import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  InternalServerErrorException,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  canvasConnectionStatusSchema,
  canvasSyncResultSchema,
} from "@campusflow/contracts";
import { AuthGuard, CurrentUser, RequestUser, ZodPipe } from "./common";
import { PrismaService } from "./prisma.service";

const SOURCE = "canvas";
const fixtureBaseUrl = "https://canvas.fixture.local";
const localConnectionSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    accessToken: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.baseUrl === undefined ||
      ["http:", "https:"].includes(new URL(value.baseUrl).protocol),
    "Canvas baseUrl must use HTTP or HTTPS",
  );

const fixtureCourses = [
  {
    id: 91001,
    name: "AUCSC 325 - Software Engineering",
    course_code: "AUCSC325",
    workflow_state: "available",
  },
  {
    id: 91002,
    name: "CMPUT 301 - Introduction to Software Engineering",
    course_code: "CMPUT301",
    workflow_state: "available",
  },
];
const fixtureAssignments: Record<number, Array<Record<string, unknown>>> = {
  91001: [
    {
      id: 92001,
      name: "Architecture decision record",
      due_at: "2026-10-10T23:59:00.000Z",
      submission_types: ["online_upload"],
    },
    {
      id: 92002,
      name: "Canvas integration demo",
      due_at: "2026-10-17T23:59:00.000Z",
      submission_types: ["online_text_entry"],
      submission: {
        submitted_at: "2026-10-02T18:00:00.000Z",
        workflow_state: "submitted",
      },
      has_submitted_submissions: true,
    },
  ],
  91002: [
    {
      id: 92003,
      name: "Sprint retrospective",
      due_at: "2026-10-12T16:00:00.000Z",
      submission_types: ["discussion_topic"],
    },
  ],
};

type CanvasCourse = {
  id: number;
  name?: string;
  course_code?: string;
  workflow_state?: string;
};
type CanvasAssignment = {
  id: number;
  name?: string;
  due_at?: string | null;
  submission_types?: string[];
  submission?: {
    submitted_at?: string | null;
    workflow_state?: string;
    score?: number | null;
  } | null;
  has_submitted_submissions?: boolean;
  missing_submissions?: boolean;
};

const configuredBaseUrl = (value?: string): string =>
  (
    value ??
    process.env.CANVAS_BASE_URL ??
    "https://canvas.ualberta.ca"
  ).replace(/\/$/, "");
