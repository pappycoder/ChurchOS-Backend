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

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateDepartmentDto, AddDepartmentMemberDto } from './dto/create-department.dto';
import { CreateCellGroupDto } from './dto/create-cell-group.dto';
import {
  DepartmentResponseDto,
  CellGroupResponseDto,
  NearestGroupResponseDto,
} from './dto/admin-response.dto';

@Injectable()
export class AdminService {
  // Step 1: Initialize logger for this service
  private readonly logger = new Logger(AdminService.name);

  constructor(
    // Step 1: Inject PrismaService for database access
    private readonly prisma: PrismaService,
    // Step 2: Inject AuditLoggingService for mutation audit trails
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
    // Step 1: Validate parent department exists within the same church if provided
    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, church_id: churchId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent department ${dto.parentId} not found`);
      }
    }

    // Step 2: Create the department record in the database
    const department = await this.prisma.department.create({
      data: {
        church_id: churchId,
        name: dto.name,
        description: dto.description,
        parent_id: dto.parentId,
      },
    });

    // Step 3: Log the creation for operational monitoring
    this.logger.log(`Department created: ${department.id} (${department.name})`);

    // Step 4: Record the creation in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'CREATE',
      entity: 'department',
      entityId: department.id,
      newValues: { name: department.name },
    });

    // Step 5: Map the Prisma record to a response DTO and return
    return this.mapDepartmentToResponseDto(department, []);
  }

  /**
   * Lists departments for a church.
   *
   * @param churchId - Church ID
   * @returns List of departments with member counts
   */
  async listDepartments(churchId: string): Promise<DepartmentResponseDto[]> {
    // Step 1: Query all departments for the church with their members
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

    // Step 2: Map each department to a response DTO with member info
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
    // Step 1: Fetch the department by ID scoped to the church
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

    // Step 2: Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Step 3: Map and return the department with its members
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
    // Step 1: Verify the department exists within this church
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    // Step 2: Throw NotFoundException if department does not exist
    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Step 3: Apply partial updates to the department record
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

    // Step 4: Log the update for operational monitoring
    this.logger.log(`Department updated: ${departmentId}`);

    // Step 5: Record the update in the audit log
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

    // Step 6: Map and return the updated department
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
    // Step 1: Fetch the department with member count
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
      include: { _count: { select: { department_members: true } } },
    });

    // Step 2: Throw NotFoundException if department does not exist
    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Step 3: Block deletion if department has assigned members
    if (existing._count.department_members > 0) {
      throw new ConflictException(
        'Cannot delete department with assigned members. Remove all members first.',
      );
    }

    // Step 4: Delete the department record
    await this.prisma.department.delete({ where: { id: departmentId } });

    // Step 5: Log the deletion for operational monitoring
    this.logger.log(`Department deleted: ${departmentId}`);

    // Step 6: Record the deletion in the audit log
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
    // Step 1: Verify the department exists within this church
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    // Step 2: Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Step 3: Check if the member is already assigned to this department
    const existing = await this.prisma.departmentMember.findUnique({
      where: { department_id_member_id: { department_id: departmentId, member_id: dto.memberId } },
    });

    // Step 4: Throw ConflictException if member is already in the department
    if (existing) {
      throw new ConflictException(`Member ${dto.memberId} is already in this department`);
    }

    // Step 5: Create the department-member assignment record
    await this.prisma.departmentMember.create({
      data: {
        department_id: departmentId,
        member_id: dto.memberId,
        role: dto.role || 'member',
      },
    });

    // Step 6: Log the assignment for operational monitoring
    this.logger.log(`Member ${dto.memberId} added to department ${departmentId}`);

    // Step 7: Record the assignment in the audit log
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
    // Step 1: Verify the member is assigned to this department
    const existing = await this.prisma.departmentMember.findUnique({
      where: { department_id_member_id: { department_id: departmentId, member_id: memberId } },
    });

    // Step 2: Throw NotFoundException if the membership record does not exist
    if (!existing) {
      throw new NotFoundException(`Member ${memberId} not found in department ${departmentId}`);
    }

    // Step 3: Delete the department-member assignment record
    await this.prisma.departmentMember.delete({
      where: { department_id_member_id: { department_id: departmentId, member_id: memberId } },
    });

    // Step 4: Log the removal for operational monitoring
    this.logger.log(`Member ${memberId} removed from department ${departmentId}`);

    // Step 5: Record the removal in the audit log
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
    // Step 1: Create the cell group record in the database
    const group = await this.prisma.cellGroup.create({
      data: {
        church_id: churchId,
        name: dto.name,
        leader_id: dto.leaderId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        meeting_day: dto.meetingDay,
        meeting_time: dto.meetingTime,
      },
    });

    // Step 2: Log the creation for operational monitoring
    this.logger.log(`Cell group created: ${group.id} (${group.name})`);

    // Step 3: Record the creation in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'CREATE',
      entity: 'cell_group',
      entityId: group.id,
      newValues: { name: group.name },
    });

    // Step 4: Map the Prisma record to a response DTO and return
    return this.mapCellGroupToResponseDto(group);
  }

  /**
   * Lists cell groups for a church.
   *
   * @param churchId - Church ID
   * @returns List of cell groups
   */
  async listCellGroups(churchId: string): Promise<CellGroupResponseDto[]> {
    // Step 1: Query all cell groups for the church ordered by name
    const groups = await this.prisma.cellGroup.findMany({
      where: { church_id: churchId },
      orderBy: { name: 'asc' },
    });

    // Step 2: Map each group to a response DTO
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
    // Step 1: Fetch the cell group by ID scoped to the church
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Step 2: Throw NotFoundException if group does not exist
    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Step 3: Map and return the cell group
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
    // Step 1: Verify the cell group exists within this church
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Step 2: Throw NotFoundException if group does not exist
    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Step 3: Apply partial updates to the cell group record
    const updated = await this.prisma.cellGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.leaderId !== undefined && { leader_id: dto.leaderId }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.meetingDay !== undefined && { meeting_day: dto.meetingDay }),
        ...(dto.meetingTime !== undefined && { meeting_time: dto.meetingTime }),
      },
    });

    // Step 4: Log the update for operational monitoring
    this.logger.log(`Cell group updated: ${groupId}`);

    // Step 5: Record the update in the audit log
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

    // Step 6: Map and return the updated cell group
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
    // Step 1: Verify the cell group exists within this church
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Step 2: Throw NotFoundException if group does not exist
    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Step 3: Delete the cell group record
    await this.prisma.cellGroup.delete({ where: { id: groupId } });

    // Step 4: Log the deletion for operational monitoring
    this.logger.log(`Cell group deleted: ${groupId}`);

    // Step 5: Record the deletion in the audit log
    await this.audit.log({
      churchId,
      userId,
      action: 'DELETE',
      entity: 'cell_group',
      entityId: groupId,
      newValues: { name: existing.name },
    });
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
    // Step 1: Fetch all cell groups with geolocation data for this church
    const groups = await this.prisma.cellGroup.findMany({
      where: {
        church_id: churchId,
        latitude: { not: null },
        longitude: { not: null },
      },
    });

    // Step 2: Calculate distance from user to each group using Haversine formula
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
      // Step 3: Sort groups by distance (nearest first)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      // Step 4: Limit results to the requested number
      .slice(0, limit);

    // Step 5: Return the nearest groups with distances
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
    // Step 1: Set Earth's radius in kilometers
    const R = 6371; // Earth's radius in km
    // Step 2: Convert latitude and longitude differences to radians
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    // Step 3: Calculate the Haversine intermediate value (a)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    // Step 4: Calculate the angular distance in radians (c)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Step 5: Multiply by Earth's radius to get distance in km
    return R * c;
  }

  /**
   * Converts degrees to radians.
   */
  private toRad(deg: number): number {
    // Step 1: Convert degrees to radians using the standard formula
    return (deg * Math.PI) / 180;
  }

  /**
   * Maps a Prisma Department record to a response DTO.
   */
  private mapDepartmentToResponseDto(dept: any, members: any[]): DepartmentResponseDto {
    // Step 1: Map the department fields to camelCase DTO properties
    return {
      id: dept.id,
      churchId: dept.church_id,
      name: dept.name,
      description: dept.description || undefined,
      parentId: dept.parent_id || undefined,
      // Step 2: Map each member record to a DepartmentMemberDto
      members: members.map((m) => ({
        id: m.id,
        memberId: m.member_id,
        firstName: m.member?.first_name || '',
        lastName: m.member?.last_name || '',
        role: m.role,
        joinedAt: m.joined_at.toISOString(),
      })),
      // Step 3: Set the total member count
      memberCount: members.length,
      // Step 4: Convert timestamp fields to ISO strings
      createdAt: dept.created_at.toISOString(),
      updatedAt: dept.updated_at.toISOString(),
    };
  }

  /**
   * Maps a Prisma CellGroup record to a response DTO.
   */
  private mapCellGroupToResponseDto(group: any): CellGroupResponseDto {
    // Step 1: Map the cell group fields to camelCase DTO properties
    return {
      id: group.id,
      churchId: group.church_id,
      name: group.name,
      leaderId: group.leader_id || undefined,
      latitude: group.latitude || undefined,
      longitude: group.longitude || undefined,
      meetingDay: group.meeting_day || undefined,
      meetingTime: group.meeting_time || undefined,
      // Step 2: Convert timestamp fields to ISO strings
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    };
  }
}
