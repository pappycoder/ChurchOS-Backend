/**
 * @file forms.service.ts
 * @description Business logic for forms and form submissions.
 *
 * Provides CRUD for form definitions, template cloning, data validation,
 * submission handling, file attachments, and a simple approval workflow.
 *
 * All queries are scoped by church_id for multi-tenant data isolation.
 * All mutations are audit-logged.
 *
 * @module forms/forms.service
 * @since 1.0.0
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Form, FormSubmission, FormStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import {
  CreateFormDto,
  CreateFormSubmissionDto,
  FormFieldDto,
  FormFieldType,
  FormResponseDto,
  FormSubmissionResponseDto,
  ListFormsDto,
  ListFormSubmissionsDto,
  SubmissionAttachmentDto,
  UpdateFormDto,
  UpdateSubmissionStatusDto,
} from './dto';

/**
 * Attachment input extracted from media assets before storing on a submission.
 */
/**
 * Paginated list result used internally by the service.
 */
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Service for managing church forms and submissions.
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  // ─── Forms ────────────────────────────────────────────────

  /**
   * Creates a new form scoped to a church.
   *
   * @param churchId - Church ID
   * @param dto - Form creation data
   * @param userId - ID of the user creating the form
   * @returns Created form response
   */
  async createForm(churchId: string, dto: CreateFormDto, userId: string): Promise<FormResponseDto> {
    this.validateFieldDefinitions(dto.fields);

    const form = await this.prisma.form.create({
      data: {
        church_id: churchId,
        title: dto.title,
        description: dto.description,
        fields: dto.fields as unknown as Prisma.InputJsonValue,
        status: dto.status ?? FormStatus.draft,
        is_template: dto.isTemplate ?? false,
        is_public: dto.isPublic ?? false,
        public_token: dto.isPublic ? randomUUID() : null,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'form',
      action: 'CREATE',
      entityId: form.id,
      newValues: this.formToPlain(form),
    });

    return this.mapForm(form);
  }

  /**
   * Lists forms for a church with optional filters and pagination.
   *
   * @param churchId - Church ID
   * @param query - List filters
   * @returns Paginated form list
   */
  async listForms(
    churchId: string,
    query: ListFormsDto,
  ): Promise<PaginatedResult<FormResponseDto>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FormWhereInput = { church_id: churchId };

    if (query.status) where.status = query.status;
    if (query.isTemplate !== undefined) where.is_template = query.isTemplate;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, forms] = await Promise.all([
      this.prisma.form.count({ where }),
      this.prisma.form.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: forms.map((form) => this.mapForm(form)),
      total,
      page,
      limit,
    };
  }

  /**
   * Gets a single form by ID within a church.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @returns Form response
   */
  async getForm(churchId: string, formId: string): Promise<FormResponseDto> {
    const form = await this.findFormOrFail(churchId, formId);
    return this.mapForm(form);
  }

  /**
   * Updates an existing form.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param dto - Update data
   * @param userId - User making the update
   * @returns Updated form response
   */
  async updateForm(
    churchId: string,
    formId: string,
    dto: UpdateFormDto,
    userId: string,
  ): Promise<FormResponseDto> {
    const existing = await this.findFormOrFail(churchId, formId);
    const oldValues = this.formToPlain(existing);

    if (dto.fields) {
      this.validateFieldDefinitions(dto.fields);
    }

    const isPublic = dto.isPublic ?? existing.is_public;
    const publicToken = isPublic && !existing.public_token ? randomUUID() : existing.public_token;

    const form = await this.prisma.form.update({
      where: { id: formId },
      data: {
        title: dto.title,
        description: dto.description,
        fields: dto.fields
          ? (dto.fields as unknown as Prisma.InputJsonValue)
          : (existing.fields as Prisma.InputJsonValue),
        status: dto.status,
        is_template: dto.isTemplate,
        is_public: dto.isPublic,
        public_token: publicToken,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'form',
      action: 'UPDATE',
      entityId: form.id,
      oldValues,
      newValues: this.formToPlain(form),
    });

    return this.mapForm(form);
  }

  /**
   * Closes a form by setting its status to closed.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param userId - User performing the action
   * @returns Success indicator
   */
  async deleteForm(
    churchId: string,
    formId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.findFormOrFail(churchId, formId);

    await this.prisma.form.update({
      where: { id: formId },
      data: { status: FormStatus.closed },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'form',
      action: 'DELETE',
      entityId: formId,
      oldValues: this.formToPlain(existing),
    });

    return { success: true };
  }

  /**
   * Clones a form (typically a template) into a new draft form.
   *
   * @param churchId - Church ID
   * @param formId - Form ID to clone
   * @param userId - User cloning the form
   * @returns Cloned form response
   */
  async cloneForm(churchId: string, formId: string, userId: string): Promise<FormResponseDto> {
    const source = await this.findFormOrFail(churchId, formId);

    const form = await this.prisma.form.create({
      data: {
        church_id: churchId,
        title: `${source.title} (Copy)`,
        description: source.description,
        fields: source.fields as Prisma.InputJsonValue,
        status: FormStatus.draft,
        is_template: false,
        is_public: false,
        public_token: null,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'form',
      action: 'CREATE',
      entityId: form.id,
      newValues: this.formToPlain(form),
    });

    return this.mapForm(form);
  }

  // ─── Submissions ──────────────────────────────────────────

  /**
   * Submits a form for an authenticated user.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param dto - Submission data
   * @param submittedBy - User ID of the submitter
   * @returns Created submission response
   */
  async submitForm(
    churchId: string,
    formId: string,
    dto: CreateFormSubmissionDto,
    submittedBy: string,
  ): Promise<FormSubmissionResponseDto> {
    const form = await this.findFormOrFail(churchId, formId);
    this.ensureFormAcceptsSubmissions(form);

    const fields = this.parseFields(form.fields);
    this.validateSubmissionData(fields, dto.data);

    const attachments = await this.resolveAttachments(churchId, dto.attachmentAssetIds);

    const submission = await this.prisma.formSubmission.create({
      data: {
        form_id: formId,
        church_id: churchId,
        data: dto.data as Prisma.InputJsonValue,
        submitted_by: submittedBy,
        status: SubmissionStatus.pending,
        attachments: attachments as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      userId: submittedBy,
      churchId,
      entity: 'form_submission',
      action: 'CREATE',
      entityId: submission.id,
      newValues: this.submissionToPlain(submission),
    });

    return this.mapSubmission(submission);
  }

  /**
   * Submits a form using a public token (unauthenticated).
   *
   * @param publicToken - Form public token
   * @param dto - Submission data
   * @returns Created submission response
   */
  async submitByPublicToken(
    publicToken: string,
    dto: CreateFormSubmissionDto,
  ): Promise<FormSubmissionResponseDto> {
    const form = await this.prisma.form.findUnique({
      where: { public_token: publicToken },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    if (!form.is_public || form.status !== FormStatus.published) {
      throw new BadRequestException('This form is not accepting public submissions');
    }

    const fields = this.parseFields(form.fields);
    this.validateSubmissionData(fields, dto.data);

    const submission = await this.prisma.formSubmission.create({
      data: {
        form_id: form.id,
        church_id: form.church_id,
        data: dto.data as Prisma.InputJsonValue,
        submitted_by: null,
        status: SubmissionStatus.pending,
        attachments: [] as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      userId: 'public',
      churchId: form.church_id,
      entity: 'form_submission',
      action: 'CREATE',
      entityId: submission.id,
      newValues: this.submissionToPlain(submission),
    });

    return this.mapSubmission(submission);
  }

  /**
   * Lists submissions for a form.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param query - List filters
   * @returns Paginated submission list
   */
  async listSubmissions(
    churchId: string,
    formId: string,
    query: ListFormSubmissionsDto,
  ): Promise<PaginatedResult<FormSubmissionResponseDto>> {
    await this.findFormOrFail(churchId, formId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FormSubmissionWhereInput = {
      form_id: formId,
      church_id: churchId,
    };

    if (query.status) where.status = query.status;
    if (query.submittedBy) where.submitted_by = query.submittedBy;

    const [total, submissions] = await Promise.all([
      this.prisma.formSubmission.count({ where }),
      this.prisma.formSubmission.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    let items = submissions.map((submission) => this.mapSubmission(submission));

    if (query.search) {
      const term = query.search.toLowerCase();
      items = items.filter((submission) =>
        Object.values(submission.data).some((value) => String(value).toLowerCase().includes(term)),
      );
    }

    return { items, total, page, limit };
  }

  /**
   * Gets a single submission by ID within a church and form.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param submissionId - Submission ID
   * @returns Submission response
   */
  async getSubmission(
    churchId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormSubmissionResponseDto> {
    const submission = await this.findSubmissionOrFail(churchId, formId, submissionId);
    return this.mapSubmission(submission);
  }

  /**
   * Updates the approval status of a submission.
   *
   * @param churchId - Church ID
   * @param formId - Form ID
   * @param submissionId - Submission ID
   * @param dto - New status data
   * @param userId - User approving/rejecting
   * @returns Updated submission response
   */
  async updateSubmissionStatus(
    churchId: string,
    formId: string,
    submissionId: string,
    dto: UpdateSubmissionStatusDto,
    userId: string,
  ): Promise<FormSubmissionResponseDto> {
    const submission = await this.findSubmissionOrFail(churchId, formId, submissionId);

    if (submission.status !== SubmissionStatus.pending) {
      throw new BadRequestException('Only pending submissions can be approved or rejected');
    }

    const oldValues = this.submissionToPlain(submission);
    const now = new Date();

    const updated = await this.prisma.formSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        approved_by_id: userId,
        approved_at: now,
        rejection_reason: dto.status === SubmissionStatus.rejected ? dto.rejectionReason : null,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'form_submission',
      action: 'UPDATE',
      entityId: updated.id,
      oldValues,
      newValues: this.submissionToPlain(updated),
    });

    return this.mapSubmission(updated);
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Finds a form scoped to a church or throws NotFoundException.
   */
  private async findFormOrFail(churchId: string, formId: string): Promise<Form> {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, church_id: churchId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    return form;
  }

  /**
   * Finds a submission scoped to a church and form or throws NotFoundException.
   */
  private async findSubmissionOrFail(
    churchId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormSubmission> {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, church_id: churchId, form_id: formId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  /**
   * Ensures a form is published and accepts submissions.
   */
  private ensureFormAcceptsSubmissions(form: Form): void {
    if (form.status !== FormStatus.published) {
      throw new BadRequestException('This form is not currently accepting submissions');
    }
  }

  /**
   * Parses the JSON fields array from a form record.
   */
  private parseFields(fieldsJson: Prisma.JsonValue): FormFieldDto[] {
    const fields = fieldsJson as unknown as FormFieldDto[] | undefined;
    return Array.isArray(fields) ? fields : [];
  }

  /**
   * Validates that field definitions have unique keys and supported types.
   */
  private validateFieldDefinitions(fields: FormFieldDto[]): void {
    const keys = new Set<string>();
    for (const field of fields) {
      if (!field.key || !field.label) {
        throw new BadRequestException('Every field must have a key and a label');
      }
      if (keys.has(field.key)) {
        throw new BadRequestException(`Duplicate field key: ${field.key}`);
      }
      keys.add(field.key);

      if (!Object.values(FormFieldType).includes(field.type)) {
        throw new BadRequestException(`Unsupported field type: ${field.type}`);
      }

      if (
        (field.type === FormFieldType.DROPDOWN || field.type === FormFieldType.CHECKBOX) &&
        (!Array.isArray(field.options) || field.options.length === 0)
      ) {
        throw new BadRequestException(
          `Field "${field.key}" of type ${field.type} requires options`,
        );
      }
    }
  }

  /**
   * Validates submitted data against the form's field definitions.
   */
  private validateSubmissionData(fields: FormFieldDto[], data: Record<string, unknown>): void {
    for (const field of fields) {
      const value = data[field.key];
      const isEmpty = value === undefined || value === null || value === '';

      if (field.required && isEmpty) {
        throw new BadRequestException(`Field "${field.label}" is required`);
      }

      if (isEmpty) {
        continue;
      }

      this.validateFieldValue(field, value);
    }

    const allowedKeys = new Set(fields.map((field) => field.key));
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`Unexpected field: ${key}`);
      }
    }
  }

  /**
   * Validates a single submitted value against its field definition.
   */
  private validateFieldValue(field: FormFieldDto, value: unknown): void {
    switch (field.type) {
      case FormFieldType.TEXT:
      case FormFieldType.TEXTAREA:
      case FormFieldType.EMAIL:
      case FormFieldType.PHONE:
      case FormFieldType.DATE:
        if (typeof value !== 'string') {
          throw new BadRequestException(`Field "${field.label}" must be a string`);
        }
        if (field.type === FormFieldType.EMAIL && !this.isValidEmail(value)) {
          throw new BadRequestException(`Field "${field.label}" must be a valid email`);
        }
        break;
      case FormFieldType.NUMBER:
        if (typeof value !== 'number') {
          throw new BadRequestException(`Field "${field.label}" must be a number`);
        }
        if (field.validation?.min !== undefined && value < field.validation.min) {
          throw new BadRequestException(
            `Field "${field.label}" must be at least ${field.validation.min}`,
          );
        }
        if (field.validation?.max !== undefined && value > field.validation.max) {
          throw new BadRequestException(
            `Field "${field.label}" must be at most ${field.validation.max}`,
          );
        }
        break;
      case FormFieldType.DROPDOWN:
        if (typeof value !== 'string' || !field.options?.includes(value)) {
          throw new BadRequestException(
            `Field "${field.label}" must be one of the allowed options`,
          );
        }
        break;
      case FormFieldType.CHECKBOX:
        if (!Array.isArray(value) || value.some((item) => !field.options?.includes(String(item)))) {
          throw new BadRequestException(`Field "${field.label}" must only use the allowed options`);
        }
        break;
    }
  }

  /**
   * Resolves media asset attachments for a submission.
   */
  private async resolveAttachments(
    churchId: string,
    assetIds?: string[],
  ): Promise<SubmissionAttachmentDto[]> {
    if (!assetIds || assetIds.length === 0) {
      return [];
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds }, church_id: churchId },
    });

    if (assets.length !== assetIds.length) {
      throw new BadRequestException('One or more attachment assets are invalid');
    }

    return assets.map((asset) => ({
      assetId: asset.id,
      url: asset.url,
      filename: asset.filename,
      mimeType: asset.mime_type,
    }));
  }

  /**
   * Basic email format validation.
   */
  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  /**
   * Maps a Prisma Form record to a FormResponseDto.
   */
  private mapForm(form: Form): FormResponseDto {
    return {
      id: form.id,
      churchId: form.church_id,
      title: form.title,
      description: form.description ?? undefined,
      fields: this.parseFields(form.fields),
      status: form.status,
      isTemplate: form.is_template,
      isPublic: form.is_public,
      publicToken: form.public_token ?? undefined,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    };
  }

  /**
   * Maps a Prisma FormSubmission record to a FormSubmissionResponseDto.
   */
  private mapSubmission(submission: FormSubmission): FormSubmissionResponseDto {
    return {
      id: submission.id,
      formId: submission.form_id,
      churchId: submission.church_id,
      data: submission.data as Record<string, unknown>,
      submittedBy: submission.submitted_by ?? undefined,
      status: submission.status,
      approvedById: submission.approved_by_id ?? undefined,
      approvedAt: submission.approved_at ?? undefined,
      rejectionReason: submission.rejection_reason ?? undefined,
      attachments: (submission.attachments as unknown as SubmissionAttachmentDto[]) || [],
      createdAt: submission.created_at,
    };
  }

  /**
   * Converts a Form record to a plain object for audit logging.
   */
  private formToPlain(form: Form): Record<string, unknown> {
    return {
      id: form.id,
      church_id: form.church_id,
      title: form.title,
      description: form.description,
      fields: form.fields,
      status: form.status,
      is_template: form.is_template,
      is_public: form.is_public,
      public_token: form.public_token,
    };
  }

  /**
   * Converts a FormSubmission record to a plain object for audit logging.
   */
  private submissionToPlain(submission: FormSubmission): Record<string, unknown> {
    return {
      id: submission.id,
      form_id: submission.form_id,
      church_id: submission.church_id,
      data: submission.data,
      submitted_by: submission.submitted_by,
      status: submission.status,
      approved_by_id: submission.approved_by_id,
      approved_at: submission.approved_at,
      rejection_reason: submission.rejection_reason,
      attachments: submission.attachments,
    };
  }
}
