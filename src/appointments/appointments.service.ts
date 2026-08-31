/**
 * @file appointments.service.ts
 * @description Service for the appointment/booking registry (With/Who model).
 *
 * Every appointment has a fixed With party (a pastor: branch_pastor |
 * church_admin | senior_pastor) and a Who party (a staff/member profile or an
 * existing visitor). The booker (secretary or pastor) is implicit — there is no
 * stored organizer column.
 *
 * Eligibility to book & manage: secretary, any pastor role, or super_admin.
 *  - A BRANCH (non-HQ) booker picks With/Who participants in the SAME branch.
 *  - An HQ booker (is_admin_hq OR seated at the HQ branch) picks church-wide.
 * A profile can read/manage appointments where they are the `person_id` OR
 * `pastor_id` (church-scoped). Status lifecycle: pending | confirmed | completed
 * | cancelled. Archived rows are hidden unless ?archived=true; restore returns
 * them; delete permanently purges.
 *
 * @module appointments/appointments.service
 * @since 1.0.0
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateAppointmentDto, AppointmentWhoKind } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import {
  AppointmentContactDto,
  AppointmentDto,
  AppointmentListEnvelopeDto,
} from './dto/appointment-response.dto';

/**
 * Roles that count as the "pastor" side (the With party) of an appointment.
 */
export const PASTOR_ROLES = ['branch_pastor', 'church_admin', 'senior_pastor'] as const;

/**
 * The booker's scope context resolved from their profile.
 */
export interface AppointmentScope {
  churchId: string;
  profileId: string;
  isHq: boolean;
  branchId: string | null;
  isPastor: boolean;
  isSecretary: boolean;
  isSuperAdmin: boolean;
}

interface ProfileLike {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string[];
  status: string;
  branch_id: string | null;
  avatar_url: string | null;
  branch?: { id: string; name: string } | null;
}

interface VisitorLike {
  id: string;
  first_name: string;
  last_name: string | null;
  branch_id?: string | null;
  branch?: { id: string; name: string } | null;
}

