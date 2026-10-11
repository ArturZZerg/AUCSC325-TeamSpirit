// Self-service web sessions live only in this tab's memory. A reload requires sign-in.
let value: string | null = null;
export const sessionStorage = {
  read: async () => value,
  write: async (next: string) => { value = next; },
  clear: async () => { value = null; },
};
