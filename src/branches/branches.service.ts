/**
 * @file Branch management service with CRUD operations.
 * @module BranchesService
 * @description Handles branch creation, retrieval, updates, and deletion.
 * Enforces single headquarters constraint and member guard on deletion.
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { MediaService } from '../media/media.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { BranchResponseDto } from './dto/branch-response.dto';
import { Prisma } from '@prisma/client';

/**
 * Service for managing church branches.
 * Provides CRUD operations with multi-tenant isolation via church_id.
 */
@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  /**
   * Creates an instance of BranchesService.
   * @param prisma - Prisma database service
   * @param audit - Audit logging service for tracking mutations
   * @param media - Media service for file operations
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
    private readonly media: MediaService,
  ) {}

  /**
   * Creates a new branch for a church.
   * Validates single headquarters constraint.
   * @param dto - Branch creation data
   * @param churchId - The church UUID
   * @param userId - User performing the creation (for audit log)
   * @returns BranchResponseDto with created branch details
   * @throws ConflictException if headquarters already exists when isHeadquarters is true
   */
  async create(dto: CreateBranchDto, churchId: string, userId: string): Promise<BranchResponseDto> {
    if (dto.isHeadquarters) {
      const existingHQ = await this.prisma.branch.findFirst({
        where: { church_id: churchId, is_headquarters: true },
      });
      if (existingHQ) {
        throw new ConflictException('A headquarters branch already exists for this church');
      }
    }

    const branch = await this.prisma.branch.create({
      data: {
        church_id: churchId,
        name: dto.name,
        is_headquarters: dto.isHeadquarters ?? false,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        phone: dto.phone,
        email: dto.email,
        photo_url: dto.photoUrl,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'branch',
      action: 'CREATE',
      entityId: branch.id,
      newValues: { name: dto.name, isHeadquarters: dto.isHeadquarters },
    });

    this.logger.log(`Branch created: ${branch.name} (${branch.id})`);

    return this.mapToResponseDto(branch, 0);
  }

  /**
   * Lists branches with pagination, search, and sorting.
   * @param churchId - The church UUID
   * @param query - Pagination, search, and sort parameters
   * @returns Array of BranchResponseDto and total count
   */
  async findAll(
    churchId: string,
    query: ListBranchesDto,
  ): Promise<{ data: BranchResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.BranchWhereInput = { church_id: churchId };

    if (query.search) {
      const searchTerm = query.search;
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { address: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.BranchOrderByWithRelationInput[] = [];
    if (query.sortBy) {
      orderBy.push({ [query.sortBy]: (query.sortOrder || 'asc') as Prisma.SortOrder });
    } else {
      orderBy.push({ is_headquarters: 'desc' });
      orderBy.push({ name: 'asc' });
    }

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: { select: { members: true } },
        },
      }),
      this.prisma.branch.count({ where }),
    ]);

    const data = branches.map((b) => this.mapToResponseDto(b, b._count.members));

    return { data, total };
  }

  /**
   * Retrieves a single branch by ID.
   * @param id - Branch UUID
   * @param churchId - The church UUID for multi-tenant isolation
   * @returns BranchResponseDto with branch details
   * @throws NotFoundException if branch not found or doesn't belong to church
   */
  async findOne(id: string, churchId: string): Promise<BranchResponseDto> {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (!branch || branch.church_id !== churchId) {
      throw new NotFoundException('Branch not found');
    }

    return this.mapToResponseDto(branch, branch._count.members);
  }

  /**
   * Updates branch details with partial updates.
   * Deletes old photo from Supabase Storage when replaced.
   * @param id - Branch UUID
   * @param dto - Update data (all fields optional)
   * @param churchId - The church UUID for multi-tenant isolation
   * @param userId - User performing the update (for audit log)
   * @returns Updated BranchResponseDto
   * @throws NotFoundException if branch not found or doesn't belong to church
   */
  async update(
    id: string,
    dto: UpdateBranchDto,
    churchId: string,
    userId: string,
  ): Promise<BranchResponseDto> {
    const existing = await this.prisma.branch.findUnique({ where: { id } });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Branch not found');
    }

    if (existing.photo_url && dto.photoUrl && existing.photo_url !== dto.photoUrl) {
      await this.media.deleteByUrl(existing.photo_url);
    }

    const updateData: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.address !== undefined) updateData.address = dto.address || null;
    if (dto.city !== undefined) updateData.city = dto.city || null;
    if (dto.state !== undefined) updateData.state = dto.state || null;
    if (dto.phone !== undefined) updateData.phone = dto.phone || null;
    if (dto.email !== undefined) updateData.email = dto.email || null;
    if (dto.photoUrl !== undefined) updateData.photo_url = dto.photoUrl || null;

    if (Object.keys(updateData).length === 0) {
      return this.findOne(id, churchId);
    }

    const branch = await this.prisma.branch.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { members: true } },
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'branch',
      action: 'UPDATE',
      entityId: id,
      oldValues: {
        name: existing.name,
        photo_url: existing.photo_url,
      },
      newValues: updateData as Record<string, unknown>,
    });

    this.logger.log(`Branch updated: ${id}`);

    return this.mapToResponseDto(branch, branch._count.members);
  }

  /**
   * Deletes a branch and its photo from storage.
   * @param id - Branch UUID
   * @param churchId - The church UUID for multi-tenant isolation
   * @param userId - User performing the deletion (for audit log)
   * @returns Object with success status
   * @throws NotFoundException if branch not found or doesn't belong to church
   * @throws BadRequestException if branch has members assigned
   */
  async remove(id: string, churchId: string, userId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.branch.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Branch not found');
    }

    if (existing._count.members > 0) {
      throw new BadRequestException(
        `Cannot delete branch with ${existing._count.members} member(s). Reassign or remove members first.`,
      );
    }

    if (existing.photo_url) {
      await this.media.deleteByUrl(existing.photo_url);
    }

    await this.prisma.branch.delete({ where: { id } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'branch',
      action: 'DELETE',
      entityId: id,
      oldValues: { name: existing.name },
    });

    this.logger.log(`Branch deleted: ${id}`);

    return { success: true };
  }

  /**
   * Maps a Prisma Branch object to a BranchResponseDto.
   * @param branch - Prisma Branch object
   * @param memberCount - Number of members in the branch
   * @returns BranchResponseDto with camelCase properties
   */
  private mapToResponseDto(
    branch: {
      id: string;
      church_id: string;
      name: string;
      is_headquarters: boolean;
      address: string | null;
      city: string | null;
      state: string | null;
      phone: string | null;
      email: string | null;
      photo_url: string | null;
      created_at: Date;
      updated_at: Date;
    },
    memberCount: number,
  ): BranchResponseDto {
    return {
      branchId: branch.id,
      churchId: branch.church_id,
      name: branch.name,
      isHeadquarters: branch.is_headquarters,
      address: branch.address || undefined,
      city: branch.city || undefined,
      state: branch.state || undefined,
      phone: branch.phone || undefined,
      email: branch.email || undefined,
      photoUrl: branch.photo_url || undefined,
      memberCount,
      createdAt: branch.created_at.toISOString(),
      updatedAt: branch.updated_at.toISOString(),
    };
  }
}
