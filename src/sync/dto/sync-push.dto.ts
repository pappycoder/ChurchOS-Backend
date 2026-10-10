/**
 * @file sync-push.dto.ts
 * @description DTO for offline sync push requests.
 *
 * @module sync/dto/sync-push.dto
 * @since 1.0.0
 */

import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsOptional,
  IsUUID,
  IsIn,
  IsObject,
  IsISO8601,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncChangeDto {
  @ApiPropertyOptional({
    description: 'Stable operation UUID, reused only when retrying that operation',
  })
  @IsOptional()
  @IsUUID()
  mutationId?: string;

  @ApiProperty({
    description: 'Entity type (e.g., member, attendance, transaction)',
    example: 'member',
  })
  @IsString()
  @IsNotEmpty()
  entity!: string;

  @ApiProperty({
    description: 'Entity ID (client-generated UUID)',
    example: '44444444-4444-4444-4444-444444444444',
  })
  @IsUUID()
  entityId!: string;

  @ApiProperty({
    description: 'Action type',
    enum: ['create', 'update', 'delete'],
    example: 'create',
  })
  @IsIn(['create', 'update', 'delete'])
  action!: string;

  @ApiProperty({
    description: 'Entity data payload',
    example: { firstName: 'John', lastName: 'Doe', phone: '+2348012345678' },
  })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Client timestamp for conflict resolution',
    example: '2026-07-22T10:00:00.000Z',
  })
  @IsISO8601()
  @IsOptional()
  clientTimestamp?: string;
}

export class SyncPushDto {
  @ApiProperty({
    description: 'Array of offline changes to sync',
    type: [SyncChangeDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  @IsNotEmpty()
  changes!: SyncChangeDto[];
}
