import { AccountEmailService } from './account-email.service';
import { StaffInvitationService } from './staff-invitation.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyEmailService } from './company-email.service';
@Module({
  imports: [CommunicationModule, SupabaseModule],
  providers: [CompanyEmailService, StaffInvitationService, AccountEmailService],
  exports: [CompanyEmailService, StaffInvitationService, AccountEmailService],
})
export class CompanyEmailModule {}
