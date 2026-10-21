import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CanvasConnectionStatus } from '@campusflow/contracts';
import CanvasScreen from '../app/canvas';
import { useAction } from '../src/features/queries';
import { api, ApiError } from '../src/lib/api';

const save = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: 'token', user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');

const token = 'canvas-personal-token-0123456789abcdef';
const status = (fields: Partial<CanvasConnectionStatus> = {}): CanvasConnectionStatus => ({ connected: false, connectMode: 'token', baseUrl: null,
  externalAccountId: null, lastSuccessfulSyncAt: null, lastSyncAttemptAt: null, lastError: null, ...fields });
const view = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CanvasScreen/></QueryClientProvider>);
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset();
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>);
});

it('shows the token guide and connects, then runs the first sync', async () => {
  jest.mocked(api).mockResolvedValue(status());
  save.mockResolvedValueOnce(status({ connected: true, baseUrl: 'https://school.instructure.com' }))
    .mockResolvedValueOnce({ startedAt: '2026-10-20T10:00:00.000Z', finishedAt: '2026-10-20T10:00:02.000Z', coursesUpdated: 3, academicItemsUpdated: 1, eventsUpdated: 0, status: 'succeeded' });
  view();
  expect(await screen.findByText('How to get your access token')).toBeOnTheScreen();
  expect(screen.getByText(/New Access Token/)).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Canvas address'), 'school.instructure.com');
  fireEvent.changeText(screen.getByLabelText('Access token'), token);
  fireEvent.press(screen.getByText('Connect Canvas'));
  expect(await screen.findByText('Connected. Synced 3 courses and 1 assignment.')).toBeOnTheScreen();
  expect(save.mock.calls.map(([request]) => request.path)).toEqual(['/canvas/connect', '/canvas/sync']);
  expect(save.mock.calls[0][0].body).toEqual({ baseUrl: 'school.instructure.com', accessToken: token });
});

it('shows a rejected token message without syncing', async () => {
  jest.mocked(api).mockResolvedValue(status());
  save.mockRejectedValueOnce(new ApiError(400, 'Canvas didn’t accept this access token. Create a new token in Canvas and connect again.'));
  view();
  fireEvent.changeText(await screen.findByLabelText('Canvas address'), 'school.instructure.com');
  fireEvent.changeText(screen.getByLabelText('Access token'), token);
  fireEvent.press(screen.getByText('Connect Canvas'));
  expect(await screen.findByText(/didn’t accept this access token/)).toBeOnTheScreen();
  expect(save).toHaveBeenCalledTimes(1);
});

it('offers sync and disconnect for a connected account and shows the last error', async () => {
  jest.mocked(api).mockResolvedValue(status({ connected: true, baseUrl: 'https://school.instructure.com', lastError: 'Canvas couldn’t be reached. Try again in a moment.' }));
  save.mockResolvedValueOnce(status());
  view();
  expect(await screen.findByText('Connected to school.instructure.com')).toBeOnTheScreen();
  expect(screen.getByText('Canvas couldn’t be reached. Try again in a moment.')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Disconnect Canvas'));
  expect(await screen.findByText(/Canvas disconnected/)).toBeOnTheScreen();
  expect(save.mock.calls[0][0]).toMatchObject({ path: '/canvas/connection', method: 'DELETE' });
});
