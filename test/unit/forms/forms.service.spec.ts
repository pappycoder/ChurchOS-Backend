/**
 * @file forms.service.spec.ts
 * @description Unit tests for FormsService.
 *
 * Tests form CRUD, template cloning, field validation, submissions,
 * file attachments, and the approval workflow.
 *
 * @module test/unit/forms/forms.service.spec
 * @since 1.0.0
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FormStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { FormsService } from '../../../src/forms/forms.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { FormFieldType } from '../../../src/forms/dto/form-field.dto';

const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const mockUserId = '11111111-1111-1111-1111-111111111111';
const mockFormId = '22222222-2222-2222-2222-222222222222';
const mockSubmissionId = '33333333-3333-3333-3333-333333333333';
const mockAssetId = '44444444-4444-4444-4444-444444444444';

const mockFields = [
  { key: 'name', label: 'Name', type: FormFieldType.TEXT, required: true },
  { key: 'age', label: 'Age', type: FormFieldType.NUMBER, required: false },
  {
    key: 'gender',
    label: 'Gender',
    type: FormFieldType.DROPDOWN,
    required: true,
    options: ['Male', 'Female'],
  },
  {
    key: 'interests',
    label: 'Interests',
    type: FormFieldType.CHECKBOX,
    required: false,
    options: ['Music', 'Sports'],
  },
  { key: 'email', label: 'Email', type: FormFieldType.EMAIL, required: false },
];

const mockForm = {
  id: mockFormId,
  church_id: mockChurchId,
  title: 'Test Form',
  description: 'A test form',
  fields: mockFields as unknown as Prisma.JsonValue,
  status: FormStatus.published,
  is_template: false,
  is_public: false,
  public_token: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockSubmission = {
  id: mockSubmissionId,
  form_id: mockFormId,
  church_id: mockChurchId,
  data: { name: 'John Doe', age: 30, gender: 'Male' } as unknown as Prisma.JsonValue,
  submitted_by: mockUserId,
  status: SubmissionStatus.pending,
  approved_by_id: null,
  approved_at: null,
  rejection_reason: null,
  attachments: [] as unknown as Prisma.JsonValue,
  created_at: new Date(),
};

const mockMediaAsset = {
  id: mockAssetId,
  church_id: mockChurchId,
  filename: 'receipt.pdf',
  url: 'https://example.com/receipt.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1024,
  folder: 'general',
  permissions: 'members',
  created_at: new Date(),
};

describe('FormsService', () => {
  let service: FormsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new FormsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
    );
  });

  describe('createForm', () => {
    it('should create a form with valid fields', async () => {
      prisma.form.create.mockResolvedValue(mockForm);

      const result = await service.createForm(
        mockChurchId,
        {
          title: 'Test Form',
          description: 'A test form',
          fields: mockFields,
        },
        mockUserId,
      );

      expect(result.title).toBe('Test Form');
      expect(result.fields).toHaveLength(5);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form', action: 'CREATE' }),
      );
    });

    it('should throw BadRequestException for duplicate field keys', async () => {
      await expect(
        service.createForm(
          mockChurchId,
          {
            title: 'Bad Form',
            fields: [
              { key: 'name', label: 'Name', type: FormFieldType.TEXT },
              { key: 'name', label: 'Name Again', type: FormFieldType.TEXT },
            ],
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when dropdown has no options', async () => {
      await expect(
        service.createForm(
          mockChurchId,
          {
            title: 'Bad Form',
            fields: [{ key: 'choice', label: 'Choice', type: FormFieldType.DROPDOWN }],
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForms', () => {
    it('should return paginated forms', async () => {
      prisma.form.count.mockResolvedValue(1);
      prisma.form.findMany.mockResolvedValue([mockForm]);

      const result = await service.listForms(mockChurchId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should exclude archived forms by default', async () => {
      prisma.form.count.mockResolvedValue(0);
      prisma.form.findMany.mockResolvedValue([]);

      await service.listForms(mockChurchId, {});

      expect(prisma.form.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ archived_at: null }) }),
      );
    });

    it('should list only archived forms when archived=true', async () => {
      prisma.form.count.mockResolvedValue(1);
      prisma.form.findMany.mockResolvedValue([
        { ...mockForm, archived_at: new Date('2026-08-28T10:00:00.000Z') },
      ]);

      const result = await service.listForms(mockChurchId, { archived: true });

      expect(prisma.form.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ archived_at: { not: null } }) }),
      );
      expect(result.items[0].archivedAt).toBe('2026-08-28T10:00:00.000Z');
    });

    it('should apply search filter', async () => {
      prisma.form.count.mockResolvedValue(0);
      prisma.form.findMany.mockResolvedValue([]);

      await service.listForms(mockChurchId, { search: 'Test' });

      expect(prisma.form.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('getForm', () => {
    it('should return a form', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);

      const result = await service.getForm(mockChurchId, mockFormId);

      expect(result.id).toBe(mockFormId);
    });

    it('should throw NotFoundException for unknown form', async () => {
      prisma.form.findFirst.mockResolvedValue(null);

      await expect(service.getForm(mockChurchId, mockFormId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateForm', () => {
    it('should update a form', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.form.update.mockResolvedValue({ ...mockForm, title: 'Updated Form' });

      const result = await service.updateForm(
        mockChurchId,
        mockFormId,
        { title: 'Updated Form' },
        mockUserId,
      );

      expect(result.title).toBe('Updated Form');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form', action: 'UPDATE' }),
      );
    });

    it('should throw NotFoundException when updating an archived form', async () => {
      prisma.form.findFirst.mockResolvedValue({
        ...mockForm,
        archived_at: new Date('2026-08-28T10:00:00.000Z'),
      });

      await expect(
        service.updateForm(mockChurchId, mockFormId, { title: 'Updated' }, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteForm', () => {
    it('should close a form', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.form.update.mockResolvedValue({ ...mockForm, status: FormStatus.closed });

      const result = await service.deleteForm(mockChurchId, mockFormId, mockUserId);

      expect(result.success).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form', action: 'DELETE' }),
      );
    });

    it('should still work (purge/close path) on an archived form', async () => {
      prisma.form.findFirst.mockResolvedValue({
        ...mockForm,
        archived_at: new Date('2026-08-28T10:00:00.000Z'),
      });
      prisma.form.update.mockResolvedValue({ ...mockForm, status: FormStatus.closed });

      const result = await service.deleteForm(mockChurchId, mockFormId, mockUserId);

      expect(result.success).toBe(true);
      expect(prisma.form.update).toHaveBeenCalled();
    });
  });

  describe('cloneForm', () => {
    it('should clone a form as a draft', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.form.create.mockResolvedValue({
        ...mockForm,
        id: '55555555-5555-5555-5555-555555555555',
        title: 'Test Form (Copy)',
        status: FormStatus.draft,
        is_template: false,
      });

      const result = await service.cloneForm(mockChurchId, mockFormId, mockUserId);

      expect(result.title).toBe('Test Form (Copy)');
      expect(result.status).toBe(FormStatus.draft);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form', action: 'CREATE' }),
      );
    });

    it('should throw NotFoundException when cloning an archived form', async () => {
      prisma.form.findFirst.mockResolvedValue({
        ...mockForm,
        archived_at: new Date('2026-08-28T10:00:00.000Z'),
      });

      await expect(service.cloneForm(mockChurchId, mockFormId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archiveForm', () => {
    it('should set archived_at and audit ARCHIVE', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.form.update.mockResolvedValue({
        ...mockForm,
        archived_at: new Date('2026-08-28T12:00:00.000Z'),
      });

      const result = await service.archiveForm(mockChurchId, mockFormId, mockUserId);

      expect(prisma.form.update).toHaveBeenCalledWith({
        where: { id: mockFormId },
        data: { archived_at: expect.any(Date) },
      });
      expect(result.archivedAt).toBe('2026-08-28T12:00:00.000Z');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ARCHIVE', entity: 'form' }),
      );
    });

    it('should throw ConflictException when already archived', async () => {
      prisma.form.findFirst.mockResolvedValue({
        ...mockForm,
        archived_at: new Date(),
      });

      await expect(service.archiveForm(mockChurchId, mockFormId, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when form is missing', async () => {
      prisma.form.findFirst.mockResolvedValue(null);

      await expect(service.archiveForm(mockChurchId, mockFormId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restoreForm', () => {
    it('should clear archived_at and audit RESTORE', async () => {
      prisma.form.findFirst.mockResolvedValue({
        ...mockForm,
        archived_at: new Date('2026-08-27T12:00:00.000Z'),
      });
      prisma.form.update.mockResolvedValue(mockForm);

      const result = await service.restoreForm(mockChurchId, mockFormId, mockUserId);

      expect(prisma.form.update).toHaveBeenCalledWith({
        where: { id: mockFormId },
        data: { archived_at: null },
      });
      expect(result.archivedAt).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESTORE', entity: 'form' }),
      );
    });

    it('should throw ConflictException when not archived', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);

      await expect(service.restoreForm(mockChurchId, mockFormId, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when form is missing', async () => {
      prisma.form.findFirst.mockResolvedValue(null);

      await expect(service.restoreForm(mockChurchId, mockFormId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('submitForm', () => {
    it('should create a submission with valid data', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.formSubmission.create.mockResolvedValue(mockSubmission);

      const result = await service.submitForm(
        mockChurchId,
        mockFormId,
        { data: { name: 'John Doe', age: 30, gender: 'Male' } },
        mockUserId,
      );

      expect(result.status).toBe(SubmissionStatus.pending);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form_submission', action: 'CREATE' }),
      );
    });

    it('should reject submission to a draft form', async () => {
      prisma.form.findFirst.mockResolvedValue({ ...mockForm, status: FormStatus.draft });

      await expect(
        service.submitForm(
          mockChurchId,
          mockFormId,
          { data: { name: 'John Doe', gender: 'Male' } },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject missing required field', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);

      await expect(
        service.submitForm(
          mockChurchId,
          mockFormId,
          { data: { age: 30, gender: 'Male' } },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid dropdown option', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);

      await expect(
        service.submitForm(
          mockChurchId,
          mockFormId,
          { data: { name: 'John Doe', gender: 'Other' } },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unexpected field', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);

      await expect(
        service.submitForm(
          mockChurchId,
          mockFormId,
          { data: { name: 'John Doe', gender: 'Male', extra: 'value' } },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include attachments when asset IDs are valid', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.mediaAsset.findMany.mockResolvedValue([mockMediaAsset]);
      prisma.formSubmission.create.mockResolvedValue({
        ...mockSubmission,
        attachments: [
          {
            assetId: mockAssetId,
            url: mockMediaAsset.url,
            filename: mockMediaAsset.filename,
            mimeType: mockMediaAsset.mime_type,
          },
        ] as unknown as Prisma.JsonValue,
      });

      const result = await service.submitForm(
        mockChurchId,
        mockFormId,
        { data: { name: 'John Doe', gender: 'Male' }, attachmentAssetIds: [mockAssetId] },
        mockUserId,
      );

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].assetId).toBe(mockAssetId);
    });

    it('should reject invalid attachment asset IDs', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      await expect(
        service.submitForm(
          mockChurchId,
          mockFormId,
          { data: { name: 'John Doe', gender: 'Male' }, attachmentAssetIds: [mockAssetId] },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitByPublicToken', () => {
    it('should create a submission with a valid public token', async () => {
      prisma.form.findUnique.mockResolvedValue({
        ...mockForm,
        is_public: true,
        public_token: 'public-token',
      });
      prisma.formSubmission.create.mockResolvedValue({ ...mockSubmission, submitted_by: null });

      const result = await service.submitByPublicToken('public-token', {
        data: { name: 'Jane Doe', gender: 'Female' },
      });

      expect(result.submittedBy).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: 'public' }));
    });

    it('should reject an invalid public token', async () => {
      prisma.form.findUnique.mockResolvedValue(null);

      await expect(
        service.submitByPublicToken('bad-token', { data: { name: 'Jane Doe' } }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject a non-public form', async () => {
      prisma.form.findUnique.mockResolvedValue(mockForm);

      await expect(
        service.submitByPublicToken('token', { data: { name: 'Jane Doe' } }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listSubmissions', () => {
    it('should return paginated submissions', async () => {
      prisma.form.findFirst.mockResolvedValue(mockForm);
      prisma.formSubmission.count.mockResolvedValue(1);
      prisma.formSubmission.findMany.mockResolvedValue([mockSubmission]);

      const result = await service.listSubmissions(mockChurchId, mockFormId, {});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getSubmission', () => {
    it('should return a submission', async () => {
      prisma.formSubmission.findFirst.mockResolvedValue(mockSubmission);

      const result = await service.getSubmission(mockChurchId, mockFormId, mockSubmissionId);

      expect(result.id).toBe(mockSubmissionId);
    });

    it('should throw NotFoundException for unknown submission', async () => {
      prisma.formSubmission.findFirst.mockResolvedValue(null);

      await expect(
        service.getSubmission(mockChurchId, mockFormId, mockSubmissionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSubmissionStatus', () => {
    it('should approve a pending submission', async () => {
      prisma.formSubmission.findFirst.mockResolvedValue(mockSubmission);
      prisma.formSubmission.update.mockResolvedValue({
        ...mockSubmission,
        status: SubmissionStatus.approved,
        approved_by_id: mockUserId,
        approved_at: new Date(),
      });

      const result = await service.updateSubmissionStatus(
        mockChurchId,
        mockFormId,
        mockSubmissionId,
        { status: SubmissionStatus.approved },
        mockUserId,
      );

      expect(result.status).toBe(SubmissionStatus.approved);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'form_submission', action: 'UPDATE' }),
      );
    });

    it('should reject a pending submission with a reason', async () => {
      prisma.formSubmission.findFirst.mockResolvedValue(mockSubmission);
      prisma.formSubmission.update.mockResolvedValue({
        ...mockSubmission,
        status: SubmissionStatus.rejected,
        approved_by_id: mockUserId,
        approved_at: new Date(),
        rejection_reason: 'Incomplete information',
      });

      const result = await service.updateSubmissionStatus(
        mockChurchId,
        mockFormId,
        mockSubmissionId,
        { status: SubmissionStatus.rejected, rejectionReason: 'Incomplete information' },
        mockUserId,
      );

      expect(result.status).toBe(SubmissionStatus.rejected);
      expect(result.rejectionReason).toBe('Incomplete information');
    });

    it('should throw BadRequestException for non-pending submissions', async () => {
      prisma.formSubmission.findFirst.mockResolvedValue({
        ...mockSubmission,
        status: SubmissionStatus.approved,
      });

      await expect(
        service.updateSubmissionStatus(
          mockChurchId,
          mockFormId,
          mockSubmissionId,
          { status: SubmissionStatus.rejected },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
