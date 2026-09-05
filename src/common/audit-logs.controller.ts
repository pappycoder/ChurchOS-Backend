/**
 * @file audit-logs.controller.ts
 * @description HTTP endpoint exposing the current user's own recent audit entries.
 *
 * Unlike most resources, audit logs carry the acting user's **Supabase** id
 * (`AuditLog.user_id`, the JWT `sub`), so the endpoint scopes by `req.user.sub`
 * rather than the Prisma profile `id`.
 *
 * @module common/audit-logs.controller
 * @since 1.0.0
 */

import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiListEndpoint } from './decorators/api-standard-responses.decorator';
import { AuditLoggingService } from './services/audit-logging.service';
import { AuditLogItemDto, AuditLogListResponseDto } from './dto/audit-log-response.dto';
import type { AuthenticatedRequest } from './decorators/current-user.decorator';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

interface RawAuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  ip_address?: string | null;
  created_at: Date | string;
  new_values?: Record<string, unknown> | null;
}

/**
 * Pulls a friendly record name out of the new-values snapshot (mirrors the
 * naming heuristic in AuditLoggingService so the dashboard can label rows).
 */
function resolveEntityLabel(
  entity: string,
  newValues?: Record<string, unknown> | null,
): string | undefined {
  if (!newValues) return undefined;
  const candidates =
    entity === 'member'
      ? ['firstName', 'first_name', 'fullName', 'name']
      : ['name', 'fullName', 'title', 'firstName', 'first_name', 'label'];
  for (const key of candidates) {
    const value = newValues[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

@ApiTags('Audit')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditLogsController {
  constructor(private readonly auditLoggingService: AuditLoggingService) {}

  /**
   * List the current user's own recent audit entries (newest first).
   */
  @Get()
  @ApiListEndpoint(
    'List my audit logs',
    'Returns the most recent audit entries for the authenticated user, newest first.',
  )
  @ApiOperation({
    summary: 'List my audit logs',
    description:
      'Returns the current user’s own recent audit entries (create/update/delete/login, etc.), newest first, scoped to their church.',
  })
  async listMyLogs(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ): Promise<AuditLogListResponseDto> {
    const churchId = req.profile?.church_id ?? '';
    const userId = req.user?.sub ?? '';

    let take = DEFAULT_LIMIT;
    if (limit) {
      const parsed = Number.parseInt(limit, 10);
      if (Number.isFinite(parsed)) take = Math.min(Math.max(parsed, 1), MAX_LIMIT);
    }

    const rows = (await this.auditLoggingService.query(churchId, {
      userId,
      limit: take,
    })) as RawAuditLog[];

    const data: AuditLogItemDto[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      entityLabel: resolveEntityLabel(row.entity, row.new_values),
    }));

    return { data, total: data.length };
  }
}
