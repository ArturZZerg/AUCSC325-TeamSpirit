import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Campus from '../app/(tabs)/campus';
import { useAction, useEvents } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { eventFixture } from './event-fixture';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useEvents: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const first = { accessToken: 'first', user: { id: 'one', timeZone: 'America/Edmonton' } };
const second = { accessToken: 'second', user: { id: 'two', timeZone: 'UTC' } };
const save = jest.fn();
function session(value: typeof first | null) {
  jest.mocked(useSessionStore).mockImplementation(select => select({ session: value } as ReturnType<typeof useSessionStore.getState>));
}
beforeEach(() => {
  jest.clearAllMocks(); session(first); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useEvents).mockReturnValue({ data: [eventFixture()], isLoading: false, refetch: jest.fn() } as unknown as ReturnType<typeof useEvents>);
});

describe('Campus session boundaries (ToR 11, 19)', () => {
  it('clears search on account switch, sign-out, and returning to an earlier account', () => {
    const view = render(<Campus/>);
    fireEvent.changeText(screen.getByLabelText('Filter events'), 'Private search');
    session(second); view.rerender(<Campus/>);
    expect(screen.getByLabelText('Filter events')).toHaveDisplayValue('');
    expect(screen.getByText(eventFixture().title)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Filter events'), 'Second search');
    session(null); view.rerender(<Campus/>);
    expect(screen.getByLabelText('Filter events')).toHaveDisplayValue('');
    session(first); view.rerender(<Campus/>);
    expect(screen.getByLabelText('Filter events')).toHaveDisplayValue('');
  });

  it('dismisses a private reminder draft before the next session can submit it', () => {
    const view = render(<Campus/>);
    fireEvent.press(screen.getByText('Set reminder'));
    fireEvent.press(screen.getByRole('radio', { name: 'Choose date and time' }));
    fireEvent.changeText(screen.getByLabelText('Reminder date'), '2030-03-08');
    session(second); view.rerender(<Campus/>);
    expect(screen.queryByText('Event reminder')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Set reminder'));
    expect(screen.getByText(/One reminder at/)).toHaveTextContent(/UTC/);
    fireEvent.press(screen.getByRole('radio', { name: 'Choose date and time' }));
    expect(screen.getByLabelText('Reminder date')).not.toHaveDisplayValue('2030-03-08');
  });

  it('keeps an old write failure from appearing or disabling the new account', async () => {
    let reject!: (reason: Error) => void;
    save.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const view = render(<Campus/>);
    fireEvent.press(screen.getByText('Remove saved'));
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
    session(second); view.rerender(<Campus/>);
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeEnabled();
    await act(async () => { reject(new Error('Private old-account failure')); });
    expect(screen.queryByText('Private old-account failure')).toBeNull();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeEnabled();
  });

  it('discards drafts on a new login to the same account', () => {
    const view = render(<Campus/>);
    fireEvent.changeText(screen.getByLabelText('Filter events'), 'Private search');
    session({ ...first, accessToken: 'new-login' }); view.rerender(<Campus/>);
    expect(screen.getByLabelText('Filter events')).toHaveDisplayValue('');
  });
});
