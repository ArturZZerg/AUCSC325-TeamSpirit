import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit(): Promise<void> { await this.$connect(); }
  // Nest drains module workers before the application-shutdown phase.
  async onApplicationShutdown(): Promise<void> { await this.$disconnect(); }
}
