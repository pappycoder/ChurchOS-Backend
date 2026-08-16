/**
 * @file recurring-giving.processor.spec.ts
 * @description Unit tests for RecurringGivingProcessor.
 *
 * @module test/unit/queues/recurring-giving.processor.spec
 * @since 1.0.0
 */

import { RecurringGivingProcessor } from '../../../src/queues/processors/recurring-giving.processor';
import { GivingService } from '../../../src/giving/giving.service';

describe('RecurringGivingProcessor', () => {
  let processor: RecurringGivingProcessor;
  let givingService: { processRecurringCharge: jest.Mock };

  beforeEach(() => {
    givingService = { processRecurringCharge: jest.fn() };
    processor = new RecurringGivingProcessor(givingService as unknown as GivingService);
  });

  describe('process', () => {
    it('should delegate to GivingService.processRecurringCharge', async () => {
      givingService.processRecurringCharge.mockResolvedValue(true);

      const job = {
        name: 'charge',
        data: {
          recurringGivingId: 'rrr-rrrr-rrrr-rrrr',
          churchId: 'ccc-cccc-cccc-cccc',
        },
      } as never;

      const result = await processor.process(job);

      expect(result).toBe(true);
      expect(givingService.processRecurringCharge).toHaveBeenCalledWith(
        'rrr-rrrr-rrrr-rrrr',
        'ccc-cccc-cccc-cccc',
      );
    });

    it('should return false when charge fails', async () => {
      givingService.processRecurringCharge.mockResolvedValue(false);

      const job = {
        name: 'charge',
        data: {
          recurringGivingId: 'rrr-rrrr-rrrr-rrrr',
          churchId: 'ccc-cccc-cccc-cccc',
        },
      } as never;

      const result = await processor.process(job);

      expect(result).toBe(false);
    });
  });
});