interface AppointmentRow {
  id: string;
  church_id: string;
  branch_id: string | null;
  pastor_id: string;
  person_id: string;
  visitor_id: string | null;
  title: string;
  scheduled_at: Date;
  location: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
  archived_at: Date | null;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  /**
   * Create a new appointment after validating the With/Who parties are in scope.
   */
  async create(
    dto: CreateAppointmentDto,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<AppointmentDto> {
    const viewer = await this.resolveScope(churchId, profileId);
    if (!viewer.isSecretary && !viewer.isPastor && !viewer.isSuperAdmin) {
      throw new BadRequestException('Only secretary and pastor roles can create appointments');
    }

    const isVisitorWho = dto.whoKind === 'visitor';
    if (isVisitorWho && !dto.visitorId) {
      throw new BadRequestException('A visitor ID is required when Who is a visitor');
    }
    if (!isVisitorWho && !dto.whoId) {
      throw new BadRequestException('A person profile is required for the Who party');
    }

    const withProfile = await this.fetchProfileInScope(churchId, dto.withId, {
      roles: [...PASTOR_ROLES],
    });
    if (!withProfile) {
      throw new BadRequestException('The selected With (pastor) is not valid');
    }
    this.assertInBranchScope(viewer, withProfile, 'Any booker');

    let whoProfile: ProfileLike | null = null;
    let visitor: VisitorLike | null = null;
    if (isVisitorWho) {
      visitor = await this.fetchVisitorInScope(churchId, dto.visitorId!);
      if (!visitor) {
        throw new BadRequestException('The selected visitor is not valid');
      }
    } else {
      whoProfile = await this.fetchProfileInScope(churchId, dto.whoId!);
      if (!whoProfile) {
        throw new BadRequestException('The selected Who (person) is not valid');
      }
      this.assertInBranchScope(viewer, whoProfile, 'Any booker');
      if (whoProfile.id === withProfile.id) {
        throw new BadRequestException(
          'The With (pastor) and Who (person) must be different people',
        );
      }
    }

    const personId = whoProfile ? whoProfile.id : viewer.profileId;

    const appointment = await this.prisma.appointment.create({
      data: {
        church_id: churchId,
        branch_id: withProfile.branch_id,
        pastor_id: withProfile.id,
        person_id: personId,
        visitor_id: visitor ? visitor.id : null,
        title: dto.title,
        scheduled_at: new Date(dto.scheduledAt),
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        status: dto.status ?? 'pending',
      },
    });

    await this.audit.log({
      churchId,
      userId,
      entity: 'appointment',
      action: 'CREATE',
      entityId: appointment.id,
      newValues: {
        title: dto.title,
        scheduled_at: dto.scheduledAt,
        pastor_id: withProfile.id,
        person_id: personId,
        visitor_id: visitor ? visitor.id : null,
        status: appointment.status,
      },
    });

    this.logger.log(
      `Appointment ${appointment.id} created (with ${withProfile.id} / who ${personId}) in church ${churchId}`,
    );
    return this.buildDetail(appointment, churchId);
  }

  /**
   * List appointments in the current viewer's scope (as the person or the With
   * pastor), with optional status/date/search/archived filters and pagination.
   */
  async list(
    churchId: string,
    profileId: string,
    q: ListAppointmentsDtoLike,
  ): Promise<AppointmentListEnvelopeDto> {
    const where: Prisma.AppointmentWhereInput = {
      church_id: churchId,
      OR: [{ person_id: profileId }, { pastor_id: profileId }],
      archived_at: q.archived === true ? { not: null } : null,
    };

    if (q.status) where.status = q.status;
    if (q.search) {
      const s = q.search.trim();
      if (s) {
        where.OR = [
          { title: { contains: s, mode: 'insensitive' } },
          { location: { contains: s, mode: 'insensitive' } },
          { notes: { contains: s, mode: 'insensitive' } },
        ];
      }
    }
    if (q.startDate || q.endDate) {
      where.scheduled_at = {
        ...(q.startDate ? { gte: new Date(`${q.startDate}T00:00:00.000Z`) } : {}),
        ...(q.endDate ? { lte: new Date(`${q.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const skip = ((q.page ?? 1) - 1) * (q.limit ?? 30);
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: {
          scheduled_at: 'desc',
        },
        skip,
        take: q.limit ?? 30,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    const data = await Promise.all(rows.map((r) => this.buildDetail(r, churchId)));
    const summary = await this.countByStatus(churchId, profileId, q);
    return { data, total, summary };
  }

  /**
   * Get a single appointment the viewer is party to.
   */
  async getOne(
    appointmentId: string,
    churchId: string,
    profileId: string,
  ): Promise<AppointmentDto> {
    const row = await this.findPartyAppointment(appointmentId, churchId, profileId);
    return this.buildDetail(row, churchId);
  }

  /**
   * Update an appointment the viewer manages, re-validating any changed With/Who
   * parties in scope. New visitors can only be created at creation time — on
   * update, an existing visitor may be selected but never created inline.
   */
  async update(
    appointmentId: string,
    dto: UpdateAppointmentDto,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<AppointmentDto> {
    const row = await this.findPartyAppointment(appointmentId, churchId, profileId);
    const viewer = await this.resolveScope(churchId, profileId);
    if (!viewer.isSecretary && !viewer.isPastor && !viewer.isSuperAdmin) {
      throw new BadRequestException('Only secretary and pastor roles can manage appointments');
    }

    let pastorId = row.pastor_id;
    let personId = row.person_id;
    let visitorId = row.visitor_id;
    let branchId = row.branch_id;

    if (dto.withId) {
      const withProfile = await this.fetchProfileInScope(churchId, dto.withId, {
        roles: [...PASTOR_ROLES],
      });
      if (!withProfile) {
        throw new BadRequestException('The selected With (pastor) is not valid');
      }
      this.assertInBranchScope(viewer, withProfile, 'Any booker');
      pastorId = withProfile.id;
      branchId = withProfile.branch_id;
    }

    const whoChanged =
      dto.whoId !== undefined || dto.whoKind !== undefined || dto.visitorId !== undefined;

    if (whoChanged) {
      const targetWhoKind: AppointmentWhoKind = dto.whoKind ?? (visitorId ? 'visitor' : 'profile');
      if (targetWhoKind === 'visitor') {
        if (dto.whoId !== undefined && dto.whoId !== null) {
          throw new BadRequestException(
            'A Who profile cannot be combined with a visitor For the Who party',
          );
        }
        const newVisitorId = dto.visitorId ?? visitorId;
        if (newVisitorId) {
          const visitor = await this.fetchVisitorInScope(churchId, newVisitorId);
          if (!visitor) {
            throw new BadRequestException('The selected visitor is not valid');
          }
          visitorId = visitor.id;
        } else {
          throw new BadRequestException('A visitor ID is required when Who is a visitor');
        }
        personId = viewer.profileId;
        if (personId === pastorId) {
          throw new BadRequestException(
            'The With (pastor) and Who (person) must be different people',
          );
        }
      } else {
        if (dto.visitorId !== undefined && dto.visitorId !== null) {
          throw new BadRequestException(
            'A visitor cannot be combined with a Who profile For the Who party',
          );
        }
        const newWhoId = dto.whoId ?? personId;
        const whoProfile = await this.fetchProfileInScope(churchId, newWhoId);
        if (!whoProfile) {
          throw new BadRequestException('The selected Who (person) is not valid');
        }
        this.assertInBranchScope(viewer, whoProfile, 'Any booker');
        personId = whoProfile.id;
        visitorId = null;
        if (personId === pastorId) {
          throw new BadRequestException(
            'The With (pastor) and Who (person) must be different people',
          );
        }
      }
    }

    const updated = await this.prisma.appointment.update({
      where: { id: row.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduled_at: new Date(dto.scheduledAt) } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.withId !== undefined || dto.whoId !== undefined || dto.visitorId !== undefined
          ? { pastor_id: pastorId, person_id: personId, visitor_id: visitorId, branch_id: branchId }
          : {}),
      },
    });

    await this.audit.log({
      churchId,
      userId,
      entity: 'appointment',
      action: 'UPDATE',
      entityId: updated.id,
      newValues: {
        title: updated.title,
        scheduled_at: updated.scheduled_at.toISOString(),
        status: updated.status,
      },
    });

    return this.buildDetail(updated, churchId);
  }

  /**
   * Archive an appointment (soft-hide from active lists).
   */
  async archive(
    appointmentId: string,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const row = await this.findPartyAppointment(appointmentId, churchId, profileId);
    if (row.archived_at) {
      throw new BadRequestException('Appointment is already archived');
    }
    await this.prisma.appointment.update({
      where: { id: row.id },
      data: { archived_at: new Date() },
    });
    await this.audit.log({
      churchId,
      userId,
      entity: 'appointment',
      action: 'ARCHIVE',
      entityId: row.id,
      newValues: { title: row.title },
    });
    return { success: true };
  }

  /**
   * Restore an archived appointment back to the active list.
   */
  async restore(
    appointmentId: string,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const row = await this.findPartyAppointment(appointmentId, churchId, profileId);
    if (!row.archived_at) {
      throw new BadRequestException('Appointment is not archived');
    }
    await this.prisma.appointment.update({
      where: { id: row.id },
      data: { archived_at: null },
    });
    await this.audit.log({
      churchId,
      userId,
      entity: 'appointment',
      action: 'RESTORE',
      entityId: row.id,
      newValues: { title: row.title },
    });
    return { success: true };
  }

  /**
   * Permanently delete (purge) an appointment. Must be archived first.
   */
  async deleteForever(
    appointmentId: string,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const row = await this.findPartyAppointment(appointmentId, churchId, profileId);
    if (!row.archived_at) {
      throw new BadRequestException('Appointment must be archived before permanent deletion');
    }
    await this.prisma.appointment.delete({ where: { id: row.id } });
    await this.audit.log({
      churchId,
      userId,
      entity: 'appointment',
      action: 'DELETE',
      entityId: row.id,
      newValues: { title: row.title },
    });
    return { success: true };
  }

  /**
   * List selectable participant contacts for a picker:
   *  - kind "with": pastor-role profiles (the With/pastor partner).
   *  - kind "who": all profiles (any role) plus optional existing visitors.
   * Both scoped by branch (non-HQ) or church (HQ).
   */
  async listContacts(
    churchId: string,
    profileId: string,
    q: ListAppointmentContactsLike,
  ): Promise<{ data: AppointmentContactDto[]; total: number }> {
    const viewer = await this.resolveScope(churchId, profileId);
    const kind = q.kind ?? 'with';

    const profileWhere: Prisma.ProfileWhereInput = {
      church_id: churchId,
      status: { not: 'inactive' },
      id: { not: profileId },
    };
    if (kind === 'with') {
      profileWhere.role = { hasSome: [...PASTOR_ROLES] };
    }

    if (q.role) {
      profileWhere.role = { has: q.role };
    }
    if (q.branchId) {
      profileWhere.branch_id = q.branchId;
    } else if (!viewer.isHq) {
      profileWhere.branch_id = viewer.branchId ?? '';
    }
    if (q.search) {
      const s = q.search.trim();
      if (s) {
        profileWhere.OR = [
          { first_name: { contains: s, mode: 'insensitive' } },
          { last_name: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
        ];
      }
    }

    const profiles = await this.prisma.profile.findMany({
      where: profileWhere,
      take: Math.min(q.limit ?? 200, 200),
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      include: { branch: { select: { id: true, name: true } } },
    });

    const data = profiles.map((p) => this.mapContact(p, kind));

    if (kind === 'who' && q.includeVisitors) {
      const visitorWhere: Prisma.VisitorWhereInput = {
        church_id: churchId,
        deleted_at: null,
        archived_at: q.archived === true ? { not: null } : null,
      };
      const visitorRows = await this.prisma.visitor.findMany({
        where: visitorWhere,
        orderBy: { first_name: 'asc' },
      });
      const visitorContacts = (visitorRows as VisitorLike[]).map((v) => this.mapVisitorContact(v));
      const all = [...data, ...visitorContacts];
      return { data: all, total: all.length };
    }

    return { data, total: data.length };
  }

  // ── private helpers ────────────────────────────────────────

  private async resolveScope(churchId: string, profileId: string): Promise<AppointmentScope> {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, church_id: churchId },
      select: {
        is_admin_hq: true,
        role: true,
        branch_id: true,
        branch: { select: { is_headquarters: true } },
      },
    });

    const roles = (profile?.role as string[] | undefined) ?? [];
    const isPastor = roles.some((r) => (PASTOR_ROLES as readonly string[]).includes(r));
    const isSecretary = roles.includes('secretary');
    const isSuperAdmin = roles.includes('super_admin');
    const atHqBranch = profile?.branch?.is_headquarters === true;
    const isHq = profile?.is_admin_hq === true || atHqBranch;

    return {
      churchId,
      profileId,
      isHq,
      branchId: profile?.branch_id ?? null,
      isPastor,
      isSecretary,
      isSuperAdmin,
    };
  }

  private async fetchProfileInScope(
    churchId: string,
    id: string,
    opts: { roles?: string[] } = {},
  ): Promise<ProfileLike | null> {
    const row = await this.prisma.profile.findFirst({
      where: {
        id,
        church_id: churchId,
        ...(opts.roles ? { role: { hasSome: opts.roles } } : {}),
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        status: true,
        branch_id: true,
        avatar_url: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!row || row.status === 'inactive') return null;
    return row as ProfileLike;
  }

  private async fetchVisitorInScope(churchId: string, id: string): Promise<VisitorLike | null> {
    const row = await this.prisma.visitor.findFirst({
      where: { id, church_id: churchId, deleted_at: null },
      select: { id: true, first_name: true, last_name: true },
    });
    return row as VisitorLike | null;
  }

  private assertInBranchScope(
    viewer: AppointmentScope,
    participant: { branch_id: string | null },
    label: string,
  ): void {
    if (viewer.isHq) return;
    if (!viewer.branchId || !participant.branch_id || participant.branch_id !== viewer.branchId) {
      throw new BadRequestException(
        `A branch ${label} can only book with participants in the same branch (HQ can book church-wide)`,
      );
    }
  }

  private async findPartyAppointment(
    appointmentId: string,
    churchId: string,
    profileId: string,
  ): Promise<AppointmentRow> {
    const row = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        church_id: churchId,
        OR: [{ person_id: profileId }, { pastor_id: profileId }],
      },
    });
    if (!row) throw new NotFoundException('Appointment not found');
    return row as AppointmentRow;
  }

  private async buildDetail(row: AppointmentRow, churchId: string): Promise<AppointmentDto> {
    const profileIds = [...new Set([row.person_id, row.pastor_id])];
    const profiles = await this.prisma.profile.findMany({
      where: { id: { in: profileIds }, church_id: churchId },
      select: { id: true, first_name: true, last_name: true, role: true },
    });
    const byId = new Map(profiles.map((r) => [r.id, r]));
    const person = byId.get(row.person_id);
    const pastor = byId.get(row.pastor_id);

    let visitorName: string | undefined;
    if (row.visitor_id) {
      const visitor = await this.prisma.visitor.findFirst({
        where: { id: row.visitor_id, church_id: churchId },
        select: { first_name: true, last_name: true },
      });
      if (visitor) {
        visitorName = [visitor.first_name, visitor.last_name].filter(Boolean).join(' ').trim();
      }
    }
    const whoKind: 'profile' | 'visitor' = row.visitor_id ? 'visitor' : 'profile';

    return {
      id: row.id,
      title: row.title,
      scheduledAt: row.scheduled_at.toISOString(),
      pastorId: row.pastor_id,
      pastorName: this.fullName(pastor),
      pastorRole: pastor ? (pastor.role as string[])[0] : undefined,
      personId: row.person_id,
      personName: whoKind === 'visitor' ? (visitorName ?? '') : this.fullName(person),
      whoKind,
      visitorId: row.visitor_id ?? undefined,
      visitorName,
      location: row.location ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      archivedAt: row.archived_at ? row.archived_at.toISOString() : undefined,
    };
  }

  private async countByStatus(
    churchId: string,
    profileId: string,
    q: ListAppointmentsDtoLike,
  ): Promise<Record<string, number>> {
    const activeWhere: Prisma.AppointmentWhereInput = {
      church_id: churchId,
      OR: [{ person_id: profileId }, { pastor_id: profileId }],
    };
    if (q.startDate || q.endDate) {
      activeWhere.scheduled_at = {
        ...(q.startDate ? { gte: new Date(`${q.startDate}T00:00:00.000Z`) } : {}),
        ...(q.endDate ? { lte: new Date(`${q.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const grouped = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: activeWhere,
      _count: { _all: true },
    });
    const map: Record<string, number> = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const g of grouped) {
      map[g.status as string] = g._count._all;
    }
    return map;
  }

  private mapContact(p: ProfileLike, kind: 'with' | 'who'): AppointmentContactDto {
    return {
      id: p.id,
      name: this.fullName(p),
      role: (p.role as string[])[0] || 'member',
      kind,
      isPastor: kind === 'with',
      branchId: p.branch_id ?? undefined,
      branchName: p.branch?.name,
      avatarUrl: p.avatar_url ?? undefined,
    };
  }

  private mapVisitorContact(v: VisitorLike): AppointmentContactDto {
    return {
      id: v.id,
      name: [v.first_name, v.last_name].filter(Boolean).join(' ').trim(),
      role: 'visitor',
      kind: 'who',
      isPastor: false,
    };
  }

  private fullName(p?: { first_name: string | null; last_name: string | null } | null): string {
    if (!p) return '';
    return [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  }
}

interface ListAppointmentsDtoLike {
  page?: number;
  limit?: number;
  status?: string;
  archived?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
}

interface ListAppointmentContactsLike {
  kind?: 'with' | 'who';
  search?: string;
  includeVisitors?: boolean;
  archived?: boolean;
  role?: string;
  branchId?: string;
  limit?: number;
}
