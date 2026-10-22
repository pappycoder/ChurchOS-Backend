import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyEmailService } from './company-email.service';
@Module({
  imports: [CommunicationModule],
  providers: [CompanyEmailService],
  exports: [CompanyEmailService],
})
export class CompanyEmailModule {}
