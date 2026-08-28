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
    gender: 'female',
    phone: '+234 801 234 5678',
    whatsapp_number: null,
    email: 'amina@example.com',
    first_visit_date: new Date('2026-07-01'),
    follow_up_status: 'new',
    assigned_to_id: null,
    assigned_to: null,
    notes: null,
    custom_fields: { how_heard: 'Friend' },
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
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockVisitor.id) return Promise.resolve(mockVisitor);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({ ...mockVisitor, follow_up_status: 'contacted' }),
        delete: jest.fn().mockResolvedValue(mockVisitor),
      },
      profile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === assigneeId) return Promise.resolve(mockProfile);
          if (where.member_id === 'member-abc') {
            return Promise.resolve({ id: 'profile-from-member', church_id: churchId });
          }
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
    it('should create a visitor with defaults', async () => {
      const result = await service.create(
        { firstName: 'Amina', lastName: 'Okafor', email: 'amina@example.com' },
        churchId,
        userId,
      );
      expect(result.firstName).toBe('Amina');
      expect(result.followUpStatus).toBe('new');
      expect(prismaMock.visitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            first_name: 'Amina',
            follow_up_status: 'new',
            custom_fields: {},
          }),
        }),
      );
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should persist gender, first visit date, and custom fields', async () => {
      await service.create(
        {
          firstName: 'Amina',
          gender: 'female',
          firstVisitDate: '2026-08-24T09:00:00.000Z',
          followUpStatus: 'contacted',
          customFields: { prayer_request: 'Job' },
        },
        churchId,
        userId,
      );
      expect(prismaMock.visitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gender: 'female',
            follow_up_status: 'contacted',
            custom_fields: { prayer_request: 'Job' },
          }),
        }),
      );
      const call = (prismaMock.visitor.create as jest.Mock).mock.calls[0][0];
      expect(call.data.first_visit_date).toEqual(new Date('2026-08-24T09:00:00.000Z'));
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
        { firstName: 'Amina', assignedToId: assigneeId },
        churchId,
        userId,
      );
      expect(result.assignedToId).toBe(assigneeId);
    });

    it('should reject invalid assignee', async () => {
      (prismaMock.profile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ firstName: 'Amina', assignedToId: 'invalid' }, churchId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve member_id to profile_id for assignee', async () => {
      (prismaMock.visitor.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          ...mockVisitor,
          first_name: data.first_name,
          assigned_to_id: data.assigned_to_id,
          assigned_to: { first_name: 'David', last_name: 'Adeyemi' },
        }),
      );
      const result = await service.create(
        { firstName: 'Amina', assignedToId: 'member-abc' },
        churchId,
        userId,
      );
      expect(result.assignedToId).toBe('profile-from-member');
    });
  });

  describe('findAll', () => {
    it('should return paginated visitors with meta totals', async () => {
      const result = await service.findAll(churchId, { page: 2, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prismaMock.visitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('should filter by followUpStatus and assignedToId', async () => {
      await service.findAll(churchId, { followUpStatus: 'new', assignedToId: assigneeId });
      const arg = (prismaMock.visitor.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where.follow_up_status).toBe('new');
      expect(arg.where.assigned_to_id).toBe(assigneeId);
    });

    it('should search across name, email, and phone', async () => {
      await service.findAll(churchId, { search: 'Amina' });
      const arg = (prismaMock.visitor.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where.OR).toHaveLength(4);
    });

    it('should map camelCase sortBy to snake_case columns', async () => {
      await service.findAll(churchId, { sortBy: 'firstName', sortOrder: 'asc' });
      const arg = (prismaMock.visitor.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.orderBy).toEqual([{ first_name: 'asc' }]);
    });

    it('should default sort to newest first', async () => {
      await service.findAll(churchId, {});
      const arg = (prismaMock.visitor.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.orderBy).toEqual([{ created_at: 'desc' }]);
    });

    it('should exclude soft-deleted (converted) visitors from pulls', async () => {
      await service.findAll(churchId, {});
      const arg = (prismaMock.visitor.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where.deleted_at).toBeNull();
      expect(arg.where.church_id).toBe(churchId);
    });
  });

  describe('findOne', () => {
    it('should return a visitor by ID including gender and customFields', async () => {
      const result = await service.findOne(mockVisitor.id, churchId);
      expect(result.id).toBe(mockVisitor.id);
      expect(result.gender).toBe('female');
      expect(result.customFields).toEqual({ how_heard: 'Friend' });
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
    it('should update visitor follow-up status and gender', async () => {
      const result = await service.update(
        mockVisitor.id,
        { followUpStatus: 'contacted', gender: 'male' },
        churchId,
        userId,
      );
      expect(result.followUpStatus).toBe('contacted');
      expect(prismaMock.visitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ follow_up_status: 'contacted', gender: 'male' }),
        }),
      );
    });

    it('should disconnect assignee when cleared', async () => {
      await service.update(mockVisitor.id, { assignedToId: '' }, churchId, userId);
      const arg = (prismaMock.visitor.update as jest.Mock).mock.calls[0][0];
      expect(arg.data.assigned_to).toEqual({ disconnect: true });
    });

    it('should throw NotFoundException for missing visitor', async () => {
      (prismaMock.visitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.update('nonexistent', { notes: 'test' }, churchId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertToMember', () => {
    it('should convert and carry gender + custom fields into the member', async () => {
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
        { firstName: 'Amina', lastName: 'Okafor' },
        churchId,
        userId,
      );
      expect(result.memberId).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
      expect(result.visitor.followUpStatus).toBe('converted');
      expect(prismaMock.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gender: 'female',
            custom_fields: { how_heard: 'Friend' },
          }),
        }),
      );
      expect(prismaMock.visitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            follow_up_status: 'converted',
            deleted_at: expect.any(Date),
          }),
        }),
      );
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
          { firstName: 'Amina', lastName: 'Okafor' },
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
          { firstName: 'Amina', lastName: 'Okafor' },
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
