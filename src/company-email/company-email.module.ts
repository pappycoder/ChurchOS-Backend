import { StaffInvitationService } from './staff-invitation.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyEmailService } from './company-email.service';
@Module({
  imports: [CommunicationModule, SupabaseModule],
  providers: [CompanyEmailService, StaffInvitationService],
  exports: [CompanyEmailService, StaffInvitationService],
})
export class CompanyEmailModule {}
