import 'dotenv/config';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  process.env.ENABLE_QUEUE_WORKERS = 'true';
  // Load module metadata after opting into persistent processors.
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}
void bootstrap();
