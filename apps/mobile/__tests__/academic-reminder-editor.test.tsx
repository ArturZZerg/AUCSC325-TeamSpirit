import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AcademicReminderEditor } from '../src/features/academic-reminder-editor';
import { useAcademicReminder, useAction } from '../src/features/queries';
import { essay } from './academic-fixture';
jest.mock('../src/features/queries', () => ({ useAcademicReminder: jest.fn(), useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn(); const close = jest.fn(); const refetch = jest.fn();
function show(overrides = {}) {
  jest.mocked(useAcademicReminder).mockReturnValue({ data: { academicItemId: essay.id, leadMinutes: null }, isLoading: false, refetch, ...overrides } as unknown as ReturnType<typeof useAcademicReminder>);
}
beforeEach(() => { jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); show();
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
describe('Relative academic reminder editor (ToR 10, 13)', () => {
  it.each([['At the deadline', 0], ['1 hour before', 60], ['1 day before', 1440], ['2 days before', 2880]])('saves %s as explicit relative intent', async (label, value) => {
    render(<AcademicReminderEditor item={essay} onClose={close}/>);
    fireEvent.press(screen.getByRole('radio', { name: String(label) }));
    await act(async () => fireEvent.press(screen.getByText('Save reminder')));
    expect(save).toHaveBeenCalledWith({ path: `/academic-items/${essay.id}/reminder`, method: 'PUT', body: { leadMinutes: value } });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('clears a configured reminder with explicit null', async () => {
    show({ data: { academicItemId: essay.id, leadMinutes: 1440 } }); render(<AcademicReminderEditor item={essay} onClose={close}/>);
    fireEvent.press(screen.getByRole('radio', { name: 'No reminder' })); await act(async () => fireEvent.press(screen.getByText('Save reminder')));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: { leadMinutes: null } }));
  });
  it('preserves a configured lead time outside the presets', async () => {
    show({ data: { academicItemId: essay.id, leadMinutes: 90 } }); render(<AcademicReminderEditor item={essay} onClose={close}/>);
    expect(screen.getByText(/Current reminder: 90 minutes/)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Save reminder')));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: { leadMinutes: 90 } }));
  });
  it('keeps a failed save and selected lead for retry', async () => {
    save.mockRejectedValueOnce(new Error('Network unavailable')); render(<AcademicReminderEditor item={essay} onClose={close}/>);
    fireEvent.press(screen.getByRole('radio', { name: '1 hour before' })); await act(async () => fireEvent.press(screen.getByText('Save reminder')));
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'); expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '1 hour before', checked: true })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Save reminder'))); expect(close).toHaveBeenCalledTimes(1);
  });
  it('blocks rapid saves, option changes and dismissal until the write ends', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<AcademicReminderEditor item={essay} onClose={close}/>);
    const button = screen.getByText('Save reminder'); act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '1 day before' })).toBeDisabled();
    await act(async () => resolve()); expect(close).toHaveBeenCalledTimes(1);
  });
  it('cannot overwrite a reminder whose configuration has not loaded', () => {
    show({ data: undefined, error: new Error('Offline') }); render(<AcademicReminderEditor item={essay} onClose={close}/>);
    expect(screen.getByRole('button', { name: 'Save reminder' })).toBeDisabled();
    expect(screen.queryByRole('radio')).toBeNull(); fireEvent.press(screen.getByText('Retry loading')); expect(refetch).toHaveBeenCalled();
  });
  it('explains why an untimed deadline or finished work cannot deliver', () => {
    render(<AcademicReminderEditor item={{ ...essay, submissionState: 'submitted' }} onClose={close}/>);
    expect(screen.getByText(/This item has no timed deadline/)).toBeOnTheScreen();
    expect(screen.getByText('Finished coursework does not send reminders.')).toBeOnTheScreen();
  });
});
