import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { MessagingCredentialsModule } from './messaging-credentials.module';
import { MessagingIntegrationsController } from './messaging-integrations.controller';
@Module({
  imports: [AuthModule, CommunicationModule, MessagingCredentialsModule],
  controllers: [MessagingIntegrationsController],
})
export class MessagingIntegrationsModule {}
