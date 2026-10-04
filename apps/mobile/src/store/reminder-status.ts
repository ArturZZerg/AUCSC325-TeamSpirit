import { create } from 'zustand';

// Device reconciliation status is shared by automatic sync and Settings retry.
export const useReminderStatus = create<{ accountId?: string; error?: string }>(() => ({}));
