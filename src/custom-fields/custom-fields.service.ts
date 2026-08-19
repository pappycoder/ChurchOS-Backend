import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CustomFieldResponseDto } from './dto/custom-field-response.dto';

const VALID_FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea'];

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  async create(
    dto: CreateCustomFieldDto,
    churchId: string,
    userId: string,
  ): Promise<CustomFieldResponseDto> {
    if (!VALID_FIELD_TYPES.includes(dto.field_type)) {
      throw new BadRequestException(
        `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}`,
      );
    }

    if (dto.field_type === 'dropdown' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('Dropdown fields require at least one option');
    }

    const existing = await this.prisma.customFieldDefinition.findFirst({
      where: { church_id: churchId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`A custom field named "${dto.name}" already exists`);
    }

    const field = await this.prisma.customFieldDefinition.create({
      data: {
        church_id: churchId,
        name: dto.name,
        field_type: dto.field_type,
        options: dto.options || [],
        is_required: dto.is_required || false,
        display_order: dto.display_order || 0,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'custom_field_definition',
      action: 'CREATE',
      entityId: field.id,
      newValues: { name: dto.name, field_type: dto.field_type },
    });

    this.logger.log(`Custom field created: ${field.id} (${dto.name})`);

    return this.toResponseDto(field);
  }

  async findAll(churchId: string): Promise<CustomFieldResponseDto[]> {
    const fields = await this.prisma.customFieldDefinition.findMany({
      where: { church_id: churchId },
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
    });

    return fields.map((f) => this.toResponseDto(f));
  }

  async findOne(id: string, churchId: string): Promise<CustomFieldResponseDto> {
    const field = await this.prisma.customFieldDefinition.findUnique({ where: { id } });

    if (!field || field.church_id !== churchId) {
      throw new NotFoundException('Custom field not found');
    }

    return this.toResponseDto(field);
  }

  async update(
    id: string,
    dto: UpdateCustomFieldDto,
    churchId: string,
    userId: string,
  ): Promise<CustomFieldResponseDto> {
    const existing = await this.prisma.customFieldDefinition.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Custom field not found');
    }

    if (dto.field_type && !VALID_FIELD_TYPES.includes(dto.field_type)) {
      throw new BadRequestException(
        `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}`,
      );
    }

    const effectiveType = dto.field_type || existing.field_type;
    if (effectiveType === 'dropdown' && dto.options && dto.options.length === 0) {
      throw new BadRequestException('Dropdown fields require at least one option');
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.customFieldDefinition.findFirst({
        where: { church_id: churchId, name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`A custom field named "${dto.name}" already exists`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.field_type !== undefined) updateData.field_type = dto.field_type;
    if (dto.options !== undefined) updateData.options = dto.options;
    if (dto.is_required !== undefined) updateData.is_required = dto.is_required;
    if (dto.display_order !== undefined) updateData.display_order = dto.display_order;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const field = await this.prisma.customFieldDefinition.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'custom_field_definition',
      action: 'UPDATE',
      entityId: id,
      oldValues: { name: existing.name },
      newValues: updateData,
    });

    this.logger.log(`Custom field updated: ${id}`);

    return this.toResponseDto(field);
  }

  async remove(id: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.customFieldDefinition.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Custom field not found');
    }

    await this.prisma.customFieldDefinition.delete({ where: { id } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'custom_field_definition',
      action: 'DELETE',
      entityId: id,
      oldValues: { name: existing.name },
    });

    this.logger.log(`Custom field deleted: ${id}`);
  }

  private toResponseDto(field: {
    id: string;
    church_id: string;
    name: string;
    field_type: string;
    options: unknown;
    is_required: boolean;
    display_order: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): CustomFieldResponseDto {
    return {
      id: field.id,
      churchId: field.church_id,
      name: field.name,
      fieldType: field.field_type,
      options: Array.isArray(field.options) ? (field.options as string[]) : [],
      isRequired: field.is_required,
      displayOrder: field.display_order,
      isActive: field.is_active,
      createdAt: field.created_at.toISOString(),
      updatedAt: field.updated_at.toISOString(),
    };
  }
}
