-- Incomplete bounds already meant disabled. Preserve that behavior while making
-- existing records valid under the paired notification-preference contract.
UPDATE "NotificationPreference"
SET "quietHoursStart" = NULL, "quietHoursEnd" = NULL
WHERE ("quietHoursStart" IS NULL) <> ("quietHoursEnd" IS NULL);
