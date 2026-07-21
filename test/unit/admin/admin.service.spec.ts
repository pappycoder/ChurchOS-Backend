import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../src/admin/admin.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
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
      prisma.departmentMember.findUnique.mockResolvedValue(null);
      prisma.departmentMember.create.mockResolvedValue({} as any);

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
      prisma.departmentMember.findUnique.mockResolvedValue({} as any);

      await expect(
        service.addDepartmentMember(
          mockDepartmentId,
          { memberId: mockMemberId },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);
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
  });
});
