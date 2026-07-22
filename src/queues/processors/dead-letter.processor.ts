import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('dead-letter')
export class DeadLetterProcessor {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  @Process('handle')
  async handleDeadLetter(
    job: Job<{ queue: string; jobId: string; failedReason: string; data: unknown }>,
  ): Promise<void> {
    const { queue, jobId, failedReason, data } = job.data;

    this.logger.error(
      `Dead letter: queue=${queue} jobId=${jobId} reason=${failedReason} data=${JSON.stringify(data)}`,
    );
  }
}