const tokenKey = (): Buffer => {
  const value = process.env.CANVAS_TOKEN_ENCRYPTION_KEY;
  if (!value)
    throw new InternalServerErrorException(
      "Canvas token encryption is not configured",
    );
  const key = Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new InternalServerErrorException(
      "CANVAS_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  return key;
};
const encrypt = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ciphertext.toString("base64")}`;
};
const decrypt = (value: string): string => {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext)
    throw new InternalServerErrorException("Stored Canvas token is invalid");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

@Injectable()
export class CanvasService {
  constructor(private readonly prisma: PrismaService) {}
  private localModeEnabled(): boolean {
    return process.env.NODE_ENV !== "production";
  }
  private fixtureEnabled(): boolean {
    return this.localModeEnabled() && process.env.CANVAS_MODE === "fixture";
  }

  async connectLocal(
    user: RequestUser,
    input: z.infer<typeof localConnectionSchema>,
  ) {
    if (!this.localModeEnabled())
      throw new ForbiddenException(
        "Local Canvas connections are disabled in production",
      );
    const baseUrl = configuredBaseUrl(input.baseUrl);
    const accessToken = input.accessToken ?? process.env.CANVAS_ACCESS_TOKEN;
    if (!accessToken)
      throw new BadRequestException(
        "Provide accessToken or configure CANVAS_ACCESS_TOKEN",
      );
    const me = await this.request<{ id: string | number }>(
      "/api/v1/users/self",
      accessToken,
      baseUrl,
    );
    await this.prisma.canvasConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        baseUrl,
        externalAccountId: String(me.id),
        encryptedAccessToken: encrypt(accessToken),
        lastError: null,
      },
      update: {
        baseUrl,
        externalAccountId: String(me.id),
        encryptedAccessToken: encrypt(accessToken),
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        lastError: null,
      },
    });
    return {
      connected: true,
      baseUrl,
      externalAccountId: String(me.id),
      mode: "local-token" as const,
    };
  }

  async connectFixture(user: RequestUser) {
    if (!this.fixtureEnabled())
      throw new ForbiddenException("Canvas fixture mode is disabled");
    await this.prisma.canvasConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        baseUrl: fixtureBaseUrl,
        externalAccountId: `fixture-${user.id}`,
        encryptedAccessToken: "fixture",
      },
      update: {
        baseUrl: fixtureBaseUrl,
        externalAccountId: `fixture-${user.id}`,
        encryptedAccessToken: "fixture",
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        lastError: null,
      },
    });
    return { connected: true, mode: "fixture" as const };
  }

  async status(user: RequestUser) {
    const connection = await this.prisma.canvasConnection.findUnique({
      where: { userId: user.id },
    });
    return canvasConnectionStatusSchema.parse({
      connected: Boolean(connection),
      baseUrl: connection?.baseUrl ?? null,
      externalAccountId: connection?.externalAccountId ?? null,
      lastSuccessfulSyncAt:
        connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncAttemptAt: connection?.lastSyncAttemptAt?.toISOString() ?? null,
      lastError: connection?.lastError ?? null,
    });
  }

  async sync(user: RequestUser) {
    const startedAt = new Date();
    const connection = await this.prisma.canvasConnection.findUnique({
      where: { userId: user.id },
    });
    if (!connection) throw new BadRequestException("Canvas is not connected");
    await this.prisma.canvasConnection.update({
      where: { userId: user.id },
      data: { lastSyncAttemptAt: startedAt, lastError: null },
    });
    try {
      const fixture =
        this.fixtureEnabled() && connection.baseUrl === fixtureBaseUrl;
      const accessToken = fixture
        ? ""
        : decrypt(connection.encryptedAccessToken);
      const courses = (
        fixture
          ? fixtureCourses
          : await this.requestAll<CanvasCourse>(
              "/api/v1/courses?enrollment_state=active&per_page=100",
              accessToken,
              connection.baseUrl,
            )
      ).filter((course) => course.workflow_state !== "deleted");
      let academicItemsUpdated = 0;
      for (const course of courses) {
        const courseRecord = await this.prisma.course.upsert({
          where: {
            userId_source_externalId: {
              userId: user.id,
              source: SOURCE,
              externalId: String(course.id),
            },
          },
          create: {
            userId: user.id,
            source: SOURCE,
            externalId: String(course.id),
            name: course.name ?? `Course ${course.id}`,
            code: course.course_code ?? null,
          },
          update: {
            name: course.name ?? `Course ${course.id}`,
            code: course.course_code ?? null,
            active: true,
          },
        });
        const assignments = fixture
          ? ((fixtureAssignments[course.id] as CanvasAssignment[]) ?? [])
          : await this.requestAll<CanvasAssignment>(
              `/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100`,
              accessToken,
              connection.baseUrl,
            );
        for (const assignment of assignments) {
          const due = assignment.due_at
            ? { kind: "instant", at: new Date(assignment.due_at).toISOString() }
            : null;
          const submissionState =
            assignment.submission?.workflow_state === "graded" ||
            (assignment.submission?.score !== null &&
              assignment.submission?.score !== undefined)
              ? "graded"
              : assignment.submission?.submitted_at ||
                  assignment.has_submitted_submissions
                ? "submitted"
                : assignment.missing_submissions
                  ? "missing"
                  : "unsubmitted";
          await this.prisma.academicItem.upsert({
            where: {
              userId_source_externalId: {
                userId: user.id,
                source: SOURCE,
                externalId: String(assignment.id),
              },
            },
            create: {
              userId: user.id,
              courseId: courseRecord.id,
              source: SOURCE,
              externalId: String(assignment.id),
              title: assignment.name ?? `Assignment ${assignment.id}`,
              kind: this.assignmentKind(assignment),
              due: due ?? Prisma.JsonNull,
              submissionState,
            },
            update: {
              courseId: courseRecord.id,
              title: assignment.name ?? `Assignment ${assignment.id}`,
              kind: this.assignmentKind(assignment),
              due: due ?? Prisma.JsonNull,
              submissionState,
            },
          });
          academicItemsUpdated++;
        }
      }
      const finishedAt = new Date();
      await this.prisma.canvasConnection.update({
        where: { userId: user.id },
        data: { lastSuccessfulSyncAt: finishedAt, lastError: null },
      });
      return canvasSyncResultSchema.parse({
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        coursesUpdated: courses.length,
        academicItemsUpdated,
        eventsUpdated: 0,
        status: "succeeded",
      });
    } catch (error) {
      await this.prisma.canvasConnection.update({
        where: { userId: user.id },
        data: {
          lastError:
            error instanceof Error ? error.message : "Canvas sync failed",
        },
      });
      throw new ServiceUnavailableException("Canvas sync failed");
    }
  }

  private assignmentKind(
    assignment: CanvasAssignment,
  ): "assignment" | "quiz" | "discussion" {
    const types = assignment.submission_types ?? [];
    return types.some((type) => type.includes("discussion"))
      ? "discussion"
      : types.some((type) => type.includes("online_quiz"))
        ? "quiz"
        : "assignment";
  }
  private async request<T>(
    path: string,
    accessToken: string,
    baseUrl: string,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok)
      throw new Error(`Canvas request failed (${response.status})`);
    return response.json() as Promise<T>;
  }
  private async requestAll<T>(
    path: string,
    accessToken: string,
    baseUrl: string,
  ): Promise<T[]> {
    const result: T[] = [];
    let next: string | undefined = `${baseUrl}${path}`;
    while (next) {
      const response: Response = await fetch(next, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok)
        throw new Error(`Canvas request failed (${response.status})`);
      result.push(...((await response.json()) as T[]));
      next = response.headers.get("link")?.match(/<([^>]+)>; rel="next"/)?.[1];
    }
    return result;
  }
}

@Controller("canvas")
@UseGuards(AuthGuard)
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}
  @Get("status") status(@CurrentUser() user: RequestUser) {
    return this.canvas.status(user);
  }
  @Post("connect") connect(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(localConnectionSchema))
    body: z.infer<typeof localConnectionSchema>,
  ) {
    return this.canvas.connectLocal(user, body);
  }
  @Post("dev/connect") connectFixture(@CurrentUser() user: RequestUser) {
    return this.canvas.connectFixture(user);
  }
  @Post("sync") sync(@CurrentUser() user: RequestUser) {
    return this.canvas.sync(user);
  }
}
