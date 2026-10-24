import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { GymEnrollment as EnrollmentRow, Prisma, Workout as WorkoutRow } from '@prisma/client';
import { gymEnrollmentSchema, gymOverviewSchema, gymRecentDays, gymRecentLimit, saveGymEnrollmentSchema, saveWorkoutSchema, workoutSchema,
  type SaveGymEnrollment, type SaveWorkout } from '@campusflow/contracts';
import { findGymExercise, findGymProgram, findProgramDay } from '@campusflow/domain';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, lockAccountRecords, parseUuid } from './common';
import { PrismaService } from './prisma.service';

const enrollmentDto = (row: EnrollmentRow) => gymEnrollmentSchema.parse({ programId: row.programId, unit: row.unit, weeklyTarget: row.weeklyTarget,
  startedAt: row.startedAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const workoutDto = (row: WorkoutRow) => workoutSchema.parse({ id: row.id, programId: row.programId, dayId: row.dayId, title: row.title,
  startedAt: row.startedAt.toISOString(), endedAt: row.endedAt.toISOString(), unit: row.unit, exercises: row.exercises,
  note: row.note, createdAt: row.createdAt.toISOString() });

/** Recorded strength training (ADR 020). The program catalog is static domain content; the API owns enrollment and history. */
@Controller('gym') @UseGuards(AuthGuard)
export class GymController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  async overview(@CurrentUser() user: RequestUser) {
    const since = new Date(Date.now() - gymRecentDays * 86400_000);
    const [enrollment, workouts] = await Promise.all([
      this.prisma.gymEnrollment.findUnique({ where: { userId: user.id } }),
      this.prisma.workout.findMany({ where: { userId: user.id, endedAt: { gte: since } }, orderBy: [{ endedAt: 'desc' }, { id: 'asc' }], take: gymRecentLimit }),
    ]);
    return gymOverviewSchema.parse({ accountId: user.id, timeZone: user.timeZone, capturedAt: new Date().toISOString(),
      enrollment: enrollment ? enrollmentDto(enrollment) : null, workouts: workouts.map(workoutDto) });
  }
  @Put('enrollment') @Header('Cache-Control', 'private, no-store')
  async enroll(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveGymEnrollmentSchema)) body: SaveGymEnrollment) {
    if (!findGymProgram(body.programId)) throw new BadRequestException('Choose a program from the list.');
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      const current = await tx.gymEnrollment.findUnique({ where: { userId: user.id } });
      // Switching programs restarts the program clock; changing units or the weekly target does not.
      const startedAt = current && current.programId === body.programId ? current.startedAt : new Date();
      return enrollmentDto(await tx.gymEnrollment.upsert({ where: { userId: user.id }, create: { userId: user.id, ...body }, update: { ...body, startedAt } }));
    });
  }
  @Delete('enrollment') @Header('Cache-Control', 'private, no-store')
  async leave(@CurrentUser() user: RequestUser) {
    await this.prisma.gymEnrollment.deleteMany({ where: { userId: user.id } });
    return { deleted: true };
  }
  @Post('workouts') @Header('Cache-Control', 'private, no-store')
  async save(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveWorkoutSchema)) body: SaveWorkout) {
    const day = findProgramDay(body.programId, body.dayId);
    if (!day) throw new BadRequestException('This workout is not part of the program.');
    for (const entry of body.exercises) {
      const exercise = findGymExercise(entry.exerciseId);
      if (!exercise || !day.exercises.some(item => item.exerciseId === entry.exerciseId)) throw new BadRequestException('An exercise is not part of this workout.');
      if (entry.sets.some(set => (exercise.load === 'bodyweight') !== (set.weight === null))) throw new BadRequestException(`Check the weights entered for ${exercise.name}.`);
    }
    const { requestKey, ...fields } = body;
    const requestHash = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Serialize retries across devices with the existing account-first lock order.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const existing = await tx.workout.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('This save key belongs to another workout.');
        return workoutDto(existing);
      }
      if (Date.parse(body.endedAt) > Date.now() + 30_000) throw new BadRequestException('Check your device clock before saving this workout.');
      return workoutDto(await tx.workout.create({ data: { ...fields, exercises: fields.exercises as Prisma.InputJsonValue, userId: user.id, requestKey, requestHash,
        startedAt: new Date(body.startedAt), endedAt: new Date(body.endedAt) } }));
    });
  }
  @Delete('workouts/:id') @Header('Cache-Control', 'private, no-store')
  async remove(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    const result = await this.prisma.workout.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) throw new NotFoundException('Workout not found.');
    return { deleted: true };
  }
}
