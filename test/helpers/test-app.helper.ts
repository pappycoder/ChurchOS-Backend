/**
 * @file test-app.helper.ts
 * @description Helper for creating NestJS test applications.
 *
 * Provides a createTestApp() function that builds a NestJS TestingModule
 * with the same global pipes, filters, and interceptors as production,
 * so integration tests run under realistic conditions.
 *
 * @module test/helpers/test-app
 * @since 1.0.0
 */

import { TestingModuleBuilder } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';

/**
 * Configures a TestingModuleBuilder with production-like middleware.
 *
 * @param builder - The TestingModuleBuilder from Test.createTestingModule()
 * @returns A configured INestApplication ready for supertest
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [MembersModule],
 * }).compile();
 *
 * const app = await createTestApp(module);
 * const response = await request(app.getHttpServer()).get('/api/v1/members');
 * expect(response.status).toBe(200);
 * ```
 */
export async function createTestApp(builder: TestingModuleBuilder): Promise<INestApplication> {
  const module = await builder.compile();

  const app = module.createNestApplication();

  // Match production ValidationPipe settings
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Register global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Set global prefix to match production
  app.setGlobalPrefix('api/v1');

  await app.init();

  return app;
}
