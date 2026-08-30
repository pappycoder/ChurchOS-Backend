/**
 * @file appointments.service.ts
 * @description Service for the appointment/booking registry.
 *
 * An appointment pairs a secretary with a pastor (any pastor role: branch
 * pastor, church admin, senior pastor). The pairing scope follows the
 * secretary↔pastor rule:
 *  - A BRANCH secretary (not HQ) books with pastor-role profiles in the SAME
 *    branch as the secretary.
 *  - An HQ secretary (is_admin_hq OR seated at the HQ branch) books with
 *    pastor-role profiles ACROSS the church.
 *  - A pastor persona creating an appointment books with secretary-role
 *    profiles: church admins / senior pastors church-wide, branch pastors in
 *    their own branch.
 * A profile can read/manage appointments where they are the secretary_id OR
 * pastor_id (church-scoped). Status lifecycle: pending | confirmed | completed
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
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import {
  AppointmentContactDto,
  AppointmentDto,
  AppointmentListEnvelopeDto,
} from './dto/appointment-response.dto';

/**
 * Roles that count as the "pastor" side of an appointment pairing.
 */
export const PASTOR_ROLES = ['branch_pastor', 'church_admin', 'senior_pastor'] as const;

/**
 * The creator's scope context resolved from their profile.
 */
export interface AppointmentScope {
  churchId: string;
  profileId: string;
  isHq: boolean;
  branchId: string | null;
  isPastor: boolean;
  isSecretary: boolean;
}

interface ProfileLike {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string[];
  status: string;
  is_admin_hq: boolean;
  branch_id: string | null;
  avatar_url: string | null;
  branch?: { id: string; name: string } | null;
}

interface AppointmentRow {
  id: string;
  church_id: string;
  branch_id: string | null;
  secretary_id: string;
  pastor_id: string;
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
   * Create a new appointment after validating the pairing is in scope.
   */
  async create(
    dto: CreateAppointmentDto,
    churchId: string,
    profileId: string,
    userId: string,
  ): Promise<AppointmentDto> {
    const viewer = await this.resolveScope(churchId, profileId);
    if (!viewer.isPastor && !viewer.isSecretary) {
      throw new BadRequestException('Only secretary and pastor roles can create appointments');
    }
    if (dto.counterpartId === profileId) {
      throw new BadRequestException('You cannot schedule an appointment with yourself');
    }

    const creatorIsSecretary = viewer.isSecretary;
    const counterpart = await this.fetchCounterpart(
      churchId,
      dto.counterpartId,
      creatorIsSecretary,
    );
    if (!counterpart) {
      throw new BadRequestException('The selected counterpart is not valid');
    }
    this.assertCounterpartInScope(viewer, counterpart, creatorIsSecretary);

    const secretaryId = creatorIsSecretary ? viewer.profileId : counterpart.profile.id;
    const pastorId = creatorIsSecretary ? counterpart.profile.id : viewer.profileId;

    const appointment = await this.prisma.appointment.create({
      data: {
        church_id: churchId,
        branch_id: counterpart.profile.branch_id,
        secretary_id: secretaryId,
        pastor_id: pastorId,
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
        secretary_id: secretaryId,
        pastor_id: pastorId,
        status: appointment.status,
      },
    });

    this.logger.log(
      `Appointment ${appointment.id} created (${secretaryId} ↔ ${pastorId}) in church ${churchId}`,
    );
    return this.buildDetail(appointment, churchId);
  }

