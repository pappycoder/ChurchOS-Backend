/**
 * @file Media upload controller with REST API endpoints.
 * @module MediaController
 * @description Handles HTTP requests for file uploads, image optimization, and deletion.
 * All endpoints require JWT authentication via Supabase.
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { MediaService, MulterFile } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { ListLibraryDto } from './dto/list-library.dto';
import { MediaAssetResponseDto } from './dto/media-asset-response.dto';

/**
 * Controller for media upload operations.
 * Provides endpoints for uploading images and files, and deleting them.
 * All endpoints require JWT authentication.
 */
@ApiTags('Media')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  /**
   * Creates an instance of MediaController.
   * @param mediaService - Service for media operations
   */
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload/image')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, WebP, GIF, AVIF)',
        },
        folder: {
          type: 'string',
          description: 'Storage folder (e.g., churches, branches, profiles)',
          example: 'churches',
        },
      },
      required: ['file'],
    },
  })
  @ApiCreateEndpoint(
    'Upload and optimize an image',
    'Uploads an image to Supabase Storage with automatic optimization (WebP conversion, resize to max 1200px, quality 80, metadata stripped).',
  )
  /**
   * Uploads and optimizes an image.
   * @param file - The image file to upload
   * @param dto - Upload metadata (folder, optional entity ID)
   * @param req - Authenticated request with user profile
   * @returns MediaResponseDto with optimized image URL and metadata
   */
  async uploadImage(
    @UploadedFile() file: MulterFile,
    @Body() dto: UploadMediaDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MediaResponseDto> {
    const churchId = req.profile?.church_id || '';
    const folder = dto.folder || 'uploads';
    return this.mediaService.uploadImage(file, folder, churchId);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload (images, PDF, CSV, Excel)',
        },
        folder: { type: 'string', description: 'Storage folder', example: 'documents' },
      },
      required: ['file'],
    },
  })
  @ApiCreateEndpoint(
    'Upload a file',
    'Uploads a file to Supabase Storage without image optimization.',
  )
  /**
   * Uploads a file without optimization.
   * @param file - The file to upload
   * @param dto - Upload metadata (folder, optional entity ID)
   * @param req - Authenticated request with user profile
   * @returns MediaResponseDto with file URL and metadata
   */
  async uploadFile(
    @UploadedFile() file: MulterFile,
    @Body() dto: UploadMediaDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MediaResponseDto> {
    const churchId = req.profile?.church_id || '';
    const folder = dto.folder || 'uploads';
    return this.mediaService.uploadFile(file, folder, churchId);
  }

  /**
   * Lists media assets with pagination and filters.
   */
  @Get('library')
  @ApiPaginatedResponse(MediaAssetResponseDto)
  @ApiOperation({
    summary: 'Browse media library',
    description: 'List media assets with folder, MIME type, permission, and search filters.',
  })
  async listLibrary(
    @Query() dto: ListLibraryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ data: MediaAssetResponseDto[]; total: number }> {
    const churchId = req.profile?.church_id || '';
    return this.mediaService.listLibrary(dto, churchId);
  }

  /**
   * Gets unique folder list for the church's media library.
   */
  @Get('library/folders')
  @ApiOperation({
    summary: 'List media folders',
    description: 'Returns unique folder names used in the church media library.',
  })
  async getFolders(@Request() req: AuthenticatedRequest): Promise<{ data: string[] }> {
    const churchId = req.profile?.church_id || '';
    const folders = await this.mediaService.getFolders(churchId);
    return { data: folders };
  }

  /**
   * Gets a single media asset by ID.
   */
  @Get('library/:assetId')
  @ApiGetEndpoint('Get media asset details')
  @ApiParam({ name: 'assetId', description: 'Media asset UUID' })
  async getAsset(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MediaAssetResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.mediaService.getAsset(assetId, churchId);
  }

  /**
   * Updates permissions on a media asset.
   */
  @Patch('library/:assetId/permissions')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @ApiUpdateEndpoint('Update media permissions')
  @ApiParam({ name: 'assetId', description: 'Media asset UUID' })
  async updatePermissions(
    @Param('assetId') assetId: string,
    @Body('permissions') permissions: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MediaAssetResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.mediaService.updatePermissions(assetId, permissions, churchId);
  }

  /**
   * Deletes a media asset from both database and storage.
   */
  @Delete('library/:assetId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint('Delete a media asset')
  @ApiParam({ name: 'assetId', description: 'Media asset UUID' })
  async deleteAsset(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.mediaService.deleteAsset(assetId, churchId);
    return { success: true };
  }

  @Delete(':path(*)')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a file from storage',
    description: 'Deletes a file by its storage path.',
  })
  /**
   * Deletes a file from Supabase Storage.
   * @param path - Storage path of the file to delete (URL-encoded)
   * @returns Object with success status
   */
  async deleteFile(@Param('path') path: string): Promise<{ success: boolean }> {
    const decodedPath = decodeURIComponent(path);
    await this.mediaService.deleteFile(decodedPath);
    return { success: true };
  }
}
