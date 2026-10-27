import { fireEvent, render, screen } from '@testing-library/react-native';
import { GradeWhatIf } from '../src/features/grade-what-if';

// Midterm 30% at 80, essays 20% at 90; quiz 10% and final 40% not graded yet.
const midterm = { id: '70000000-0000-4000-8000-000000000001', title: 'Midterm', weight: 30, score: 80 };
const essays = { id: '70000000-0000-4000-8000-000000000002', title: 'Essays', weight: 20, score: 90 };
const quiz = { id: '70000000-0000-4000-8000-000000000003', title: 'Quiz', weight: 10, score: null };
const final = { id: '70000000-0000-4000-8000-000000000004', title: 'Final exam', weight: 40, score: null };
const outline = [midterm, essays, quiz, final];
const score = (title: string) => screen.getByLabelText(`What-if score for ${title} (%)`);

it('offers inputs only for ungraded work and prompts before anything is tried', () => {
  render(<GradeWhatIf assessments={outline} target={80}/>);
  expect(score('Quiz')).toBeOnTheScreen(); expect(score('Final exam')).toBeOnTheScreen();
  expect(screen.queryByLabelText('What-if score for Midterm (%)')).toBeNull();
  expect(screen.getByText(/Type a score for any ungraded assessment/)).toBeOnTheScreen();
  expect(screen.getByText('Nothing here is saved.', { exact: false })).toBeOnTheScreen();
});

it('updates what is still needed after a partial guess, then projects the final grade', () => {
  render(<GradeWhatIf assessments={outline} target={80}/>);
  fireEvent.changeText(score('Quiz'), '100');
  expect(screen.getByText('Your grade so far would be 86.7%. You’d then need an average of 70% on the remaining 40%.')).toBeOnTheScreen();
  fireEvent.changeText(score('Final exam'), '75%');
  expect(screen.getByText('Your final grade would be 82%. That meets your 80% target.')).toBeOnTheScreen();
  fireEvent.changeText(score('Final exam'), '60');
  expect(screen.getByText('Your final grade would be 76%. That’s 4% short of your 80% target.')).toBeOnTheScreen();
});

it('fills the rest with the average needed so the projection lands on the target', () => {
  render(<GradeWhatIf assessments={outline} target={80}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Fill the rest with 76%' }));
  expect(score('Quiz')).toHaveDisplayValue('76'); expect(score('Final exam')).toHaveDisplayValue('76');
  expect(screen.getByText('Your final grade would be 80%. That meets your 80% target.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Fill the rest/ })).toBeNull();
});

it('flags out-of-range entries and leaves them out of the projection', () => {
  render(<GradeWhatIf assessments={outline} target={null}/>);
  fireEvent.changeText(score('Quiz'), '151');
  expect(screen.getByText('Enter 0 to 150.')).toBeOnTheScreen();
  expect(screen.getByText(/Type a score for any ungraded assessment/)).toBeOnTheScreen();
  fireEvent.changeText(score('Quiz'), '50');
  expect(screen.queryByText('Enter 0 to 150.')).toBeNull();
  expect(screen.getByText('Your grade so far would be 78.3%. You’d finish between 47% and 87%.')).toBeOnTheScreen();
});

it('explains secured and out-of-reach targets', () => {
  const { rerender } = render(<GradeWhatIf assessments={outline} target={50}/>);
  fireEvent.changeText(score('Quiz'), '100');
  expect(screen.getByText(/Your 50% target would be secured, even with 0% on the remaining 40%\./)).toBeOnTheScreen();
  rerender(<GradeWhatIf assessments={outline} target={95}/>);
  expect(screen.getByText(/Your 95% target would be out of reach: 100% on the rest gives 92%\./)).toBeOnTheScreen();
});

it('clears every what-if score', () => {
  render(<GradeWhatIf assessments={outline} target={80}/>);
  fireEvent.changeText(score('Quiz'), '90');
  fireEvent.press(screen.getByRole('button', { name: 'Clear what-if scores' }));
  expect(score('Quiz')).toHaveDisplayValue('');
  expect(screen.queryByRole('button', { name: 'Clear what-if scores' })).toBeNull();
});

it('ignores a guess once the real score is recorded', () => {
  const { rerender } = render(<GradeWhatIf assessments={outline} target={80}/>);
  fireEvent.changeText(score('Quiz'), '0');
  rerender(<GradeWhatIf assessments={[midterm, essays, { ...quiz, score: 100 }, final]} target={80}/>);
  expect(screen.queryByLabelText('What-if score for Quiz (%)')).toBeNull();
  expect(screen.getByText(/Type a score for any ungraded assessment/)).toBeOnTheScreen();
});

it('stays hidden when everything is graded', () => {
  render(<GradeWhatIf assessments={[midterm, essays]} target={80}/>);
  expect(screen.queryByText('What if…')).toBeNull();
});
