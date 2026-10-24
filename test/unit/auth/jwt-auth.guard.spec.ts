import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const payload = { sub: 'user', session_id: 'session' };
const context = () =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: 'Bearer token' }, verifiedJwt: payload }),
    }),
  }) as never;

describe('Parallel session checks', () => {
  it('starts independent checks together and waits for both approvals', async () => {
    const revoked = deferred<unknown>(),
      approved = deferred<void>();
    const redis = { get: jest.fn(() => revoked.promise) };
    const auth = { assertSession: jest.fn(() => approved.promise) };
    const guard = new JwtAuthGuard({} as never, redis as never, auth as never);
    let allowed = false;
    const attempt = guard.canActivate(context());
    const result = Promise.resolve(attempt).then((value) => {
      allowed = true;
      return value;
    });
    await Promise.resolve();
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(auth.assertSession).toHaveBeenCalledTimes(1);
    revoked.resolve(null);
    await Promise.resolve();
    expect(allowed).toBe(false);
    approved.resolve();
    expect(await result).toBe(true);
  });
  it('fails closed on Redis loss even when session approval succeeds', async () => {
    const guard = new JwtAuthGuard(
      {} as never,
      {
        get: async () => {
          throw new Error('unavailable');
        },
      } as never,
      { assertSession: async () => undefined } as never,
    );
    await expect(guard.canActivate(context())).rejects.toThrow(ServiceUnavailableException);
  });
  it('rejects revoked tokens and unapproved/MFA sessions', async () => {
    const auth = {
      assertSession: async () => {
        throw new UnauthorizedException('Session approval expired');
      },
    };
    const revoked = new JwtAuthGuard(
      {} as never,
      { get: async () => true } as never,
      auth as never,
    );
    await expect(revoked.canActivate(context())).rejects.toThrow('Token has been revoked');
    const unapproved = new JwtAuthGuard(
      {} as never,
      { get: async () => null } as never,
      auth as never,
    );
    await expect(unapproved.canActivate(context())).rejects.toThrow('Session approval expired');
  });
});
