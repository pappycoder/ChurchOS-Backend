import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('dead-letter')
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor() {
    super();
  }

  async process(
    job: Job<{ queue: string; jobId: string; failedReason: string; data: unknown }>,
  ): Promise<void> {
    const { queue, jobId, failedReason, data } = job.data;

    this.logger.error(
      `Dead letter: queue=${queue} jobId=${jobId} reason=${failedReason} data=${JSON.stringify(data)}`,
    );
  }
}
