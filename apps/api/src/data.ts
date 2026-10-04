import { eventRange, selectEvents } from './integrations/events/event-query';
import { campusEventSchema } from '@campusflow/contracts';
import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { configureAcademicReminderSchema, academicReminderConfigurationSchema, dueSchema, eventQuerySchema, pauseGoalSchema, taskQuerySchema, academicItemSchema, completeGoalSchema, completePersonalTaskSchema, courseSchema, createGoalSchema, createPersonalTaskSchema, createWellnessEntrySchema, eventSchema, goalCompletionSchema, goalSchema, notificationPreferencesSchema, personalTaskSchema, reminderSchema, saveEventSchema, savedEventSchema, setMainGoalSchema, snoozeGoalSchema, snoozePersonalTaskSchema, updateGoalSchema, updateNotificationPreferencesSchema, updatePersonalTaskSchema, updateSavedEventSchema, wellnessEntrySchema } from '@campusflow/contracts';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, parseUuid, toIso } from './common';
import { PrismaService } from './prisma.service';
import { academicReminderFireAt, goalOccursOn, reminderAfterSnooze, taskOccursOn } from '@campusflow/domain';

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const taskDto = (r:{id:string;title:string;description:string|null;priority:string;category:string;due:Prisma.JsonValue|null;scheduled:Prisma.JsonValue|null;recurrence:Prisma.JsonValue|null;reminder:Prisma.JsonValue|null;estimatedMinutes:number|null;completedAt:Date|null;snoozedUntil:Date|null;mainGoalDate:string|null;createdAt:Date;updatedAt:Date}) => personalTaskSchema.parse({...r,completedAt:r.completedAt?.toISOString()??null,snoozedUntil:r.snoozedUntil?.toISOString()??null,createdAt:toIso(r.createdAt),updatedAt:toIso(r.updatedAt)});
const goalDto = (r:{id:string;title:string;category:string;schedule:Prisma.JsonValue;timeZone:string;reminder:Prisma.JsonValue|null;pausedAt:Date|null;snoozedUntil:Date|null;createdAt:Date;updatedAt:Date}) => goalSchema.parse({...r,pausedAt:r.pausedAt?.toISOString()??null,snoozedUntil:r.snoozedUntil?.toISOString()??null,createdAt:toIso(r.createdAt),updatedAt:toIso(r.updatedAt)});
const eventDto = (r:{id:string;title:string;description:string|null;category:string|null;source:string;externalId:string;timing:Prisma.JsonValue;location:string|null;url:string|null}) => eventSchema.parse(r);
const isExplicitReminder = (reminder: unknown): reminder is { kind: 'instant'; at: string } => Boolean(reminder && typeof reminder === 'object' && 'kind' in reminder && reminder.kind === 'instant' && 'at' in reminder && typeof reminder.at === 'string');

