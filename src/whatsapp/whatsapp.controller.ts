/**
 * @file whatsapp.controller.ts
 * @description Authenticated endpoints for WhatsApp messages and templates.
 *
 * Provider callbacks live in integrations. Outbound delivery uses the church’s
 * enabled provider account; history remains church/branch scoped.
 *
 * @module whatsapp/whatsapp.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { ApiCreateEndpoint } from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';

/**
 * Controller for church-owned WhatsApp messaging.
 */
@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Send a WhatsApp message (authenticated).
   */
  @Post('send')
  @RequirePermissions('whatsapp:create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint(
    'Send a WhatsApp message',
    'Sends an outbound WhatsApp message to a phone number. Requires authentication.',
  )
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.whatsappService.sendMessage(dto.to, dto.text || '', churchId);
  }

  /**
   * Send a WhatsApp template message (authenticated).
   */
  @Post('send-template')
  @RequirePermissions('whatsapp:create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint(
    'Send a WhatsApp template message',
    'Sends an outbound WhatsApp template message to a phone number. Requires authentication.',
  )
  async sendTemplateMessage(
    @Body() dto: SendTemplateMessageDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.whatsappService.sendTemplateMessage(
      dto.to,
      dto.templateName,
      dto.language || 'en',
      dto.variables,
      churchId,
      dto.memberId,
    );
  }

  /**
   * List WhatsApp messages with pagination and filters.
   */
  @Get('messages')
  @RequirePermissions('whatsapp:read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('supabase-auth')
  @ApiPaginatedResponse(MessageResponseDto)
  @ApiOperation({
    summary: 'List WhatsApp messages',
    description: 'List church WhatsApp messages with phone, direction filters, and pagination.',
  })
  async listMessages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('phone') phone?: string,
    @Query('direction') direction?: string,
    @Request() req?: AuthenticatedRequest,
  ): Promise<{ data: MessageResponseDto[]; total: number }> {
    const churchId = req?.profile?.church_id || '';
    return this.whatsappService.listMessages(
      churchId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      phone,
      direction,
    );
  }
}
