import { fireEvent, render, screen } from '@testing-library/react-native';
import { FocusRecoveryCard } from '../src/features/focus-recovery-card';
import { focusOwner, useFocusStore } from '../src/store/focus';
import { useSessionStore } from '../src/store/session';
import { makeFocusDraft } from '../src/features/focus-recovery';
import type { Session } from '../src/lib/types';
jest.mock('../src/store/session', () => ({ useSessionStore: jest.requireActual('zustand').create(() => ({ session: null })) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
const session: Session = { accessToken: 'first', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'UTC', createdAt: '2026-10-07T00:00:00Z',
} };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); mockPush.mockClear(); useSessionStore.setState({ session }); useFocusStore.getState().clear(); });
afterEach(() => jest.useRealTimers());
it('links Today to private recovered work and shows only saved checkpoint time', () => {
  const owner = focusOwner(session)!; const store = useFocusStore.getState(); store.configure(owner, 25, null); store.start(owner);
  jest.setSystemTime(65_000); const draft = makeFocusDraft(useFocusStore.getState(), session.user.id, Date.now())!;
  jest.setSystemTime(7_200_000); store.recover(owner, draft); render(<FocusRecoveryCard/>);
  expect(screen.getByText(/1 min 5 sec kept on this device/)).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Recover my focus block')); expect(mockPush).toHaveBeenCalledWith('/focus');
});
it.each(['normal', 'saved', 'foreign', 'logout'])('hides recovery for %s state', kind => {
  if (kind !== 'normal') useFocusStore.setState({ owner: focusOwner(session), recoveredAt: 0, recorded: kind === 'saved' });
  if (kind === 'foreign') useFocusStore.setState({ owner: 'another-login' });
  if (kind === 'logout') useSessionStore.setState({ session: null });
  render(<FocusRecoveryCard/>); expect(screen.queryByText('Recover my focus block')).toBeNull();
});