  /**
   * List appointments in the current viewer's scope (as secretary or pastor),
   * with optional status/date/search/archived filters and pagination.
   */
  async list(
    churchId: string,
    profileId: string,
    q: ListAppointmentsDtoLike,
  ): Promise<AppointmentListEnvelopeDto> {
    const where: Prisma.AppointmentWhereInput = {
      church_id: churchId,
      OR: [{ secretary_id: profileId }, { pastor_id: profileId }],
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
   * Update an appointment the viewer manages (secretary or pastor), preserving
   * the pairing integrity by validating any new pastor.
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

    let secretaryId = row.secretary_id;
    let pastorId = row.pastor_id;
    let branchId = row.branch_id;
    if (dto.counterpartId) {
      const creatorIsSecretary = viewer.isSecretary;
      const counterpart = await this.fetchCounterpart(
        churchId,
        dto.counterpartId,
        creatorIsSecretary,
      );
      if (!counterpart) {
        throw new BadRequestException('The selected counterpart is not valid');
      }
      this.assertCounterpartInScope(viewer, counterpart, creatorIsSecretary);
      secretaryId = creatorIsSecretary ? viewer.profileId : counterpart.profile.id;
      pastorId = creatorIsSecretary ? counterpart.profile.id : viewer.profileId;
      branchId = counterpart.profile.branch_id;
    }

    const updated = await this.prisma.appointment.update({
      where: { id: row.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduled_at: new Date(dto.scheduledAt) } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.counterpartId !== undefined
          ? { pastor_id: pastorId, secretary_id: secretaryId, branch_id: branchId }
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
   * List selectable counterpart contacts in the current viewer's pairing scope.
   */
  async listContacts(
    churchId: string,
    profileId: string,
    q: ListAppointmentContactsLike,
  ): Promise<{ data: AppointmentContactDto[]; total: number }> {
    const viewer = await this.resolveScope(churchId, profileId);

    let roles: string[];
    let isPastor: boolean;
    if (q.pastorsOnly !== undefined ? q.pastorsOnly : viewer.isSecretary) {
      roles = [...PASTOR_ROLES];
      isPastor = true;
    } else {
      roles = ['secretary'];
      isPastor = false;
    }

    const where: Prisma.ProfileWhereInput = {
      church_id: churchId,
      status: { not: 'inactive' },
      role: { hasSome: roles },
      id: { not: profileId },
    };

    if (q.role && roles.includes(q.role)) {
      where.role = { has: q.role };
    }
    if (q.branchId) {
      where.branch_id = q.branchId;
    } else if (!viewer.isHq) {
      where.branch_id = viewer.branchId ?? '';
    }
    if (q.search) {
      const s = q.search.trim();
      if (s) {
        where.OR = [
          { first_name: { contains: s, mode: 'insensitive' } },
          { last_name: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
        ];
      }
    }

    const profiles = await this.prisma.profile.findMany({
      where,
      take: Math.min(q.limit ?? 200, 200),
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      include: { branch: { select: { id: true, name: true } } },
    });

    const data = profiles.map((p) => this.mapContact(p, isPastor));
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
    const atHqBranch = profile?.branch?.is_headquarters === true;
    const isHq = profile?.is_admin_hq === true || atHqBranch;

    return {
      churchId,
      profileId,
      isHq,
      branchId: profile?.branch_id ?? null,
      isPastor,
      isSecretary,
    };
  }

  private async fetchCounterpart(
    churchId: string,
    id: string,
    targetIsPastor: boolean,
  ): Promise<{ profile: ProfileLike } | null> {
    const roles = targetIsPastor ? ([...PASTOR_ROLES] as string[]) : ['secretary'];
    const row = await this.prisma.profile.findFirst({
      where: { id, church_id: churchId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        status: true,
        is_admin_hq: true,
        branch_id: true,
        avatar_url: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!row || row.status === 'inactive') return null;
    if (!(row.role as string[]).some((r) => roles.includes(r))) return null;
    return { profile: row as ProfileLike };
  }

  private assertCounterpartInScope(
    viewer: AppointmentScope,
    counterpart: { profile: ProfileLike },
    targetIsPastor: boolean,
  ): void {
    if (viewer.isHq) return;
    if (viewer.isSecretary && targetIsPastor) {
      if (
        !viewer.branchId ||
        !counterpart.profile.branch_id ||
        counterpart.profile.branch_id !== viewer.branchId
      ) {
        throw new BadRequestException(
          'A branch secretary can only book with a pastor in the same branch',
        );
      }
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
        OR: [{ secretary_id: profileId }, { pastor_id: profileId }],
      },
    });
    if (!row) throw new NotFoundException('Appointment not found');
    return row as AppointmentRow;
  }

  private async buildDetail(row: AppointmentRow, churchId: string): Promise<AppointmentDto> {
    const ids = [...new Set([row.secretary_id, row.pastor_id])];
    const rows = await this.prisma.profile.findMany({
      where: { id: { in: ids }, church_id: churchId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const secretary = byId.get(row.secretary_id);
    const pastor = byId.get(row.pastor_id);

    return {
      id: row.id,
      title: row.title,
      scheduledAt: row.scheduled_at.toISOString(),
      secretaryId: row.secretary_id,
      secretaryName: this.fullName(secretary),
      pastorId: row.pastor_id,
      pastorName: this.fullName(pastor),
      pastorRole: pastor ? (pastor.role as string[])[0] : undefined,
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
      OR: [{ secretary_id: profileId }, { pastor_id: profileId }],
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

  private mapContact(p: ProfileLike, isPastor: boolean): AppointmentContactDto {
    return {
      id: p.id,
      name: this.fullName(p),
      role: (p.role as string[])[0] || 'member',
      isPastor,
      branchId: p.branch_id ?? undefined,
      branchName: p.branch?.name,
      avatarUrl: p.avatar_url ?? undefined,
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
  search?: string;
  pastorsOnly?: boolean;
  role?: string;
  branchId?: string;
  limit?: number;
}
