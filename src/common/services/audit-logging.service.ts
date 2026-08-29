/**
 * @file audit-logging.service.ts
 * @description Service for recording audit logs of data mutations.
 *
 * Records create, update, and delete operations against the audit_logs table
 * for compliance, debugging, and security review.
 *
 * Each audit entry captures:
 * - Who (user_id, church_id)
 * - What (entity, action, entity_id)
 * - Before/after state (old_values / new_values)
 * - IP address and user agent
 *
 * @module common/services/audit-logging.service
 * @since 1.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditAction =
  'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'ARCHIVE' | 'RESTORE';

export interface AuditLogParams {
  userId: string;
  churchId: string;
  entity: string;
  action: AuditAction;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Service for recording audit trail entries.
 *
 * All mutations to sensitive data (members, transactions, giving, etc.)
 * should be logged through this service for compliance and security.
 *
 * @example
 * ```typescript
 * await this.audit.log({
 *   userId,
 *   churchId,
 *   entity: 'member',
 *   action: 'CREATE',
 *   entityId: member.id,
 *   newValues: member,
 * });
 * ```
 */
@Injectable()
export class AuditLoggingService {
  private readonly logger = new Logger(AuditLoggingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit log entry.
   *
   * @param params - Audit log data
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          church_id: params.churchId,
          user_id: params.userId,
          entity: params.entity,
          action: params.action,
          entity_id: params.entityId,
          old_values: params.oldValues as Prisma.InputJsonValue | undefined,
          new_values: params.newValues as Prisma.InputJsonValue | undefined,
          ip_address: params.ipAddress,
          user_agent: params.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${params.action} on ${params.entity}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Queries audit logs for a church with optional filters.
   */
  async query(
    churchId: string,
    filters?: {
      entity?: string;
      action?: AuditAction;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = { church_id: churchId };

    if (filters?.entity) where.entity = filters.entity;
    if (filters?.action) where.action = filters.action;
    if (filters?.userId) where.user_id = filters.userId;

    if (filters?.startDate || filters?.endDate) {
      where.created_at = {
        ...(filters.startDate && { gte: filters.startDate }),
        ...(filters.endDate && { lte: filters.endDate }),
      };
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: filters?.limit || 100,
      skip: filters?.offset || 0,
    });
  }
}