@Injectable() export class ReminderService {
  constructor(private readonly prisma:PrismaService) {}
  // Acquire before any academic/course persistence, including configuration.
  // This also covers newly configured items omitted from a course-state import.
  async lockAcademicReminders(userId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('academic-reminders'), hashtext(${userId}))::text`;
  }
  // The owned row lock also serializes null-occurrence reminder creation with
  // academic updates. PostgreSQL nullable unique keys alone allow duplicates.
  async lockAcademicItem(userId: string, id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "AcademicItem" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR NO KEY UPDATE`;
  }
  async reconcileAcademicItem(userId: string, id: string, tx: Prisma.TransactionClient): Promise<void> {
    await this.lockAcademicItem(userId, id, tx);
    const item = await tx.academicItem.findFirst({ where: { id, userId }, include: { course: true } });
    if (!item) throw new NotFoundException('Academic item not found');
    const where = { userId, targetKind: 'academicItem', targetId: id, academicItemId: id };
    if (item.reminderLeadMinutes === null) {
      await tx.reminder.deleteMany({ where });
      return;
    }
    const fireAt = academicReminderFireAt(dueSchema.nullable().parse(item.due), item.reminderLeadMinutes,
      item.submissionState, item.course?.active ?? true);
    const existing = await tx.reminder.findFirst({ where });
    if (!fireAt) {
      await tx.reminder.updateMany({ where: { ...where, enabled: true }, data: { enabled: false } });
    } else if (!existing) {
      await tx.reminder.create({ data: { ...where, fireAt: new Date(fireAt) } });
    } else if (!existing.enabled || existing.fireAt.getTime() !== Date.parse(fireAt)) {
      await tx.reminder.update({ where: { id: existing.id }, data: { fireAt: new Date(fireAt), enabled: true } });
    }
  }
  async replace(userId:string,targetKind:string,targetId:string,reminder:unknown, tx:Prisma.TransactionClient = this.prisma, notBefore?: Date | null):Promise<void> {
    await tx.reminder.deleteMany({where:{userId,targetKind,targetId}});
    if (isExplicitReminder(reminder)) await tx.reminder.create({data:{userId,targetKind,targetId,fireAt:new Date(reminderAfterSnooze(reminder.at, notBefore?.toISOString())),...(targetKind==='personalTask'?{personalTaskId:targetId}:targetKind==='goal'?{goalId:targetId}:targetKind==='savedEvent'?{savedEventUserId:userId,savedEventEventId:targetId}:{})}});
  }
  async postpone(userId: string, targetKind: string, targetId: string, reminder: unknown, until: Date, tx: Prisma.TransactionClient): Promise<void> {
    if (!isExplicitReminder(reminder)) { await this.replace(userId, targetKind, targetId, null, tx); return; }
    // Change only existing enabled intent, retaining its ID and never advancing it.
    await tx.reminder.updateMany({ where: { userId, targetKind, targetId, enabled: true, fireAt: { lt: until } }, data: { fireAt: until } });
  }
}

// All Main Goal writers acquire the same account row before reading/clearing either
// table. NO KEY UPDATE allows unrelated foreign-key inserts to proceed.
// READ COMMITTED then sees the preceding selector's committed changes.
async function lockMainGoalAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
}
async function clearMainGoal(tx: Prisma.TransactionClient, userId: string, date: string): Promise<void> {
  await tx.personalTask.updateMany({ where: { userId, mainGoalDate: date }, data: { mainGoalDate: null } });
  await tx.academicItem.updateMany({ where: { userId, mainGoalDate: date }, data: { mainGoalDate: null } });
}
const taskTiming = (task: { recurrence: unknown; due: unknown; scheduled: unknown }) => ({
  recurrence: createPersonalTaskSchema.shape.recurrence.parse(task.recurrence) ?? undefined,
  due: createPersonalTaskSchema.shape.due.parse(task.due) ?? undefined,
  scheduled: createPersonalTaskSchema.shape.scheduled.parse(task.scheduled) ?? undefined,
});
function validateTaskAnchor(task: { recurrence?: unknown; due?: unknown; scheduled?: unknown }): void {
  if (task.recurrence && !task.due && !task.scheduled) throw new BadRequestException('Recurring tasks require a scheduled date or deadline');
}

@Controller('tasks') @UseGuards(AuthGuard) export class TasksController {
  constructor(private readonly prisma: PrismaService, private readonly reminders: ReminderService) {}

