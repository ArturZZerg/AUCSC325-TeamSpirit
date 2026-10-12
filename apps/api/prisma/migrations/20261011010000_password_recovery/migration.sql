CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

CREATE TABLE "RecoveryMail" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "recipientHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sealed" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryMail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryMail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecoveryMail_nextAttemptAt_leaseUntil_idx" ON "RecoveryMail"("nextAttemptAt", "leaseUntil");
CREATE INDEX "RecoveryMail_expiresAt_idx" ON "RecoveryMail"("expiresAt");
CREATE INDEX "RecoveryMail_recipientHash_idx" ON "RecoveryMail"("recipientHash");

CREATE TABLE "RecoveryRateBucket" (
  "key" TEXT NOT NULL,
  "recipientHash" TEXT,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryRateBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RecoveryRateBucket_expiresAt_idx" ON "RecoveryRateBucket"("expiresAt");
CREATE INDEX "RecoveryRateBucket_recipientHash_idx" ON "RecoveryRateBucket"("recipientHash");
