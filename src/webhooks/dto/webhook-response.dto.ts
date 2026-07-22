/**
 * @file webhook-response.dto.ts
 * @description Response DTOs for webhook endpoints.
 *
 * @module webhooks/dto/webhook-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookSubscriptionResponseDto {
  @ApiProperty({ description: 'Subscription ID' })
  id!: string;

  @ApiProperty({ description: 'Webhook URL', example: 'https://example.com/webhooks' })
  url!: string;

  @ApiProperty({ description: 'Subscribed events', type: [String] })
  events!: string[];

  @ApiProperty({ description: 'Whether the subscription is active' })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty({ description: 'Delivery ID' })
  id!: string;

  @ApiProperty({ description: 'Event type delivered', example: 'member.created' })
  event!: string;

  @ApiProperty({ description: 'Delivery status', enum: ['pending', 'success', 'failed'] })
  status!: string;

  @ApiPropertyOptional({ description: 'HTTP response status code', example: 200 })
  responseStatus?: number;

  @ApiPropertyOptional({ description: 'Number of delivery attempts', example: 3 })
  attempts?: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;
}
