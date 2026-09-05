/**
 * @file response.interceptor.ts
 * @description NestJS interceptor that wraps all responses in a standard format.
 *
 * Transforms successful responses into:
 * { success: true, data: <payload>, meta: { timestamp, path } }
 *
 * Paginated responses include additional meta:
 * { success: true, data: [...], meta: { timestamp, path, total, page, limit, totalPages } }
 *
 * @module common/interceptors/response.interceptor
 * @since 1.0.0
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Standard API response wrapper.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    path: string;
    requestId?: string;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

/**
 * Paginated data structure returned by list endpoints.
 */
interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Interceptor that wraps all successful responses in a standard format.
 *
 * @example
 * // Before interceptor:
 * // GET /api/v1/members → [{ id: 1, name: "John" }, ...]
 *
 * // After interceptor:
 * // GET /api/v1/members → {
 * //   success: true,
 * //   data: [{ id: 1, name: "John" }, ...],
 * //   meta: { timestamp: "2026-07-15T10:00:00Z", path: "/api/v1/members" }
 * // }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.url;
    const requestId = (request as unknown as Record<string, unknown>)['requestId'] as
      string | undefined;

    return next.handle().pipe(
      map((data) => {
        // If data is null/undefined, return empty response
        if (data === null || data === undefined) {
          return {
            success: true,
            data: null,
            meta: {
              timestamp: new Date().toISOString(),
              path,
              requestId,
            },
          };
        }

        // Check if data is a paginated response
        if (this.isPaginated(data)) {
          return {
            success: true,
            data: data.items,
            meta: {
              timestamp: new Date().toISOString(),
              path,
              requestId,
              total: data.total,
              page: data.page,
              limit: data.limit,
              totalPages: data.totalPages,
            },
          };
        }

        // Standard non-paginated response
        return {
          success: true,
          data,
          meta: {
            timestamp: new Date().toISOString(),
            path,
            requestId,
          },
        };
      }),
    );
  }

  /**
   * Checks if the data object has a paginated structure.
   */
  private isPaginated(data: unknown): data is PaginatedData<unknown> {
    return (
      typeof data === 'object' &&
      data !== null &&
      'items' in data &&
      'total' in data &&
      'page' in data &&
      'limit' in data &&
      'totalPages' in data
    );
  }
}
