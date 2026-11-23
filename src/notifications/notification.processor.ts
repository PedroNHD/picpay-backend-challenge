import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

export const NOTIFICATIONS_QUEUE = 'notifications';

export interface TransferNotificationJob {
  transactionId: string;
  payeeEmail: string;
  amountCents: number;
}

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly notifierUrl: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.notifierUrl =
      this.configService.get<string>('NOTIFIER_URL') ??
      'https://util.devi.tools/api/v1/notify';
  }

  async process(job: Job<TransferNotificationJob>): Promise<void> {
    const { transactionId, payeeEmail, amountCents } = job.data;

    const response = await fetch(this.notifierUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId,
        email: payeeEmail,
        message: `Você recebeu uma transferência de R$ ${(amountCents / 100).toFixed(2)}.`,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      this.logger.warn(
        `Notification failed for tx=${transactionId} (HTTP ${response.status}), attempt ${job.attemptsMade + 1}`,
      );
      throw new Error(`Notifier returned HTTP ${response.status}`);
    }

    this.logger.log(`Notification delivered for tx=${transactionId}`);
  }
}
