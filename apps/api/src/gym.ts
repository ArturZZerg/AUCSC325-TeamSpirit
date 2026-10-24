import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, PayloadTooLargeException, Post, Put,
  Req, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Prisma, type BodyWeightEntry as BodyWeightRow, type GymEnrollment as EnrollmentRow, type UserExercise as ExerciseRow,
  type UserProgram as ProgramRow, type Workout as WorkoutRow } from '@prisma/client';
import { bodyWeightEntrySchema, dateSchema, exerciseDetailsSchema, gymEnrollmentSchema, gymImportResultSchema, gymOverviewSchema, gymRecentDays, gymRecentLimit,
  programDaySchema, saveBodyWeightSchema, saveGymEnrollmentSchema, saveUserExerciseSchema, saveUserProgramSchema, saveWorkoutSchema, userExerciseSchema,
  userProgramSchema, workoutSchema, type SaveGymEnrollment, type SaveUserExercise, type SaveUserProgram, type SaveWorkout } from '@campusflow/contracts';
import { findLibraryExercise, localDateAt, resolveExercise, resolveProgram, type GymExercise, type TrainingProgram } from '@campusflow/domain';
import { z } from 'zod';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, lockAccountRecords, parseUuid } from './common';
import { readDataFile } from './data-files';
import { parseOpenGym } from './integrations/opengym/opengym-import';
import { PrismaService } from './prisma.service';

