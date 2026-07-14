/**
 * @file main.ts
 * @description Application entry point for the ChurchOS Backend API.
 *
 * This file bootstraps the NestJS application with the following configuration:
 * 1. Creates the NestJS application instance from AppModule.
 * 2. Sets a global URL prefix (`/api/v1`) for all routes.
 * 3. Configures a global ValidationPipe for incoming request validation.
 * 4. Enables CORS for the ChurchOS web frontend.
 * 5. Sets up Swagger/OpenAPI documentation at `/api/v1/docs`.
 * 6. Starts the HTTP server on the configured port.
 *
 * @module main
 * @since 1.0.0
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstraps and starts the NestJS application.
 *
 * Steps performed:
 * - Creates the application from the root AppModule.
 * - Configures global route prefix `/api/v1`.
 * - Enables automatic DTO validation via ValidationPipe.
 * - Enables CORS for cross-origin requests from the web frontend.
 * - Generates and serves Swagger/OpenAPI documentation.
 * - Starts listening on the configured PORT (default: 3000).
 *
 * @returns {Promise<void>}
 */
async function bootstrap(): Promise<void> {
  // Step 1: Create the NestJS application instance.
  // NestFactory.create() initializes the IoC container, resolves all modules,
  // and creates the underlying HTTP adapter (Express by default).
  const app = await NestFactory.create(AppModule);

  // Step 2: Set a global prefix for all routes.
  // Every controller route will be prefixed with `/api/v1`.
  // Example: @Get('members') on MembersController → GET /api/v1/members
  app.setGlobalPrefix('api/v1');

  // Step 3: Configure global ValidationPipe.
  // This pipe automatically validates incoming request bodies, query params,
  // and path params against class-validator decorators on DTO classes.
  // - whitelist: true → strips properties not defined in the DTO
  // - forbidNonWhitelisted: true → throws 400 if unknown properties are sent
  // - transform: true → automatically transforms payloads to DTO class instances
  // - enableImplicitConversion: true → converts query strings to their types (e.g., ?page=1 → number)
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

  // Step 4: Enable CORS (Cross-Origin Resource Sharing).
  // Allows the ChurchOS web frontend (Next.js) running on a different port/origin
  // to make API requests to this backend. Credentials are enabled to support
  // cookie-based authentication if needed.
  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Step 5: Configure Swagger/OpenAPI documentation.
  // The DocumentBuilder creates a configuration object that defines the API
  // metadata: title, description, version, authentication scheme (Bearer JWT),
  // and endpoint tags for grouping related controllers.
  const config = new DocumentBuilder()
    .setTitle('ChurchOS API')
    .setDescription('Church Management & Digital Ministry Platform API')
    .setVersion('1.0')
    .addBearerAuth() // Adds a "Bearer" token input in Swagger UI for JWT auth
    .addTag('auth', 'Authentication & authorization')
    .addTag('members', 'Member management')
    .addTag('attendance', 'Service attendance tracking')
    .addTag('giving', 'Giving & transactions')
    .addTag('events', 'Event management')
    .addTag('whatsapp', 'WhatsApp integration')
    .addTag('media', 'Media & sermons')
    .addTag('pastoral', 'Pastoral care')
    .addTag('admin', 'Administration')
    .build();

  // Step 6: Generate the Swagger document and serve it.
  // SwaggerModule.createDocument() scans all controllers and their decorators
  // (@ApiProperty, @ApiOperation, etc.) to build the OpenAPI 3.0 spec.
  // SwaggerModule.setup() serves the Swagger UI at the specified path.
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // Step 7: Start the HTTP server.
  // The PORT is read from environment variables (default: 3000).
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/v1/docs`);
}

// Execute the bootstrap function.
// This is the entry point called by Node.js when the application starts.
bootstrap();
