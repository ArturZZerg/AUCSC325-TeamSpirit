import { api, ApiError } from '../src/lib/api';

describe('API errors', () => {
  it('retains the HTTP status for an actionable offline/auth boundary', () => {
    const error = new ApiError(401, 'Session expired');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
  });

  it('aborts a request after the shared API timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = api('/tasks');
    const assertion = expect(pending).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    jest.useRealTimers();
  });

  it('forwards caller cancellation through the shared request signal', async () => {
    const caller = new AbortController();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = api('/tasks', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(jest.mocked(fetch).mock.calls[0][1]?.signal).not.toBe(caller.signal);
  });
});
