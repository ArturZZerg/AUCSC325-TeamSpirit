import { api, ApiError } from '../src/lib/api';

const realFetch = global.fetch;
// A fetch that never answers on its own and rejects like fetch when its signal aborts.
const hangingFetch = () => jest.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
}));
afterEach(() => { global.fetch = realFetch; jest.useRealTimers(); });

describe('API errors', () => {
  it('retains the HTTP status for an actionable offline/auth boundary', () => {
    const error = new ApiError(401, 'Session expired');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
  });

  it('turns a timeout into a connection error, so editors ask the student to check before retrying', async () => {
    jest.useFakeTimers();
    global.fetch = hangingFetch();
    const pending = api('/tasks');
    const assertion = expect(pending).rejects.toThrow(new TypeError('The request timed out.'));
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('lets a slow call such as Canvas sync wait longer than the default', async () => {
    jest.useFakeTimers();
    global.fetch = hangingFetch();
    let settled = false;
    const pending = api('/canvas/sync', { method: 'POST', timeoutMs: 60_000 }).finally(() => { settled = true; });
    pending.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });

  it('keeps a caller cancellation as an abort, not a timeout', async () => {
    const caller = new AbortController();
    global.fetch = hangingFetch();
    const pending = api('/tasks', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(jest.mocked(fetch).mock.calls[0][1]?.signal).not.toBe(caller.signal);
  });

  it('forwards the caller abort without AbortSignal.any and stops listening once settled', async () => {
    const any = AbortSignal.any;
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
    try {
      const caller = new AbortController();
      const remove = jest.spyOn(caller.signal, 'removeEventListener');
      global.fetch = hangingFetch();
      const pending = api('/tasks', { signal: caller.signal });
      caller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    } finally { Object.defineProperty(AbortSignal, 'any', { value: any, configurable: true }); }
  });
});
