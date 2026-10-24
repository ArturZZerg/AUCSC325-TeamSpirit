import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FoodLogEntry as EntryRow, NutritionProfile as ProfileRow, Prisma, UserFood as FoodRow } from '@prisma/client';
import { copyMealSchema, dateSchema, diningMenuSchema, foodEntrySchema, foodSchema, foodSearchSchema, nutritionDaySchema, nutritionProfileSchema, saveFoodEntrySchema,
  saveUserFoodSchema, updateFoodEntrySchema, type Food, type NutritionProfileDto, type SaveFoodEntry, type SaveUserFood } from '@campusflow/contracts';
import { diningVisible, localDateAt, roundNutrients, type DiningSetting, type Nutrients } from '@campusflow/domain';
import { z } from 'zod';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, lockAccountRecords, parseUuid } from './common';
import { searchUsda } from './integrations/food/usda-foods';
import { dishKey, dishName, estimateDish } from './integrations/dining/dining-dishes';
import type { ParsedMeal } from './integrations/dining/wagner';
import { PrismaService } from './prisma.service';

const nutrients = (row: Pick<EntryRow, 'kcal' | 'protein' | 'fat' | 'carbs' | 'fiber'>): Nutrients => roundNutrients({ kcal: row.kcal, protein: row.protein, fat: row.fat, carbs: row.carbs, fiber: row.fiber });
const entryDto = (row: EntryRow) => foodEntrySchema.parse({ id: row.id, date: row.date, meal: row.meal, name: row.name, grams: row.grams, nutrients: nutrients(row),
  source: row.source, sourceRef: row.sourceRef, createdAt: row.createdAt.toISOString() });
const profileDto = (row: ProfileRow) => nutritionProfileSchema.parse({ sex: row.sex, birthYear: row.birthYear, heightCm: row.heightCm, activity: row.activity, goal: row.goal,
  overrides: row.overrides ?? null, diningHall: row.diningHall });
