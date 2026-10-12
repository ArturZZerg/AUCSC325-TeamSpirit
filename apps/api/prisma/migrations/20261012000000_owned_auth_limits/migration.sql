ALTER TABLE "RecoveryRateBucket" ADD COLUMN "userId" UUID;
CREATE INDEX "RecoveryRateBucket_userId_idx" ON "RecoveryRateBucket"("userId");
ALTER TABLE "RecoveryRateBucket" ADD CONSTRAINT "RecoveryRateBucket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
