/**
 * @file giving.module.ts
 * @description Giving module for categories, transactions, and receipts.
 *
 * Registers payment gateway providers (Paystack, Flutterwave) and creates
 * a gateway registry map used by GivingService for gateway-agnostic processing.
 *
 * @module giving/giving.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GivingController } from './giving.controller';
import { GivingService } from './giving.service';
import { PaystackService } from './services/paystack.service';
import { FlutterwaveService } from './services/flutterwave.service';
import { ReceiptService } from './services/receipt.service';
import { PaymentGatewayProvider, PAYMENT_GATEWAY_REGISTRY } from './services/payment-gateway.interface';

/**
 * Giving module providing category management, payment processing,
 * transaction recording, and PDF receipt generation.
 */
@Module({
  imports: [AuthModule],
  controllers: [GivingController],
  providers: [
    GivingService,
    PaystackService,
    FlutterwaveService,
    ReceiptService,
    {
      provide: PAYMENT_GATEWAY_REGISTRY,
      useFactory: (
        paystack: PaystackService,
        flutterwave: FlutterwaveService,
      ): Map<string, PaymentGatewayProvider> => {
        const registry = new Map<string, PaymentGatewayProvider>();
        registry.set('paystack', paystack);
        registry.set('flutterwave', flutterwave);
        return registry;
      },
      inject: [PaystackService, FlutterwaveService],
    },
  ],
  exports: [GivingService],
})
export class GivingModule {}
