import { QueryClient } from '@tanstack/react-query';

// Session cleanup must use the same client as the application provider.
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
