import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../src/admin/admin.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditLog = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLoggingService, useValue: { log: auditLog } },
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
});
