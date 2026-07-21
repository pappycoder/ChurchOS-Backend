/**
 * @file whatsapp.controller.ts
 * @description HTTP endpoints for WhatsApp integration.
 *
 * Provides webhook verification, inbound message processing, outbound sending,
 * and message listing.
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
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { ApiCreateEndpoint } from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WebhookBodyDto } from './dto/webhook.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';

/**
 * Controller for WhatsApp Business API integration.
 */
@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Webhook verification endpoint (GET).
   * 360dialog sends a GET request to verify the webhook URL.
   */
  @Get('webhook')
  @ApiOperation({
    summary: 'Verify WhatsApp webhook',
    description: 'Handles webhook verification from 360dialog. Returns the challenge token.',
  })
  @ApiQuery({ name: 'hub.mode', required: true })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'churchos-verify-token';

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn(`Webhook verification failed: mode=${mode}, token=${token}`);
    return 'Verification failed';
  }

  /**
   * Process inbound WhatsApp messages (POST).
   * Receives webhook events from 360dialog for inbound messages and status updates.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process WhatsApp webhook',
    description: 'Receives inbound messages and delivery status updates from 360dialog.',
  })
  async processWebhook(
    @Body() body: WebhookBodyDto,
  ): Promise<{ success: boolean; processed: number }> {
    const result = await this.whatsappService.processWebhook(body);
    return { success: true, processed: result.processed };
  }

  /**
   * Send a WhatsApp message (authenticated).
   */
  @Post('send')
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
