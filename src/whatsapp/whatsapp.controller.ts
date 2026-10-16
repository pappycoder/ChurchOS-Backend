import { RawResponse } from '../common/decorators/raw-response.decorator';
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
  Param,
  ParseUUIDPipe,
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
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipRateLimit } from '../common/guards/rate-limit.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { ApiCreateEndpoint } from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { MessagingCredentialsService } from '../messaging-integrations/messaging-credentials.service';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Controller for WhatsApp integration via the Termii platform.
 */
@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly credentials: MessagingCredentialsService,
  ) {}

  /**
   * Webhook verification endpoint (GET).
   * Termii sends a GET request to verify the webhook URL.
   */
  @Get('webhook')
  @RawResponse()
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
    const verifyToken = process.env.TERMII_WEBHOOK_VERIFY_TOKEN;

    if (verifyToken && mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed');
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
    if (!webhookSecret || !req.rawBody) {
      throw new UnauthorizedException('Webhook verification is unavailable');
    }
    {
      const signature =
        (req.headers['x-termii-signature'] as string | undefined) ??
        (req.headers['x-hub-signature-256'] as string | undefined);
      this.verifyWebhookSignature(
        req.rawBody,
        signature,
        webhookSecret,
        req.headers['x-termii-signature'] ? 'sha512' : 'sha256',
      );
    }

    const churchId = await this.credentials.platformWebhookChurch();
    const result = await this.whatsappService.processWebhook(body, churchId);
    return { success: true, processed: result.processed };
  }

  @Get('webhook/:churchId')
  @RawResponse()
  async verifyChurchWebhook(
    @Param('churchId', ParseUUIDPipe) churchId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    const credentials = await this.credentials.webhookCredentials(churchId);
    if (!credentials.verifyToken || !token || mode !== 'subscribe')
      throw new UnauthorizedException('Invalid verification token');
    const expected = Buffer.from(credentials.verifyToken);
    const received = Buffer.from(token);
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      throw new UnauthorizedException('Invalid verification token');
    return challenge;
  }

  @Post('webhook/:churchId')
  @HttpCode(HttpStatus.OK)
  async processChurchWebhook(
    @Param('churchId', ParseUUIDPipe) churchId: string,
    @Body() body: Record<string, unknown>,
    @Request() req: AuthenticatedRequest & { rawBody?: Buffer },
  ) {
    const credentials = await this.credentials.webhookCredentials(churchId);
    if (!credentials.webhookSecret || !req.rawBody)
      throw new UnauthorizedException('Webhook verification is unavailable');
    this.verifyWebhookSignature(
      req.rawBody,
      req.headers['x-termii-signature'] as string | undefined,
      credentials.webhookSecret,
    );
    const result = await this.whatsappService.processWebhook(body, churchId);
    return { success: true, processed: result.processed };
  }

  /**
   * Verifies the Termii HMAC-SHA512 signature (SHA256 for legacy Meta headers) of an incoming webhook payload.
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * @throws UnauthorizedException if signature is missing or invalid
   */
  private verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha512',
  ): void {
    if (!signature) {
      this.logger.warn('WhatsApp webhook: missing signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedPrefix = `${algorithm}=`;
    const receivedHash = signature.startsWith(expectedPrefix)
      ? signature.slice(expectedPrefix.length)
      : signature;
    const expectedLength = algorithm === 'sha512' ? 128 : 64;
    if (receivedHash.length !== expectedLength || !/^[a-fA-F0-9]+$/.test(receivedHash)) {
      this.logger.warn('WhatsApp webhook: invalid signature format');
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const expectedHash = createHmac(algorithm, secret).update(rawBody).digest('hex');

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
