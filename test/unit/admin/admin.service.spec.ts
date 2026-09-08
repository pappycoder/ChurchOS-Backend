import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../src/admin/admin.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditLog: jest.Mock;

  const mockChurchId = 'church-1';
  const mockUserId = 'user-1';
  const mockDepartmentId = 'dept-1';
  const mockMemberId = 'member-1';
  const mockGroupId = 'group-1';

  const mockDepartment = {
    id: mockDepartmentId,
    church_id: mockChurchId,
    name: 'Youth Ministry',
    description: 'Ministry for youth',
    parent_id: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
    department_members: [],
  };

  const mockCellGroup = {
    id: mockGroupId,
    church_id: mockChurchId,
    name: 'Victory Cell',
    address: null,
    leader_id: null,
    latitude: 6.5244,
    longitude: 3.3792,
    meeting_day: 'Sunday',
    meeting_time: '18:00',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  const mockCellGroupMember = {
    cell_group_id: mockGroupId,
    member_id: mockMemberId,
    role: 'member',
    joined_at: new Date('2024-02-01'),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditLog = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLoggingService, useValue: { log: auditLog } },
        BranchScopeService,
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('createDepartment', () => {
    it('should create a department', async () => {
      prisma.department.create.mockResolvedValue(mockDepartment);

      const result = await service.createDepartment(
        { name: 'Youth Ministry', description: 'Ministry for youth' },
        mockChurchId,
        mockUserId,
      );

      expect(result.name).toBe('Youth Ministry');
      expect(prisma.department.create).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalled();
    });

    it('should validate parent department exists', async () => {
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.createDepartment(
          { name: 'Sub Ministry', parentId: 'non-existent' },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDepartments', () => {
    it('should list departments with members', async () => {
      prisma.department.findMany.mockResolvedValue([mockDepartment]);

      const result = await service.listDepartments(mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Youth Ministry');
    });
  });

  describe('deleteDepartment', () => {
    it('should delete an empty department', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        _count: { department_members: 0 },
      });
      prisma.department.delete.mockResolvedValue(mockDepartment);

      await service.deleteDepartment(mockDepartmentId, mockChurchId, mockUserId);

      expect(prisma.department.delete).toHaveBeenCalled();
    });

    it('should block deletion of department with members', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        _count: { department_members: 5 },
      });

      await expect(
        service.deleteDepartment(mockDepartmentId, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addDepartmentMember', () => {
    it('should add a member to a department', async () => {
      prisma.department.findFirst.mockResolvedValue(mockDepartment);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      prisma.departmentMember.findUnique.mockResolvedValue(null);
      prisma.departmentMember.create.mockResolvedValue({} as never);

      await service.addDepartmentMember(
        mockDepartmentId,
        { memberId: mockMemberId, role: 'leader' },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.departmentMember.create).toHaveBeenCalled();
    });

    it('should prevent duplicate membership', async () => {
      prisma.department.findFirst.mockResolvedValue(mockDepartment);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      (prisma.departmentMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'dm-1',
        member_id: 'm-1',
        department_id: 'd-1',
      });

      await expect(
        service.addDepartmentMember(
          mockDepartmentId,
          { memberId: mockMemberId },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject a member from another church', async () => {
      prisma.department.findFirst.mockResolvedValue(mockDepartment);
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.addDepartmentMember(
          mockDepartmentId,
          { memberId: mockMemberId },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject a member from a different branch than the department', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        branch_id: 'branch-lekki',
        head_member_id: null,
        archived_at: null,
      });
      prisma.member.findFirst.mockResolvedValue({
        id: mockMemberId,
        branch_id: 'branch-hq',
      });

      await expect(
        service.addDepartmentMember(
          mockDepartmentId,
          { memberId: mockMemberId },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.departmentMember.create).not.toHaveBeenCalled();
    });

    it('should allow a member from the department branch', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        branch_id: 'branch-lekki',
        head_member_id: null,
        archived_at: null,
      });
      prisma.member.findFirst.mockResolvedValue({
        id: mockMemberId,
        branch_id: 'branch-lekki',
      });
      prisma.departmentMember.findUnique.mockResolvedValue(null);
      prisma.departmentMember.create.mockResolvedValue({} as never);

      await service.addDepartmentMember(
        mockDepartmentId,
        { memberId: mockMemberId },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.departmentMember.create).toHaveBeenCalled();
    });

    it('should allow any church member when the department has no branch', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        branch_id: null,
        head_member_id: null,
        archived_at: null,
      });
      prisma.member.findFirst.mockResolvedValue({
        id: mockMemberId,
        branch_id: 'branch-hq',
      });
      prisma.departmentMember.findUnique.mockResolvedValue(null);
      prisma.departmentMember.create.mockResolvedValue({} as never);

      await service.addDepartmentMember(
        mockDepartmentId,
        { memberId: mockMemberId },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.departmentMember.create).toHaveBeenCalled();
    });
  });

  describe('createCellGroup', () => {
    it('should create a cell group', async () => {
      prisma.cellGroup.create.mockResolvedValue(mockCellGroup);

      const result = await service.createCellGroup(
        { name: 'Victory Cell', latitude: 6.5244, longitude: 3.3792 },
        mockChurchId,
        mockUserId,
      );

      expect(result.name).toBe('Victory Cell');
      expect(result.latitude).toBe(6.5244);
    });

    it('should persist the branch id', async () => {
      prisma.cellGroup.create.mockResolvedValue({
        ...mockCellGroup,
        branch_id: 'branch-1',
      });

      await service.createCellGroup(
        { name: 'Victory Cell', branchId: 'branch-1' },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branch_id: 'branch-1' }),
        }),
      );
    });

    it('should persist the address and map it on the response', async () => {
      prisma.cellGroup.create.mockResolvedValue({
        ...mockCellGroup,
        address: '12 Adeola Odeku St, Lekki',
      });

      const result = await service.createCellGroup(
        { name: 'Victory Cell', address: '12 Adeola Odeku St, Lekki' },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ address: '12 Adeola Odeku St, Lekki' }),
        }),
      );
      expect(result.address).toBe('12 Adeola Odeku St, Lekki');
    });

    it('should resolve the leader name on the response', async () => {
      prisma.cellGroup.create.mockResolvedValue({
        ...mockCellGroup,
        leader_id: mockMemberId,
      });
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
      ]);

      const result = await service.createCellGroup(
        { name: 'Victory Cell', leaderId: mockMemberId },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            church_id: mockChurchId,
            id: { in: [mockMemberId] },
          }),
        }),
      );
      expect(result.leaderId).toBe(mockMemberId);
      expect(result.leaderFirstName).toBe('John');
      expect(result.leaderLastName).toBe('Doe');
    });
  });

  describe('updateCellGroup', () => {
    it('should persist details and map them on update', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.cellGroup.update.mockResolvedValue({
        ...mockCellGroup,
        branch_id: 'branch-1',
        address: '12 Adeola Odeku St, Lekki',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });

      const result = await service.updateCellGroup(
        mockGroupId,
        { branchId: 'branch-1', address: '12 Adeola Odeku St, Lekki' },
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch_id: 'branch-1',
            address: '12 Adeola Odeku St, Lekki',
          }),
          include: { branch: { select: { id: true, name: true } } },
        }),
      );
      expect(result.branchId).toBe('branch-1');
      expect(result.branchName).toBe('Lekki Campus');
      expect(result.address).toBe('12 Adeola Odeku St, Lekki');
    });

    it('should forbid a cell_leader updating a group they do not lead', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
      });

      await expect(
        service.updateCellGroup(mockGroupId, { name: 'X' }, mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow an own-group cell_leader update while stripping leader/branch changes', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
        branch_id: 'branch-1',
      });
      prisma.cellGroup.update.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
        branch_id: 'branch-1',
        address: '10 Admiralty Way, Lekki',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.updateCellGroup(
        mockGroupId,
        { branchId: 'branch-2', leaderId: 'member-other', address: '10 Admiralty Way, Lekki' },
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      const call = prisma.cellGroup.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.address).toBe('10 Admiralty Way, Lekki');
      expect(call.data.branch_id).toBeUndefined();
      expect(call.data.leader_id).toBeUndefined();
      expect(result.branchId).toBe('branch-1');
    });

    it('should allow an admin-hq cell_leader editing any group\u2019s details without stripping leader/branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
        branch_id: 'branch-1',
      });
      prisma.cellGroup.update.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
        branch_id: 'branch-2',
        address: '10 Admiralty Way, Lekki',
        branch: { id: 'branch-2', name: 'Ikeja Campus' },
      });

      const result = await service.updateCellGroup(
        mockGroupId,
        { branchId: 'branch-2', leaderId: 'member-other', address: '10 Admiralty Way, Lekki' },
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
          is_admin_hq: true,
        },
      );

      const call = prisma.cellGroup.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.address).toBe('10 Admiralty Way, Lekki');
      expect(call.data.branch_id).toBe('branch-2');
      expect(call.data.leader_id).toBe('member-other');
      expect(result.branchId).toBe('branch-2');
    });
  });

  describe('cell group member management ownership', () => {
    it('should allow an own-group cell_leader to add members', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-1' });
      prisma.cellGroupMember.findUnique.mockResolvedValue(null);
      prisma.cellGroupMember.create.mockResolvedValue({} as never);

      await service.addCellGroupMember(
        mockGroupId,
        mockMemberId,
        'member',
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.cellGroupMember.create).toHaveBeenCalled();
    });

    it('should forbid a cell_leader adding members to a group they do not lead', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
      });

      await expect(
        service.addCellGroupMember(mockGroupId, mockMemberId, 'member', mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid a branch-restricted cell_leader adding a member from another branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-2' });

      await expect(
        service.addCellGroupMember(mockGroupId, mockMemberId, 'member', mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupMember.create).not.toHaveBeenCalled();
    });

    it('should allow a branch-restricted cell_leader adding a member from their own branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-1' });
      prisma.cellGroupMember.findUnique.mockResolvedValue(null);
      prisma.cellGroupMember.create.mockResolvedValue({} as never);

      await service.addCellGroupMember(
        mockGroupId,
        mockMemberId,
        'member',
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.cellGroupMember.create).toHaveBeenCalled();
    });

    it('should forbid an admin-hq cell_leader adding a member', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: null,
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-2' });
      prisma.cellGroupMember.findUnique.mockResolvedValue(null);
      prisma.cellGroupMember.create.mockResolvedValue({} as never);

      await expect(
        service.addCellGroupMember(mockGroupId, mockMemberId, 'member', mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
          is_admin_hq: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupMember.create).not.toHaveBeenCalled();
    });

    it('should allow an own-group cell_leader to remove members', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.cellGroupMember.findUnique.mockResolvedValue(mockCellGroupMember);
      prisma.cellGroupMember.delete.mockResolvedValue({} as never);

      await service.removeCellGroupMember(mockGroupId, mockMemberId, mockChurchId, mockUserId, {
        church_id: mockChurchId,
        branch_id: 'branch-1',
        member_id: 'member-leader-1',
        role: 'cell_leader',
      });

      expect(prisma.cellGroupMember.delete).toHaveBeenCalled();
    });

    it('should forbid a cell_leader removing members from a group they do not lead', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
      });

      await expect(
        service.removeCellGroupMember(mockGroupId, mockMemberId, mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid a cell_leader without a linked member from managing members', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);

      await expect(
        service.removeCellGroupMember(mockGroupId, mockMemberId, mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          role: 'cell_leader',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid an admin-hq cell_leader removing a member', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, leader_id: null });
      prisma.cellGroupMember.findUnique.mockResolvedValue(mockCellGroupMember);
      prisma.cellGroupMember.delete.mockResolvedValue({} as never);

      await expect(
        service.removeCellGroupMember(mockGroupId, mockMemberId, mockChurchId, mockUserId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
          is_admin_hq: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('listCellGroups', () => {
    it('should map branch names on each group', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([
        {
          ...mockCellGroup,
          branch_id: 'branch-1',
          branch: { id: 'branch-1', name: 'Lekki Campus' },
        },
        { ...mockCellGroup, id: 'group-2', name: 'Grace Cell', branch_id: null },
      ]);

      const result = await service.listCellGroups(mockChurchId);

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { branch: { select: { id: true, name: true } } },
        }),
      );
      expect(result[0].branchName).toBe('Lekki Campus');
      expect(result[1].branchName).toBeUndefined();
    });

    it('should resolve leader names on each group', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([
        { ...mockCellGroup, leader_id: mockMemberId },
        { ...mockCellGroup, id: 'group-2', name: 'Grace Cell', leader_id: null },
      ]);
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
      ]);

      const result = await service.listCellGroups(mockChurchId);

      expect(result[0].leaderFirstName).toBe('John');
      expect(result[0].leaderLastName).toBe('Doe');
      expect(result[1].leaderFirstName).toBeUndefined();
      expect(result[1].leaderLastName).toBeUndefined();
    });

    it('should scope a non-HQ cell_leader to the groups they lead', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        {},
        {
          church_id: mockChurchId,
          branch_id: 'branch-a',
          member_id: 'leader-member',
          role: 'cell_leader',
          roles: ['cell_leader'],
          is_admin_hq: false,
        },
      );

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ leader_id: 'leader-member' }),
        }),
      );
    });

    it('should scope a non-HQ cell_leader WITHOUT a linked member to zero groups (never the branch fallback)', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        {},
        {
          church_id: mockChurchId,
          branch_id: 'branch-a',
          role: 'cell_leader',
          roles: ['cell_leader'],
          is_admin_hq: false,
        },
      );

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leader_id: '',
            archived_at: null,
          }),
        }),
      );
    });

    it('should scope a non-HQ non-leader viewer to their own branch', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        {},
        {
          church_id: mockChurchId,
          branch_id: 'branch-a',
          role: 'branch_pastor',
          is_admin_hq: false,
        },
      );

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branch_id: 'branch-a' }),
        }),
      );
    });

    it('should NOT scope an admin-hq viewer (sees all groups)', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        {},
        {
          church_id: mockChurchId,
          branch_id: 'branch-a',
          role: 'church_admin',
          is_admin_hq: true,
        },
      );

      const call = prisma.cellGroup.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.leader_id).toBeUndefined();
      expect(call.where.branch_id).toBeUndefined();
    });

    it('should honor the branchId filter for a church-only (admin-hq) viewer', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        { branchId: 'branch-2' },
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          role: 'cell_leader',
          is_admin_hq: true,
        },
      );

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branch_id: 'branch-2' }),
        }),
      );
    });

    it('should force a branch-restricted viewer to their own branch (ignore branchId filter)', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(
        mockChurchId,
        { branchId: 'branch-2' },
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          role: 'branch_pastor',
          is_admin_hq: false,
        },
      );

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branch_id: 'branch-1' }),
        }),
      );
    });

    it('should apply the meetingDay filter', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(mockChurchId, { meetingDay: 'Sunday' });

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ meeting_day: 'Sunday' }),
        }),
      );
    });

    it('should search across group name, address, and resolved leader names', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([mockCellGroup]);
      // Search resolves leader ids by name, then leader-name resolution reuses
      // the same mock call for the returned group's leader.
      prisma.member.findMany.mockResolvedValue([
        { id: 'leader-a', first_name: 'Ada', last_name: 'Okafor' },
      ]);

      await service.listCellGroups(mockChurchId, { search: 'ada' });

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { first_name: { contains: 'ada', mode: 'insensitive' } },
              { last_name: { contains: 'ada', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.objectContaining({
              OR: expect.arrayContaining([
                { name: { contains: 'ada', mode: 'insensitive' } },
                { address: { contains: 'ada', mode: 'insensitive' } },
                { leader_id: { in: ['leader-a'] } },
              ]),
            }),
          }),
        }),
      );
    });

    it('should skip the search query when only whitespace is provided', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);

      await service.listCellGroups(mockChurchId, { search: '   ' });

      const call = prisma.cellGroup.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.AND).toBeUndefined();
    });
  });

  describe('exportCellGroupsCsv', () => {
    it('should export scoped groups as CSV with a header row and escaped values', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([
        {
          ...mockCellGroup,
          id: 'group-1',
          name: 'Grace, Cell',
          branch_id: 'branch-1',
          branch: { id: 'branch-1', name: 'Lekki Campus' },
          leader_id: mockMemberId,
          address: '12 Adeola "Odeku" St',
        },
      ]);
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'Ada', last_name: 'Okafor' },
      ]);

      const csv = await service.exportCellGroupsCsv(mockChurchId);

      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        [
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
        ].join(','),
      );
      expect(lines[1]).toContain('"Grace, Cell"');
      expect(lines[1]).toContain('Ada Okafor');
      expect(lines[1]).toContain('Lekki Campus');
      expect(lines[1]).toContain('"12 Adeola ""Odeku"" St"');
    });
  });

  describe('getCellGroupById', () => {
    it('should return a group with its resolved leader name', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: mockMemberId,
        branch_id: 'branch-1',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'Ada', last_name: 'Okafor' },
      ]);

      const result = await service.getCellGroupById(mockGroupId, mockChurchId);

      expect(result.branchId).toBe('branch-1');
      expect(result.branchName).toBe('Lekki Campus');
      expect(result.leaderFirstName).toBe('Ada');
      expect(result.leaderLastName).toBe('Okafor');
    });

    it('should throw NotFoundException for a missing group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(null);

      await expect(service.getCellGroupById(mockGroupId, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow the owning cell_leader to fetch their group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
        branch_id: 'branch-1',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.getCellGroupById(mockGroupId, mockChurchId, {
        church_id: mockChurchId,
        branch_id: 'branch-1',
        member_id: 'member-leader-1',
        role: 'cell_leader',
        roles: ['cell_leader'],
        is_admin_hq: false,
      });

      expect(result.id).toBe(mockGroupId);
    });

    it('should 404 a non-owning cell_leader fetching a group in their branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
        branch_id: 'branch-1',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });
      prisma.member.findMany.mockResolvedValue([]);

      await expect(
        service.getCellGroupById(mockGroupId, mockChurchId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
          roles: ['cell_leader'],
          is_admin_hq: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should 404 a cell_leader WITHOUT a linked member fetching any group (never the branch fallback)', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
        branch_id: 'branch-1',
        branch: { id: 'branch-1', name: 'Lekki Campus' },
      });
      prisma.member.findMany.mockResolvedValue([]);

      await expect(
        service.getCellGroupById(mockGroupId, mockChurchId, {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          role: 'cell_leader',
          roles: ['cell_leader'],
          is_admin_hq: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordCellGroupAttendance', () => {
    const meetingDate = '2024-06-02T10:00:00.000Z';

    it('should reject when no member, visitor, or visitor name is supplied', async () => {
      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          undefined,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a member attendance record', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        mockMemberId,
        undefined,
        undefined,
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cell_group_id: mockGroupId,
            member_id: mockMemberId,
            visitor_id: null,
            status: 'present',
          }),
        }),
      );
    });

    it('should update an existing member attendance record', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue({
        id: 'att-1',
        member_id: mockMemberId,
        visitor_id: null,
      });

      await service.recordCellGroupAttendance(
        mockGroupId,
        mockMemberId,
        undefined,
        undefined,
        meetingDate,
        'excused',
        'Sick',
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroupAttendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'excused', notes: 'Sick' }),
        }),
      );
    });

    it('should reject a member from another church', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          mockMemberId,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a visitor attendance record and resolve the visitor name', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.visitor.findFirst.mockResolvedValue({
        first_name: 'Ada',
        last_name: 'Okafor',
      });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        undefined,
        'visitor-1',
        undefined,
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cell_group_id: mockGroupId,
            member_id: null,
            visitor_id: 'visitor-1',
            visitor_name: 'Ada Okafor',
          }),
        }),
      );
    });

    it('should reject a visitor from another church', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.visitor.findFirst.mockResolvedValue(null);

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          undefined,
          'visitor-1',
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record a free-text walk-in', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        undefined,
        undefined,
        'Walk In Guest',
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cell_group_id: mockGroupId,
            member_id: null,
            visitor_id: null,
            visitor_name: 'Walk In Guest',
          }),
        }),
      );
    });

    it('should allow a cell_leader recording attendance for their own group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-1' });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        mockMemberId,
        undefined,
        undefined,
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalled();
    });

    it('should forbid a cell_leader recording attendance for a group they do not lead', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-other',
      });

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          mockMemberId,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          {
            church_id: mockChurchId,
            branch_id: 'branch-1',
            member_id: 'member-leader-1',
            role: 'cell_leader',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid a cell_leader without a linked member from recording attendance', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          mockMemberId,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          { church_id: mockChurchId, branch_id: 'branch-1', role: 'cell_leader' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid an admin-hq cell_leader recording attendance', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, leader_id: null });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          mockMemberId,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          {
            church_id: mockChurchId,
            branch_id: 'branch-1',
            role: 'cell_leader',
            is_admin_hq: true,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupAttendance.create).not.toHaveBeenCalled();
    });

    it('should forbid a branch-restricted viewer recording a member from another branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-2' });

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          mockMemberId,
          undefined,
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          {
            church_id: mockChurchId,
            branch_id: 'branch-1',
            member_id: 'member-leader-1',
            role: 'cell_leader',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupAttendance.create).not.toHaveBeenCalled();
    });

    it('should allow a branch-restricted viewer recording a member from their own branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, branch_id: 'branch-1' });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        mockMemberId,
        undefined,
        undefined,
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalled();
    });

    it('should forbid a branch-restricted viewer recording a visitor from another branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.visitor.findFirst.mockResolvedValue({
        first_name: 'Ada',
        last_name: 'Okafor',
        branch_id: 'branch-2',
      });

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          undefined,
          'visitor-1',
          undefined,
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          {
            church_id: mockChurchId,
            branch_id: 'branch-1',
            member_id: 'member-leader-1',
            role: 'cell_leader',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.cellGroupAttendance.create).not.toHaveBeenCalled();
    });

    it('should allow a branch-restricted viewer recording an untagged (null-branch) visitor', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.visitor.findFirst.mockResolvedValue({
        first_name: 'Ada',
        last_name: 'Okafor',
        branch_id: null,
      });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        undefined,
        'visitor-1',
        undefined,
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.cellGroupAttendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            member_id: null,
            visitor_id: 'visitor-1',
            visitor_name: 'Ada Okafor',
          }),
        }),
      );
    });

    it('should register a walk-in as a new visitor in the recorder\u2019s branch', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.visitor.create.mockResolvedValue({
        id: 'visitor-new',
        first_name: 'Walk',
        last_name: 'In Guest',
      });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        undefined,
        undefined,
        'Walk In Guest',
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.visitor.create).toHaveBeenCalledWith({
        data: {
          church_id: mockChurchId,
          first_name: 'Walk',
          last_name: 'In Guest',
          branch_id: 'branch-1',
        },
        select: { id: true, first_name: true, last_name: true },
      });
      expect(prisma.cellGroupAttendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            member_id: null,
            visitor_id: 'visitor-new',
            visitor_name: 'Walk In Guest',
          }),
        }),
      );
    });

    it('should register a single-name walk-in with a null last name', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        leader_id: 'member-leader-1',
      });
      prisma.visitor.create.mockResolvedValue({
        id: 'visitor-new',
        first_name: 'Moses',
        last_name: null,
      });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await service.recordCellGroupAttendance(
        mockGroupId,
        undefined,
        undefined,
        'Moses',
        meetingDate,
        'present',
        undefined,
        mockChurchId,
        mockUserId,
        {
          church_id: mockChurchId,
          branch_id: 'branch-1',
          member_id: 'member-leader-1',
          role: 'cell_leader',
        },
      );

      expect(prisma.visitor.create).toHaveBeenCalledWith({
        data: {
          church_id: mockChurchId,
          first_name: 'Moses',
          last_name: null,
          branch_id: 'branch-1',
        },
        select: { id: true, first_name: true, last_name: true },
      });
    });

    it('should forbid an admin-hq cell_leader recording a walk-in', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, leader_id: null });
      prisma.cellGroupAttendance.findUnique.mockResolvedValue(null);
      prisma.cellGroupAttendance.create.mockResolvedValue({} as never);

      await expect(
        service.recordCellGroupAttendance(
          mockGroupId,
          undefined,
          undefined,
          'Walk In Guest',
          meetingDate,
          'present',
          undefined,
          mockChurchId,
          mockUserId,
          {
            church_id: mockChurchId,
            branch_id: 'branch-1',
            role: 'cell_leader',
            is_admin_hq: true,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.visitor.create).not.toHaveBeenCalled();
      expect(prisma.cellGroupAttendance.create).not.toHaveBeenCalled();
    });
  });

  describe('listCellGroupAttendance', () => {
    it('should resolve visitor names and keep member fields nullable', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.cellGroupAttendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          cell_group_id: mockGroupId,
          member_id: mockMemberId,
          visitor_id: null,
          visitor_name: null,
          meeting_date: new Date('2024-06-02T10:00:00.000Z'),
          status: 'present',
          notes: null,
          created_at: new Date('2024-06-02T10:00:00.000Z'),
          member: { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
          visitor: null,
        },
        {
          id: 'att-2',
          cell_group_id: mockGroupId,
          member_id: null,
          visitor_id: 'visitor-1',
          visitor_name: 'Ada Okafor',
          meeting_date: new Date('2024-06-02T10:00:00.000Z'),
          status: 'present',
          notes: null,
          created_at: new Date('2024-06-02T10:00:00.000Z'),
          member: null,
          visitor: { first_name: 'Ada', last_name: 'Okafor' },
        },
      ]);

      const result = await service.listCellGroupAttendance(mockGroupId, mockChurchId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        memberId: mockMemberId,
        firstName: 'John',
        lastName: 'Doe',
        visitorName: undefined,
      });
      expect(result[1]).toMatchObject({
        memberId: undefined,
        firstName: '',
        visitorId: 'visitor-1',
        visitorName: 'Ada Okafor',
      });
    });

    it('should fall back to the linked visitor name when the snapshot is empty', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.cellGroupAttendance.findMany.mockResolvedValue([
        {
          id: 'att-2',
          cell_group_id: mockGroupId,
          member_id: null,
          visitor_id: 'visitor-1',
          visitor_name: null,
          meeting_date: new Date('2024-06-02T10:00:00.000Z'),
          status: 'present',
          notes: null,
          created_at: new Date('2024-06-02T10:00:00.000Z'),
          member: null,
          visitor: { first_name: 'Ada', last_name: 'Okafor' },
        },
      ]);

      const result = await service.listCellGroupAttendance(mockGroupId, mockChurchId);

      expect(result[0].visitorName).toBe('Ada Okafor');
    });
  });

  describe('findNearestGroups', () => {
    it('should find nearest groups sorted by distance', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([
        { ...mockCellGroup, latitude: 6.5244, longitude: 3.3792 },
        {
          ...mockCellGroup,
          id: 'group-2',
          name: 'Grace Cell',
          latitude: 6.6,
          longitude: 3.4,
        },
      ]);

      const result = await service.findNearestGroups(6.52, 3.38, mockChurchId);

      expect(result).toHaveLength(2);
      expect(result[0].distanceKm).toBeLessThanOrEqual(result[1].distanceKm);
    });

    it('should limit results', async () => {
      prisma.cellGroup.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          ...mockCellGroup,
          id: `group-${i}`,
          latitude: 6.5 + i * 0.01,
          longitude: 3.37 + i * 0.01,
        })),
      );

      const result = await service.findNearestGroups(6.5, 3.37, mockChurchId, 3);

      expect(result).toHaveLength(3);
    });

    it('should resolve leader names in nearest results', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([
        { ...mockCellGroup, leader_id: mockMemberId, latitude: 6.5244, longitude: 3.3792 },
      ]);
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'Ada', last_name: 'Okafor' },
      ]);

      const result = await service.findNearestGroups(6.52, 3.38, mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].leaderFirstName).toBe('Ada');
      expect(result[0].leaderLastName).toBe('Okafor');
    });
  });

  describe('archiveDepartment', () => {
    it('should set archived_at and audit ARCHIVE', async () => {
      const archivedAt = new Date('2026-08-28T12:00:00.000Z');
      prisma.department.findFirst.mockResolvedValue(mockDepartment);
      prisma.department.update.mockResolvedValue({
        ...mockDepartment,
        archived_at: archivedAt,
        department_members: [],
      });

      const result = await service.archiveDepartment(mockDepartmentId, mockChurchId, mockUserId);

      expect(prisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDepartmentId },
          data: { archived_at: expect.any(Date) },
        }),
      );
      expect(result.archivedAt).toBe(archivedAt.toISOString());
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ARCHIVE', entity: 'department' }),
      );
    });

    it('should throw ConflictException when already archived', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        archived_at: new Date(),
      });

      await expect(
        service.archiveDepartment(mockDepartmentId, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when department is missing', async () => {
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.archiveDepartment(mockDepartmentId, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('restoreDepartment', () => {
    it('should clear archived_at and audit RESTORE', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        archived_at: new Date('2026-08-27T12:00:00.000Z'),
      });
      prisma.department.update.mockResolvedValue({
        ...mockDepartment,
        archived_at: null,
        department_members: [],
      });

      const result = await service.restoreDepartment(mockDepartmentId, mockChurchId, mockUserId);

      expect(prisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockDepartmentId }, data: { archived_at: null } }),
      );
      expect(result.archivedAt).toBeUndefined();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESTORE', entity: 'department' }),
      );
    });

    it('should throw ConflictException when not archived', async () => {
      prisma.department.findFirst.mockResolvedValue(mockDepartment);

      await expect(
        service.restoreDepartment(mockDepartmentId, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when department is missing', async () => {
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.restoreDepartment(mockDepartmentId, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('department list & purge archive behavior', () => {
    it('should exclude archived departments by default', async () => {
      prisma.department.findMany.mockResolvedValue([mockDepartment]);

      const result = await service.listDepartments(mockChurchId);

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ archived_at: null }) }),
      );
      expect(result[0].archivedAt).toBeUndefined();
    });

    it('should list only archived departments when archived=true', async () => {
      const archivedAt = new Date('2026-08-28T10:00:00.000Z');
      prisma.department.findMany.mockResolvedValue([
        { ...mockDepartment, archived_at: archivedAt },
      ]);

      const result = await service.listDepartments(mockChurchId, true);

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archived_at: { not: null } }),
        }),
      );
      expect(result[0].archivedAt).toBe(archivedAt.toISOString());
    });

    it('should still hard-delete (purge) an archived department', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        archived_at: new Date(),
        _count: { department_members: 0 },
      });
      prisma.department.delete.mockResolvedValue(mockDepartment);

      await service.deleteDepartment(mockDepartmentId, mockChurchId, mockUserId);

      expect(prisma.department.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when adding a member to an archived department', async () => {
      prisma.department.findFirst.mockResolvedValue({
        ...mockDepartment,
        archived_at: new Date(),
      });

      await expect(
        service.addDepartmentMember(
          mockDepartmentId,
          { memberId: mockMemberId },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveCellGroup', () => {
    it('should set archived_at and audit ARCHIVE', async () => {
      const archivedAt = new Date('2026-08-28T12:00:00.000Z');
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);
      prisma.cellGroup.update.mockResolvedValue({
        ...mockCellGroup,
        archived_at: archivedAt,
        branch: null,
      });

      const result = await service.archiveCellGroup(mockGroupId, mockChurchId, mockUserId);

      expect(prisma.cellGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockGroupId },
          data: { archived_at: expect.any(Date) },
        }),
      );
      expect(result.archivedAt).toBe(archivedAt.toISOString());
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ARCHIVE', entity: 'cell_group' }),
      );
    });

    it('should throw ConflictException when already archived', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, archived_at: new Date() });

      await expect(service.archiveCellGroup(mockGroupId, mockChurchId, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when group is missing', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(null);

      await expect(service.archiveCellGroup(mockGroupId, mockChurchId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restoreCellGroup', () => {
    it('should clear archived_at and audit RESTORE', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        archived_at: new Date('2026-08-27T12:00:00.000Z'),
      });
      prisma.cellGroup.update.mockResolvedValue({
        ...mockCellGroup,
        archived_at: null,
        branch: null,
      });

      const result = await service.restoreCellGroup(mockGroupId, mockChurchId, mockUserId);

      expect(prisma.cellGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockGroupId }, data: { archived_at: null } }),
      );
      expect(result.archivedAt).toBeUndefined();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESTORE', entity: 'cell_group' }),
      );
    });

    it('should throw ConflictException when not archived', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(mockCellGroup);

      await expect(service.restoreCellGroup(mockGroupId, mockChurchId, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when group is missing', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue(null);

      await expect(service.restoreCellGroup(mockGroupId, mockChurchId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cell group list & purge archive behavior', () => {
    it('should exclude archived cell groups by default', async () => {
      prisma.cellGroup.findMany.mockResolvedValue([mockCellGroup]);

      const result = await service.listCellGroups(mockChurchId);

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ archived_at: null }) }),
      );
      expect(result[0].archivedAt).toBeUndefined();
    });

    it('should list only archived cell groups when archived=true', async () => {
      const archivedAt = new Date('2026-08-28T10:00:00.000Z');
      prisma.cellGroup.findMany.mockResolvedValue([{ ...mockCellGroup, archived_at: archivedAt }]);

      const result = await service.listCellGroups(mockChurchId, { archived: true });

      expect(prisma.cellGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archived_at: { not: null } }),
        }),
      );
      expect(result[0].archivedAt).toBe(archivedAt.toISOString());
    });

    it('should still hard-delete (purge) an archived cell group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({
        ...mockCellGroup,
        archived_at: new Date(),
      });
      prisma.cellGroup.delete.mockResolvedValue(mockCellGroup);

      await service.deleteCellGroup(mockGroupId, mockChurchId, mockUserId);

      expect(prisma.cellGroup.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating an archived cell group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, archived_at: new Date() });

      await expect(
        service.updateCellGroup(mockGroupId, { name: 'X' }, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when adding a member to an archived cell group', async () => {
      prisma.cellGroup.findFirst.mockResolvedValue({ ...mockCellGroup, archived_at: new Date() });

      await expect(
        service.addCellGroupMember(mockGroupId, mockMemberId, 'member', mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
