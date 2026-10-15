import { useState, type PropsWithChildren } from 'react';
import { Button, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AcademicItemEditor } from '../src/features/academic-item-editor';
import { useAcademic } from '../src/features/queries';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { readCache, writeCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { AcademicItem, Session } from '../src/lib/types';
import { courses, essay } from './academic-fixture';
import { accountId } from './snapshot-fixture';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
const session: Session = { accessToken: 'academic-edit-test', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: accountId, email: 'academic-edit@example.test', displayName: 'Student', timeZone: 'America/Edmonton', createdAt: essay.updatedAt,
} };
let serverItem: AcademicItem;
let listUnavailable: boolean;
const patches: unknown[] = [];
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
function Coursework() {
  const query = useAcademic();
  const [editing, setEditing] = useState<AcademicItem>();
  return <>
    {query.error && <Text>Coursework could not refresh</Text>}
    {query.data?.map(item => <Button key={item.id} title={`Edit ${item.title}`} onPress={() => setEditing(item)}/>)}
    {editing && <AcademicItemEditor item={editing} courses={courses} timeZone={session.user.timeZone}
      onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)}/>}
  </>;
}
beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { gcTime: Infinity } });
  useSessionStore.setState({ session, ready: true });
  serverItem = { ...essay, source: 'manual' }; listUnavailable = false; patches.length = 0;
  jest.mocked(readCache).mockResolvedValue(undefined); jest.mocked(writeCache).mockResolvedValue(undefined);
  jest.mocked(api).mockReset().mockImplementation(async (path, init) => {
    if (path === '/academic-items') {
      if (listUnavailable) throw new Error('Offline refresh');
      return [{ ...serverItem }];
    }
    if (path === `/academic-items/${essay.id}` && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)); patches.push(body);
      serverItem = { ...serverItem, ...body }; return serverItem;
    }
    throw new Error(`Unexpected academic test endpoint: ${path}`);
  });
});
afterEach(() => queryClient.clear());
it('keeps an acknowledged title after failed list refresh and a deadline-only edit of the cached row', async () => {
  render(<Coursework/>, { wrapper: Wrapper });
  await screen.findByText(`Edit ${essay.title}`);
  fireEvent.press(screen.getByText(`Edit ${essay.title}`));
  fireEvent.changeText(screen.getByLabelText('Coursework title'), 'Acknowledged title');
  listUnavailable = true;
  await act(async () => fireEvent.press(screen.getByText('Save coursework')));
  await screen.findByText('Coursework could not refresh');
  expect(serverItem.title).toBe('Acknowledged title');
  expect(screen.queryByLabelText('Coursework title')).toBeNull();
  fireEvent.press(screen.getByText(`Edit ${essay.title}`));
  expect(screen.getByLabelText('Coursework title')).toHaveDisplayValue(essay.title);
  fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
  await act(async () => fireEvent.press(screen.getByText('Save coursework')));
  await waitFor(() => expect(patches).toHaveLength(2));
  expect(patches).toEqual([{ title: 'Acknowledged title' }, { due: { kind: 'date', date: '2025-03-10' } }]);
  expect(serverItem).toMatchObject({ title: 'Acknowledged title', due: { kind: 'date', date: '2025-03-10' }, courseId: essay.courseId, submissionState: 'unsubmitted' });
});
it('keeps a server deadline and course changed while the student edits only a title', async () => {
  render(<Coursework/>, { wrapper: Wrapper });
  fireEvent.press(await screen.findByText(`Edit ${essay.title}`));
  fireEvent.changeText(screen.getByLabelText('Coursework title'), 'My revised title');
  serverItem = { ...serverItem, due: { kind: 'instant', at: '2025-03-12T08:30:42Z' }, courseId: null, kind: 'quiz' };
  await act(async () => fireEvent.press(screen.getByText('Save coursework')));
  expect(patches).toEqual([{ title: 'My revised title' }]);
  expect(serverItem).toMatchObject({ title: 'My revised title', due: { kind: 'instant', at: '2025-03-12T08:30:42Z' }, courseId: null, kind: 'quiz' });
});
