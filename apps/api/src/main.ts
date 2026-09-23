import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
