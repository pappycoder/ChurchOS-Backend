import { of, firstValueFrom } from 'rxjs';
import { CacheVersionInterceptor } from '../../../src/common/interceptors/cache-version.interceptor';
import type { ExecutionContext } from '@nestjs/common';
import type { RedisService } from '../../../src/redis/redis.service';

describe('Assistant is not a business mutation', () => {
  it.each([
    ['/api/v1/assistant/message', false],
    ['/api/v1/members', true],
    ['/api/v1/assistant/message/other', true],
  ])('invalidates only actual mutation routes: %s', async (url, invalidates) => {
    const set = jest.fn().mockResolvedValue(undefined);
    const interceptor = new CacheVersionInterceptor({ set } as unknown as RedisService);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: url,
          profile: { church_id: 'church-a' },
        }),
      }),
    } as unknown as ExecutionContext;
    await firstValueFrom(interceptor.intercept(context, { handle: () => of({ ok: true }) }));
    expect(set).toHaveBeenCalledTimes(invalidates ? 1 : 0);
  });
});
