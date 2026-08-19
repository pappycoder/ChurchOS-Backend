/**
 * @file Media upload service with Supabase Storage integration.
 * @module MediaService
 * @description Handles file uploads, image optimization, and deletion from Supabase Storage.
 * Images are automatically optimized to WebP format with quality 80 and max dimensions 1200x1200px.
 * Metadata is stripped from images for privacy and size reduction.
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { MediaResponseDto } from './dto/media-response.dto';
import { ListLibraryDto } from './dto/list-library.dto';
import { MediaAssetResponseDto } from './dto/media-asset-response.dto';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

/** Allowed MIME types for image uploads */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
/** Allowed MIME types for document uploads */
const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
/** Maximum file size in bytes (5MB) */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Interface representing a file uploaded via Multer.
 * @property fieldname - The field name from the form
 * @property originalname - The original filename
 * @property encoding - The file encoding
 * @property mimetype - The MIME type
 * @property size - File size in bytes
 * @property buffer - File content as Buffer
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Service for handling media uploads and file management.
 * Provides methods for uploading images with optimization and documents,
 * as well as deleting files from Supabase Storage.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly bucket: string;

  /**
   * Creates an instance of MediaService.
   * @param supabase - Supabase client for storage operations
   * @param config - Configuration service for environment variables
   */
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {
    this.bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET', 'media');
  }

  /**
   * Uploads an image with automatic optimization.
   * Converts to WebP format, resizes to max 1200x1200px, quality 80, strips metadata.
   * @param file - The image file to upload
   * @param folder - Storage folder path (e.g., "churches", "branches")
   * @param churchId - Church ID for multi-tenant storage isolation
   * @returns MediaResponseDto with URL, path, dimensions, and size
   * @throws BadRequestException if file is invalid or too large
   * @throws InternalServerErrorException if upload fails
   */
  async uploadImage(
    file: MulterFile,
    folder: string,
    churchId: string,
    userId?: string,
  ): Promise<MediaResponseDto> {
    this.validateFile(file, true);

    const optimized = await this.optimizeImage(file.buffer);
    const ext = 'webp';
    const filename = `${randomUUID()}.${ext}`;
    const path = `${folder}/${churchId}/${filename}`;

    const { error } = await this.supabase.client.storage
      .from(this.bucket)
      .upload(path, optimized.buffer, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload image');
    }

    const { data: urlData } = this.supabase.client.storage.from(this.bucket).getPublicUrl(path);

    const metadata = await sharp(optimized.buffer).metadata();

    await this.prisma.mediaAsset.create({
      data: {
        church_id: churchId,
        filename,
        url: urlData.publicUrl,
        mime_type: 'image/webp',
        size_bytes: optimized.buffer.length,
        folder,
        permissions: 'members',
      },
    });

    if (userId) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'media_asset',
        action: 'CREATE',
        entityId: filename,
        newValues: { filename, folder, mime_type: 'image/webp', size: optimized.buffer.length },
      });
    }

    return {
      url: urlData.publicUrl,
      path,
      width: metadata.width,
      height: metadata.height,
      size: optimized.buffer.length,
      contentType: 'image/webp',
    };
  }

  /**
   * Uploads a file without optimization.
   * Accepts images, PDF, CSV, and Excel files.
   * @param file - The file to upload
   * @param folder - Storage folder path (e.g., "documents")
   * @param churchId - Church ID for multi-tenant storage isolation
   * @returns MediaResponseDto with URL, path, and size
   * @throws BadRequestException if file is invalid or too large
   * @throws InternalServerErrorException if upload fails
   */
  async uploadFile(
    file: MulterFile,
    folder: string,
    churchId: string,
    userId?: string,
  ): Promise<MediaResponseDto> {
    this.validateFile(file, false);

    const ext = file.originalname.split('.').pop() || 'bin';
    const filename = `${randomUUID()}.${ext}`;
    const path = `${folder}/${churchId}/${filename}`;

    const { error } = await this.supabase.client.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload file');
    }

    const { data: urlData } = this.supabase.client.storage.from(this.bucket).getPublicUrl(path);

    await this.prisma.mediaAsset.create({
      data: {
        church_id: churchId,
        filename,
        url: urlData.publicUrl,
        mime_type: file.mimetype,
        size_bytes: file.buffer.length,
        folder,
        permissions: 'members',
      },
    });

    if (userId) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'media_asset',
        action: 'CREATE',
        entityId: filename,
        newValues: { filename, folder, mime_type: file.mimetype, size: file.buffer.length },
      });
    }

    return {
      url: urlData.publicUrl,
      path,
      size: file.buffer.length,
      contentType: file.mimetype,
    };
  }

  /**
   * Deletes a file from Supabase Storage by its path.
   * @param path - Storage path of the file to delete
   * @returns Promise<void>
   */
  async deleteFile(path: string): Promise<void> {
    const { error } = await this.supabase.client.storage.from(this.bucket).remove([path]);

    if (error) {
      this.logger.warn(`Failed to delete file at ${path}: ${error.message}`);
    }
  }

  /**
   * Deletes a file from Supabase Storage by its public URL.
   * Extracts the path from the URL and calls deleteFile.
   * @param url - Public URL of the file to delete
   * @returns Promise<void>
   */
  async deleteByUrl(url: string): Promise<void> {
    const extractedPath = this.extractPathFromUrl(url);
    if (extractedPath) {
      await this.deleteFile(extractedPath);
    }
  }

  /**
   * Lists media assets with pagination, folder filter, and search.
   */
  async listLibrary(
    dto: ListLibraryDto,
    churchId: string,
  ): Promise<{ data: MediaAssetResponseDto[]; total: number }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MediaAssetWhereInput = {
      church_id: churchId,
    };

    if (dto.folder) {
      where.folder = { contains: dto.folder, mode: 'insensitive' };
    }

    if (dto.mimeType) {
      where.mime_type = { contains: dto.mimeType, mode: 'insensitive' };
    }

    if (dto.permissions) {
      where.permissions = dto.permissions;
    }

    if (dto.search) {
      where.filename = { contains: dto.search, mode: 'insensitive' };
    }

    const orderBy: Prisma.MediaAssetOrderByWithRelationInput =
      dto.sortBy === 'filename'
        ? { filename: dto.sortOrder ?? 'asc' }
        : dto.sortBy === 'size_bytes'
          ? { size_bytes: dto.sortOrder ?? 'desc' }
          : { created_at: dto.sortOrder ?? 'desc' };

    const [assets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return {
      data: assets.map((a) => this.mapAssetToDto(a)),
      total,
    };
  }

  /**
   * Gets a single media asset by ID.
   */
  async getAsset(assetId: string, churchId: string): Promise<MediaAssetResponseDto> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, church_id: churchId },
    });

    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    return this.mapAssetToDto(asset);
  }

  /**
   * Gets unique folder list for the church's media assets.
   */
  async getFolders(churchId: string): Promise<string[]> {
    const result = await this.prisma.mediaAsset.groupBy({
      by: ['folder'],
      where: { church_id: churchId },
      orderBy: { folder: 'asc' },
    });

    return result.map((r) => r.folder);
  }

  /**
   * Deletes a media asset from both the database and Supabase Storage.
   */
  async deleteAsset(assetId: string, churchId: string, userId?: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, church_id: churchId },
    });

    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    // Delete from Supabase Storage (best-effort)
    const path = this.extractPathFromUrl(asset.url);
    if (path) {
      await this.deleteFile(path);
    }

    await this.prisma.mediaAsset.delete({ where: { id: assetId } });

    if (userId) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'media_asset',
        action: 'DELETE',
        entityId: assetId,
        oldValues: { filename: asset.filename, folder: asset.folder },
      });
    }

    this.logger.log(`Media asset deleted: ${assetId}`);
  }

  /**
   * Updates the permissions on a media asset.
   */
  async updatePermissions(
    assetId: string,
    permissions: string,
    churchId: string,
    userId?: string,
  ): Promise<MediaAssetResponseDto> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, church_id: churchId },
    });

    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { permissions },
    });

    if (userId) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'media_asset',
        action: 'UPDATE',
        entityId: assetId,
        oldValues: { permissions: asset.permissions },
        newValues: { permissions },
      });
    }

    return this.mapAssetToDto(updated);
  }

  // ─── MAPPERS ───────────────────────────────────────────────────

  /**
   * Maps a Prisma MediaAsset to MediaAssetResponseDto.
   */
  private mapAssetToDto(
    asset: Record<string, unknown> & { id: string; created_at: Date },
  ): MediaAssetResponseDto {
    return {
      assetId: asset.id,
      churchId: asset.church_id as string,
      filename: asset.filename as string,
      url: asset.url as string,
      mimeType: asset.mime_type as string,
      sizeBytes: asset.size_bytes as number,
      folder: asset.folder as string,
      permissions: asset.permissions as string,
      createdAt: asset.created_at.toISOString(),
    };
  }

  /**
   * Optimizes an image buffer using sharp.
   * Converts to WebP, resizes to max 1200x1200px, quality 80.
   * @param buffer - The image buffer to optimize
   * @returns Optimized image buffer
   */
  private async optimizeImage(buffer: Buffer): Promise<{ buffer: Buffer }> {
    const result = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return { buffer: result.data };
  }

  /**
   * Validates file size and MIME type.
   * @param file - The file to validate
   * @param isImage - Whether to validate as image only (true) or image + document (false)
   * @throws BadRequestException if file is missing, too large, or has invalid type
   */
  private validateFile(file: MulterFile, isImage: boolean): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds maximum of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
      );
    }

    const allowedTypes = isImage
      ? ALLOWED_IMAGE_TYPES
      : [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Accepted: ${allowedTypes.join(', ')}`,
      );
    }
  }

  /**
   * Extracts the storage path from a Supabase public URL.
   * @param url - The full Supabase Storage public URL
   * @returns The storage path relative to the bucket, or null if invalid
   */
  private extractPathFromUrl(url: string): string | null {
    try {
      const marker = `/storage/v1/object/public/${this.bucket}/`;
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      return url.substring(idx + marker.length);
    } catch {
      return null;
    }
  }
}
