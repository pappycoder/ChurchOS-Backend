/**
 * @file audit-log-response.dto.ts
 * @description DTOs for the audit-log endpoints.
 *
 * Exposes a whitelisted, read-only view of a user's own recent audit rows.
 * Only a small set of fields is emitted — the full `newValues`/`oldValues`
 * snapshots are intentionally omitted except for a resolved entity name so the
 * dashboard can render a friendly "Created Member" style line.
 *
 * @module common/dto/audit-log-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogItemDto {
  @ApiProperty({
    description: 'Audit log entry ID (UUID)',
    example: '3f0f0f0f-0000-0000-0000-000000000000',
  })
  id!: string;

  @ApiProperty({
    description: 'Action performed',
    enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'ARCHIVE', 'RESTORE'],
    example: 'CREATE',
  })
  action!: string;

  @ApiProperty({ description: 'Affected entity (snake_case)', example: 'member' })
  entity!: string;

  @ApiPropertyOptional({
    description: 'Affected entity record ID',
    example: '44444444-4444-4444-4444-444444444444',
  })
  entityId?: string;

  @ApiPropertyOptional({ description: 'Request IP address', example: '102.89.33.10' })
  ipAddress?: string;

  @ApiProperty({ description: 'Timestamp of the action', example: '2026-08-30T08:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({
    description: 'A human-friendly name resolved from the new-values snapshot, if any',
    example: 'John Doe',
  })
  entityLabel?: string;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemDto], description: 'The current user’s recent audit entries' })
  data!: AuditLogItemDto[];

  @ApiProperty({ description: 'Total matching audit entries for this user', example: 42 })
  total!: number;
}
