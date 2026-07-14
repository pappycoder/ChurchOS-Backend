/**
 * @file .config/prisma.config.ts
 * @description Prisma ORM configuration for CLI commands (migrations, generate, studio).
 *
 * Prisma 7 requires the database connection URL to be configured here instead of
 * in the `url` field of the `datasource` block in `schema.prisma`.
 *
 * This file is loaded automatically by all Prisma CLI commands.
 * It reads DATABASE_URL from the `.env` file via dotenv.
 *
 * Note: Paths are resolved relative to this file's location (`.config/`),
 * so they use `../prisma/` to reach the project-root prisma directory.
 *
 * @module prisma.config
 * @since 1.0.0
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Path to the Prisma schema file (relative to this config file).
  schema: '../prisma/schema.prisma',

  // Migration configuration.
  migrations: {
    // Directory where migration files are stored (relative to this config file).
    path: '../prisma/migrations',
  },

  // Database connection configuration.
  // Reads DATABASE_URL from the .env file (loaded by dotenv above).
  datasource: {
    url: env('DATABASE_URL'),
  },
});
