import { Module } from '@nestjs/common';
import { IntegrationAccountsService } from './integration-accounts.service';
import { ProviderTransportService } from './provider-transport.service';
@Module({
  providers: [IntegrationAccountsService, ProviderTransportService],
  exports: [IntegrationAccountsService, ProviderTransportService],
})
export class IntegrationAccountsModule {}
