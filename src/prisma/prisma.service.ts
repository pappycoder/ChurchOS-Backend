/**
 * @file prisma.service.ts
 * @description Prisma database client service for the ChurchOS Backend.
 *
 * This service extends PrismaClient and integrates with the NestJS dependency
 * injection system. It manages the database connection lifecycle by connecting
 * when the application module initializes and disconnecting when the module
 * is destroyed.
 *
 * PrismaService is registered as a global provider in PrismaModule, so it can
 * be injected into any service across the application via constructor injection.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MembersService {
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   async findAll(churchId: string) {
 *     return this.prisma.member.findMany({ where: { church_id: churchId } });
 *   }
 * }
 * ```
 *
 * @module prisma/prisma.service
 * @since 1.0.0
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

/**
 * PrismaService provides database access through Prisma ORM.
 *
 * Extends PrismaClient to inherit all model query methods (findMany, create,
 * update, delete, etc.) and implements NestJS lifecycle hooks for connection
 * management.
 *
 * Uses the @prisma/adapter-pg driver adapter for PostgreSQL connections
 * as required by Prisma 7's "client" engine type.
 *
 * Connection pooling is configured via environment variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DB_POOL_MAX: Maximum connections in pool (default: 10)
 * - DB_IDLE_TIMEOUT_MS: Idle connection timeout in ms (default: 10000)
 * - DB_CONNECT_TIMEOUT_MS: Connection timeout in ms (default: 0 = no timeout)
 *
 * @extends PrismaClient
 * @implements OnModuleInit
 * @implements OnModuleDestroy
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const poolConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? '10000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? '0', 10),
    };

    const adapter = new PrismaPg(poolConfig);
    super({ adapter });

    this.logger.log(
      `Connection pool configured: max=${poolConfig.max}, idleTimeout=${poolConfig.idleTimeoutMillis}ms, connectTimeout=${poolConfig.connectionTimeoutMillis}ms`,
    );
  }

  /**
   * Called automatically when the application module is initialized.
   * Establishes the database connection pool.
   *
   * @returns {Promise<void>}
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Called automatically when the application module is destroyed.
   * Gracefully closes the database connection pool.
   *
   * @returns {Promise<void>}
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
