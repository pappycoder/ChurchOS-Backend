import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController, BillingWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaystackService } from '../giving/services/paystack.service';
import { FlutterwaveService } from '../giving/services/flutterwave.service';
@Module({
  imports: [AuthModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, PaystackService, FlutterwaveService],
})
export class BillingModule {}
