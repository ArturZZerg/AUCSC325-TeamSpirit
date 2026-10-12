import type { Prisma } from '@prisma/client';

// One atomic, UTC window implementation for recovery and authentication quotas.
// Callers commit the returned count before reporting a rejection.
export async function countRateBucket(tx: Prisma.TransactionClient, key: string, window: number,
  recipientHash: string | null = null, userId: string | null = null) {
  const [result] = await tx.$queryRaw<{ count: number }[]>`
    INSERT INTO "RecoveryRateBucket" ("key", "recipientHash", "userId", "count", "expiresAt")
    VALUES (${key}, ${recipientHash}, ${userId}::uuid, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${window} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RecoveryRateBucket"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
        ELSE LEAST("RecoveryRateBucket"."count", 2147483646) + 1 END,
      "expiresAt" = CASE WHEN "RecoveryRateBucket"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN EXCLUDED."expiresAt"
        ELSE "RecoveryRateBucket"."expiresAt" END
    RETURNING "count"`;
  return result.count;
}
