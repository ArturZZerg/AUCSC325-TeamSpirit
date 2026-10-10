import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { classScheduleSchema, saveClassScheduleSchema, type SaveClassSchedule } from '@campusflow/contracts';
import type { ClassSchedule as ClassRow } from '@prisma/client';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, parseUuid } from './common';
import { PrismaService } from './prisma.service';

const dto = (row: ClassRow) => classScheduleSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

@Controller('classes') @UseGuards(AuthGuard)
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@CurrentUser() user: RequestUser) {
    return (await this.prisma.classSchedule.findMany({ where: { userId: user.id }, orderBy: [{ termStart: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] })).map(dto);
  }
  @Post() async create(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveClassScheduleSchema)) body: SaveClassSchedule) {
    return dto(await this.prisma.classSchedule.create({ data: { ...body, userId: user.id } }));
  }
  @Put(':id') async replace(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(saveClassScheduleSchema)) body: SaveClassSchedule) {
    return this.prisma.$transaction(async tx => {
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
