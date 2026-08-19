import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiQuery, getSchemaPath } from '@nestjs/swagger';

/**
 * Decorator for paginated response documentation.
 * Wraps the item type in a standard paginated response format.
 *
 * @param itemClass - The DTO class for individual items
 * @returns Decorator combining ApiOkResponse and ApiQuery for pagination
 *
 * @example
 * ```typescript
 * @ApiPaginatedResponse(MemberDto)
 * @Get('members')
 * async findAll(@Query() query: PaginationDto) { ... }
 * ```
 */
export function ApiPaginatedResponse<T extends Type<unknown>>(itemClass: T) {
  return applyDecorators(
    ApiExtraModels(itemClass),
    ApiOkResponse({
      description: 'Paginated list of items',
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(itemClass) },
              },
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'number', example: 100 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 20 },
                  totalPages: { type: 'number', example: 5 },
                },
              },
            },
          },
        ],
      },
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Page number (default: 1)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Items per page (default: 20)',
    }),
  );
}
