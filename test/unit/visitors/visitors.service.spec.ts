import { Test, TestingModule } from '@nestjs/testing';
import { VisitorsService } from '../../../src/visitors/visitors.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('VisitorsService', () => {
  let service: VisitorsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let auditMock: { log: jest.Mock };

  const churchId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const assigneeId = '55555555-5555-5555-5555-555555555555';

  const mockVisitor = {
    id: 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    church_id: churchId,
    first_name: 'Amina',
    last_name: 'Okafor',
    phone: '+234 801 234 5678',
    whatsapp_number: null,
    email: 'amina@example.com',
    first_visit_date: new Date('2026-07-01'),
    follow_up_status: 'new',
    assigned_to_id: null,
    assigned_to: null,
    notes: null,
    converted_member_id: null,
    converted_at: null,
    created_at: new Date('2026-07-01'),
    updated_at: new Date('2026-07-01'),
  };

  const mockProfile = {
    id: assigneeId,
    church_id: churchId,
    first_name: 'David',
    last_name: 'Adeyemi',
  };

  beforeEach(async () => {
    prismaMock = {
      visitor: {
        create: jest.fn().mockResolvedValue(mockVisitor),
        findMany: jest.fn().mockResolvedValue([mockVisitor]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockVisitor.id) return Promise.resolve(mockVisitor);
          if (where.id === assigneeId) return Promise.resolve(mockProfile);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({ ...mockVisitor, follow_up_status: 'contacted' }),
        delete: jest.fn().mockResolvedValue(mockVisitor),
      },
      profile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === assigneeId) return Promise.resolve(mockProfile);
          return Promise.resolve(null);
        }),
      },
      member: {
        create: jest.fn().mockResolvedValue({
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          church_id: churchId,
          first_name: 'Amina',
          last_name: 'Okafor',
          email: 'amina@example.com',
          phone: '+234 801 234 5678',
          whatsapp_number: null,
          branch_id: null,
          status: 'active',
        }),
      },
    };

    auditMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLoggingService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<VisitorsService>(VisitorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a visitor', async () => {
      const result = await service.create(
        { first_name: 'Amina', last_name: 'Okafor', email: 'amina@example.com' },
        churchId,
        userId,
      );
      expect(result.firstName).toBe('Amina');
      expect(result.followUpStatus).toBe('new');
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should create visitor with assigned team member', async () => {
      (prismaMock.visitor.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          ...mockVisitor,
          first_name: data.first_name,
          assigned_to_id: data.assigned_to_id,
          assigned_to: { first_name: 'David', last_name: 'Adeyemi' },
        }),
      );
      const result = await service.create(
        { first_name: 'Amina', assigned_to_id: assigneeId },
        churchId,
        userId,
      );
      expect(result.assignedToId).toBe(assigneeId);
    });

    it('should reject invalid assignee', async () => {
      (prismaMock.profile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ first_name: 'Amina', assigned_to_id: 'invalid' }, churchId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all visitors', async () => {
      const result = await service.findAll(churchId);
      expect(result).toHaveLength(1);
    });

    it('should filter by follow_up_status', async () => {
      await service.findAll(churchId, { follow_up_status: 'new' });
      expect(prismaMock.visitor.findMany).toHaveBeenCalled();
    });

    it('should filter by assigned_to_id', async () => {
      await service.findAll(churchId, { assigned_to_id: assigneeId });
      expect(prismaMock.visitor.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a visitor by ID', async () => {
      const result = await service.findOne(mockVisitor.id, churchId);
      expect(result.id).toBe(mockVisitor.id);
    });

    it('should throw NotFoundException for wrong church', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockVisitor,
        church_id: 'wrong',
      });
      await expect(service.findOne(mockVisitor.id, churchId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for missing visitor', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.findOne('nonexistent', churchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update visitor follow-up status', async () => {
      const result = await service.update(
        mockVisitor.id,
        { follow_up_status: 'contacted' },
        churchId,
        userId,
      );
      expect(result.followUpStatus).toBe('contacted');
    });

    it('should throw NotFoundException for missing visitor', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.update('nonexistent', { notes: 'test' }, churchId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertToMember', () => {
    it('should convert visitor to member', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockVisitor,
        follow_up_status: 'interested',
      });
      (prismaMock.visitor.update as jest.Mock).mockResolvedValueOnce({
        ...mockVisitor,
        follow_up_status: 'converted',
        converted_member_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        converted_at: new Date(),
      });

      const result = await service.convertToMember(
        mockVisitor.id,
        { first_name: 'Amina', last_name: 'Okafor' },
        churchId,
        userId,
      );
      expect(result.memberId).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
      expect(result.visitor.followUpStatus).toBe('converted');
    });

    it('should reject if already converted', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockVisitor,
        follow_up_status: 'converted',
        converted_member_id: 'some-id',
      });
      await expect(
        service.convertToMember(
          mockVisitor.id,
          { first_name: 'Amina', last_name: 'Okafor' },
          churchId,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for missing visitor', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.convertToMember(
          'nonexistent',
          { first_name: 'Amina', last_name: 'Okafor' },
          churchId,
          userId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a visitor', async () => {
      await service.remove(mockVisitor.id, churchId, userId);
      expect(prismaMock.visitor.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing visitor', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.remove('nonexistent', churchId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
