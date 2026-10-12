import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, Param, Post, Put, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma, type WellnessEntry } from '@prisma/client';
import { z } from 'zod';
import { createWellnessEntrySchema, dateSchema, deleteWellnessJournalSchema, saveWellnessJournalSchema,
  wellnessEntrySchema, wellnessJournalEntrySchema, wellnessJournalQuerySchema, wellnessJournalSchema } from '@campusflow/contracts';
import { localDateAt } from '@campusflow/domain';
import { AuthGuard, CurrentUser, type RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';

const dto = (row: WellnessEntry) => wellnessEntrySchema.parse({ ...row, createdAt: toIso(row.createdAt) });
const journalDto = (row: WellnessEntry) => wellnessJournalEntrySchema.parse({ ...dto(row), revision: row.revision });
const conflict = () => new ConflictException('This check-in changed. Refresh and review the saved entry before editing again.');
@Controller('wellness') @UseGuards(AuthGuard)
export class WellnessController {
  constructor(private readonly prisma: PrismaService) {}
  private async owner(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR KEY SHARE`;
    if (!rows.length) throw new UnauthorizedException('Account is unavailable.');
  }
  private date(user: RequestUser, date: string) {
    if (date > localDateAt(new Date().toISOString(), user.timeZone)) throw new BadRequestException('Choose today or an earlier date.');
  }
  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(operation, { timeout: 5000, maxWait: 5000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict(); throw error; }
  }
  @Get() @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: RequestUser) {
    return (await this.prisma.wellnessEntry.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' } })).map(dto);
  }
  @Post() @Header('Cache-Control', 'private, no-store')
  async create(@CurrentUser() user: RequestUser, @Body(new ZodPipe(createWellnessEntrySchema)) body: z.infer<typeof createWellnessEntrySchema>) {
    this.date(user, body.date);
    try { return dto(await this.write(async tx => { await this.owner(tx, user.id);
      return tx.wellnessEntry.create({ data: { userId: user.id, ...body } }); })); }
    catch (error) { if (error instanceof ConflictException) throw new ConflictException('A check-in is already saved for this day. Update CampusFlow and use the journal to edit it safely.'); throw error; }
  }
  @Get('journal') @Header('Cache-Control', 'private, no-store')
  async journal(@CurrentUser() user: RequestUser, @Query(new ZodPipe(wellnessJournalQuerySchema)) range: z.infer<typeof wellnessJournalQuerySchema>) {
    const entries = await this.prisma.wellnessEntry.findMany({ where: { userId: user.id, date: { gte: range.from, lte: range.through } }, orderBy: { date: 'desc' } });
    return wellnessJournalSchema.parse({ accountId: user.id, timeZone: user.timeZone, ...range,
      capturedAt: new Date().toISOString(), entries: entries.map(journalDto) });
  }
  @Put('journal/:date') @Header('Cache-Control', 'private, no-store')
  async save(@CurrentUser() user: RequestUser, @Param('date', new ZodPipe(dateSchema)) date: string,
    @Body(new ZodPipe(saveWellnessJournalSchema)) body: z.infer<typeof saveWellnessJournalSchema>) {
    this.date(user, date);
    const { expected, ...fields } = body;
    return journalDto(await this.write(async tx => {
      await this.owner(tx, user.id);
      if (expected === null) return tx.wellnessEntry.create({ data: { userId: user.id, date, ...fields } });
      if (expected.revision === 2147483647) throw conflict();
      const result = await tx.wellnessEntry.updateMany({ where: { userId: user.id, date, ...expected }, data: { ...fields, revision: { increment: 1 } } });
      if (!result.count) throw conflict();
      return tx.wellnessEntry.findUniqueOrThrow({ where: { id: expected.id } });
    }));
  }
  @Delete('journal/:date') @Header('Cache-Control', 'private, no-store')
  async remove(@CurrentUser() user: RequestUser, @Param('date', new ZodPipe(dateSchema)) date: string,
    @Body(new ZodPipe(deleteWellnessJournalSchema)) body: z.infer<typeof deleteWellnessJournalSchema>) {
    await this.write(async tx => { await this.owner(tx, user.id);
      const result = await tx.wellnessEntry.deleteMany({ where: { userId: user.id, date, ...body.expected } });
      if (!result.count) throw conflict();
    });
    return { deleted: true };
  }
}
