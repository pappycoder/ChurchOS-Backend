import { Test, TestingModule } from '@nestjs/testing';
import { CustomFieldsService } from '../../../src/custom-fields/custom-fields.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let auditMock: { log: jest.Mock };

  const churchId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  const mockField = {
    id: 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    church_id: churchId,
    name: 'Occupation',
    field_type: 'text',
    options: [],
    is_required: false,
    display_order: 0,
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    prismaMock = {
      customFieldDefinition: {
        create: jest.fn().mockResolvedValue(mockField),
        findMany: jest.fn().mockResolvedValue([mockField]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(mockField),
        update: jest.fn().mockResolvedValue(mockField),
        delete: jest.fn().mockResolvedValue(mockField),
      },
    };

    auditMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLoggingService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<CustomFieldsService>(CustomFieldsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a text custom field', async () => {
      const result = await service.create(
        { name: 'Occupation', field_type: 'text' },
        churchId,
        userId,
      );
      expect(result.name).toBe('Occupation');
      expect(result.fieldType).toBe('text');
      expect(prismaMock.customFieldDefinition.create).toHaveBeenCalled();
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should reject invalid field type', async () => {
      await expect(
        service.create({ name: 'Test', field_type: 'invalid' }, churchId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject dropdown without options', async () => {
      await expect(
        service.create({ name: 'Select', field_type: 'dropdown' }, churchId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate field name', async () => {
      (prismaMock.customFieldDefinition.findFirst as jest.Mock).mockResolvedValue(mockField);
      await expect(
        service.create({ name: 'Occupation', field_type: 'text' }, churchId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should create dropdown with options', async () => {
      (prismaMock.customFieldDefinition.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          ...mockField,
          name: data.name,
          field_type: data.field_type,
          options: data.options,
        }),
      );
      const result = await service.create(
        { name: 'Department', field_type: 'dropdown', options: ['Music', 'Protocol'] },
        churchId,
        userId,
      );
      expect(result.name).toBe('Department');
    });
  });

  describe('findAll', () => {
    it('should return all fields for a church', async () => {
      const result = await service.findAll(churchId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Occupation');
    });
  });

  describe('findOne', () => {
    it('should return a field by ID', async () => {
      const result = await service.findOne(mockField.id, churchId);
      expect(result.id).toBe(mockField.id);
    });

    it('should throw NotFoundException for wrong church', async () => {
      (prismaMock.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue({
        ...mockField,
        church_id: 'wrong-church',
      });
      await expect(service.findOne(mockField.id, churchId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for missing field', async () => {
      (prismaMock.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('nonexistent', churchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a field', async () => {
      const result = await service.update(mockField.id, { name: 'Job Title' }, churchId, userId);
      expect(result.name).toBe('Occupation');
      expect(prismaMock.customFieldDefinition.update).toHaveBeenCalled();
    });

    it('should reject rename to duplicate', async () => {
      (prismaMock.customFieldDefinition.findFirst as jest.Mock).mockResolvedValue({
        ...mockField,
        id: 'other-id',
      });
      await expect(
        service.update(mockField.id, { name: 'Other Field' }, churchId, userId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a field', async () => {
      await service.remove(mockField.id, churchId, userId);
      expect(prismaMock.customFieldDefinition.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing field', async () => {
      (prismaMock.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.remove('nonexistent', churchId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
