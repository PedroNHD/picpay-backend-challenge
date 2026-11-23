import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthorizerService } from './authorizer.service';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TransfersController],
  providers: [TransfersService, AuthorizerService],
})
export class TransfersModule {}
