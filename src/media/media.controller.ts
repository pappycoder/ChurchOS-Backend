/**
 * @file Media upload controller with REST API endpoints.
 * @module MediaController
 * @description Handles HTTP requests for file uploads, image optimization, and deletion.
 * All endpoints require JWT authentication via Supabase.
 * @since 1.0.0
 */

import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { ApiCreateEndpoint } from '../common/decorators/api-standard-responses.decorator';
import { MediaService, MulterFile } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';

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