const ownFood = (row: FoodRow): Food => foodSchema.parse({ id: `own:${row.id}`, name: row.name, source: 'own', per100: row.per100, portions: row.portions });
const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Calorie and macro diary, goals and the Augustana dining hall (ADR 023). */
@Controller('nutrition') @UseGuards(AuthGuard)
export class NutritionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('day/:date') @Header('Cache-Control', 'private, no-store')
  async day(@CurrentUser() user: RequestUser, @Param('date', new ZodPipe(dateSchema)) date: string) {
    const since = localDateAt(new Date(Date.now() - 45 * 86400_000).toISOString(), user.timeZone);
    const [profile, entries, history, weight, courses] = await Promise.all([
      this.prisma.nutritionProfile.findUnique({ where: { userId: user.id } }),
      this.prisma.foodLogEntry.findMany({ where: { userId: user.id, date }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.foodLogEntry.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 400 }),
      this.prisma.bodyWeightEntry.findFirst({ where: { userId: user.id }, orderBy: { date: 'desc' } }),
      this.prisma.course.findMany({ where: { userId: user.id, active: true }, select: { code: true, name: true } }),
    ]);
    // Recent foods: what the student actually eats, with their usual portion first.
    const groups = new Map<string, { row: EntryRow; count: number }>();
    for (const row of history) {
      if (row.source === 'dining') continue;
      const key = `${row.source}:${row.sourceRef ?? row.name.toLowerCase()}`, group = groups.get(key);
      if (group) group.count++; else groups.set(key, { row, count: 1 });
    }
    const recent = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20).map(({ row }) => foodSchema.parse({
      id: row.sourceRef ?? `quick:${row.name.toLowerCase().slice(0, 100)}`, name: row.name, source: row.source === 'quick' ? 'quick' : row.source,
      per100: roundNutrients({ kcal: row.kcal / row.grams * 100, protein: row.protein / row.grams * 100, fat: row.fat / row.grams * 100, carbs: row.carbs / row.grams * 100, fiber: row.fiber / row.grams * 100 }),
      portions: [{ label: 'Usual portion', grams: row.grams }] }));
    const setting = (profile?.diningHall ?? 'auto') as DiningSetting;
    return nutritionDaySchema.parse({ accountId: user.id, timeZone: user.timeZone, date, capturedAt: new Date().toISOString(), profile: profile ? profileDto(profile) : null,
      latestWeightKg: weight ? Math.round((weight.unit === 'lb' ? weight.weight / 2.20462 : weight.weight) * 10) / 10 : null,
      diningAvailable: diningVisible(setting, courses.flatMap(course => [course.code, course.name])), entries: entries.map(entryDto), recent });
  }

  @Put('profile') @Header('Cache-Control', 'private, no-store')
  async saveProfile(@CurrentUser() user: RequestUser, @Body(new ZodPipe(nutritionProfileSchema)) body: NutritionProfileDto) {
    const data = { ...body, overrides: body.overrides ? json(body.overrides) : undefined };
    return profileDto(await this.prisma.nutritionProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data },
      update: { ...data, overrides: body.overrides ? json(body.overrides) : { set: null } as never } }));
  }

  @Get('foods') @Header('Cache-Control', 'private, no-store')
  async search(@CurrentUser() user: RequestUser, @Query('q', new ZodPipe(z.string().trim().max(80).default(''))) query: string) {
    const own = await this.prisma.userFood.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } });
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const mine = own.map(ownFood).filter(food => terms.every(term => food.name.toLowerCase().includes(term)));
    return foodSearchSchema.parse({ query, foods: [...mine.slice(0, 10), ...(terms.length ? searchUsda(query, 30) : [])].slice(0, 40) });
  }
  @Post('foods') @Header('Cache-Control', 'private, no-store')
  async createFood(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveUserFoodSchema)) body: SaveUserFood) {
    if (await this.prisma.userFood.count({ where: { userId: user.id } }) >= 300) throw new BadRequestException('You can keep up to 300 foods.');
    return ownFood(await this.prisma.userFood.create({ data: { userId: user.id, name: body.name, per100: json(body.per100), portions: json(body.portions) } }));
  }
  @Delete('foods/:id') @Header('Cache-Control', 'private, no-store')
  async deleteFood(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    if (!(await this.prisma.userFood.deleteMany({ where: { id, userId: user.id } })).count) throw new NotFoundException('Food not found.');
    return { deleted: true };
  }

  @Post('entries') @Header('Cache-Control', 'private, no-store')
  async addEntry(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveFoodEntrySchema)) body: SaveFoodEntry) {
    const { requestKey, nutrients: values, ...fields } = body;
    this.notFuture(user, body.date);
    return this.prisma.$transaction(async tx => {
      await lockAccountRecords(tx, user.id);
      const existing = await tx.foodLogEntry.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey } } });
      if (existing) {
        if (existing.name !== body.name || existing.grams !== body.grams || existing.date !== body.date) throw new ConflictException('This save key belongs to another food.');
        return entryDto(existing);
      }
      if (await tx.foodLogEntry.count({ where: { userId: user.id, date: body.date } }) >= 300) throw new BadRequestException('This day already has 300 foods.');
      return entryDto(await tx.foodLogEntry.create({ data: { ...fields, ...values, requestKey, userId: user.id } }));
    });
  }
  @Patch('entries/:id') @Header('Cache-Control', 'private, no-store')
  async updateEntry(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string, @Body(new ZodPipe(updateFoodEntrySchema)) body: z.infer<typeof updateFoodEntrySchema>) {
    const { nutrients: values, ...fields } = body;
    if (!(await this.prisma.foodLogEntry.updateMany({ where: { id, userId: user.id }, data: { ...fields, ...values } })).count) throw new NotFoundException('Food not found.');
    return entryDto(await this.prisma.foodLogEntry.findUniqueOrThrow({ where: { id } }));
  }
  @Delete('entries/:id') @Header('Cache-Control', 'private, no-store')
  async deleteEntry(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string) {
    if (!(await this.prisma.foodLogEntry.deleteMany({ where: { id, userId: user.id } })).count) throw new NotFoundException('Food not found.');
    return { deleted: true };
  }
  /** Repeats a meal (for example yesterday's breakfast) as new diary lines. */
  @Post('entries/copy') @Header('Cache-Control', 'private, no-store')
  async copyMeal(@CurrentUser() user: RequestUser, @Body(new ZodPipe(copyMealSchema)) body: z.infer<typeof copyMealSchema>) {
    this.notFuture(user, body.toDate);
    const source = await this.prisma.foodLogEntry.findMany({ where: { userId: user.id, date: body.fromDate, meal: body.fromMeal }, orderBy: { createdAt: 'asc' } });
    if (!source.length) throw new BadRequestException('That meal has nothing to copy.');
    await this.prisma.foodLogEntry.createMany({ data: source.map(({ id, createdAt: _createdAt, requestKey, date: _date, meal: _meal, ...row }) => ({ ...row, date: body.toDate, meal: body.toMeal,
      requestKey: `copy-${createHash('sha256').update(`${requestKey}:${body.toDate}:${body.toMeal}:${Date.now()}:${id}`).digest('hex').slice(0, 40)}` })) });
    return { copied: source.length };
  }

  /** The Augustana menu with per-serving estimates. Estimates are recomputed at read time from the stored menu. */
  @Get('dining/:date') @Header('Cache-Control', 'private, max-age=300')
  async dining(@Param('date', new ZodPipe(dateSchema)) date: string) {
    const day = await this.prisma.diningMenuDay.findUnique({ where: { date } });
    const meals = (day?.meals ?? []) as unknown as ParsedMeal[];
    return diningMenuSchema.parse({ date, published: day?.published ?? false, fetchedAt: day?.fetchedAt.toISOString() ?? null, error: day?.error ?? null,
      meals: meals.map(meal => ({ meal: meal.meal, label: meal.label, start: meal.start, end: meal.end, stations: meal.stations.filter(station => station.items.length).map(station => ({
        label: station.label, dishes: station.items.map(item => { const name = dishName(item.name, station.label), estimate = estimateDish(name, item.kcal);
          return { key: dishKey(name), name, siteKcal: item.kcal, kind: estimate.kind, serving: estimate.serving, meat: estimate.meat, rest: estimate.rest, estimated: true }; }),
      })) })) });
  }

  private notFuture(user: RequestUser, date: string) {
    if (date > localDateAt(new Date().toISOString(), user.timeZone)) throw new BadRequestException('Choose today or an earlier day.');
  }
}
