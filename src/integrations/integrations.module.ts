import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { GivingModule } from '../giving/giving.module';
import { EventsModule } from '../events/events.module';
import { CallsController } from './calls.controller';
import { IntegrationCallbacksController } from './integration-callbacks.controller';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationAccountsModule } from './integration-accounts.module';
import { IntegrationsController } from './integrations.controller';
@Module({
  imports: [AuthModule, IntegrationAccountsModule, WhatsAppModule, GivingModule, EventsModule],
  controllers: [
    IntegrationsController,
    IntegrationCallbacksController,
    PaymentCallbacksController,
    CallsController,
  ],
})
export class IntegrationsModule {}
