import { Module } from '@nestjs/common';
import { MessagingCredentialsService } from './messaging-credentials.service';
@Module({ providers: [MessagingCredentialsService], exports: [MessagingCredentialsService] })
export class MessagingCredentialsModule {}
