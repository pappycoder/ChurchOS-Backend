/**
 * @file webhooks.controller.ts
 * @description HTTP endpoints for webhook subscription management.
 *
 * @module webhooks/webhooks.controller
 * @since 1.0.0
 */

import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import {
  WebhookSubscriptionResponseDto,
  WebhookDeliveryResponseDto,
} from './dto/webhook-response.dto';

@ApiTags('Webhooks')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Create a webhook subscription.
   */
  @Post()
  @RequireRoles('church_admin')
  @ApiOperation({ summary: 'Create webhook', description: 'Subscribe to outbound webhook events.' })
  async create(
    @Body() dto: CreateWebhookSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookSubscriptionResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.webhooksService.createSubscription(dto, churchId, req.user?.sub || '');
  }

  /**
   * List all webhook subscriptions.
   */
  @Get()
  @RequireRoles('church_admin')
  @ApiOperation({
    summary: 'List webhooks',
    description: 'List all webhook subscriptions for the church.',
  })
  async list(@Req() req: AuthenticatedRequest): Promise<WebhookSubscriptionResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.webhooksService.listSubscriptions(churchId);
  }

  /**
   * Deactivate a webhook subscription.
   */
  @Delete(':webhookId')
  @RequireRoles('church_admin')
  @ApiOperation({
    summary: 'Deactivate webhook',
    description: 'Deactivate a webhook subscription.',
  })
  async deactivate(
    @Param('webhookId') webhookId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deactivated: boolean }> {
    const churchId = req.profile?.church_id || '';
    return this.webhooksService.deactivateSubscription(webhookId, churchId, req.user?.sub || '');
  }

  /**
   * List delivery history for a subscription.
   */
  @Get(':webhookId/deliveries')
  @RequireRoles('church_admin')
  @ApiOperation({
    summary: 'Delivery history',
    description: 'View delivery attempts for a webhook.',
  })
  async listDeliveries(
    @Param('webhookId') webhookId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WebhookDeliveryResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.webhooksService.listDeliveries(webhookId, churchId);
  }

  /**
   * Fire a test delivery.
   */
  @Post(':webhookId/test')
  @RequireRoles('church_admin')
  @ApiOperation({ summary: 'Test webhook', description: 'Send a test ping to the webhook URL.' })
  async testDelivery(
    @Param('webhookId') webhookId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deliveryId: string }> {
    const churchId = req.profile?.church_id || '';
    return this.webhooksService.testDelivery(webhookId, churchId);
  }
}
