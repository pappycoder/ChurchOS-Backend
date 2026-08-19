/**
 * @file request-context.service.spec.ts
 * @description Unit tests for RequestContextService.
 *
 * @module test/unit/common/request-context.service.spec
 * @since 1.0.0
 */

import {
  RequestContextService,
  RequestContextData,
} from '../../../src/common/services/request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  describe('getStore', () => {
    it('should return undefined outside of a request context', () => {
      const ctx = service.getStore();
      expect(ctx).toBeUndefined();
    });
  });

  describe('run', () => {
    it('should store and retrieve context within run()', async () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'church_admin',
      };

      const result = await service.run(context, () => {
        return service.getStore();
      });

      expect(result).toEqual(context);
    });

    it('should return the callback return value', async () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'member',
      };

      const result = await service.run(context, () => {
        return { computed: true };
      });

      expect(result).toEqual({ computed: true });
    });

    it('should support nested run() calls with different contexts', async () => {
      const outerContext: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'church_admin',
      };

      const innerContext: RequestContextData = {
        userId: 'user-2',
        churchId: 'church-2',
        role: 'member',
      };

      await service.run(outerContext, async () => {
        expect(service.getStore()?.userId).toBe('user-1');

        await service.run(innerContext, async () => {
          expect(service.getStore()?.userId).toBe('user-2');
        });

        // After inner run completes, should revert to outer context
        expect(service.getStore()?.userId).toBe('user-1');
      });
    });

    it('should handle async callbacks', async () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'member',
      };

      const result = await service.run(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return service.getStore();
      });

      expect(result?.userId).toBe('user-1');
    });

    it('should handle callbacks that throw errors', () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'member',
      };

      expect(() =>
        service.run(context, () => {
          throw new Error('Test error');
        }),
      ).toThrow('Test error');
    });

    it('should clear context after run completes', async () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-1',
        role: 'member',
      };

      await service.run(context, () => {
        expect(service.getStore()).toBeDefined();
      });

      expect(service.getStore()).toBeUndefined();
    });
  });

  describe('getChurchId', () => {
    it('should return churchId from context', async () => {
      const context: RequestContextData = {
        userId: 'user-1',
        churchId: 'church-123',
        role: 'member',
      };

      await service.run(context, () => {
        expect(service.getChurchId()).toBe('church-123');
      });
    });

    it('should throw when called outside context', () => {
      expect(() => service.getChurchId()).toThrow('RequestContext not available');
    });
  });

  describe('getUserId', () => {
    it('should return userId from context', async () => {
      const context: RequestContextData = {
        userId: 'user-456',
        churchId: 'church-1',
        role: 'member',
      };

      await service.run(context, () => {
        expect(service.getUserId()).toBe('user-456');
      });
    });

    it('should throw when called outside context', () => {
      expect(() => service.getUserId()).toThrow('RequestContext not available');
    });
  });
});
