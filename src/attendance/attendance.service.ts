/**
 * @file attendance.service.ts
 * @description Business logic for attendance and service management.
 *
 * Handles service CRUD, single/bulk check-in recording, attendance
 * summaries, trends, and visitor attendance. All queries are scoped
 * by church_id for multi-tenant data isolation.
 *
 * @module attendance/attendance.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ListServicesDto } from './dto/list-services.dto';
import { ListAttendanceDto } from './dto/list-attendance.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { RecordBulkAttendanceDto } from './dto/record-bulk-attendance.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
import {
  AttendanceResponseDto,
  AttendanceSummaryDto,
  AttendanceTrendDto,
} from './dto/attendance-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  // ─── Service CRUD ──────────────────────────────────────

  async createService(
    dto: CreateServiceDto,
    churchId: string,
    userId: string,
  ): Promise<ServiceResponseDto> {
    const service = await this.prisma.service.create({
      data: {
        church_id: churchId,
        branch_id: dto.branchId || null,
        name: dto.name,
        category: dto.category ?? 'adult',
        day_of_week: dto.dayOfWeek ?? null,
        start_time: dto.startTime ? new Date(dto.startTime) : null,
        end_time: dto.endTime ? new Date(dto.endTime) : null,
        is_active: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'service',
      action: 'CREATE',
      entityId: service.id,
      newValues: { name: dto.name, dayOfWeek: dto.dayOfWeek },
    });

    this.logger.log(`Service created: ${service.name} (${service.id})`);

    return this.mapToServiceResponse(service);
  }

  async getServiceById(id: string, churchId: string): Promise<ServiceResponseDto> {
    const service = await this.prisma.service.findUnique({ where: { id } });

    if (!service || service.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    return this.mapToServiceResponse(service);
  }

  async listServices(
    churchId: string,
    query: ListServicesDto,
  ): Promise<{ data: ServiceResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceWhereInput = { church_id: churchId };

    if (query.branchId) {
      where.branch_id = query.branchId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    if (query.dayOfWeek !== undefined) {
      where.day_of_week = query.dayOfWeek;
    }

    const orderBy: Prisma.ServiceOrderByWithRelationInput[] = [];
    if (query.sortBy) {
      orderBy.push({ [query.sortBy]: (query.sortOrder || 'asc') as Prisma.SortOrder });
    } else {
      orderBy.push({ day_of_week: 'asc' });
      orderBy.push({ name: 'asc' });
    }

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data: services.map((s) => this.mapToServiceResponse(s)),
      total,
    };
  }

  async updateService(
    id: string,
    dto: UpdateServiceDto,
    churchId: string,
    userId: string,
  ): Promise<ServiceResponseDto> {
    const existing = await this.prisma.service.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    const updateData: Prisma.ServiceUpdateInput = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.branchId !== undefined)
      updateData.branch = dto.branchId ? { connect: { id: dto.branchId } } : { disconnect: true };
    if (dto.dayOfWeek !== undefined) updateData.day_of_week = dto.dayOfWeek;
    if (dto.startTime !== undefined)
      updateData.start_time = dto.startTime ? new Date(dto.startTime) : null;
    if (dto.endTime !== undefined) updateData.end_time = dto.endTime ? new Date(dto.endTime) : null;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    if (Object.keys(updateData).length === 0) {
      return this.mapToServiceResponse(existing);
    }

    const service = await this.prisma.service.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'service',
      action: 'UPDATE',
      entityId: id,
      oldValues: { name: existing.name, isActive: existing.is_active },
      newValues: updateData,
    });

    this.logger.log(`Service updated: ${id}`);

    return this.mapToServiceResponse(service);
  }

  async deleteService(id: string, churchId: string, userId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.service.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    const attendanceCount = await this.prisma.attendance.count({
      where: { service_id: id },
    });

    if (attendanceCount > 0) {
      throw new ConflictException(
        `Cannot delete this service: ${attendanceCount} attendance record(s) reference it. Delete those records first.`,
      );
    }

    await this.prisma.service.delete({ where: { id } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'service',
      action: 'DELETE',
      entityId: id,
      oldValues: { name: existing.name, isActive: existing.is_active },
    });

    this.logger.log(`Service deleted: ${existing.name} (${id})`);

    return { success: true };
  }

  // ─── Attendance Recording ───────────────────────────────

  async recordAttendance(
    dto: RecordAttendanceDto,
    churchId: string,
    userId: string,
  ): Promise<AttendanceResponseDto> {
    if (!dto.memberId && !dto.visitorName && !dto.visitorId) {
      throw new BadRequestException('Either memberId, visitorId, or visitorName must be provided');
    }

    // Verify service exists and belongs to this church
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service || service.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    // Verify member exists if memberId provided
    if (dto.memberId) {
      const member = await this.prisma.member.findUnique({
        where: { id: dto.memberId },
      });

      if (!member || member.church_id !== churchId) {
        throw new NotFoundException('Member not found');
      }
    }

    // Verify the linked visitor record belongs to this church
    let linkedVisitorName: string | null = null;
    if (dto.visitorId) {
      const visitor = await this.prisma.visitor.findUnique({
        where: { id: dto.visitorId },
        select: { id: true, church_id: true, first_name: true, last_name: true },
      });

      if (!visitor || visitor.church_id !== churchId) {
        throw new NotFoundException('Visitor not found');
      }

      linkedVisitorName = [visitor.first_name, visitor.last_name].filter(Boolean).join(' ');
    }

    // Check for duplicate check-in
    if (dto.memberId) {
      const existing = await this.prisma.attendance.findUnique({
        where: {
          service_id_member_id: {
            service_id: dto.serviceId,
            member_id: dto.memberId,
          },
        },
      });

      if (existing) {
        throw new ConflictException('Member already checked in for this service');
      }
    }

    // Category resolution: explicit override → service category → adult
    const category = dto.category ?? service.category ?? 'adult';

    const attendance = await this.prisma.attendance.create({
      data: {
        church_id: churchId,
        service_id: dto.serviceId,
        member_id: dto.memberId || null,
        visitor_id: dto.visitorId || null,
        visitor_name: dto.visitorName || linkedVisitorName,
        category,
        source: dto.source || 'manual',
      },
      include: {
        service: { select: { name: true } },
        member: { select: { first_name: true, last_name: true } },
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'attendance',
      action: 'CREATE',
      entityId: attendance.id,
      newValues: {
        serviceId: dto.serviceId,
        memberId: dto.memberId,
        visitorName: dto.visitorName,
        source: dto.source,
      },
    });

    this.logger.log(`Attendance recorded: ${attendance.id}`);

    return this.mapToAttendanceResponse(attendance);
  }

  async recordBulkAttendance(
    dto: RecordBulkAttendanceDto,
    churchId: string,
    userId: string,
  ): Promise<{
    recorded: number;
    skipped: number;
    errors: Array<{ index: number; message: string }>;
  }> {
    // Verify service exists
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service || service.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    let recorded = 0;
    let skipped = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < dto.records.length; i++) {
      const record = dto.records[i];

      if (!record.memberId && !record.visitorName && !record.visitorId) {
        errors.push({
          index: i,
          message: 'Either memberId, visitorId, or visitorName must be provided',
        });
        continue;
      }

      try {
        // Verify the linked visitor record belongs to the church before writing
        let linkedVisitorName: string | null = null;
        if (record.visitorId) {
          const visitor = await this.prisma.visitor.findFirst({
            where: { id: record.visitorId, church_id: churchId },
            select: { first_name: true, last_name: true },
          });

          if (!visitor) {
            errors.push({ index: i, message: 'Visitor not found in this church' });
            continue;
          }

          linkedVisitorName = [visitor.first_name, visitor.last_name].filter(Boolean).join(' ');
        }

        // Verify the member belongs to the church before writing
        if (record.memberId) {
          const member = await this.prisma.member.findFirst({
            where: { id: record.memberId, church_id: churchId },
            select: { id: true },
          });

          if (!member) {
            errors.push({ index: i, message: 'Member not found in this church' });
            continue;
          }

          // Check for duplicate if member
          const existing = await this.prisma.attendance.findUnique({
            where: {
              service_id_member_id: {
                service_id: dto.serviceId,
                member_id: record.memberId,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }
        }

        await this.prisma.attendance.create({
          data: {
            church_id: churchId,
            service_id: dto.serviceId,
            member_id: record.memberId || null,
            visitor_id: record.visitorId || null,
            visitor_name: record.visitorName || linkedVisitorName,
            category: dto.category ?? service.category ?? 'adult',
            source: dto.source || 'manual',
          },
        });

        recorded++;
      } catch (error) {
        errors.push({
          index: i,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (recorded > 0) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'attendance',
        action: 'CREATE',
        entityId: 'bulk',
        newValues: { serviceId: dto.serviceId, recorded, skipped, errorCount: errors.length },
      });
    }

    this.logger.log(
      `Bulk attendance: ${recorded} recorded, ${skipped} skipped, ${errors.length} errors`,
    );

    return { recorded, skipped, errors };
  }

  async recordVisitorAttendance(
    dto: {
      serviceId: string;
      visitorName: string;
      visitorId?: string;
      category?: string;
      source?: string;
    },
    churchId: string,
    userId: string,
  ): Promise<AttendanceResponseDto> {
    if (!dto.visitorName || dto.visitorName.trim().length === 0) {
      throw new BadRequestException('Visitor name is required');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service || service.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    // Verify the linked visitor record belongs to this church
    if (dto.visitorId) {
      const visitor = await this.prisma.visitor.findFirst({
        where: { id: dto.visitorId, church_id: churchId },
        select: { id: true },
      });

      if (!visitor) {
        throw new NotFoundException('Visitor not found');
      }
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        church_id: churchId,
        service_id: dto.serviceId,
        visitor_id: dto.visitorId || null,
        visitor_name: dto.visitorName.trim(),
        category: dto.category ?? service.category ?? 'adult',
        source: dto.source || 'manual',
      },
      include: {
        service: { select: { name: true } },
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'attendance',
      action: 'CREATE',
      entityId: attendance.id,
      newValues: { visitorName: dto.visitorName, source: dto.source },
    });

    this.logger.log(`Visitor attendance recorded: ${dto.visitorName} (${attendance.id})`);

    return this.mapToAttendanceResponse(attendance);
  }

  async deleteAttendance(
    attendanceId: string,
    churchId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Attendance record not found');
    }

    await this.prisma.attendance.delete({ where: { id: attendanceId } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'attendance',
      action: 'DELETE',
      entityId: attendanceId,
      oldValues: {
        serviceId: existing.service_id,
        memberId: existing.member_id,
        visitorName: existing.visitor_name,
      },
    });

    this.logger.log(`Attendance deleted: ${attendanceId}`);

    return { success: true };
  }

  // ─── Queries & Analytics ────────────────────────────────

  async listAttendance(
    churchId: string,
    query: ListAttendanceDto,
  ): Promise<{ data: AttendanceResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = { church_id: churchId };

    if (query.serviceId) where.service_id = query.serviceId;
    if (query.memberId) where.member_id = query.memberId;
    if (query.visitorId) where.visitor_id = query.visitorId;
    if (query.category) where.category = query.category;
    if (query.source) where.source = query.source;

    if (query.startDate || query.endDate) {
      where.checkin_at = {};
      if (query.startDate) where.checkin_at.gte = new Date(query.startDate);
      if (query.endDate) where.checkin_at.lte = new Date(query.endDate);
    }

    const sortField = query.sortBy === 'createdAt' ? 'created_at' : 'checkin_at';
    const order = (query.sortOrder || 'desc') as Prisma.SortOrder;

    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: { [sortField]: order },
        skip,
        take: limit,
        include: {
          service: { select: { name: true } },
          member: { select: { first_name: true, last_name: true } },
          visitor: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data: records.map((r) => this.mapToAttendanceResponse(r)),
      total,
    };
  }

  async getAttendanceByService(
    serviceId: string,
    churchId: string,
  ): Promise<{ data: AttendanceResponseDto[]; total: number }> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service || service.church_id !== churchId) {
      throw new NotFoundException('Service not found');
    }

    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { service_id: serviceId, church_id: churchId },
        orderBy: { checkin_at: 'desc' },
        include: {
          service: { select: { name: true } },
          member: { select: { first_name: true, last_name: true } },
          visitor: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.attendance.count({
        where: { service_id: serviceId, church_id: churchId },
      }),
    ]);

    return {
      data: records.map((r) => this.mapToAttendanceResponse(r)),
      total,
    };
  }

  async getAttendanceSummary(
    churchId: string,
    startDate?: string,
    endDate?: string,
    branchId?: string,
  ): Promise<AttendanceSummaryDto> {
    const where: Prisma.AttendanceWhereInput = { church_id: churchId };

    if (startDate || endDate) {
      where.checkin_at = {};
      if (startDate) where.checkin_at.gte = new Date(startDate);
      if (endDate) where.checkin_at.lte = new Date(endDate);
    }

    if (branchId) {
      where.service = { branch_id: branchId };
    }

    const [totalCheckIns, memberCheckIns, visitorCheckIns, bySourceRaw, byCategoryRaw, genderRows] =
      await Promise.all([
        this.prisma.attendance.count({ where }),
        this.prisma.attendance.count({ where: { ...where, member_id: { not: null } } }),
        this.prisma.attendance.count({ where: { ...where, member_id: null } }),
        this.prisma.attendance.groupBy({
          by: ['source'],
          where,
          _count: { id: true },
        }),
        this.prisma.attendance.groupBy({
          by: ['category'],
          where,
          _count: { id: true },
        }),
        // Gender is derived from the linked member/visitor records — never stored
        // on the check-in itself. Legacy rows without links count as unknown.
        this.prisma.attendance.findMany({
          where,
          select: {
            member: { select: { gender: true } },
            visitor: { select: { gender: true } },
          },
        }),
      ]);

    const bySource: Record<string, number> = {};
    for (const item of bySourceRaw) {
      bySource[item.source] = item._count.id;
    }

    const byCategory: Record<string, number> = {};
    for (const item of byCategoryRaw) {
      byCategory[item.category] = item._count.id;
    }

    const byGender: Record<string, number> = { male: 0, female: 0, unknown: 0 };
    for (const row of genderRows) {
      const gender = (row.member?.gender || row.visitor?.gender || '').toLowerCase();
      if (gender === 'male') byGender.male++;
      else if (gender === 'female') byGender.female++;
      else byGender.unknown++;
    }

    return { totalCheckIns, memberCheckIns, visitorCheckIns, bySource, byCategory, byGender };
  }

  async getAttendanceTrends(
    churchId: string,
    days = 30,
    branchId?: string,
  ): Promise<AttendanceTrendDto[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.AttendanceWhereInput = {
      church_id: churchId,
      checkin_at: { gte: startDate },
    };

    if (branchId) {
      where.service = { branch_id: branchId };
    }

    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: { checkin_at: 'asc' },
      select: {
        checkin_at: true,
        member_id: true,
      },
    });

    // Group by date
    const grouped: Record<string, { total: number; members: number; visitors: number }> = {};

    for (const record of records) {
      const dateKey = record.checkin_at.toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = { total: 0, members: 0, visitors: 0 };
      }
      grouped[dateKey].total++;
      if (record.member_id) {
        grouped[dateKey].members++;
      } else {
        grouped[dateKey].visitors++;
      }
    }

    return Object.entries(grouped).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  // ─── Helpers ────────────────────────────────────────────

  private mapToServiceResponse(service: {
    id: string;
    church_id: string;
    branch_id: string | null;
    name: string;
    category: string;
    day_of_week: number | null;
    start_time: Date | null;
    end_time: Date | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): ServiceResponseDto {
    return {
      serviceId: service.id,
      churchId: service.church_id,
      branchId: service.branch_id || undefined,
      name: service.name,
      category: service.category || 'adult',
      dayOfWeek: service.day_of_week ?? undefined,
      startTime: service.start_time?.toISOString() || undefined,
      endTime: service.end_time?.toISOString() || undefined,
      isActive: service.is_active,
      createdAt: service.created_at.toISOString(),
      updatedAt: service.updated_at.toISOString(),
    };
  }

  private mapToAttendanceResponse(record: {
    id: string;
    church_id: string;
    service_id: string;
    member_id: string | null;
    visitor_id: string | null;
    visitor_name: string | null;
    category: string;
    checkin_at: Date;
    source: string;
    created_at: Date;
    service?: { name: string } | null;
    member?: { first_name: string; last_name: string } | null;
    visitor?: { first_name: string; last_name: string | null } | null;
  }): AttendanceResponseDto {
    const linkedVisitorName = record.visitor
      ? [record.visitor.first_name, record.visitor.last_name].filter(Boolean).join(' ')
      : undefined;

    return {
      attendanceId: record.id,
      churchId: record.church_id,
      serviceId: record.service_id,
      memberId: record.member_id || undefined,
      visitorId: record.visitor_id || undefined,
      visitorName: record.visitor_name || linkedVisitorName,
      category: record.category || 'adult',
      checkInAt: record.checkin_at.toISOString(),
      source: record.source,
      createdAt: record.created_at.toISOString(),
      memberName: record.member
        ? `${record.member.first_name} ${record.member.last_name}`
        : undefined,
      serviceName: record.service?.name || undefined,
    };
  }
}
