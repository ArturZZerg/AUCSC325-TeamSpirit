export const productionApiUrl: string;
export const updatesOrigin: string;
export function updatesConfig(env: Record<string, string | undefined>): { runtimeVersion: string; updates: Record<string, unknown> };
