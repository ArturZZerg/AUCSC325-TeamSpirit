import { Controller, Get, Header, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { runtimeConfig } from './runtime-config';
import { requiredSchema } from './schema-manifest';

interface Column { table_name: string; column_name: string; udt_name: string; is_nullable: string }
interface Migration { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }
export function schemaIsReady(columns: Column[], migrations: Migration[]): boolean {
  const available = new Map(columns.map(column => [`${column.table_name}.${column.column_name}`, column]));
  if (requiredSchema.tables.some(table => table.columns.some(([name, type, nullable]) => {
    const column = available.get(`${table.name}.${name}`);
    return !column || column.udt_name !== type || column.is_nullable !== nullable;
  }))) return false;
  const applied = migrations.filter(migration => !migration.rolled_back_at);
  if (applied.some(migration => !migration.finished_at)) return false;
  return requiredSchema.migrations.every(required => applied.some(migration => migration.migration_name === required.name &&
    required.checksums.some(checksum => checksum === migration.checksum)));
}

@Injectable()
export class HealthService {
  private pending?: Promise<boolean>;
  constructor(private readonly prisma: PrismaService) {}
  ready(): Promise<boolean> {
    if (this.pending) return this.pending;
    const schema = runtimeConfig().schema;
    // Keep one probe pending even if its driver outlives the response timeout.
    const work = this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
      const columns = await tx.$queryRaw<Column[]>`SELECT table_name, column_name, udt_name, is_nullable
        FROM information_schema.columns WHERE table_schema = ${schema}`;
      const migrations = await tx.$queryRaw<Migration[]>(Prisma.sql`SELECT migration_name, checksum, finished_at, rolled_back_at
        FROM ${Prisma.raw(`"${schema}"."_prisma_migrations"`)}`);
      return schemaIsReady(columns, migrations);
    }, { maxWait: 1000, timeout: 1500, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }).catch(() => false);
    let timer: ReturnType<typeof setTimeout>;
    const bounded = Promise.race([work, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
    this.pending = bounded;
    void work.finally(() => { clearTimeout(timer); this.pending = undefined; });
    return bounded;
  }
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get('live') @Header('Cache-Control', 'no-store') live() { return { status: 'alive' }; }
  @Get('ready') @Header('Cache-Control', 'no-store') async ready() {
    if (!await this.health.ready()) throw new ServiceUnavailableException('Service unavailable');
    return { status: 'ready' };
  }
}
