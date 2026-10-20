import { PaymentReconciliationService } from '../../../src/billing/payment-reconciliation.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { BillingService } from '../../../src/billing/billing.service';
import { FlutterwaveService } from '../../../src/giving/services/flutterwave.service';
import { workersEnabled } from '../../../src/queues/workers-enabled';
jest.mock('../../../src/queues/workers-enabled', () => ({ workersEnabled: jest.fn(() => true) }));

describe('subscription payment recovery', () => {
  const findMany = jest.fn();
  const reconcilePayment = jest.fn();
  const isConfigured = jest.fn();
  let recovery: PaymentReconciliationService;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(workersEnabled).mockReturnValue(true);
    isConfigured.mockReturnValue(true);
    findMany.mockResolvedValue([]);
    reconcilePayment.mockResolvedValue(undefined);
    recovery = new PaymentReconciliationService(
      { subscriptionPayment: { findMany } } as unknown as PrismaService,
      { reconcilePayment } as unknown as BillingService,
      { isConfigured } as unknown as FlutterwaveService,
    );
  });
  it('rechecks pending and previously failed attempts through the same tenant-scoped verifier', async () => {
    findMany.mockResolvedValue([
      { reference: 'payment-a', church_id: 'church-a' },
      { reference: 'payment-b', church_id: 'church-b' },
    ]);
    reconcilePayment.mockRejectedValueOnce(new Error('provider unavailable'));
    await recovery.reconcile();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gateway: 'flutterwave',
          status: { in: ['pending', 'failed'] },
        }),
        take: 25,
      }),
    );
    expect(reconcilePayment).toHaveBeenNthCalledWith(1, 'church-a', 'payment-a');
    expect(reconcilePayment).toHaveBeenNthCalledWith(2, 'church-b', 'payment-b');
  });
  it('rotates bounded batches instead of repeatedly checking only the oldest payments', async () => {
    findMany.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({ reference: `reference-${i}`, church_id: 'c' })),
    );
    await recovery.reconcile();
    await recovery.reconcile();
    expect(findMany.mock.calls[1][0].where.reference).toEqual({ gt: 'reference-24' });
    await recovery.reconcile();
    expect(findMany.mock.calls[2][0].where).not.toHaveProperty('reference');
  });
  it('does not overlap scans and remains usable after a database failure', async () => {
    let finish!: () => void;
    findMany.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = recovery.reconcile();
    await recovery.reconcile();
    expect(findMany).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await recovery.reconcile();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
  it('does not run on HTTP-only serverless instances or without platform credentials', async () => {
    jest.mocked(workersEnabled).mockReturnValue(false);
    await recovery.reconcile();
    jest.mocked(workersEnabled).mockReturnValue(true);
    isConfigured.mockReturnValue(false);
    await recovery.reconcile();
    expect(findMany).not.toHaveBeenCalled();
  });
});