type Tx = Prisma.TransactionClient;
const enrollmentDto = (row: EnrollmentRow) => gymEnrollmentSchema.parse({ programId: row.programId, unit: row.unit, weeklyTarget: row.weeklyTarget,
  trackRir: row.trackRir, startedAt: row.startedAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const workoutDto = (row: WorkoutRow) => workoutSchema.parse({ id: row.id, programId: row.programId, dayId: row.dayId, title: row.title,
  startedAt: row.startedAt.toISOString(), endedAt: row.endedAt.toISOString(), unit: row.unit, exercises: row.exercises,
  note: row.note, createdAt: row.createdAt.toISOString() });
const exerciseDto = (row: ExerciseRow) => userExerciseSchema.parse({ id: row.id, name: row.name, equipment: row.equipment, load: row.load, muscles: row.muscles,
  note: row.note, mediaId: row.mediaId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const programDto = (row: ProgramRow) => userProgramSchema.parse({ id: row.id, name: row.name, days: row.days,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const weightDto = (row: BodyWeightRow) => bodyWeightEntrySchema.parse({ date: row.date, weight: row.weight, unit: row.unit });
const ownExercise = (row: ExerciseRow): GymExercise => ({ id: row.id, name: row.name, equipment: row.equipment as GymExercise['equipment'],
  load: row.load as GymExercise['load'], muscles: row.muscles as GymExercise['muscles'], cue: row.note ?? '', ...(row.mediaId ? { mediaId: row.mediaId } : {}) });
const ownProgram = (row: ProgramRow): TrainingProgram => ({ id: row.id, name: row.name, days: z.array(programDaySchema).parse(row.days) });
const json = (value: unknown) => value as Prisma.InputJsonValue;
const importMaxBytes = 4 * 1024 * 1024;
let instructions: Record<string, string[]> | undefined;
const exerciseInstructions = () => instructions ??= JSON.parse(readDataFile('exercise-instructions.json')) as Record<string, string[]>;
/** Photos are synced to the owner's server (ADR 022); without a configured base the app shows text only. */
const mediaBase = () => process.env.EXERCISE_MEDIA_URL?.replace(/\/+$/, '');

/** Reads an openGym backup as a bounded raw body; Nest's JSON parser never sees it. */
async function backupBody(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/octet-stream(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new UnsupportedMediaTypeException('Upload the openGym backup file.');
  const tooLarge = () => new PayloadTooLargeException('Backups can be up to 4 MB.');
  if (Number(request.headers['content-length'] ?? 0) > importMaxBytes) { request.destroy(); throw tooLarge(); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > importMaxBytes) { request.destroy(); throw tooLarge(); }
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new BadRequestException('This file is not a readable openGym backup.'); }
}

/** Recorded strength training (ADR 020, ADR 022). Catalog and library are static domain content; the API owns everything per account. */
@Controller('gym') @UseGuards(AuthGuard)
export class GymController {
  constructor(private readonly prisma: PrismaService) {}

  private async owned(tx: Tx, userId: string) {
    const [exercises, programs] = await Promise.all([tx.userExercise.findMany({ where: { userId } }), tx.userProgram.findMany({ where: { userId } })]);
    return { exercises: exercises.map(ownExercise), programs: programs.map(ownProgram) };
  }
  private checkProgram(body: SaveUserProgram, exercises: readonly GymExercise[]) {
    for (const day of body.days) for (const item of day.exercises)
      if (!resolveExercise(item.exerciseId, exercises)) throw new BadRequestException(`An exercise in ${day.name} is no longer available.`);
  }

  @Get() @Header('Cache-Control', 'private, no-store')
  async overview(@CurrentUser() user: RequestUser) {
    const since = new Date(Date.now() - gymRecentDays * 86400_000);
    const [enrollment, workouts, exercises, programs, weights] = await Promise.all([
      this.prisma.gymEnrollment.findUnique({ where: { userId: user.id } }),
      this.prisma.workout.findMany({ where: { userId: user.id, endedAt: { gte: since } }, orderBy: [{ endedAt: 'desc' }, { id: 'asc' }], take: gymRecentLimit }),
      this.prisma.userExercise.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } }),
      this.prisma.userProgram.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.bodyWeightEntry.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' }, take: gymRecentDays }),
    ]);
    return gymOverviewSchema.parse({ accountId: user.id, timeZone: user.timeZone, capturedAt: new Date().toISOString(),
      enrollment: enrollment ? enrollmentDto(enrollment) : null, workouts: workouts.map(workoutDto), exercises: exercises.map(exerciseDto),
      programs: programs.map(programDto), bodyWeights: weights.map(weightDto) });
  }

  @Put('enrollment') @Header('Cache-Control', 'private, no-store')
  async enroll(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveGymEnrollmentSchema)) body: SaveGymEnrollment) {
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      if (!resolveProgram(body.programId, (await this.owned(tx, user.id)).programs)) throw new BadRequestException('Choose a program from the list.');
      const current = await tx.gymEnrollment.findUnique({ where: { userId: user.id } });
      // Switching programs restarts the program clock; changing settings does not.
      const startedAt = current && current.programId === body.programId ? current.startedAt : new Date();
      return enrollmentDto(await tx.gymEnrollment.upsert({ where: { userId: user.id }, create: { userId: user.id, ...body }, update: { ...body, startedAt } }));
    });
  }
  @Delete('enrollment') @Header('Cache-Control', 'private, no-store')
  async leave(@CurrentUser() user: RequestUser) {
    await this.prisma.gymEnrollment.deleteMany({ where: { userId: user.id } });
    return { deleted: true };
  }

  @Post('programs') @Header('Cache-Control', 'private, no-store')
  async createProgram(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveUserProgramSchema)) body: SaveUserProgram) {
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      this.checkProgram(body, (await this.owned(tx, user.id)).exercises);
      if (await tx.userProgram.count({ where: { userId: user.id } }) >= 50) throw new BadRequestException('You can keep up to 50 programs.');
      return programDto(await tx.userProgram.create({ data: { userId: user.id, name: body.name, days: json(body.days) } }));
    });
  }
  @Put('programs/:id') @Header('Cache-Control', 'private, no-store')
  async updateProgram(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(saveUserProgramSchema)) body: SaveUserProgram) {
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      this.checkProgram(body, (await this.owned(tx, user.id)).exercises);
      const result = await tx.userProgram.updateMany({ where: { id, userId: user.id }, data: { name: body.name, days: json(body.days) } });
      if (!result.count) throw new NotFoundException('Program not found.');
      return programDto(await tx.userProgram.findUniqueOrThrow({ where: { id } }));
    });
  }
  @Delete('programs/:id') @Header('Cache-Control', 'private, no-store')
  async deleteProgram(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    await this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      if (!(await tx.userProgram.deleteMany({ where: { id, userId: user.id } })).count) throw new NotFoundException('Program not found.');
      // Saved workouts keep their program id and title; only the plan goes away.
      await tx.gymEnrollment.deleteMany({ where: { userId: user.id, programId: id } });
    });
    return { deleted: true };
  }

  @Post('exercises') @Header('Cache-Control', 'private, no-store')
  async createExercise(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveUserExerciseSchema)) body: SaveUserExercise) {
    if (body.mediaId && !findLibraryExercise(body.mediaId)) throw new BadRequestException('Choose a picture from the exercise library.');
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      if (await tx.userExercise.count({ where: { userId: user.id } }) >= 500) throw new BadRequestException('You can keep up to 500 exercises.');
      return exerciseDto(await tx.userExercise.create({ data: { userId: user.id, ...body } }));
    });
  }
  @Put('exercises/:id') @Header('Cache-Control', 'private, no-store')
  async updateExercise(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(saveUserExerciseSchema)) body: SaveUserExercise) {
    if (body.mediaId && !findLibraryExercise(body.mediaId)) throw new BadRequestException('Choose a picture from the exercise library.');
    const result = await this.prisma.userExercise.updateMany({ where: { id, userId: user.id }, data: body });
    if (!result.count) throw new NotFoundException('Exercise not found.');
    return exerciseDto(await this.prisma.userExercise.findUniqueOrThrow({ where: { id } }));
  }
  @Delete('exercises/:id') @Header('Cache-Control', 'private, no-store')
  async deleteExercise(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    await this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      const used = await tx.$queryRaw<{ used: boolean }[]>`SELECT (
        EXISTS (SELECT 1 FROM "UserProgram" p, jsonb_array_elements(p."days") d, jsonb_array_elements(d->'exercises') e
          WHERE p."userId" = ${user.id}::uuid AND e->>'exerciseId' = ${id})
        OR EXISTS (SELECT 1 FROM "Workout" w, jsonb_array_elements(w."exercises") e WHERE w."userId" = ${user.id}::uuid AND e->>'exerciseId' = ${id})) AS "used"`;
      if (used[0]?.used) throw new ConflictException('This exercise is part of a program or your history. Rename it instead.');
      if (!(await tx.userExercise.deleteMany({ where: { id, userId: user.id } })).count) throw new NotFoundException('Exercise not found.');
    });
    return { deleted: true };
  }
  @Get('exercises/:id/details') @Header('Cache-Control', 'private, max-age=86400')
  details(@Param('id', new ZodPipe(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/))) id: string) {
    const entry = findLibraryExercise(id);
    if (!entry) throw new NotFoundException('No library details for this exercise.');
    const base = mediaBase();
    return exerciseDetailsSchema.parse({ id, instructions: (exerciseInstructions()[id] ?? []).slice(0, 30),
      photos: base ? Array.from({ length: Math.min(entry.photos, 4) }, (_, index) => `${base}/${encodeURIComponent(id)}/${index}.jpg`) : [] });
  }

  @Put('body-weight/:date') @Header('Cache-Control', 'private, no-store')
  async saveWeight(@CurrentUser() user: RequestUser, @Param('date', new ZodPipe(dateSchema)) date: string, @Body(new ZodPipe(saveBodyWeightSchema)) body: z.infer<typeof saveBodyWeightSchema>) {
    if (date > localDateAt(new Date().toISOString(), user.timeZone)) throw new BadRequestException('Choose today or an earlier date.');
    return weightDto(await this.prisma.bodyWeightEntry.upsert({ where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, ...body }, update: body }));
  }
  @Delete('body-weight/:date') @Header('Cache-Control', 'private, no-store')
  async deleteWeight(@CurrentUser() user: RequestUser, @Param('date', new ZodPipe(dateSchema)) date: string) {
    if (!(await this.prisma.bodyWeightEntry.deleteMany({ where: { userId: user.id, date } })).count) throw new NotFoundException('No weight saved for this day.');
    return { deleted: true };
  }

  @Post('workouts') @Header('Cache-Control', 'private, no-store')
  async save(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveWorkoutSchema)) body: SaveWorkout) {
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
      const { exercises, programs } = await this.owned(tx, user.id);
      if (!resolveProgram(body.programId, programs)?.days.some(day => day.id === body.dayId)) throw new BadRequestException('This workout is not part of the program.');
      for (const entry of body.exercises) {
        const exercise = resolveExercise(entry.exerciseId, exercises);
        if (!exercise) throw new BadRequestException('An exercise in this workout is no longer available.');
        if (entry.sets.some(set => (exercise.load === 'bodyweight') !== (set.weight === null))) throw new BadRequestException(`Check the weights entered for ${exercise.name}.`);
      }
      if (Date.parse(body.endedAt) > Date.now() + 30_000) throw new BadRequestException('Check your device clock before saving this workout.');
      return workoutDto(await tx.workout.create({ data: { ...fields, exercises: json(fields.exercises), userId: user.id, requestKey, requestHash,
        startedAt: new Date(body.startedAt), endedAt: new Date(body.endedAt) } }));
    });
  }
  @Delete('workouts/:id') @Header('Cache-Control', 'private, no-store')
  async remove(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    const result = await this.prisma.workout.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) throw new NotFoundException('Workout not found.');
    return { deleted: true };
  }

  /** Idempotent: re-importing the same backup adds only what is missing and never overwrites edits (ADR 022). */
  @Post('import/opengym') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  async importOpenGym(@CurrentUser() user: RequestUser, @Req() request: IncomingMessage) {
    let data;
    try { data = parseOpenGym(await backupBody(request)); }
    catch (error) { if (error instanceof Error && !(error instanceof PayloadTooLargeException) && !(error instanceof UnsupportedMediaTypeException)) throw new BadRequestException(error.message); throw error; }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const counts = { exercises: 0, programs: 0, workouts: 0, bodyWeights: 0, skipped: data.skipped };
      const ids = new Map<string, string>();
      for (const row of await tx.userExercise.findMany({ where: { userId: user.id, sourceKey: { in: data.exercises.map(item => item.sourceKey) } } })) ids.set(row.sourceKey!, row.id);
      for (const item of data.exercises.filter(entry => !ids.has(entry.sourceKey))) {
        ids.set(item.sourceKey, (await tx.userExercise.create({ data: { userId: user.id, ...item } })).id);
        counts.exercises++;
      }
      const mapDay = (day: typeof data.days[number]) => ({ id: day.id, name: day.name, focus: day.focus, ...(day.archived ? { archived: true } : {}),
        exercises: day.exercises.map(({ sourceKey, ...item }) => ({ ...item, exerciseId: ids.get(sourceKey)! })) });
      let program = await tx.userProgram.findUnique({ where: { userId_sourceKey: { userId: user.id, sourceKey: 'opengym:program' } } });
      if (!program && data.days.length) {
        program = await tx.userProgram.create({ data: { userId: user.id, sourceKey: 'opengym:program', name: 'My openGym program', days: json(data.days.map(mapDay)) } });
        counts.programs++;
      } else if (program) {
        // Keep the student's edits; add only days that imported history needs.
        const days = z.array(programDaySchema).parse(program.days), known = new Set(days.map(day => day.id));
        const missing = data.days.filter(day => !known.has(day.id)).map(day => ({ ...mapDay(day), archived: true }));
        if (missing.length) program = await tx.userProgram.update({ where: { id: program.id }, data: { days: json([...days, ...missing]) } });
      }
      const existing = new Set((await tx.workout.findMany({ where: { userId: user.id, requestKey: { in: data.workouts.map(item => item.requestKey) } }, select: { requestKey: true } }))
        .map(row => row.requestKey));
      const fresh = program ? data.workouts.filter(item => !existing.has(item.requestKey)) : [];
      if (fresh.length) await tx.workout.createMany({ data: fresh.map(({ requestKey, exercises, ...item }) => {
        const fields = { ...item, programId: program!.id, unit: data.unit, exercises: exercises.map(({ sourceKey, sets }) => ({ exerciseId: ids.get(sourceKey)!, sets })) };
        return { ...fields, userId: user.id, requestKey, requestHash: createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
          startedAt: new Date(item.startedAt), endedAt: new Date(item.endedAt), exercises: json(fields.exercises) };
      }) });
      counts.workouts = fresh.length;
      const weights = await tx.bodyWeightEntry.createMany({ data: data.bodyWeights.map(entry => ({ userId: user.id, ...entry, unit: data.unit })), skipDuplicates: true });
      counts.bodyWeights = weights.count;
      if (program && !await tx.gymEnrollment.findUnique({ where: { userId: user.id } }))
        await tx.gymEnrollment.create({ data: { userId: user.id, programId: program.id, unit: data.unit, trackRir: true,
          weeklyTarget: Math.min(7, Math.max(1, data.days.filter(day => !day.archived).length)) } });
      return gymImportResultSchema.parse({ ...counts, programId: program?.id ?? null });
    }, { timeout: 30000, maxWait: 10000 });
  }
}
