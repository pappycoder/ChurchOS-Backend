import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { ConvertVisitorDto } from './dto/convert-visitor.dto';
import { VisitorResponseDto } from './dto/visitor-response.dto';

@Injectable()
export class VisitorsService {
  private readonly logger = new Logger(VisitorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  async create(
    dto: CreateVisitorDto,
    churchId: string,
    userId: string,
  ): Promise<VisitorResponseDto> {
    if (dto.assigned_to_id) {
      const assignee = await this.prisma.profile.findUnique({
        where: { id: dto.assigned_to_id },
      });
      if (!assignee || assignee.church_id !== churchId) {
        throw new BadRequestException('Assigned team member not found');
      }
    }

    const visitor = await this.prisma.visitor.create({
      data: {
        church_id: churchId,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        whatsapp_number: dto.whatsapp_number,
        email: dto.email,
        assigned_to_id: dto.assigned_to_id,
        notes: dto.notes,
      },
      include: { assigned_to: { select: { first_name: true, last_name: true } } },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'visitor',
      action: 'CREATE',
      entityId: visitor.id,
      newValues: { first_name: dto.first_name, last_name: dto.last_name },
    });

    this.logger.log(`Visitor created: ${visitor.id}`);

    return this.toResponseDto(visitor);
  }

  async findAll(
    churchId: string,
    filters?: { follow_up_status?: string; assigned_to_id?: string },
  ): Promise<VisitorResponseDto[]> {
    const where: Record<string, unknown> = { church_id: churchId };

    if (filters?.follow_up_status) {
      where.follow_up_status = filters.follow_up_status;
    }
    if (filters?.assigned_to_id) {
      where.assigned_to_id = filters.assigned_to_id;
    }

    const visitors = await this.prisma.visitor.findMany({
      where,
      include: { assigned_to: { select: { first_name: true, last_name: true } } },
      orderBy: { created_at: 'desc' },
    });

    return visitors.map((v) => this.toResponseDto(v));
  }

  async findOne(id: string, churchId: string): Promise<VisitorResponseDto> {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id },
      include: { assigned_to: { select: { first_name: true, last_name: true } } },
    });

    if (!visitor || visitor.church_id !== churchId) {
      throw new NotFoundException('Visitor not found');
    }

    return this.toResponseDto(visitor);
  }

  async update(
    id: string,
    dto: UpdateVisitorDto,
    churchId: string,
    userId: string,
  ): Promise<VisitorResponseDto> {
    const existing = await this.prisma.visitor.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Visitor not found');
    }

    if (dto.assigned_to_id) {
      const assignee = await this.prisma.profile.findUnique({
        where: { id: dto.assigned_to_id },
      });
      if (!assignee || assignee.church_id !== churchId) {
        throw new BadRequestException('Assigned team member not found');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.first_name !== undefined) updateData.first_name = dto.first_name;
    if (dto.last_name !== undefined) updateData.last_name = dto.last_name;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.whatsapp_number !== undefined) updateData.whatsapp_number = dto.whatsapp_number;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.follow_up_status !== undefined) updateData.follow_up_status = dto.follow_up_status;
    if (dto.assigned_to_id !== undefined) updateData.assigned_to_id = dto.assigned_to_id;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const visitor = await this.prisma.visitor.update({
      where: { id },
      data: updateData,
      include: { assigned_to: { select: { first_name: true, last_name: true } } },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'visitor',
      action: 'UPDATE',
      entityId: id,
      oldValues: { follow_up_status: existing.follow_up_status },
      newValues: updateData,
    });

    this.logger.log(`Visitor updated: ${id}`);

    return this.toResponseDto(visitor);
  }

  async remove(id: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.visitor.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Visitor not found');
    }

    await this.prisma.visitor.delete({ where: { id } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'visitor',
      action: 'DELETE',
      entityId: id,
      oldValues: { first_name: existing.first_name },
    });

    this.logger.log(`Visitor deleted: ${id}`);
  }

  async convertToMember(
    id: string,
    dto: ConvertVisitorDto,
    churchId: string,
    userId: string,
  ): Promise<{ visitor: VisitorResponseDto; memberId: string }> {
    const visitor = await this.prisma.visitor.findUnique({ where: { id } });

    if (!visitor || visitor.church_id !== churchId) {
      throw new NotFoundException('Visitor not found');
    }

    if (visitor.follow_up_status === 'converted') {
      throw new BadRequestException('Visitor has already been converted');
    }

    const member = await this.prisma.member.create({
      data: {
        church_id: churchId,
        branch_id: dto.branch_id,
        first_name: dto.first_name,
        last_name: dto.last_name,
        email: dto.email || visitor.email,
        phone: dto.phone || visitor.phone,
        whatsapp_number: visitor.whatsapp_number,
        status: 'active',
      },
    });

    const updatedVisitor = await this.prisma.visitor.update({
      where: { id },
      data: {
        follow_up_status: 'converted',
        converted_member_id: member.id,
        converted_at: new Date(),
      },
      include: { assigned_to: { select: { first_name: true, last_name: true } } },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'visitor',
      action: 'UPDATE',
      entityId: id,
      oldValues: { follow_up_status: visitor.follow_up_status },
      newValues: { follow_up_status: 'converted', converted_member_id: member.id },
    });

    this.logger.log(`Visitor ${id} converted to member ${member.id}`);

    return {
      visitor: this.toResponseDto(updatedVisitor),
      memberId: member.id,
    };
  }

  private toResponseDto(visitor: {
    id: string;
    church_id: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    email: string | null;
    first_visit_date: Date;
    follow_up_status: string;
    assigned_to_id: string | null;
    assigned_to?: { first_name: string; last_name: string } | null;
    notes: string | null;
    converted_member_id: string | null;
    converted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): VisitorResponseDto {
    return {
      id: visitor.id,
      churchId: visitor.church_id,
      firstName: visitor.first_name,
      lastName: visitor.last_name || undefined,
      phone: visitor.phone || undefined,
      whatsappNumber: visitor.whatsapp_number || undefined,
      email: visitor.email || undefined,
      firstVisitDate: visitor.first_visit_date.toISOString(),
      followUpStatus: visitor.follow_up_status,
      assignedToId: visitor.assigned_to_id || undefined,
      assignedToName: visitor.assigned_to
        ? `${visitor.assigned_to.first_name} ${visitor.assigned_to.last_name}`
        : undefined,
      notes: visitor.notes || undefined,
      convertedMemberId: visitor.converted_member_id || undefined,
      convertedAt: visitor.converted_at?.toISOString(),
      createdAt: visitor.created_at.toISOString(),
      updatedAt: visitor.updated_at.toISOString(),
    };
  }
}
