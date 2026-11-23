import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  NOTIFICATIONS_QUEUE,
  NotificationProcessor,
} from './notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [NotificationProcessor],
  exports: [BullModule],
})
export class NotificationsModule {}
