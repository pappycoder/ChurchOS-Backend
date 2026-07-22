/**
 * @file sync-push.dto.ts
 * @description DTO for offline sync push requests.
 *
 * @module sync/dto/sync-push.dto
 * @since 1.0.0
 */

import { IsArray, IsNotEmpty, IsString, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncChangeDto {
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
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({
    description: 'Action type',
    enum: ['create', 'update', 'delete'],
    example: 'create',
  })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiProperty({
    description: 'Entity data payload',
    example: { firstName: 'John', lastName: 'Doe', phone: '+2348012345678' },
  })
  @IsNotEmpty()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Client timestamp for conflict resolution',
    example: '2026-07-22T10:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  clientTimestamp?: string;
}

export class SyncPushDto {
  @ApiProperty({
    description: 'Array of offline changes to sync',
    type: [SyncChangeDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  @IsNotEmpty()
  changes!: SyncChangeDto[];
}
