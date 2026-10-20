import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FlutterwaveService } from '../giving/services/flutterwave.service';
import { workersEnabled } from '../queues/workers-enabled';
import { BillingService } from './billing.service';

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private running = false;
  private cursor = '';
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly flutterwave: FlutterwaveService,
  ) {}

  @Cron('0 */2 * * * *')
  async reconcile(): Promise<void> {
    if (!workersEnabled() || !this.flutterwave.isConfigured() || this.running) return;
    this.running = true;
    try {
      // Keyset pagination rotates through every candidate without starving newer
      // payments behind abandoned checkouts. Failed attempts can later succeed.
      const payments = await this.prisma.subscriptionPayment.findMany({
        where: {
          gateway: 'flutterwave',
          status: { in: ['pending', 'failed'] },
          created_at: { gte: new Date(Date.now() - 7 * 86400000) },
          ...(this.cursor ? { reference: { gt: this.cursor } } : {}),
        },
        orderBy: { reference: 'asc' },
        take: 25,
        select: { reference: true, church_id: true },
      });
      this.cursor = payments.length === 25 ? payments[payments.length - 1].reference : '';
      for (const payment of payments) {
        try {
          await this.billing.reconcilePayment(payment.church_id, payment.reference);
        } catch {
          this.logger.warn('Subscription payment reconciliation will retry');
        }
      }
    } catch {
      this.logger.warn('Subscription payment recovery scan will retry');
    } finally {
      this.running = false;
    }
  }
}
