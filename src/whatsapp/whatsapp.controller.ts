/**
 * @file whatsapp.controller.ts
 * @description HTTP endpoints for WhatsApp integration via Termii.
 *
 * Provides webhook verification, inbound message processing, outbound sending,
 * and message listing. All outbound WhatsApp and SMS delivery flows through
 * the Termii platform.
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
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipRateLimit } from '../common/guards/rate-limit.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { ApiCreateEndpoint } from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Controller for WhatsApp integration via the Termii platform.
 */
@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Webhook verification endpoint (GET).
   * Termii sends a GET request to verify the webhook URL.
   */
  @Get('webhook')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'Verify WhatsApp webhook',
    description: 'Handles webhook verification from Termii. Returns the challenge token.',
  })
  @ApiQuery({ name: 'hub.mode', required: true })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = process.env.TERMII_WEBHOOK_VERIFY_TOKEN || 'churchos-verify-token';

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn(`Webhook verification failed: mode=${mode}, token=${token}`);
    return 'Verification failed';
  }

  /**
   * Process inbound WhatsApp messages (POST).
   * Receives webhook events from Termii for inbound messages and status updates.
   *
   * The body is intentionally accepted raw (not DTO-validated) because Termii
   * delivers a flat, provider-specific payload; validation is handled in the
   * service. When TERMII_WEBHOOK_SECRET is configured, the request is verified
   * using the signature in the `x-termii-signature` header (falling back to
   * the legacy `x-hub-signature-256` header for transition compatibility).
   */
  @Post('webhook')
  @SkipRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process WhatsApp webhook',
    description: 'Receives inbound messages and delivery status updates from Termii.',
  })
  @ApiBody({ type: Object, required: true })
  async processWebhook(
    @Body() body: Record<string, unknown>,
    @Request() req: AuthenticatedRequest & { rawBody?: Buffer },
  ): Promise<{ success: boolean; processed: number }> {
    const webhookSecret = process.env['TERMII_WEBHOOK_SECRET'];
    if (webhookSecret && req.rawBody) {
      const signature =
        (req.headers['x-termii-signature'] as string | undefined) ??
        (req.headers['x-hub-signature-256'] as string | undefined);
      this.verifyWebhookSignature(req.rawBody, signature, webhookSecret);
    }

    const result = await this.whatsappService.processWebhook(body);
    return { success: true, processed: result.processed };
  }

  /**
   * Verifies the HMAC-SHA256 signature of an incoming webhook payload.
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * @throws UnauthorizedException if signature is missing or invalid
   */
  private verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
    secret: string,
  ): void {
    if (!signature) {
      this.logger.warn('WhatsApp webhook: missing signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedPrefix = 'sha256=';
    if (!signature.startsWith(expectedPrefix)) {
      this.logger.warn('WhatsApp webhook: invalid signature format');
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const expectedHash = createHmac('sha256', secret).update(rawBody).digest('hex');
    const receivedHash = signature.slice(expectedPrefix.length);

    const a = Buffer.from(expectedHash, 'hex');
    const b = Buffer.from(receivedHash, 'hex');

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('WhatsApp webhook: signature mismatch');
      throw new UnauthorizedException('Invalid webhook signature');
    }
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
