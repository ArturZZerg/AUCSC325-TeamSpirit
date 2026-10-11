import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runtimeConfig } from './runtime-config';

async function bootstrap(): Promise<void> {
  const config = runtimeConfig();
  const app = await NestFactory.create(AppModule, { logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}
void bootstrap();
