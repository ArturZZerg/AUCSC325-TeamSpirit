import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppErrorScreen } from '../src/features/app-error';

it('offers retry and a way home without showing error details', () => {
  const retry = jest.fn(), home = jest.fn();
  render(<AppErrorScreen onRetry={retry} onHome={home}/>);
  expect(screen.getByText('Something went wrong.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' })); expect(retry).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Go to Today' })); expect(home).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/TypeError|undefined is not/)).toBeNull();
});

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Stack: () => null, useGlobalSearchParams: () => ({}), useRouter: () => ({ replace: jest.fn() }), useSegments: () => [] }));
it('wires the root error boundary to retry and to Today', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ErrorBoundary } = require('../app/_layout') as typeof import('../app/_layout');
  const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
  const retry = jest.fn().mockResolvedValue(undefined);
  render(<ErrorBoundary error={new Error('private detail')} retry={retry}/>);
  expect(screen.queryByText(/private detail/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Go to Today' }));
  expect(router.replace).toHaveBeenCalledWith('/today'); expect(retry).toHaveBeenCalledTimes(1);
});
