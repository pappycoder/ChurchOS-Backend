import { Logger, UnauthorizedException } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../../src/common/filters/global-exception.filter';

describe('Integration subscription credential privacy', () => {
  it('omits webhook verification tokens from error logs and response paths', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = {
      method: 'GET',
      url: '/api/v1/integrations/webhooks/account?hub.verify_token=private-token',
      headers: {},
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ status }) }),
    };
    new GlobalExceptionFilter().catch(
      new UnauthorizedException('Invalid subscription token'),
      host as never,
    );
    expect(JSON.stringify([errorLog.mock.calls, json.mock.calls])).not.toContain('private-token');
    expect(json.mock.calls[0][0].error.path).toBe('/api/v1/integrations/webhooks/account');
  });
});
