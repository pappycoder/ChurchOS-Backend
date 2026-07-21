/**
 * @file templates.service.ts
 * @description Business logic for message template management.
 *
 * Handles CRUD operations for reusable message templates used across
 * WhatsApp, SMS, and Email channels. Templates allow church admins to
 * create standardized messages for common communications:
 * - Welcome messages for new members
 * - Event reminders and invitations
 * - Giving receipt confirmations
 * - Prayer request acknowledgments
 * - Birthday/anniversary greetings
 *
 * All queries are scoped by church_id for multi-tenant data isolation.
 * All mutations are audit-logged.
 *
 * @module templates/templates.service
 * @since 1.0.0
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { TemplateResponseDto } from './dto/template-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  /**
   * Creates a new message template.
   *
   * @param dto - Template creation data (name, content, channel, optional language)
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user creating the template (for audit)
   * @returns Created template response
   */
  async create(
    dto: CreateTemplateDto,
    churchId: string,
    userId: string,
  ): Promise<TemplateResponseDto> {
    const template = await this.prisma.template.create({
      data: {
        church_id: churchId,
        name: dto.name,
        content: dto.content,
        channel: dto.channel,
        language: dto.language || 'en',
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'template',
      action: 'CREATE',
      entityId: template.id,
      newValues: { name: dto.name, channel: dto.channel },
    });

    this.logger.log(`Template created: ${template.name} (${template.id})`);
    return this.mapToResponseDto(template);
  }

  /**
   * Lists templates with pagination and optional filters.
   *
   * @param churchId - Church ID for tenant scoping
   * @param query - List query parameters (pagination, channel, status, search)
   * @returns Paginated list of templates with total count
   */
  async findAll(
    churchId: string,
    query: ListTemplatesDto,
  ): Promise<{ data: TemplateResponseDto[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TemplateWhereInput = { church_id: churchId };

    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      data: templates.map((t) => this.mapToResponseDto(t)),
      total,
    };
  }

  /**
   * Gets a single template by ID.
   *
   * @param templateId - Template UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Template response
   * @throws NotFoundException if template doesn't exist or belongs to another church
   */
  async findById(templateId: string, churchId: string): Promise<TemplateResponseDto> {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, church_id: churchId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return this.mapToResponseDto(template);
  }

  /**
   * Updates a template with partial data.
   *
   * @param templateId - Template UUID to update
   * @param dto - Update data (name, content, channel, status, language — all optional)
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the update (for audit)
   * @returns Updated template response
   * @throws NotFoundException if template doesn't exist
   */
  async update(
    templateId: string,
    dto: UpdateTemplateDto,
    churchId: string,
    userId: string,
  ): Promise<TemplateResponseDto> {
    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.channel !== undefined) updateData.channel = dto.channel;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.language !== undefined) updateData.language = dto.language;

    if (Object.keys(updateData).length === 0) {
      return this.mapToResponseDto(existing);
    }

    const updated = await this.prisma.template.update({
      where: { id: templateId },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'template',
      action: 'UPDATE',
      entityId: templateId,
      oldValues: { name: existing.name, status: existing.status },
      newValues: updateData,
    });

    this.logger.log(`Template updated: ${templateId}`);
    return this.mapToResponseDto(updated);
  }

  /**
   * Deletes a template permanently.
   *
   * @param templateId - Template UUID to delete
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the deletion (for audit)
   * @throws NotFoundException if template doesn't exist
   */
  async delete(templateId: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    await this.prisma.template.delete({ where: { id: templateId } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'template',
      action: 'DELETE',
      entityId: templateId,
      oldValues: { name: existing.name },
    });

    this.logger.log(`Template deleted: ${templateId}`);
  }

  /**
   * Maps raw Prisma template data to a TemplateResponseDto.
   *
   * @param template - Raw template record from Prisma
   * @returns Formatted template response DTO
   */
  private mapToResponseDto(template: {
    id: string;
    church_id: string;
    name: string;
    content: string;
    channel: string;
    language: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }): TemplateResponseDto {
    return {
      templateId: template.id,
      churchId: template.church_id,
      name: template.name,
      content: template.content,
      channel: template.channel,
      language: template.language,
      status: template.status,
      createdAt: template.created_at.toISOString(),
      updatedAt: template.updated_at.toISOString(),
    };
  }
}
