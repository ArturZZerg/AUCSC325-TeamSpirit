import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, PayloadTooLargeException, Post, Put, Req,
  UnprocessableEntityException, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { classImportMaxBytes, classImportPreviewSchema, classScheduleSchema, saveClassScheduleSchema, type SaveClassSchedule } from '@campusflow/contracts';
import { addCalendarDays, localDateAt } from '@campusflow/domain';
import type { ClassSchedule as ClassRow, Prisma } from '@prisma/client';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, parseUuid } from './common';
import { PrismaService } from './prisma.service';
import { IcsEventProvider } from './integrations/events/ics-event-provider';
import { detectClassPatterns } from './integrations/timetable/timetable-import';

/** Reads a raw text/calendar body; JSON parsing never sees it. */
async function calendarBody(request: IncomingMessage) {
  if (!/^text\/calendar(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new UnsupportedMediaTypeException('Upload a calendar (.ics) file.');
  // Read an oversized body to the end, discarding it, so the client receives the 413 rather than a reset.
  // Beyond the hard ceiling the connection is cut instead (Nginx rejects these before they arrive).
  const tooLarge = () => new PayloadTooLargeException('Calendar files can be up to 1 MB.');
  const ceiling = 4 * classImportMaxBytes;
  if (Number(request.headers['content-length'] ?? 0) > ceiling) { request.destroy(); throw tooLarge(); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > ceiling) { request.destroy(); throw tooLarge(); }
    if (size <= classImportMaxBytes) chunks.push(chunk);
  }
  if (size > classImportMaxBytes) throw tooLarge();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new BadRequestException('This file is not a readable text calendar.'); }
}

// Hold the course row so a concurrent delete cannot break the reference mid-save.
async function ownedCourse(tx: Prisma.TransactionClient, userId: string, courseId: string | null | undefined) {
  if (!courseId) return;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Course" WHERE "id" = ${courseId}::uuid AND "userId" = ${userId}::uuid FOR KEY SHARE`;
  if (!rows.length) throw new NotFoundException('Course not found');
}
const dto = (row: ClassRow) => classScheduleSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

@Controller('classes') @UseGuards(AuthGuard)
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@CurrentUser() user: RequestUser) {
    return (await this.prisma.classSchedule.findMany({ where: { userId: user.id }, orderBy: [{ termStart: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] })).map(dto);
  }
  @Post() async create(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveClassScheduleSchema)) body: SaveClassSchedule) {
    return this.prisma.$transaction(async tx => {
      await ownedCourse(tx, user.id, body.courseId);
      return dto(await tx.classSchedule.create({ data: { ...body, userId: user.id } }));
    });
  }
  /** Detects weekly classes in an uploaded calendar. Reads the file and saved classes only; saving is POST /classes. */
  @Post('import-preview') @HttpCode(200) async importPreview(@CurrentUser() user: RequestUser, @Req() request: IncomingMessage) {
    const calendar = await calendarBody(request);
    const today = localDateAt(new Date().toISOString(), user.timeZone);
    const batch = await new IcsEventProvider(async () => calendar, { timeZone: user.timeZone, partial: true })
      .fetchEvents({ from: addCalendarDays(today, -150), through: addCalendarDays(today, 210), timeZone: user.timeZone });
    if (batch.status === 'failed' || !batch.events.length && batch.issues.length)
      throw new UnprocessableEntityException('CampusFlow couldn’t read classes from this file. Export the calendar again as .ics and retry.');
    const saved = await this.prisma.classSchedule.findMany({ where: { userId: user.id }, select: { id: true, title: true, startTime: true, weekdays: true } });
    return classImportPreviewSchema.parse(detectClassPatterns(batch.events, { timeZone: user.timeZone, today, saved, unsupported: batch.issues.length }));
  }
  @Put(':id') async replace(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(saveClassScheduleSchema)) body: SaveClassSchedule) {
    return this.prisma.$transaction(async tx => {
      await ownedCourse(tx, user.id, body.courseId);
      const result = await tx.classSchedule.updateMany({ where: { id, userId: user.id }, data: body });
      if (!result.count) throw new NotFoundException('Class not found');
      return dto(await tx.classSchedule.findFirstOrThrow({ where: { id, userId: user.id } }));
    });
  }
  @Delete(':id') async remove(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    const result = await this.prisma.classSchedule.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) throw new NotFoundException('Class not found');
    return { deleted: true };
  }
}
