/**
 * @file doc.module.ts
 * @description Module that serves the comprehensive API documentation page.
 *
 * Provides a single endpoint at GET /api/v1/doc that dynamically discovers
 * all registered routes in the NestJS application and renders them in a
 * beautiful, self-contained HTML documentation page.
 *
 * @module doc/doc.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { DocController } from './doc.controller';

@Module({
  controllers: [DocController],
})
export class DocModule {}
