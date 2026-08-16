/**
 * @file dead-letter.processor.spec.ts
 * @description Unit tests for DeadLetterProcessor.
 *
 * @module test/unit/queues/dead-letter.processor.spec
 */

import { DeadLetterProcessor } from '../../../src/queues/processors/dead-letter.processor';

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;

  beforeEach(() => {
    processor = new DeadLetterProcessor();
  });

  describe('process', () => {
    it('should consume dead-letter jobs without throwing', async () => {
      const job = {
        data: {
          queue: 'whatsapp-outbound',
          jobId: 'job-123',
          failedReason: 'HTTP 500',
          data: { to: '+2348000000000' },
        },
      } as never;

      await expect(processor.process(job)).resolves.toBeUndefined();
    });
  });
});