  @Get() async list(@CurrentUser() u: RequestUser, @Query(new ZodPipe(taskQuerySchema)) query: z.infer<typeof taskQuerySchema>) {
    const { search, category, completed } = query;
    const where: Prisma.PersonalTaskWhereInput = {
      userId: u.id,
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {}),
      ...(category ? { category } : {}),
      ...(completed === 'true' ? { completedAt: { not: null } } : completed === 'false' ? { completedAt: null } : {}),
    };
    return (await this.prisma.personalTask.findMany({ where, orderBy: { updatedAt: 'desc' } })).map(taskDto);
  }

  @Post() async create(@CurrentUser() u: RequestUser, @Body(new ZodPipe(createPersonalTaskSchema)) b: z.infer<typeof createPersonalTaskSchema>) {
    validateTaskAnchor(b);
    return this.prisma.$transaction(async tx => {
      const task = await tx.personalTask.create({ data: {
        userId: u.id, title: b.title, description: b.description ?? null,
        priority: b.priority ?? 'medium', category: b.category ?? 'personal',
        due: b.due ? asJson(b.due) : Prisma.JsonNull, scheduled: b.scheduled ? asJson(b.scheduled) : Prisma.JsonNull,
        recurrence: b.recurrence ? asJson(b.recurrence) : Prisma.JsonNull,
        reminder: b.reminder ? asJson(b.reminder) : Prisma.JsonNull, estimatedMinutes: b.estimatedMinutes ?? null,
      } });
      await this.reminders.replace(u.id, 'personalTask', task.id, b.reminder, tx);
      return taskDto(task);
    });
  }

  @Get(':id') async get(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    return taskDto(await this.owned(this.prisma, u.id, id));
  }

  @Patch(':id') async update(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(updatePersonalTaskSchema)) b: z.infer<typeof updatePersonalTaskSchema>) {
    return this.prisma.$transaction(async tx => {
      await this.lockTask(tx, u.id, id);
      const existing = await this.owned(tx, u.id, id);
      const recurrence = b.recurrence === undefined ? existing.recurrence : b.recurrence;
      if (existing.completedAt && !existing.recurrence && recurrence) throw new BadRequestException('Undo completion before making this task repeat');
      validateTaskAnchor({ recurrence,
        due: b.due === undefined ? existing.due : b.due, scheduled: b.scheduled === undefined ? existing.scheduled : b.scheduled });
      const data: Prisma.PersonalTaskUpdateInput = { ...b,
        due: b.due === undefined ? undefined : b.due === null ? Prisma.JsonNull : asJson(b.due),
        scheduled: b.scheduled === undefined ? undefined : b.scheduled === null ? Prisma.JsonNull : asJson(b.scheduled),
        recurrence: b.recurrence === undefined ? undefined : b.recurrence === null ? Prisma.JsonNull : asJson(b.recurrence),
        reminder: b.reminder === undefined ? undefined : b.reminder === null ? Prisma.JsonNull : asJson(b.reminder),
      };
      const task = await tx.personalTask.update({ where: { id }, data });
      if (task.completedAt || b.reminder !== undefined) await this.reminders.replace(u.id, 'personalTask', id, task.completedAt ? null : b.reminder, tx, task.snoozedUntil);
      return taskDto(task);
    });
  }

  @Delete(':id') async remove(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    const result = await this.prisma.personalTask.deleteMany({ where: { id, userId: u.id } });
    if (!result.count) throw new NotFoundException('Task not found');
    return { deleted: true };
  }

  @Post(':id/complete') async complete(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(completePersonalTaskSchema)) b: z.infer<typeof completePersonalTaskSchema>) {
    return this.prisma.$transaction(async tx => {
      await this.lockTask(tx, u.id, id);
      const task = await this.owned(tx, u.id, id);
      if (task.recurrence) {
        if (!b.occurrenceKey) throw new BadRequestException('A recurring task completion requires an occurrence date');
        if (!taskOccursOn(taskTiming(task), b.occurrenceKey, u.timeZone)) {
          throw new BadRequestException('A valid scheduled occurrence date is required');
        }
        const key = { userId: u.id, taskId: id, occurrenceKey: b.occurrenceKey };
        if (b.completed) await tx.taskCompletion.upsert({ where: { userId_taskId_occurrenceKey: key }, create: key, update: {} });
        else await tx.taskCompletion.deleteMany({ where: key });
        return taskDto(task);
      }
      if (b.occurrenceKey !== undefined) throw new BadRequestException('Non-recurring tasks do not accept an occurrence date');
      const updated = await tx.personalTask.update({ where: { id }, data: { completedAt: b.completed ? task.completedAt ?? new Date() : null } });
      // Retain configuration for undo, but remove delivery intent while closed.
      // Retried completion cleans up legacy intent; retried undo keeps its ID.
      if (b.completed || task.completedAt) await this.reminders.replace(u.id, 'personalTask', id, b.completed ? null : task.reminder, tx, task.snoozedUntil);
      return taskDto(updated);
    });
  }

  @Post(':id/snooze') async snooze(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(snoozePersonalTaskSchema)) b: z.infer<typeof snoozePersonalTaskSchema>) {
    return this.prisma.$transaction(async tx => {
      await this.lockTask(tx, u.id, id); const task = await this.owned(tx, u.id, id); const until = new Date(b.until);
      const updated = await tx.personalTask.update({ where: { id }, data: { snoozedUntil: until } });
      await this.reminders.postpone(u.id, 'personalTask', id, task.completedAt ? null : task.reminder, until, tx);
      return taskDto(updated);
    });
  }

  @Post(':id/main-goal') async main(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(setMainGoalSchema)) b: z.infer<typeof setMainGoalSchema>) {
    return this.prisma.$transaction(async tx => {
      await lockMainGoalAccount(tx, u.id);
      await this.lockTask(tx, u.id, id);
      const task = await this.owned(tx, u.id, id);
      if (b.date && task.recurrence && !taskOccursOn(taskTiming(task), b.date, u.timeZone)) {
        throw new BadRequestException('Main Goal date must be a scheduled occurrence');
      }
      if (b.date) await clearMainGoal(tx, u.id, b.date);
      return taskDto(await tx.personalTask.update({ where: { id }, data: { mainGoalDate: b.date } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private async lockTask(tx: Prisma.TransactionClient, userId: string, id: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "PersonalTask" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
  }
  private async owned(db: Prisma.TransactionClient, userId: string, id: string) {
    const task = await db.personalTask.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}

@Controller() @UseGuards(AuthGuard) export class AcademicController {
 constructor(private readonly prisma:PrismaService, private readonly reminders: ReminderService){}
 @Get('academic-items/:id/reminder') async reminder(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
   const item = await this.prisma.academicItem.findFirst({ where: { id, userId: u.id } });
   if (!item) throw new NotFoundException('Academic item not found');
   return academicReminderConfigurationSchema.parse({ academicItemId: id, leadMinutes: item.reminderLeadMinutes });
 }
 @Put('academic-items/:id/reminder') async configureReminder(@CurrentUser() u: RequestUser,
   @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(configureAcademicReminderSchema)) b: z.infer<typeof configureAcademicReminderSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.reminders.lockAcademicReminders(u.id, tx);
     await this.reminders.lockAcademicItem(u.id, id, tx);
     const item = await tx.academicItem.findFirst({ where: { id, userId: u.id } });
     if (!item) throw new NotFoundException('Academic item not found');
     if (item.reminderLeadMinutes !== b.leadMinutes)
       await tx.academicItem.update({ where: { id }, data: { reminderLeadMinutes: b.leadMinutes } });
     await this.reminders.reconcileAcademicItem(u.id, id, tx);
     return academicReminderConfigurationSchema.parse({ academicItemId: id, leadMinutes: b.leadMinutes });
   }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
 }
 @Get('courses') async courses(@CurrentUser() u:RequestUser){return (await this.prisma.course.findMany({where:{userId:u.id},orderBy:{name:'asc'}})).map(r=>courseSchema.parse(r));}
 @Get('academic-items') async items(@CurrentUser() u:RequestUser){return (await this.prisma.academicItem.findMany({where:{userId:u.id},orderBy:{updatedAt:'desc'}})).map(r=>academicItemSchema.parse({...r,updatedAt:toIso(r.updatedAt)}));}
 @Patch('academic-items/:id/main-goal') async main(@CurrentUser() u: RequestUser,
   @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(setMainGoalSchema)) b: z.infer<typeof setMainGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     await lockMainGoalAccount(tx, u.id);
     const owned = await tx.academicItem.findFirst({ where: { id, userId: u.id } });
     if (!owned) throw new NotFoundException('Academic item not found');
     if (b.date) await clearMainGoal(tx, u.id, b.date);
     const item = await tx.academicItem.update({ where: { id }, data: { mainGoalDate: b.date } });
     return academicItemSchema.parse({ ...item, updatedAt: toIso(item.updatedAt) });
   }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
 }
}

@Controller('goals') @UseGuards(AuthGuard) export class GoalsController {
 constructor(private readonly prisma: PrismaService, private readonly reminders: ReminderService) {}
 @Get() async list(@CurrentUser() u:RequestUser){return (await this.prisma.goal.findMany({where:{userId:u.id},orderBy:{updatedAt:'desc'}})).map(goalDto);}
 @Post() async create(@CurrentUser() u: RequestUser, @Body(new ZodPipe(createGoalSchema)) b: z.infer<typeof createGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     const goal = await tx.goal.create({ data: { userId: u.id, title: b.title, category: b.category ?? 'health', schedule: asJson(b.schedule), timeZone: b.timeZone, reminder: b.reminder ? asJson(b.reminder) : Prisma.JsonNull } });
     await this.reminders.replace(u.id, 'goal', goal.id, b.reminder, tx);
     return goalDto(goal);
   });
 }
 @Patch(':id') async update(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(updateGoalSchema)) b: z.infer<typeof updateGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.lockGoal(tx, u.id, id); await this.owned(u.id, id, tx);
     const data: Prisma.GoalUpdateInput = { ...b, schedule: b.schedule ? asJson(b.schedule) : undefined, reminder: b.reminder === undefined ? undefined : b.reminder === null ? Prisma.JsonNull : asJson(b.reminder) };
     const goal = await tx.goal.update({ where: { id }, data });
     if (goal.pausedAt || b.reminder !== undefined) await this.reminders.replace(u.id, 'goal', id, goal.pausedAt ? null : b.reminder, tx, goal.snoozedUntil);
     return goalDto(goal);
   });
 }
 @Delete(':id') async remove(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
   return this.prisma.$transaction(async tx => {
     await this.lockGoal(tx, u.id, id); await this.owned(u.id, id, tx);
     await tx.goal.delete({ where: { id } }); return { deleted: true };
   });
 }
 @Post(':id/complete') async complete(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
   @Body(new ZodPipe(completeGoalSchema)) b: z.infer<typeof completeGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     // Serialize against schedule edits and deletion while validating the occurrence.
     await this.lockGoal(tx, u.id, id);
     const record = await tx.goal.findFirst({ where: { id, userId: u.id } });
     if (!record) throw new NotFoundException('Goal not found');
     const goal = goalDto(record);
     if (goal.schedule.kind !== 'weeklyTarget' && !goalOccursOn({ id, title: goal.title, schedule: goal.schedule, timeZone: goal.timeZone }, b.occurrenceKey)) {
       throw new BadRequestException('Date is not a scheduled goal occurrence');
     }
     const key = { userId: u.id, goalId: id, occurrenceKey: b.occurrenceKey };
     const existing = await tx.goalCompletion.findUnique({ where: { userId_goalId_occurrenceKey: key } });
     const completedAt = b.state === 'completed' ? existing?.completedAt ?? new Date() : null;
     const row = await tx.goalCompletion.upsert({ where: { userId_goalId_occurrenceKey: key },
       create: { ...key, state: b.state, completedAt }, update: { state: b.state, completedAt } });
     return goalCompletionSchema.parse({ ...row, completedAt: row.completedAt?.toISOString() ?? null, createdAt: toIso(row.createdAt) });
   });
 }
 @Post(':id/snooze') async snooze(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(snoozeGoalSchema)) b: z.infer<typeof snoozeGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.lockGoal(tx, u.id, id); const goal = await this.owned(u.id, id, tx); const until = new Date(b.until);
     const updated = await tx.goal.update({ where: { id }, data: { snoozedUntil: until } });
     await this.reminders.postpone(u.id, 'goal', id, goal.pausedAt ? null : goal.reminder, until, tx);
     return goalDto(updated);
   });
 }
 @Post(':id/pause') async pause(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(pauseGoalSchema)) b: z.infer<typeof pauseGoalSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.lockGoal(tx, u.id, id); const existing = await this.owned(u.id, id, tx);
     const goal = await tx.goal.update({ where: { id }, data: { pausedAt: b.paused ? existing.pausedAt ?? new Date() : null } });
     // Retain configuration while paused; resume once without replacing intent on retries.
     if (b.paused || existing.pausedAt) await this.reminders.replace(u.id, 'goal', id, b.paused ? null : goal.reminder, tx, goal.snoozedUntil);
     return goalDto(goal);
   });
 }
 @Get(':id/history') async history(@CurrentUser() u:RequestUser,@Param('id',new ZodPipe(parseUuid)) id:string){await this.owned(u.id,id);return (await this.prisma.goalCompletion.findMany({where:{userId:u.id,goalId:id},orderBy:{occurrenceKey:'desc'}})).map(r=>goalCompletionSchema.parse({...r,completedAt:r.completedAt?.toISOString()??null,createdAt:toIso(r.createdAt)}));}
 private async lockGoal(tx: Prisma.TransactionClient, userId: string, id: string): Promise<void> {
   await tx.$queryRaw`SELECT "id" FROM "Goal" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
 }
 private async owned(userId: string, id: string, db: Prisma.TransactionClient = this.prisma) {
   const record = await db.goal.findFirst({ where: { id, userId } }); if (!record) throw new NotFoundException('Goal not found'); return record;
 }
}

@Controller('wellness') @UseGuards(AuthGuard) export class WellnessController {constructor(private readonly prisma:PrismaService){} @Get() async list(@CurrentUser()u:RequestUser){return(await this.prisma.wellnessEntry.findMany({where:{userId:u.id},orderBy:{date:'desc'}})).map(r=>wellnessEntrySchema.parse({...r,createdAt:toIso(r.createdAt)}));} @Post() async save(@CurrentUser()u:RequestUser,@Body(new ZodPipe(createWellnessEntrySchema))b:z.infer<typeof createWellnessEntrySchema>){const r=await this.prisma.wellnessEntry.upsert({where:{userId_date:{userId:u.id,date:b.date}},create:{userId:u.id,...b},update:b});return wellnessEntrySchema.parse({...r,createdAt:toIso(r.createdAt)});}}

@Controller('events') @UseGuards(AuthGuard) export class EventsController {
 constructor(private readonly prisma: PrismaService, private readonly reminders: ReminderService) {}
 @Get() async list(@CurrentUser() u: RequestUser, @Query(new ZodPipe(eventQuerySchema)) query: z.infer<typeof eventQuerySchema>) {
   const range = eventRange(query, u.timeZone);
   const rows = await this.prisma.event.findMany({ where: {
     OR: [{ sourceScope: 'public' }, { sourceScope: `user:${u.id}` }],
     ...(query.category ? { category: query.category } : {}),
   }, include: { savedBy: { where: { userId: u.id } } } });
   return selectEvents(rows.map(r => campusEventSchema.parse({ ...eventDto(r), saved: r.savedBy.length > 0, includedInPlan: r.savedBy[0]?.includedInPlan ?? false, savedReminder: r.savedBy[0]?.reminder ?? null })), range, u.timeZone);
 }
 @Put(':id/saved') async save(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(saveEventSchema)) b: z.infer<typeof saveEventSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.lockEvent(tx, id); await this.event(id, u.id, tx);
     const row = await tx.savedEvent.upsert({ where: { userId_eventId: { userId: u.id, eventId: id } },
       create: { userId: u.id, eventId: id, includedInPlan: b.includedInPlan, reminder: b.reminder ? asJson(b.reminder) : Prisma.JsonNull },
       update: { includedInPlan: b.includedInPlan, reminder: b.reminder === undefined ? undefined : b.reminder === null ? Prisma.JsonNull : asJson(b.reminder) } });
     if (b.reminder !== undefined) await this.reminders.replace(u.id, 'savedEvent', id, b.reminder, tx);
     return savedEventSchema.parse({ ...row, savedAt: toIso(row.savedAt) });
   });
 }
 @Patch(':id/saved') async patch(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(updateSavedEventSchema)) b: z.infer<typeof updateSavedEventSchema>) {
   return this.prisma.$transaction(async tx => {
     await this.lockEvent(tx, id);
     const key = { userId: u.id, eventId: id }; const existing = await tx.savedEvent.findUnique({ where: { userId_eventId: key } });
     if (!existing) throw new NotFoundException('Saved event not found');
     const row = await tx.savedEvent.update({ where: { userId_eventId: key }, data: { includedInPlan: b.includedInPlan, reminder: b.reminder === undefined ? undefined : b.reminder === null ? Prisma.JsonNull : asJson(b.reminder) } });
     if (b.reminder !== undefined) await this.reminders.replace(u.id, 'savedEvent', id, b.reminder, tx);
     return savedEventSchema.parse({ ...row, savedAt: toIso(row.savedAt) });
   });
 }
 @Delete(':id/saved') async unsave(@CurrentUser() u: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
   return this.prisma.$transaction(async tx => {
     await this.lockEvent(tx, id); await tx.savedEvent.deleteMany({ where: { userId: u.id, eventId: id } });
     // Also clean legacy intent that predates the SavedEvent foreign key.
     await this.reminders.replace(u.id, 'savedEvent', id, null, tx); return { deleted: true };
   });
 }
 private async lockEvent(tx: Prisma.TransactionClient, id: string): Promise<void> {
   // Serialize even the first save, and coordinate with provider deletion/reconciliation.
   await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`;
 }
 private async event(id: string, userId: string, db: Prisma.TransactionClient = this.prisma) {
   const row = await db.event.findFirst({ where: { id, OR: [{ sourceScope: 'public' }, { sourceScope: `user:${userId}` }] } });
   if (!row) throw new NotFoundException('Event not found'); return row;
 }
}

@Controller() @UseGuards(AuthGuard) export class PreferencesController {
 constructor(private readonly prisma:PrismaService){}
 @Get('notification-preferences') async get(@CurrentUser()u:RequestUser){const r=await this.prisma.notificationPreference.upsert({where:{userId:u.id},create:{userId:u.id},update:{}});return notificationPreferencesSchema.parse(r);}
 @Patch('notification-preferences') async patch(@CurrentUser()u:RequestUser,@Body(new ZodPipe(updateNotificationPreferencesSchema))b:z.infer<typeof updateNotificationPreferencesSchema>){return notificationPreferencesSchema.parse(await this.prisma.notificationPreference.upsert({where:{userId:u.id},create:{userId:u.id,...b},update:b}));}
 @Get('reminders') async reminders(@CurrentUser()u:RequestUser){return(await this.prisma.reminder.findMany({where:{userId:u.id,enabled:true},orderBy:{fireAt:'asc'}})).map(r=>reminderSchema.parse({...r,fireAt:toIso(r.fireAt)}));}
}
