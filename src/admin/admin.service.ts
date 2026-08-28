/**
 * @file admin.service.ts
 * @description Business logic for department and cell group management.
 *
 * Handles CRUD operations for departments (with hierarchical structure
 * and member assignments) and cell groups (with nearest-group
 * geolocation recommendations).
 *
 * All queries are scoped by church_id for multi-tenant data isolation.
 * All mutations are audit-logged.
 *
 * @module admin/admin.service
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
import { Prisma } from '@prisma/client';
import { CreateDepartmentDto, AddDepartmentMemberDto } from './dto/create-department.dto';
import { CreateCellGroupDto } from './dto/create-cell-group.dto';
import {
  DepartmentResponseDto,
  CellGroupResponseDto,
  NearestGroupResponseDto,
} from './dto/admin-response.dto';

@Injectable()
export class AdminService {
  // Initialize logger for this service
  private readonly logger = new Logger(AdminService.name);

  constructor(
    // Inject PrismaService for database access
    private readonly prisma: PrismaService,
    // Inject AuditLoggingService for mutation audit trails
    private readonly audit: AuditLoggingService,
  ) {}

  // ─── Departments ──────────────────────────────────────────

  /**
   * Creates a new department.
   *
   * @param dto - Department creation data
   * @param churchId - Church ID for tenant scoping
   * @param userId - User creating the department
   * @returns Created department
   */
  async createDepartment(
    dto: CreateDepartmentDto,
    churchId: string,
    userId: string,
  ): Promise<DepartmentResponseDto> {
    // Validate parent department exists within the same church if provided
    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, church_id: churchId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent department ${dto.parentId} not found`);
      }
    }

    // Create the department record in the database
    const department = await this.prisma.department.create({
      data: {
        church_id: churchId,
        name: dto.name,
        description: dto.description,
        parent_id: dto.parentId,
      },
    });

    // Log the creation for operational monitoring
    this.logger.log(`Department created: ${department.id} (${department.name})`);

    // Record the creation in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'CREATE',
      entity: 'department',
      entityId: department.id,
      newValues: { name: department.name },
    });

    // Map the Prisma record to a response DTO and return
    return this.mapDepartmentToResponseDto(department, []);
  }

  /**
   * Lists departments for a church.
   *
   * @param churchId - Church ID
   * @returns List of departments with member counts
   */
  async listDepartments(churchId: string): Promise<DepartmentResponseDto[]> {
    // Query all departments for the church with their members
    const departments = await this.prisma.department.findMany({
      where: { church_id: churchId },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Map each department to a response DTO with member info
    return departments.map((d) => this.mapDepartmentToResponseDto(d, d.department_members));
  }

  /**
   * Gets a single department by ID.
   *
   * @param departmentId - Department ID
   * @param churchId - Church ID
   * @returns Department with members
   */
  async getDepartmentById(departmentId: string, churchId: string): Promise<DepartmentResponseDto> {
    // Fetch the department by ID scoped to the church
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    });

    // Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Map and return the department with its members
    return this.mapDepartmentToResponseDto(department, department.department_members);
  }

  /**
   * Updates a department.
   *
   * @param departmentId - Department ID
   * @param dto - Update data
   * @param churchId - Church ID
   * @param userId - User performing update
   * @returns Updated department
   */
  async updateDepartment(
    departmentId: string,
    dto: Partial<CreateDepartmentDto>,
    churchId: string,
    userId: string,
  ): Promise<DepartmentResponseDto> {
    // Verify the department exists within this church
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    // Throw NotFoundException if department does not exist
    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Apply partial updates to the department record
    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parent_id: dto.parentId }),
      },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    });

    // Log the update for operational monitoring
    this.logger.log(`Department updated: ${departmentId}`);

    // Record the update in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'UPDATE',
      entity: 'department',
      entityId: departmentId,
      newValues: {
        updatedFields: Object.keys(dto).filter(
          (k) => dto[k as keyof CreateDepartmentDto] !== undefined,
        ),
      },
    });

    // Map and return the updated department
    return this.mapDepartmentToResponseDto(updated, updated.department_members);
  }

  /**
   * Deletes a department. Blocked if members are assigned.
   *
   * @param departmentId - Department ID
   * @param churchId - Church ID
   * @param userId - User performing delete
   */
  async deleteDepartment(departmentId: string, churchId: string, userId: string): Promise<void> {
    // Fetch the department with member count
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
      include: { _count: { select: { department_members: true } } },
    });

    // Throw NotFoundException if department does not exist
    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Block deletion if department has assigned members
    if (existing._count.department_members > 0) {
      throw new ConflictException(
        'Cannot delete department with assigned members. Remove all members first.',
      );
    }

    // Delete the department record
    await this.prisma.department.delete({ where: { id: departmentId } });

    // Log the deletion for operational monitoring
    this.logger.log(`Department deleted: ${departmentId}`);

    // Record the deletion in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'DELETE',
      entity: 'department',
      entityId: departmentId,
      newValues: { name: existing.name },
    });
  }

  /**
   * Adds a member to a department.
   *
   * @param departmentId - Department ID
   * @param dto - Member addition data
   * @param churchId - Church ID
   * @param userId - User performing the action
   */
  async addDepartmentMember(
    departmentId: string,
    dto: AddDepartmentMemberDto,
    churchId: string,
    userId: string,
  ): Promise<void> {
    // Verify the department exists within this church
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    // Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Verify the member belongs to this church
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, church_id: churchId },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this church');
    }

    // Check if the member is already assigned to this department
    const existing = await this.prisma.departmentMember.findUnique({
      where: { department_id_member_id: { department_id: departmentId, member_id: dto.memberId } },
    });

    // Throw ConflictException if member is already in the department
    if (existing) {
      throw new ConflictException(`Member ${dto.memberId} is already in this department`);
    }

    // Create the department-member assignment record
    await this.prisma.departmentMember.create({
      data: {
        department_id: departmentId,
        member_id: dto.memberId,
        role: dto.role || 'member',
      },
    });

    // Log the assignment for operational monitoring
    this.logger.log(`Member ${dto.memberId} added to department ${departmentId}`);

    // Record the assignment in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'CREATE',
      entity: 'department_member',
      entityId: departmentId,
      newValues: { memberId: dto.memberId, role: dto.role || 'member' },
    });
  }

  /**
   * Removes a member from a department.
   *
   * @param departmentId - Department ID
   * @param memberId - Member ID
   * @param churchId - Church ID
   * @param userId - User performing the action
   */
  async removeDepartmentMember(
    departmentId: string,
    memberId: string,
    churchId: string,
    userId: string,
  ): Promise<void> {
    // Verify the member is assigned to this department
    const existing = await this.prisma.departmentMember.findUnique({
      where: { department_id_member_id: { department_id: departmentId, member_id: memberId } },
    });

    // Throw NotFoundException if the membership record does not exist
    if (!existing) {
      throw new NotFoundException(`Member ${memberId} not found in department ${departmentId}`);
    }

    // Delete the department-member assignment record
    await this.prisma.departmentMember.delete({
      where: { department_id_member_id: { department_id: departmentId, member_id: memberId } },
    });

    // Log the removal for operational monitoring
    this.logger.log(`Member ${memberId} removed from department ${departmentId}`);

    // Record the removal in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'DELETE',
      entity: 'department_member',
      entityId: departmentId,
      newValues: { memberId },
    });
  }

  // ─── Cell Groups ──────────────────────────────────────────

  /**
   * Creates a new cell group.
   *
   * @param dto - Cell group creation data
   * @param churchId - Church ID
   * @param userId - User creating the cell group
   * @returns Created cell group
   */
  async createCellGroup(
    dto: CreateCellGroupDto,
    churchId: string,
    userId: string,
  ): Promise<CellGroupResponseDto> {
    // Create the cell group record in the database
    const group = await this.prisma.cellGroup.create({
      data: {
        church_id: churchId,
        name: dto.name,
        branch_id: dto.branchId,
        leader_id: dto.leaderId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        meeting_day: dto.meetingDay,
        meeting_time: dto.meetingTime,
      },
    });

    // Log the creation for operational monitoring
    this.logger.log(`Cell group created: ${group.id} (${group.name})`);

    // Record the creation in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'CREATE',
      entity: 'cell_group',
      entityId: group.id,
      newValues: { name: group.name },
    });

    // Map the Prisma record to a response DTO and return
    return this.mapCellGroupToResponseDto(group);
  }

  /**
   * Lists cell groups for a church.
   *
   * @param churchId - Church ID
   * @returns List of cell groups
   */
  async listCellGroups(churchId: string): Promise<CellGroupResponseDto[]> {
    // Query all cell groups for the church ordered by name
    const groups = await this.prisma.cellGroup.findMany({
      where: { church_id: churchId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    // Map each group to a response DTO
    return groups.map((g) => this.mapCellGroupToResponseDto(g));
  }

  /**
   * Gets a single cell group by ID.
   *
   * @param groupId - Cell group ID
   * @param churchId - Church ID
   * @returns Cell group data
   */
  async getCellGroupById(groupId: string, churchId: string): Promise<CellGroupResponseDto> {
    // Fetch the cell group by ID scoped to the church
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
      include: { branch: { select: { id: true, name: true } } },
    });

    // Throw NotFoundException if group does not exist
    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Map and return the cell group
    return this.mapCellGroupToResponseDto(group);
  }

  /**
   * Updates a cell group.
   *
   * @param groupId - Cell group ID
   * @param dto - Update data
   * @param churchId - Church ID
   * @param userId - User performing update
   * @returns Updated cell group
   */
  async updateCellGroup(
    groupId: string,
    dto: Partial<CreateCellGroupDto>,
    churchId: string,
    userId: string,
  ): Promise<CellGroupResponseDto> {
    // Verify the cell group exists within this church
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Throw NotFoundException if group does not exist
    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Apply partial updates to the cell group record
    const updated = await this.prisma.cellGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.branchId !== undefined && { branch_id: dto.branchId }),
        ...(dto.leaderId !== undefined && { leader_id: dto.leaderId }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.meetingDay !== undefined && { meeting_day: dto.meetingDay }),
        ...(dto.meetingTime !== undefined && { meeting_time: dto.meetingTime }),
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    // Log the update for operational monitoring
    this.logger.log(`Cell group updated: ${groupId}`);

    // Record the update in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'UPDATE',
      entity: 'cell_group',
      entityId: groupId,
      newValues: {
        updatedFields: Object.keys(dto).filter(
          (k) => dto[k as keyof CreateCellGroupDto] !== undefined,
        ),
      },
    });

    // Map and return the updated cell group
    return this.mapCellGroupToResponseDto(updated);
  }

  /**
   * Deletes a cell group.
   *
   * @param groupId - Cell group ID
   * @param churchId - Church ID
   * @param userId - User performing delete
   */
  async deleteCellGroup(groupId: string, churchId: string, userId: string): Promise<void> {
    // Verify the cell group exists within this church
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Throw NotFoundException if group does not exist
    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Delete the cell group record
    await this.prisma.cellGroup.delete({ where: { id: groupId } });

    // Log the deletion for operational monitoring
    this.logger.log(`Cell group deleted: ${groupId}`);

    // Record the deletion in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'DELETE',
      entity: 'cell_group',
      entityId: groupId,
      newValues: { name: existing.name },
    });
  }

  // ─── Cell Group Members ─────────────────────────────────────

  /**
   * Adds a member to a cell group.
   */
  async addCellGroupMember(
    groupId: string,
    memberId: string,
    role: string,
    churchId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Verify the member belongs to this church
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, church_id: churchId },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this church');
    }

    const existing = await this.prisma.cellGroupMember.findUnique({
      where: {
        cell_group_id_member_id: { cell_group_id: groupId, member_id: memberId },
      },
    });

    if (existing) {
      throw new ConflictException(`Member ${memberId} is already in this cell group`);
    }

    await this.prisma.cellGroupMember.create({
      data: {
        cell_group_id: groupId,
        member_id: memberId,
        role: role || 'member',
      },
    });

    await this.audit.log({
      userId,
      churchId,
      action: 'CREATE',
      entity: 'cell_group_member',
      entityId: groupId,
      newValues: { memberId, role: role || 'member' },
    });

    this.logger.log(`Member ${memberId} added to cell group ${groupId}`);
  }

  /**
   * Removes a member from a cell group.
   */
  async removeCellGroupMember(
    groupId: string,
    memberId: string,
    churchId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.cellGroupMember.findUnique({
      where: {
        cell_group_id_member_id: { cell_group_id: groupId, member_id: memberId },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Member ${memberId} not found in cell group ${groupId}`);
    }

    await this.prisma.cellGroupMember.delete({
      where: {
        cell_group_id_member_id: { cell_group_id: groupId, member_id: memberId },
      },
    });

    await this.audit.log({
      userId,
      churchId,
      action: 'DELETE',
      entity: 'cell_group_member',
      entityId: groupId,
      newValues: { memberId },
    });

    this.logger.log(`Member ${memberId} removed from cell group ${groupId}`);
  }

  /**
   * Lists members of a cell group.
   */
  async listCellGroupMembers(
    groupId: string,
    churchId: string,
  ): Promise<
    Array<{
      id: string;
      memberId: string;
      firstName: string;
      lastName: string;
      role: string;
      joinedAt: string;
    }>
  > {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    const members = await this.prisma.cellGroupMember.findMany({
      where: { cell_group_id: groupId },
      include: {
        member: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { joined_at: 'desc' },
    });

    return members.map((m) => ({
      id: m.id,
      memberId: m.member_id,
      firstName: m.member?.first_name || '',
      lastName: m.member?.last_name || '',
      role: m.role,
      joinedAt: m.joined_at.toISOString(),
    }));
  }

  // ─── Cell Group Attendance ─────────────────────────────────

  /**
   * Records attendance for a cell group meeting.
   */
  async recordCellGroupAttendance(
    groupId: string,
    memberId: string | undefined,
    visitorId: string | undefined,
    visitorName: string | undefined,
    meetingDate: string,
    status: string,
    notes: string | undefined,
    churchId: string,
    userId: string,
  ): Promise<void> {
    // Attendance must reference a member, a visitor, or a free-text walk-in name
    if (!memberId && !visitorId && !visitorName) {
      throw new BadRequestException(
        'An attendance record requires a member, a visitor, or a visitor name',
      );
    }

    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    let resolvedVisitorName = visitorName;

    // Verify the member belongs to this church
    if (memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: memberId, church_id: churchId },
        select: { id: true },
      });

      if (!member) {
        throw new NotFoundException('Member not found in this church');
      }
    }

    // Verify the visitor belongs to this church and resolve their name
    if (visitorId) {
      const visitor = await this.prisma.visitor.findFirst({
        where: { id: visitorId, church_id: churchId },
        select: { first_name: true, last_name: true },
      });

      if (!visitor) {
        throw new NotFoundException('Visitor not found in this church');
      }

      resolvedVisitorName =
        resolvedVisitorName || `${visitor.first_name} ${visitor.last_name || ''}`.trim();
    }

    const meetingDateObj = new Date(meetingDate);

    const existing = memberId
      ? await this.prisma.cellGroupAttendance.findUnique({
          where: {
            cell_group_id_member_id_meeting_date: {
              cell_group_id: groupId,
              member_id: memberId,
              meeting_date: meetingDateObj,
            },
          },
        })
      : visitorId
        ? await this.prisma.cellGroupAttendance.findUnique({
            where: {
              cell_group_id_visitor_id_meeting_date: {
                cell_group_id: groupId,
                visitor_id: visitorId,
                meeting_date: meetingDateObj,
              },
            },
          })
        : null;

    const subject = memberId
      ? `member ${memberId}`
      : visitorId
        ? `visitor ${visitorId}`
        : `walk-in ${visitorName || ''}`.trim();

    if (existing) {
      // Update existing attendance record
      await this.prisma.cellGroupAttendance.update({
        where: existing.member_id
          ? {
              cell_group_id_member_id_meeting_date: {
                cell_group_id: groupId,
                member_id: existing.member_id,
                meeting_date: meetingDateObj,
              },
            }
          : {
              cell_group_id_visitor_id_meeting_date: {
                cell_group_id: groupId,
                visitor_id: existing.visitor_id || '',
                meeting_date: meetingDateObj,
              },
            },
        data: {
          status: status || 'present',
          notes: notes ?? null,
          ...(resolvedVisitorName !== undefined && { visitor_name: resolvedVisitorName }),
        },
      });

      this.logger.log(`Cell group attendance updated: ${groupId} ${subject}`);
    } else {
      await this.prisma.cellGroupAttendance.create({
        data: {
          cell_group_id: groupId,
          member_id: memberId ?? null,
          visitor_id: visitorId ?? null,
          visitor_name: resolvedVisitorName ?? null,
          meeting_date: meetingDateObj,
          status: status || 'present',
          notes: notes ?? null,
        },
      });

      this.logger.log(`Cell group attendance recorded: ${groupId} ${subject}`);
    }

    await this.audit.log({
      userId,
      churchId,
      action: 'CREATE',
      entity: 'cell_group_attendance',
      newValues: {
        groupId,
        memberId,
        visitorId,
        visitorName: resolvedVisitorName,
        meetingDate,
        status,
      },
    });
  }

  /**
   * Lists attendance records for a cell group.
   */
  async listCellGroupAttendance(
    groupId: string,
    churchId: string,
    meetingDate?: string,
  ): Promise<
    Array<{
      id: string;
      memberId: string | undefined;
      firstName: string;
      lastName: string;
      visitorId: string | undefined;
      visitorName: string | undefined;
      status: string;
      notes: string | null;
      meetingDate: string;
    }>
  > {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    const where: Prisma.CellGroupAttendanceWhereInput = {
      cell_group_id: groupId,
    };

    if (meetingDate) {
      where.meeting_date = new Date(meetingDate);
    }

    const records = await this.prisma.cellGroupAttendance.findMany({
      where,
      include: {
        member: { select: { id: true, first_name: true, last_name: true } },
        visitor: { select: { first_name: true, last_name: true } },
      },
      orderBy: [{ meeting_date: 'desc' }, { created_at: 'desc' }],
    });

    return records.map((r) => {
      const visitorName =
        r.visitor_name ||
        (r.visitor ? `${r.visitor.first_name} ${r.visitor.last_name || ''}`.trim() : '');

      return {
        id: r.id,
        memberId: r.member_id || undefined,
        firstName: r.member?.first_name || '',
        lastName: r.member?.last_name || '',
        visitorId: r.visitor_id || undefined,
        visitorName: visitorName || undefined,
        status: r.status,
        notes: r.notes,
        meetingDate: r.meeting_date.toISOString(),
      };
    });
  }

  /**
   * Gets attendance summary for a cell group.
   */
  async getCellGroupAttendanceSummary(
    groupId: string,
    churchId: string,
  ): Promise<{
    totalMeetings: number;
    averageAttendance: number;
    memberCount: number;
  }> {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    const memberCount = await this.prisma.cellGroupMember.count({
      where: { cell_group_id: groupId },
    });

    const dates = await this.prisma.cellGroupAttendance.findMany({
      where: { cell_group_id: groupId },
      select: { meeting_date: true },
      distinct: ['meeting_date'],
    });

    const totalMeetings = dates.length;

    let averageAttendance = 0;
    if (totalMeetings > 0) {
      const totalRecords = await this.prisma.cellGroupAttendance.count({
        where: { cell_group_id: groupId },
      });
      averageAttendance = Math.round(totalRecords / totalMeetings);
    }

    return { totalMeetings, averageAttendance, memberCount };
  }

  /**
   * Finds nearest cell groups based on geolocation.
   * Uses Haversine formula for distance calculation.
   *
   * @param latitude - User's latitude
   * @param longitude - User's longitude
   * @param churchId - Church ID
   * @param limit - Max results
   * @returns Nearest cell groups with distances
   */
  async findNearestGroups(
    latitude: number,
    longitude: number,
    churchId: string,
    limit = 5,
  ): Promise<NearestGroupResponseDto[]> {
    // Fetch all cell groups with geolocation data for this church
    const groups = await this.prisma.cellGroup.findMany({
      where: {
        church_id: churchId,
        latitude: { not: null },
        longitude: { not: null },
      },
    });

    // Calculate distance from user to each group using Haversine formula
    const groupsWithDistance = groups
      .map((group) => {
        const distance = this.haversineDistance(
          latitude,
          longitude,
          group.latitude!,
          group.longitude!,
        );
        return {
          ...this.mapCellGroupToResponseDto(group),
          distanceKm: Math.round(distance * 100) / 100,
        };
      })
      // Sort groups by distance (nearest first)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      // Limit results to the requested number
      .slice(0, limit);

    // Return the nearest groups with distances
    return groupsWithDistance;
  }

  // ─── Private Helpers ──────────────────────────────────────

  /**
   * Calculates distance between two points using the Haversine formula.
   *
   * @param lat1 - Latitude of point 1
   * @param lon1 - Longitude of point 1
   * @param lat2 - Latitude of point 2
   * @param lon2 - Longitude of point 2
   * @returns Distance in kilometers
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Set Earth's radius in kilometers
    const R = 6371; // Earth's radius in km
    // Convert latitude and longitude differences to radians
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    // Calculate the Haversine intermediate value (a)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    // Calculate the angular distance in radians (c)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Multiply by Earth's radius to get distance in km
    return R * c;
  }

  /**
   * Converts degrees to radians.
   */
  private toRad(deg: number): number {
    // Convert degrees to radians using the standard formula
    return (deg * Math.PI) / 180;
  }

  /**
   * Maps a Prisma Department record to a response DTO.
   */
  private mapDepartmentToResponseDto(
    dept: {
      id: string;
      church_id: string;
      name: string;
      description: string | null;
      parent_id: string | null;
      created_at: Date;
      updated_at: Date;
    },
    members: Array<{
      id: string;
      member_id: string;
      role: string;
      joined_at: Date;
      member?: { first_name: string; last_name: string } | null;
    }>,
  ): DepartmentResponseDto {
    // Map the department fields to camelCase DTO properties
    return {
      id: dept.id,
      churchId: dept.church_id,
      name: dept.name,
      description: dept.description || undefined,
      parentId: dept.parent_id || undefined,
      // Map each member record to a DepartmentMemberDto
      members: members.map((m) => ({
        id: m.id,
        memberId: m.member_id,
        firstName: m.member?.first_name || '',
        lastName: m.member?.last_name || '',
        role: m.role,
        joinedAt: m.joined_at.toISOString(),
      })),
      // Set the total member count
      memberCount: members.length,
      // Convert timestamp fields to ISO strings
      createdAt: dept.created_at.toISOString(),
      updatedAt: dept.updated_at.toISOString(),
    };
  }

  // ─── Multi-Church Federation (Super Admin) ────────────────

  /**
   * Lists all churches for super_admin users.
   * Returns summary data for each church including member counts
   * and basic admin info.
   */
  async listAllChurches(): Promise<
    Array<{
      id: string;
      name: string;
      denomination: string | null;
      city: string | null;
      state: string | null;
      memberCount: number;
      activeMemberCount: number;
      branchCount: number;
      monthlyGivingTotal: number;
      adminName: string;
      adminEmail: string;
      createdAt: string;
    }>
  > {
    const churches = await this.prisma.church.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        denomination: true,
        city: true,
        state: true,
        created_at: true,
        _count: { select: { members: true, branches: true } },
      },
    });

    const results = [];
    for (const church of churches) {
      const activeMemberCount = await this.prisma.member.count({
        where: { church_id: church.id, status: 'active' },
      });

      // Monthly giving total
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const givingAgg = await this.prisma.transaction.aggregate({
        where: {
          church_id: church.id,
          status: 'success',
          created_at: { gte: firstOfMonth },
        },
        _sum: { amount: true },
      });

      // Get the first admin profile for contact info
      const adminProfile = await this.prisma.profile.findFirst({
        where: { church_id: church.id, role: { hasSome: ['church_admin', 'senior_pastor'] } },
        select: { first_name: true, last_name: true },
      });

      results.push({
        id: church.id,
        name: church.name,
        denomination: church.denomination,
        city: church.city,
        state: church.state,
        memberCount: church._count.members,
        activeMemberCount,
        branchCount: church._count.branches,
        monthlyGivingTotal: givingAgg._sum.amount || 0,
        adminName: adminProfile ? `${adminProfile.first_name} ${adminProfile.last_name}` : 'N/A',
        adminEmail: '',
        createdAt: church.created_at.toISOString(),
      });
    }

    return results;
  }

  /**
   * Gets cross-church analytics for super_admin.
   * Aggregates key metrics across all churches.
   */
  async getCrossChurchAnalytics(): Promise<{
    totalChurches: number;
    totalMembers: number;
    totalActiveMembers: number;
    totalBranches: number;
    totalMonthlyGiving: number;
    averageMembersPerChurch: number;
    averageGivingPerChurch: number;
    churches: Array<{
      id: string;
      name: string;
      denomination: string | null;
      city: string | null;
      state: string | null;
      memberCount: number;
      activeMemberCount: number;
      branchCount: number;
      monthlyGivingTotal: number;
      adminName: string;
      adminEmail: string;
      createdAt: string;
    }>;
  }> {
    const churches = await this.listAllChurches();

    const totalMembers = churches.reduce((sum, c) => sum + c.memberCount, 0);
    const totalActiveMembers = churches.reduce((sum, c) => sum + c.activeMemberCount, 0);
    const totalBranches = churches.reduce((sum, c) => sum + c.branchCount, 0);
    const totalMonthlyGiving = churches.reduce((sum, c) => sum + c.monthlyGivingTotal, 0);
    const totalChurches = churches.length;

    return {
      totalChurches,
      totalMembers,
      totalActiveMembers,
      totalBranches,
      totalMonthlyGiving,
      averageMembersPerChurch: totalChurches > 0 ? Math.round(totalMembers / totalChurches) : 0,
      averageGivingPerChurch:
        totalChurches > 0 ? Math.round(totalMonthlyGiving / totalChurches) : 0,
      churches,
    };
  }

  /**
   * Maps a Prisma CellGroup record to a response DTO.
   */
  private mapCellGroupToResponseDto(group: {
    id: string;
    church_id: string;
    branch_id: string | null;
    name: string;
    leader_id: string | null;
    latitude: number | null;
    longitude: number | null;
    meeting_day: string | null;
    meeting_time: string | null;
    created_at: Date;
    updated_at: Date;
    branch?: { id: string; name: string } | null;
  }): CellGroupResponseDto {
    // Map the cell group fields to camelCase DTO properties
    return {
      id: group.id,
      churchId: group.church_id,
      name: group.name,
      leaderId: group.leader_id || undefined,
      branchId: group.branch_id || undefined,
      branchName: group.branch?.name,
      latitude: group.latitude || undefined,
      longitude: group.longitude || undefined,
      meetingDay: group.meeting_day || undefined,
      meetingTime: group.meeting_time || undefined,
      // Convert timestamp fields to ISO strings
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    };
  }
}
