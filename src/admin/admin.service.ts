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
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { BranchScopeService, ViewerScope } from '../common/services/branch-scope.service';
import { Prisma } from '@prisma/client';
import { CreateDepartmentDto, AddDepartmentMemberDto } from './dto/create-department.dto';
import { CreateCellGroupDto } from './dto/create-cell-group.dto';
import { ListCellGroupsDto } from './dto/list-cell-groups.dto';
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
    private readonly branchScope: BranchScopeService,
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

    // Validate the branch + head assignments (church-scoped)
    await this.validateDepartmentAssignments(churchId, dto.branchId, dto.headMemberId);

    // Create the department record in the database
    const department = await this.prisma.department.create({
      data: {
        church_id: churchId,
        name: dto.name,
        description: dto.description,
        parent_id: dto.parentId,
        branch_id: dto.branchId,
        head_member_id: dto.headMemberId,
      },
      include: { branch: { select: { id: true, name: true } } },
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

    // Resolve the assigned head's name for the response
    const heads = await this.resolveDepartmentHeads(churchId, [department]);

    // Map the Prisma record to a response DTO and return
    return this.mapDepartmentToResponseDto(
      department,
      [],
      heads.get(department.head_member_id || ''),
    );
  }

  /**
   * Lists departments for a church.
   *
   * @param churchId - Church ID
   * @param archived - Whether to list archived departments only
   * @param viewer - The request profile-derived viewer context, if any
   * @returns List of departments with member counts
   */
  async listDepartments(
    churchId: string,
    archived: boolean = false,
    viewer?: ViewerScope | null,
  ): Promise<DepartmentResponseDto[]> {
    // A branch-restricted department_head sees only the department(s) they
    // head. The head scope is detected by key presence ('headId') so a viewer
    // with no linked member can never fall through to the unfiltered list.
    const scope = this.branchScope.resolveDepartmentScope(viewer);
    const isHeadScope = !scope.churchOnly && 'headId' in scope;

    // Query all departments for the church with their members
    const departments = await this.prisma.department.findMany({
      where: {
        church_id: churchId,
        archived_at: archived ? { not: null } : null,
        ...(isHeadScope ? { head_member_id: scope.headId || '' } : {}),
      },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Resolve the assigned heads' names for the responses
    const heads = await this.resolveDepartmentHeads(churchId, departments.flatMap((d) => d));

    // Map each department to a response DTO with member info
    return departments.map((d) =>
      this.mapDepartmentToResponseDto(d, d.department_members, heads.get(d.head_member_id || '')),
    );
  }

  /**
   * Gets a single department by ID.
   *
   * @param departmentId - Department ID
   * @param churchId - Church ID
   * @param viewer - The request profile-derived viewer context, if any
   * @returns Department with members
   */
  async getDepartmentById(
    departmentId: string,
    churchId: string,
    viewer?: ViewerScope | null,
  ): Promise<DepartmentResponseDto> {
    // A branch-restricted department_head may only fetch the department(s)
    // they head; other departments resolve to a silent 404 for them.
    const scope = this.branchScope.resolveDepartmentScope(viewer);
    const isHeadScope = !scope.churchOnly && 'headId' in scope;

    // Fetch the department by ID scoped to the church
    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        church_id: churchId,
        ...(isHeadScope ? { head_member_id: scope.headId || '' } : {}),
      },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    // Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Resolve the assigned head's name for the response
    const heads = await this.resolveDepartmentHeads(churchId, [department]);

    // Map and return the department with its members
    return this.mapDepartmentToResponseDto(
      department,
      department.department_members,
      heads.get(department.head_member_id || ''),
    );
  }

  /**
   * Updates a department.
   *
   * @param departmentId - Department ID
   * @param dto - Update data
   * @param churchId - Church ID
   * @param userId - User performing update
   * @param viewer - The request profile-derived viewer context, if any
   * @returns Updated department
   */
  async updateDepartment(
    departmentId: string,
    dto: Partial<CreateDepartmentDto>,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<DepartmentResponseDto> {
    // Verify the department exists within this church
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    // Throw NotFoundException if department does not exist
    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    if (existing.archived_at) {
      throw new NotFoundException('Department is archived');
    }

    // An admin-HQ department head is read-only (view + export only).
    this.assertDepartmentHeadHqReadOnly(viewer);

    // A branch-restricted department head may only update their own department.
    this.assertDepartmentHeadOwnership(viewer, existing);

    // A branch-restricted department head may change every field EXCEPT the
    // branch and head — reassigning those is church-admin-only. The payload is
    // silently stripped (never an error) so clients can keep sending the full form.
    const restrictedHead =
      (viewer?.role === 'department_head' || viewer?.roles?.includes('department_head')) &&
      !viewer?.is_admin_hq;

    // Validate the branch + head assignments when the caller is allowed to set them
    if (!restrictedHead) {
      await this.validateDepartmentAssignments(churchId, dto.branchId, dto.headMemberId);
    }

    // Apply partial updates to the department record
    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parent_id: dto.parentId }),
        ...(dto.branchId !== undefined && !restrictedHead && { branch_id: dto.branchId }),
        ...(dto.headMemberId !== undefined &&
          !restrictedHead && { head_member_id: dto.headMemberId }),
      },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
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

    // Resolve the assigned head's name for the response
    const heads = await this.resolveDepartmentHeads(churchId, [updated]);

    // Map and return the updated department
    return this.mapDepartmentToResponseDto(
      updated,
      updated.department_members,
      heads.get(updated.head_member_id || ''),
    );
  }

  /**
   * Archives a department by setting archived_at. Archived departments drop out
   * of active lists (which filter archived_at: null) but stay reachable by ID
   * and can be restored or permanently deleted.
   *
   * @param departmentId - Department ID
   * @param churchId - Church ID
   * @param userId - User performing the action
   * @returns Updated department
   * @throws NotFoundException if the department is missing or not in this church
   * @throws ConflictException if the department is already archived
   */
  async archiveDepartment(
    departmentId: string,
    churchId: string,
    userId: string,
  ): Promise<DepartmentResponseDto> {
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    if (existing.archived_at) {
      throw new ConflictException('Department is already archived');
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { archived_at: new Date() },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      churchId,
      userId,
      action: 'ARCHIVE',
      entity: 'department',
      entityId: departmentId,
      oldValues: { archived_at: existing.archived_at },
      newValues: { archived_at: updated.archived_at },
    });

    this.logger.log(`Department archived: ${departmentId}`);

    const heads = await this.resolveDepartmentHeads(churchId, [updated]);
    return this.mapDepartmentToResponseDto(
      updated,
      updated.department_members,
      heads.get(updated.head_member_id || ''),
    );
  }

  /**
   * Restores an archived department by clearing archived_at.
   *
   * @param departmentId - Department ID
   * @param churchId - Church ID
   * @param userId - User performing the action
   * @returns Updated department
   * @throws NotFoundException if the department is missing or not in this church
   * @throws ConflictException if the department is not currently archived
   */
  async restoreDepartment(
    departmentId: string,
    churchId: string,
    userId: string,
  ): Promise<DepartmentResponseDto> {
    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    if (!existing.archived_at) {
      throw new ConflictException('Department is not archived');
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { archived_at: null },
      include: {
        department_members: {
          include: {
            member: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      churchId,
      userId,
      action: 'RESTORE',
      entity: 'department',
      entityId: departmentId,
      oldValues: { archived_at: existing.archived_at },
      newValues: { archived_at: null },
    });

    this.logger.log(`Department restored: ${departmentId}`);

    const heads = await this.resolveDepartmentHeads(churchId, [updated]);
    return this.mapDepartmentToResponseDto(
      updated,
      updated.department_members,
      heads.get(updated.head_member_id || ''),
    );
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
   * @param viewer - The request profile-derived viewer context, if any
   */
  async addDepartmentMember(
    departmentId: string,
    dto: AddDepartmentMemberDto,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<void> {
    // Verify the department exists within this church
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
      select: { id: true, archived_at: true, head_member_id: true, branch_id: true },
    });

    // Throw NotFoundException if department does not exist
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // Reject mutations against an archived department
    if (department.archived_at) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // An admin-HQ department head is read-only; a branch-restricted head may
    // only manage their own department.
    this.assertDepartmentHeadHqReadOnly(viewer);
    this.assertDepartmentHeadOwnership(viewer, department);

    // Verify the member belongs to this church
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, church_id: churchId },
      select: { id: true, branch_id: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this church');
    }

    // A department can only contain members from its own branch. Branchless
    // departments (legacy) impose no constraint.
    if (department.branch_id && member.branch_id !== department.branch_id) {
      throw new BadRequestException("Member does not belong to this department's branch");
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
   * @param viewer - The request profile-derived viewer context, if any
   */
  async removeDepartmentMember(
    departmentId: string,
    memberId: string,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<void> {
    // Verify the department exists within this church (previously the delete
    // ran without ever loading the department, so any caller holding the route
    // permission could remove anyone from a cross-church department).
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, church_id: churchId },
      select: { id: true, archived_at: true, head_member_id: true },
    });

    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    if (department.archived_at) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // An admin-HQ department head is read-only; a branch-restricted head may
    // only manage their own department.
    this.assertDepartmentHeadHqReadOnly(viewer);
    this.assertDepartmentHeadOwnership(viewer, department);

    // Verify the member is assigned to this department
    const existing = await this.prisma.departmentMember.findUnique({
      where: { department_id_member_id: { department_id: departmentId, member_id: memberId } },
    });

    // Idempotent removal: the web drawer's Remove button re-enables the
    // moment the first DELETE settles (204), while the removed row stays
    // visible until the invalidation refetch lands — so a second, identical
    // DELETE can arrive for an already-removed membership. Treat the missing
    // record as a successful no-op instead of a 404 the UI surfaces as a
    // "Failed to remove member" error.
    if (!existing) {
      this.logger.log(
        `Member ${memberId} not in department ${departmentId}: no-op removal`,
      );
      return;
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
        address: dto.address,
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

    // Resolve the assigned leader's name for the response
    const leaders = await this.resolveCellGroupLeaders(churchId, [group]);

    // Map the Prisma record to a response DTO and return
    return this.mapCellGroupToResponseDto({ ...group, leader: leaders.get(group.leader_id || '') });
  }

  /**
   * Lists cell groups for a church.
   *
   * @param churchId - Church ID
   * @param query - Optional filter/search query (archived, search, branchId,
   *   meetingDay). The `branchId` filter is only honored for church-only
   *   (admin-HQ / viewer-less) callers — a branch-restricted viewer is always
   *   forced to their own scoped branch (same convention as the rest of the
   *   branch-scoped reads).
   * @param viewer - Request profile-derived viewer context
   * @returns List of cell groups
   */
  async listCellGroups(
    churchId: string,
    query: ListCellGroupsDto = {},
    viewer?: ViewerScope | null,
  ): Promise<CellGroupResponseDto[]> {
    // Scope cell groups per the viewer's entitlement:
    // admin-hq → all groups in the church; cell_leader (non-HQ) → groups they
    // lead; everyone else (non-HQ) → groups in their own branch.
    const scope = this.branchScope.resolveCellGroupScope(viewer);
    // A cell-leader scope is detected by the PRESENCE of the `leaderId` key —
    // not by a non-undefined value. A leader whose profile has no linked member
    // resolves `{ churchOnly: false, leaderId: undefined }`, and must still be
    // treated as a leader scope so they see ZERO groups rather than falling
    // through to the branch fallback (which would leak groups they don't lead).
    const isCellLeaderScope = !scope.churchOnly && 'leaderId' in scope;
    const where: Prisma.CellGroupWhereInput = {
      church_id: churchId,
      archived_at: isCellLeaderScope ? null : query.archived ? { not: null } : null,
    };
    if (!scope.churchOnly) {
      if (isCellLeaderScope) {
        // Undefined leaderId (no linked member) → force a no-match filter so
        // the leader sees nothing instead of every group in the church.
        where.leader_id = scope.leaderId || '';
      } else if (scope.branchId) {
        where.branch_id = scope.branchId;
      }
    } else if (query.branchId) {
      where.branch_id = query.branchId;
    }

    if (query.meetingDay) {
      where.meeting_day = query.meetingDay;
    }

    const term = query.search?.trim();
    if (term) {
      // Search across the group name, its meet-up address, and the names of its
      // leader (leader_id is a free-form member reference, so leader ids are
      // resolved first by name and matched via `in`).
      const leaders = await this.prisma.member.findMany({
        where: {
          church_id: churchId,
          OR: [
            { first_name: { contains: term, mode: 'insensitive' } },
            { last_name: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      where.AND = {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { address: { contains: term, mode: 'insensitive' } },
          { leader_id: { in: leaders.map((l) => l.id) } },
        ],
      };
    }

    // Query the scoped cell groups for the church ordered by name
    const groups = await this.prisma.cellGroup.findMany({
      where,
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    // Resolve assigned leader names in a single batch query
    const leaders = await this.resolveCellGroupLeaders(churchId, groups);

    // Map each group to a response DTO
    return groups.map((g) =>
      this.mapCellGroupToResponseDto({ ...g, leader: leaders.get(g.leader_id || '') }),
    );
  }

  /**
   * Exports the scoped cell groups as a CSV file download.
   *
   * Scope and filters work exactly like {@link listCellGroups}, so everyone
   * who can list cell groups (including admin-hq and branch cell leaders) can
   * export the same set of rows they currently see.
   *
   * @param churchId - Church ID
   * @param query - Optional filter/search query applied before exporting
   * @param viewer - Request profile-derived viewer context
   * @returns CSV text (with header row)
   */
  async exportCellGroupsCsv(
    churchId: string,
    query: ListCellGroupsDto = {},
    viewer?: ViewerScope | null,
  ): Promise<string> {
    const groups = await this.listCellGroups(churchId, query, viewer);

    const headers = [
      'ID',
      'Name',
      'Leader',
      'Branch',
      'Address',
      'Meeting Day',
      'Meeting Time',
      'Latitude',
      'Longitude',
      'Archived At',
      'Created At',
    ];

    const rows = groups.map((g) => [
      g.id,
      g.name,
      [g.leaderFirstName, g.leaderLastName].filter(Boolean).join(' '),
      g.branchName || '',
      g.address || '',
      g.meetingDay || '',
      g.meetingTime || '',
      g.latitude?.toString() || '',
      g.longitude?.toString() || '',
      g.archivedAt || '',
      g.createdAt,
    ]);

    // Escape CSV values (handle commas, quotes, newlines)
    const escapeCsv = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvLines = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))];

    this.logger.log(`Exported ${groups.length} cell groups as CSV`);

    return csvLines.join('\n');
  }

  /**
   * Gets a single cell group by ID.
   *
   * @param groupId - Cell group ID
   * @param churchId - Church ID
   * @param viewer - Request profile (enforces cell-group scoping)
   * @returns Cell group data
   */
  async getCellGroupById(
    groupId: string,
    churchId: string,
    viewer?: ViewerScope | null,
  ): Promise<CellGroupResponseDto> {
    // Fetch the cell group by ID scoped to the church
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
      include: { branch: { select: { id: true, name: true } } },
    });

    // Throw NotFoundException if group does not exist
    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // Enforce the same cell-group visibility rule as listCellGroups so a
    // cell_leader (or a branch-restricted viewer) can't fetch another group
    // by ID.
    const scope = this.branchScope.resolveCellGroupScope(viewer);
    // Same leader-scope discriminator as listCellGroups (see above): a leader
    // whose profile has no linked member resolves `leaderId: undefined` and
    // must NOT fall through to the branch check.
    const isCellLeaderScope = !scope.churchOnly && 'leaderId' in scope;
    // Archived groups are invisible to cell leaders: treat them like the group
    // doesn't exist (silent 404, matching the active-only list filter above).
    if (isCellLeaderScope && group.archived_at) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }
    if (!scope.churchOnly) {
      // A cell leader sees a group ONLY when it is the one they lead; without a
      // linked member (leaderId undefined) nothing is visible.
      const visible = isCellLeaderScope
        ? !!scope.leaderId && group.leader_id === scope.leaderId
        : !!scope.branchId && group.branch_id === scope.branchId;
      if (!visible) {
        throw new NotFoundException(`Cell group ${groupId} not found`);
      }
    }

    // Resolve the assigned leader's name for the response
    const leaders = await this.resolveCellGroupLeaders(churchId, [group]);

    // Map and return the cell group
    return this.mapCellGroupToResponseDto({ ...group, leader: leaders.get(group.leader_id || '') });
  }

  /**
   * A branch-restricted `cell_leader` may only manage the cell groups they
   * lead — mirrors `resolveCellGroupScope` and the ownership check in
   * `recordCellGroupAttendance` (admin-hq cell leaders are unconstrained).
   *
   * @param viewer - The request profile-derived viewer context, if any
   * @param group - The cell group being acted on (must be pre-fetched and
   *   church-scoped)
   * @throws ForbiddenException if the group is not the caller's own
   */
  private assertCellLeaderOwnership(
    viewer: ViewerScope | null | undefined,
    group: { leader_id: string | null },
  ): void {
    const isCellLeader = viewer?.role === 'cell_leader' || viewer?.roles?.includes('cell_leader');
    if (isCellLeader && !viewer?.is_admin_hq) {
      if (!viewer?.member_id || group.leader_id !== viewer.member_id) {
        throw new ForbiddenException('You can only manage your own cell group');
      }
    }
  }

  /**
   * An admin-HQ cell_leader is granted church-wide cell group READING and
   * DETAIL EDITING (see updateCellGroup) but is locked out of the membership
   * and attendance write paths — recording attendance, adding a member, or
   * removing a member is Forbidden for them on every group. Non-HQ cell
   * leaders are unaffected (own-group writes, enforced by
   * assertCellLeaderOwnership).
   */
  private assertCellLeaderHqReadOnly(viewer: ViewerScope | null | undefined): void {
    const isCellLeader = viewer?.role === 'cell_leader' || viewer?.roles?.includes('cell_leader');
    if (isCellLeader && viewer?.is_admin_hq) {
      throw new ForbiddenException(
        'HQ cell group leaders can view and edit cell groups but cannot record attendance or manage members',
      );
    }
  }

  /**
   * A branch-restricted `department_head` may only manage the department(s)
   * they head — mirrors `resolveDepartmentScope`. Admin-HQ department heads
   * are read-only (see `assertDepartmentHeadHqReadOnly`), so they never reach
   * this ownership check.
   *
   * @param viewer - The request profile-derived viewer context, if any
   * @param department - The department being acted on (must be pre-fetched
   *   and church-scoped)
   * @throws ForbiddenException if the department is not the caller's own
   */
  private assertDepartmentHeadOwnership(
    viewer: ViewerScope | null | undefined,
    department: { head_member_id: string | null },
  ): void {
    const isDepartmentHead =
      viewer?.role === 'department_head' || viewer?.roles?.includes('department_head');
    if (isDepartmentHead && !viewer?.is_admin_hq) {
      if (!viewer?.member_id || department.head_member_id !== viewer.member_id) {
        throw new ForbiddenException('You can only manage your own department');
      }
    }
  }

  /**
   * An admin-HQ department_head is read-only: they can view and export every
   * department church-wide, but editing, adding members, or removing members
   * is Forbidden for them. Non-HQ department heads are unaffected (own-department
   * writes, enforced by `assertDepartmentHeadOwnership`).
   */
  private assertDepartmentHeadHqReadOnly(viewer: ViewerScope | null | undefined): void {
    const isDepartmentHead =
      viewer?.role === 'department_head' || viewer?.roles?.includes('department_head');
    if (isDepartmentHead && viewer?.is_admin_hq) {
      throw new ForbiddenException(
        'HQ department heads can view and export departments but cannot edit them',
      );
    }
  }

  /**
   * Validates department branch + head assignments are church-scoped and
   * consistent: the branch must belong to the church, the head member must
   * belong to the church, and (when both are set) the head member must belong
   * to the selected branch.
   *
   * @param churchId - Church ID
   * @param branchId - Proposed branch ID (optional)
   * @param headMemberId - Proposed head member ID (optional)
   */
  private async validateDepartmentAssignments(
    churchId: string,
    branchId?: string,
    headMemberId?: string,
  ): Promise<void> {
    if (branchId !== undefined) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, church_id: churchId },
        select: { id: true },
      });
      if (!branch) {
        throw new NotFoundException(`Branch ${branchId} not found`);
      }
    }

    if (headMemberId !== undefined) {
      const member = await this.prisma.member.findFirst({
        where: { id: headMemberId, church_id: churchId },
        select: { id: true, branch_id: true },
      });
      if (!member) {
        throw new NotFoundException('Head member not found in this church');
      }
      if (branchId !== undefined && member.branch_id !== branchId) {
        throw new BadRequestException('Head member must belong to the selected branch');
      }
    }
  }

  /**
   * Updates a cell group.
   *
   * @param groupId - Cell group ID
   * @param dto - Update data
   * @param churchId - Church ID
   * @param userId - User performing update
   * @param viewer - The request profile-derived viewer context, if any
   * @returns Updated cell group
   */
  async updateCellGroup(
    groupId: string,
    dto: Partial<CreateCellGroupDto>,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<CellGroupResponseDto> {
    // Verify the cell group exists within this church
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    // Throw NotFoundException if group does not exist
    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    if (existing.archived_at) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // A branch-restricted cell leader may only update the groups they lead.
    this.assertCellLeaderOwnership(viewer, existing);

    // A branch-restricted cell leader may change every field EXCEPT the
    // group's leader and branch — reassigning those is pastor-only. The
    // payload is silently stripped (never an error) so clients can keep
    // sending the full form.
    const restrictedLeader =
      (viewer?.role === 'cell_leader' || viewer?.roles?.includes('cell_leader')) &&
      !viewer?.is_admin_hq;

    // Apply partial updates to the cell group record
    const updated = await this.prisma.cellGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.branchId !== undefined && !restrictedLeader && { branch_id: dto.branchId }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.leaderId !== undefined && !restrictedLeader && { leader_id: dto.leaderId }),
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

    // Resolve the assigned leader's name for the response
    const leaders = await this.resolveCellGroupLeaders(churchId, [updated]);

    // Map and return the updated cell group
    return this.mapCellGroupToResponseDto({
      ...updated,
      leader: leaders.get(updated.leader_id || ''),
    });
  }

  /**
   * Archives a cell group by setting archived_at. Archived groups drop out of
   * active lists but stay reachable by ID and can be restored or purged.
   *
   * @param groupId - Cell group ID
   * @param churchId - Church ID
   * @param userId - User performing the action
   * @returns Updated cell group
   * @throws NotFoundException if the group is missing or not in this church
   * @throws ConflictException if the group is already archived
   */
  async archiveCellGroup(
    groupId: string,
    churchId: string,
    userId: string,
  ): Promise<CellGroupResponseDto> {
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    if (existing.archived_at) {
      throw new ConflictException('Cell group is already archived');
    }

    const updated = await this.prisma.cellGroup.update({
      where: { id: groupId },
      data: { archived_at: new Date() },
      include: { branch: { select: { id: true, name: true } } },
    });

    const leaders = await this.resolveCellGroupLeaders(churchId, [updated]);

    await this.audit.log({
      churchId,
      userId,
      action: 'ARCHIVE',
      entity: 'cell_group',
      entityId: groupId,
      oldValues: { archived_at: existing.archived_at },
      newValues: { archived_at: updated.archived_at },
    });

    this.logger.log(`Cell group archived: ${groupId}`);
    return this.mapCellGroupToResponseDto({
      ...updated,
      leader: leaders.get(updated.leader_id || ''),
    });
  }

  /**
   * Restores an archived cell group by clearing archived_at.
   *
   * @param groupId - Cell group ID
   * @param churchId - Church ID
   * @param userId - User performing the action
   * @returns Updated cell group
   * @throws NotFoundException if the group is missing or not in this church
   * @throws ConflictException if the group is not currently archived
   */
  async restoreCellGroup(
    groupId: string,
    churchId: string,
    userId: string,
  ): Promise<CellGroupResponseDto> {
    const existing = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    if (!existing.archived_at) {
      throw new ConflictException('Cell group is not archived');
    }

    const updated = await this.prisma.cellGroup.update({
      where: { id: groupId },
      data: { archived_at: null },
      include: { branch: { select: { id: true, name: true } } },
    });

    const leaders = await this.resolveCellGroupLeaders(churchId, [updated]);

    await this.audit.log({
      churchId,
      userId,
      action: 'RESTORE',
      entity: 'cell_group',
      entityId: groupId,
      oldValues: { archived_at: existing.archived_at },
      newValues: { archived_at: null },
    });

    this.logger.log(`Cell group restored: ${groupId}`);
    return this.mapCellGroupToResponseDto({
      ...updated,
      leader: leaders.get(updated.leader_id || ''),
    });
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
   *
   * @param viewer - The request profile-derived viewer context, if any
   */
  async addCellGroupMember(
    groupId: string,
    memberId: string,
    role: string,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<void> {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    if (group.archived_at) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // An admin-HQ cell leader may manage no group's membership.
    this.assertCellLeaderHqReadOnly(viewer);

    // A branch-restricted cell leader may only manage members of the groups
    // they lead.
    this.assertCellLeaderOwnership(viewer, group);

    // Verify the member belongs to this church
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, church_id: churchId },
      select: { id: true, branch_id: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this church');
    }

    // A branch-restricted viewer may only add members from their own branch
    // (mirrors the member list scoping, which hides other-branch members).
    if (this.branchScope.isBranchRestricted(viewer)) {
      if (!this.branchScope.isVisible(viewer, member.branch_id)) {
        throw new ForbiddenException(`Member ${memberId} does not belong to your branch`);
      }
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
   *
   * @param viewer - The request profile-derived viewer context, if any
   */
  async removeCellGroupMember(
    groupId: string,
    memberId: string,
    churchId: string,
    userId: string,
    viewer?: ViewerScope | null,
  ): Promise<void> {
    const group = await this.prisma.cellGroup.findFirst({
      where: { id: groupId, church_id: churchId },
    });

    if (!group) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    if (group.archived_at) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // An admin-HQ cell leader may manage no group's membership.
    this.assertCellLeaderHqReadOnly(viewer);

    // A branch-restricted cell leader may only manage members of the groups
    // they lead.
    this.assertCellLeaderOwnership(viewer, group);

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
    viewer?: ViewerScope | null,
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

    if (group.archived_at) {
      throw new NotFoundException(`Cell group ${groupId} not found`);
    }

    // An admin-HQ cell leader may not record attendance for any group.
    this.assertCellLeaderHqReadOnly(viewer);

    // A branch-restricted cell_leader may only record attendance for the
    // groups they lead (mirrors resolveCellGroupScope: admin-hq cell_leaders
    // are unconstrained).
    const isCellLeader = viewer?.role === 'cell_leader' || viewer?.roles?.includes('cell_leader');
    if (isCellLeader && !viewer?.is_admin_hq) {
      if (!viewer?.member_id || group.leader_id !== viewer.member_id) {
        throw new ForbiddenException('You can only record attendance for your own cell group');
      }
    }

    let resolvedVisitorName = visitorName;

    // Verify the member belongs to this church
    if (memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: memberId, church_id: churchId },
        select: { id: true, branch_id: true },
      });

      if (!member) {
        throw new NotFoundException('Member not found in this church');
      }

      // A branch-restricted viewer may only record attendance for members of
      // their own branch (mirrors the member list scoping).
      if (this.branchScope.isBranchRestricted(viewer)) {
        if (!this.branchScope.isVisible(viewer, member.branch_id)) {
          throw new ForbiddenException(`Member ${memberId} does not belong to your branch`);
        }
      }
    }

    // Verify the visitor belongs to this church and resolve their name
    if (visitorId) {
      const visitor = await this.prisma.visitor.findFirst({
        where: { id: visitorId, church_id: churchId },
        select: { first_name: true, last_name: true, branch_id: true },
      });

      if (!visitor) {
        throw new NotFoundException('Visitor not found in this church');
      }

      // A branch-restricted viewer may only record attendance for visitors of
      // their own branch. Legacy untagged visitors (branch_id null) stay
      // allowed, mirroring the visitors list scoping.
      if (this.branchScope.isBranchRestricted(viewer)) {
        const viewerBranchId = viewer?.branch_id;
        const sameBranch = visitor.branch_id === null || visitor.branch_id === viewerBranchId;
        if (!sameBranch) {
          throw new ForbiddenException(`Visitor ${visitorId} does not belong to your branch`);
        }
      }

      resolvedVisitorName =
        resolvedVisitorName || `${visitor.first_name} ${visitor.last_name || ''}`.trim();
    }

    // A branch-restricted viewer who records a walk-in registers the visitor
    // as a real Visitor record pinned to their own branch. HQ viewers keep the
    // free-text snapshot behavior.
    const isWalkIn = !memberId && !visitorId && !!visitorName;
    const restrictedViewer = this.branchScope.isBranchRestricted(viewer);
    const viewerBranchId = viewer?.branch_id;
    if (isWalkIn && restrictedViewer && viewerBranchId) {
      const [firstName, ...rest] = visitorName.trim().split(/\s+/);
      const createdVisitor = await this.prisma.visitor.create({
        data: {
          church_id: churchId,
          first_name: firstName,
          last_name: rest.length ? rest.join(' ') : null,
          branch_id: viewerBranchId,
        },
        select: { id: true, first_name: true, last_name: true },
      });
      visitorId = createdVisitor.id;
      resolvedVisitorName =
        resolvedVisitorName ||
        `${createdVisitor.first_name} ${createdVisitor.last_name || ''}`.trim();
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
      : isWalkIn
        ? `walk-in ${visitorName || ''}`.trim()
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

    // Resolve assigned leader names in a single batch query
    const leaders = await this.resolveCellGroupLeaders(churchId, groups);

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
          ...this.mapCellGroupToResponseDto({
            ...group,
            leader: leaders.get(group.leader_id || ''),
          }),
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
      branch_id: string | null;
      name: string;
      description: string | null;
      parent_id: string | null;
      head_member_id: string | null;
      archived_at: Date | null;
      created_at: Date;
      updated_at: Date;
      branch?: { id: string; name: string } | null;
    },
    members: Array<{
      id: string;
      member_id: string;
      role: string;
      joined_at: Date;
      member?: { first_name: string; last_name: string } | null;
    }>,
    head?: { first_name: string; last_name: string } | null,
  ): DepartmentResponseDto {
    // Map the department fields to camelCase DTO properties
    return {
      id: dept.id,
      churchId: dept.church_id,
      name: dept.name,
      description: dept.description || undefined,
      parentId: dept.parent_id || undefined,
      branchId: dept.branch_id || undefined,
      branchName: dept.branch?.name,
      headMemberId: dept.head_member_id || undefined,
      headFirstName: head?.first_name || undefined,
      headLastName: head?.last_name || undefined,
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
      archivedAt: dept.archived_at?.toISOString(),
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
   * Resolves the names of cell-group leaders via a batched member lookup.
   *
   * @param churchId - Church ID (scope)
   * @param groups - Cell group rows to gather leader IDs from
   * @returns Map of leader member ID to { first_name, last_name }
   */
  private async resolveCellGroupLeaders(
    churchId: string,
    groups: Array<{ leader_id: string | null }>,
  ): Promise<Map<string, { first_name: string; last_name: string }>> {
    // Collect unique non-null leader IDs
    const leaderIds = [
      ...new Set(groups.map((g) => g.leader_id).filter((id): id is string => !!id)),
    ];

    // Short-circuit when no leaders are assigned
    if (leaderIds.length === 0) {
      return new Map();
    }

    // Batch-fetch leader member names scoped to the church
    const leaders =
      (await this.prisma.member.findMany({
        where: { church_id: churchId, id: { in: leaderIds } },
        select: { id: true, first_name: true, last_name: true },
      })) ?? [];

    // Build a lookup map keyed by member ID
    return new Map(
      leaders.map((m) => [m.id, { first_name: m.first_name, last_name: m.last_name }]),
    );
  }

  /**
   * Resolves the names of department heads via a batched member lookup.
   *
   * @param churchId - Church ID (scope)
   * @param departments - Department rows to gather head IDs from
   * @returns Map of head member ID to { first_name, last_name }
   */
  private async resolveDepartmentHeads(
    churchId: string,
    departments: Array<{ head_member_id: string | null }>,
  ): Promise<Map<string, { first_name: string; last_name: string }>> {
    // Collect unique non-null head IDs
    const headIds = [
      ...new Set(departments.map((d) => d.head_member_id).filter((id): id is string => !!id)),
    ];

    // Short-circuit when no heads are assigned
    if (headIds.length === 0) {
      return new Map();
    }

    // Batch-fetch head member names scoped to the church
    const heads =
      (await this.prisma.member.findMany({
        where: { church_id: churchId, id: { in: headIds } },
        select: { id: true, first_name: true, last_name: true },
      })) ?? [];

    // Build a lookup map keyed by member ID
    return new Map(
      heads.map((m) => [m.id, { first_name: m.first_name, last_name: m.last_name }]),
    );
  }

  /**
   * Maps a Prisma CellGroup record to a response DTO.
   */
  private mapCellGroupToResponseDto(group: {
    id: string;
    church_id: string;
    branch_id: string | null;
    name: string;
    address: string | null;
    leader_id: string | null;
    latitude: number | null;
    longitude: number | null;
    meeting_day: string | null;
    meeting_time: string | null;
    archived_at: Date | null;
    created_at: Date;
    updated_at: Date;
    branch?: { id: string; name: string } | null;
    leader?: { first_name: string | null; last_name: string | null } | null;
  }): CellGroupResponseDto {
    // Map the cell group fields to camelCase DTO properties
    return {
      id: group.id,
      churchId: group.church_id,
      name: group.name,
      leaderId: group.leader_id || undefined,
      leaderFirstName: group.leader?.first_name || undefined,
      leaderLastName: group.leader?.last_name || undefined,
      branchId: group.branch_id || undefined,
      branchName: group.branch?.name,
      address: group.address || undefined,
      latitude: group.latitude || undefined,
      longitude: group.longitude || undefined,
      meetingDay: group.meeting_day || undefined,
      meetingTime: group.meeting_time || undefined,
      archivedAt: group.archived_at?.toISOString(),
      // Convert timestamp fields to ISO strings
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    };
  }
}
