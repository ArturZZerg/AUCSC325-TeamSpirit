import { ApiError } from '../src/lib/api';

describe('API errors', () => {
  it('retains the HTTP status for an actionable offline/auth boundary', () => {
    const error = new ApiError(401, 'Session expired');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
  });
});
