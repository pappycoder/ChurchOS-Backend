/**
 * @file request-context.service.ts
 * @description AsyncLocalStorage-based service for per-request tenant context.
 *
 * Stores { userId, churchId, branchId, role } in Node.js AsyncLocalStorage
 * so any service in the call stack can retrieve the current request context
 * without explicit parameter passing.
 *
 * @module common/services/request-context
 * @since 1.0.0
 */

import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  userId: string;
  churchId: string;
  branchId?: string;
  role: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

@Injectable()
export class RequestContextService {
  /**
   * Runs a callback within a request context.
   *
   * @param context - The tenant context to attach to the current async scope
   * @param callback - The function to execute within the context
   * @returns The return value of the callback
   *
   * @example
   * ```typescript
   * await this.requestContext.run(
   *   { userId, churchId, role: 'church_admin' },
   *   () => this.membersService.findAll(),
   * );
   * ```
   */
  run<T>(context: RequestContextData, callback: () => T | Promise<T>): Promise<T> | T {
    return asyncLocalStorage.run(context, callback);
  }

  /**
   * Retrieves the current request context from async storage.
   *
   * @returns The current context, or undefined if called outside a request
   *
   * @example
   * ```typescript
   * const ctx = this.requestContext.getStore();
   * if (ctx) {
   *   console.log(ctx.churchId); // Scoped to current request
   * }
   * ```
   */
  getStore(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  }

  /**
   * Retrieves the current churchId from the request context.
   * Throws if no context is available.
   */
  getChurchId(): string {
    const ctx = this.getStore();
    if (!ctx) {
      throw new Error('RequestContext not available — ensure middleware is registered');
    }
    return ctx.churchId;
  }

  /**
   * Retrieves the current userId from the request context.
   * Throws if no context is available.
   */
  getUserId(): string {
    const ctx = this.getStore();
    if (!ctx) {
      throw new Error('RequestContext not available — ensure middleware is registered');
    }
    return ctx.userId;
  }
}
