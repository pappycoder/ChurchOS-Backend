/**
 * @file giving.service.spec.ts
 * @description Unit tests for GivingService.
 *
 * Tests category CRUD, digital payment initialization/verification,
 * webhook handling, cash/bank recording, transaction queries, and
 * receipt generation. Supports multiple payment gateways.
 *
 * @module test/unit/giving/giving.service.spec
 * @since 1.0.0
 */

import { GivingService } from '../../../src/giving/giving.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { PaymentGatewayProvider } from '../../../src/giving/services/payment-gateway.interface';
import { ReceiptService } from '../../../src/giving/services/receipt.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('GivingService', () => {
  let service: GivingService;
  let prisma: Record<string, unknown> & { $transaction: jest.Mock };
  let audit: { log: jest.Mock };
  let paystack: Record<string, jest.Mock>;
  let flutterwave: Record<string, jest.Mock>;
  let gatewayRegistry: Map<string, PaymentGatewayProvider>;
  let receipt: Record<string, jest.Mock>;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockCategoryId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const mockTransactionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const mockBranchId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const mockMemberId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  function createPrismaMock() {
    const models: Record<string, Record<string, jest.Mock>> = {};
    const $transactionMock = jest.fn();

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === '$transaction') return $transactionMock;
        if (!models[prop]) {
          models[prop] = {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          };
        }
        return models[prop];
      },
    };

    return new Proxy(
      { $transaction: $transactionMock } as Record<string, unknown>,
      handler,
    ) as Record<string, unknown> & { $transaction: jest.Mock };
  }

  function model(name: string): Record<string, jest.Mock> {
    return prisma[name] as Record<string, jest.Mock>;
  }

  function createGatewayMock(): Record<string, jest.Mock> {
    return {
      isConfigured: jest.fn().mockReturnValue(true),
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      validateWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookEvent: jest.fn(),
      mapChannelToPaymentMethod: jest.fn().mockReturnValue('card'),
      mapEventToStatus: jest.fn(),
    };
  }

  const mockCategory = {
    id: mockCategoryId,
    church_id: mockChurchId,
    name: 'Tithe',
    description: 'Regular tithe',
    display_order: 1,
    is_recurring: true,
    is_active: true,
    created_at: new Date('2026-07-01T10:00:00.000Z'),
    updated_at: new Date('2026-07-01T10:00:00.000Z'),
  };

  const mockTransaction = {
    id: mockTransactionId,
    church_id: mockChurchId,
    branch_id: mockBranchId,
    member_id: mockMemberId,
    category_id: mockCategoryId,
    amount: 10000,
    currency: 'NGN',
    type: 'digital',
    status: 'success',
    payment_reference: 'TITHSEED123abc',
    payment_gateway: 'paystack',
    payment_method: 'card',
    receipt_number: '2026/TIT/0001',
    receipt_url: null,
    notes: null,
    created_at: new Date('2026-07-20T10:00:00.000Z'),
    updated_at: new Date('2026-07-20T10:00:00.000Z'),
    category: { name: 'Tithe' },
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    paystack = createGatewayMock();
    flutterwave = createGatewayMock();

    gatewayRegistry = new Map([
      ['paystack', paystack as unknown as PaymentGatewayProvider],
      ['flutterwave', flutterwave as unknown as PaymentGatewayProvider],
    ]);

    receipt = {
      generateReceipt: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      getCategoryPrefix: jest.fn().mockReturnValue('TIT'),
      generateReceiptNumber: jest.fn().mockReturnValue('2026/TIT/0001'),
    };

    service = new GivingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
      gatewayRegistry,
      receipt as unknown as ReceiptService,
      {
        createNotification: jest.fn().mockResolvedValue({}),
        broadcastToChurch: jest.fn().mockResolvedValue({ sent: 0 }),
      } as never,
    );
  });

  // ─── CATEGORY CRUD ────────────────────────────────────────────────

  describe('createCategory', () => {
    it('should create a new category', async () => {
      model('givingCategory').findFirst.mockResolvedValue(null);
      model('givingCategory').create.mockResolvedValue(mockCategory);

      const result = await service.createCategory(
        { name: 'Tithe', description: 'Regular tithe' },
        mockChurchId,
        mockUserId,
      );

      expect(result.name).toBe('Tithe');
      expect(result.categoryId).toBe(mockCategoryId);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'giving_category', action: 'CREATE' }),
      );
    });

    it('should throw ConflictException if category name exists', async () => {
      model('givingCategory').findFirst.mockResolvedValue(mockCategory);

      await expect(
        service.createCategory({ name: 'Tithe' }, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listCategories', () => {
    it('should return all categories', async () => {
      model('givingCategory').findMany.mockResolvedValue([mockCategory]);

      const result = await service.listCategories(mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tithe');
    });

    it('should filter by isActive', async () => {
      model('givingCategory').findMany.mockResolvedValue([]);

      await service.listCategories(mockChurchId, true);

      expect(model('givingCategory').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_active: true }),
        }),
      );
    });
  });

  describe('getCategoryById', () => {
    it('should return category by ID', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);

      const result = await service.getCategoryById(mockCategoryId, mockChurchId);

      expect(result.name).toBe('Tithe');
    });

    it('should throw NotFoundException if not found', async () => {
      model('givingCategory').findUnique.mockResolvedValue(null);

      await expect(service.getCategoryById('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if belongs to another church', async () => {
      model('givingCategory').findUnique.mockResolvedValue({
        ...mockCategory,
        church_id: 'other-church',
      });

      await expect(service.getCategoryById(mockCategoryId, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateCategory', () => {
    it('should update category fields', async () => {
      model('givingCategory').findUnique.mockResolvedValueOnce(mockCategory);
      model('givingCategory').update.mockResolvedValue({
        ...mockCategory,
        name: 'Updated Tithe',
      });

      const result = await service.updateCategory(
        mockCategoryId,
        { name: 'Updated Tithe' },
        mockChurchId,
        mockUserId,
      );

      expect(result.name).toBe('Updated Tithe');
    });

    it('should throw NotFoundException if not found', async () => {
      model('givingCategory').findUnique.mockResolvedValue(null);

      await expect(
        service.updateCategory(mockCategoryId, { name: 'X' }, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new name conflicts', async () => {
      model('givingCategory').findUnique.mockResolvedValueOnce(mockCategory);
      model('givingCategory').findFirst.mockResolvedValueOnce({ id: 'other', name: 'Offering' });

      await expect(
        service.updateCategory(mockCategoryId, { name: 'Offering' }, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should return existing if no fields provided', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);

      const result = await service.updateCategory(mockCategoryId, {}, mockChurchId, mockUserId);

      expect(result.name).toBe('Tithe');
      expect(model('givingCategory').update).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('should soft-delete category', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);
      model('givingCategory').update.mockResolvedValue({});

      await service.deleteCategory(mockCategoryId, mockChurchId, mockUserId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'giving_category', action: 'DELETE' }),
      );
    });

    it('should throw NotFoundException if not found', async () => {
      model('givingCategory').findUnique.mockResolvedValue(null);

      await expect(
        service.deleteCategory(mockCategoryId, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── DIGITAL GIVING (PAYSTACK) ────────────────────────────────────

  describe('initializePayment (paystack)', () => {
    it('should initialize a payment via paystack', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);
      model('church').findUnique.mockResolvedValue({
        id: mockChurchId,
        config: { default_payment_gateway: 'paystack' },
      });
      model('transaction').create.mockResolvedValue({
        ...mockTransaction,
        status: 'pending',
      });
      paystack.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/abc',
        accessCode: 'abc',
        reference: 'TITHSEED123abc',
      });

      const result = await service.initializePayment(
        { categoryId: mockCategoryId, amount: 10000, email: 'test@example.com' },
        mockChurchId,
        mockUserId,
      );

      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
      expect(result.gateway).toBe('paystack');
    });

    it('should use gateway from DTO when provided', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);
      model('transaction').create.mockResolvedValue({
        ...mockTransaction,
        payment_gateway: 'flutterwave',
        status: 'pending',
      });
      flutterwave.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.flutterwave.com/abc',
        reference: 'TITHSEED123abc',
      });

      const result = await service.initializePayment(
        {
          categoryId: mockCategoryId,
          amount: 10000,
          email: 'test@example.com',
          gateway: 'flutterwave',
        },
        mockChurchId,
        mockUserId,
      );

      expect(result.authorizationUrl).toBe('https://checkout.flutterwave.com/abc');
      expect(result.gateway).toBe('flutterwave');
    });

    it('should throw NotFoundException if category not found', async () => {
      model('givingCategory').findUnique.mockResolvedValue(null);

      await expect(
        service.initializePayment(
          { categoryId: 'nonexistent', amount: 10000, email: 'test@example.com' },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if category is inactive', async () => {
      model('givingCategory').findUnique.mockResolvedValue({
        ...mockCategory,
        is_active: false,
      });

      await expect(
        service.initializePayment(
          { categoryId: mockCategoryId, amount: 10000, email: 'test@example.com' },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if gateway not configured', async () => {
      paystack.isConfigured.mockReturnValue(false);

      await expect(
        service.initializePayment(
          {
            categoryId: mockCategoryId,
            amount: 10000,
            email: 'test@example.com',
            gateway: 'paystack',
          },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyPayment', () => {
    it('should return existing successful transaction', async () => {
      model('transaction').findFirst.mockResolvedValue(mockTransaction);

      const result = await service.verifyPayment('TITHSEED123abc', mockChurchId);

      expect(result.status).toBe('success');
      expect(paystack.verifyTransaction).not.toHaveBeenCalled();
    });

    it('should verify pending transaction with correct gateway', async () => {
      const pendingTransaction = { ...mockTransaction, status: 'pending' };
      model('transaction').findFirst.mockResolvedValue(pendingTransaction);
      paystack.verifyTransaction.mockResolvedValue({
        amount: 10000,
        status: 'success',
        paidAt: '2026-07-20T10:00:00.000Z',
        channel: 'card',
        customerEmail: 'test@example.com',
      });
      model('transaction').update.mockResolvedValue({
        ...mockTransaction,
        status: 'success',
      });

      const result = await service.verifyPayment('TITHSEED123abc', mockChurchId);

      expect(result.status).toBe('success');
      expect(paystack.verifyTransaction).toHaveBeenCalledWith('TITHSEED123abc');
    });

    it('should verify with flutterwave when transaction gateway is flutterwave', async () => {
      const pendingTransaction = {
        ...mockTransaction,
        status: 'pending',
        payment_gateway: 'flutterwave',
      };
      model('transaction').findFirst.mockResolvedValue(pendingTransaction);
      flutterwave.verifyTransaction.mockResolvedValue({
        amount: 10000,
        status: 'success',
        paidAt: '2026-07-20T10:00:00.000Z',
        channel: 'card',
        customerEmail: 'test@example.com',
      });
      model('transaction').update.mockResolvedValue({
        ...mockTransaction,
        status: 'success',
      });

      const result = await service.verifyPayment('TITHSEED123abc', mockChurchId);

      expect(result.status).toBe('success');
      expect(flutterwave.verifyTransaction).toHaveBeenCalledWith('TITHSEED123abc');
      expect(paystack.verifyTransaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if transaction not found', async () => {
      model('transaction').findFirst.mockResolvedValue(null);

      await expect(service.verifyPayment('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── WEBHOOK HANDLING ────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('should process charge.success event from paystack', async () => {
      paystack.parseWebhookEvent.mockReturnValue({
        event: 'charge.success',
        reference: 'TITHSEED123abc',
        channel: 'card',
      });
      paystack.mapEventToStatus.mockReturnValue('success');

      const pendingTransaction = { ...mockTransaction, status: 'pending' };
      model('transaction').findFirst.mockResolvedValue(pendingTransaction);
      model('transaction').update.mockResolvedValue({
        ...mockTransaction,
        status: 'success',
      });

      const result = await service.handleWebhook(
        JSON.stringify({ event: 'charge.success', data: {} }),
        'valid-signature',
        'paystack',
      );

      expect(result.processed).toBe(true);
    });

    it('should process charge.completed event from flutterwave', async () => {
      flutterwave.parseWebhookEvent.mockReturnValue({
        event: 'charge.completed',
        reference: 'TITHSEED123abc',
        channel: 'card',
      });
      flutterwave.mapEventToStatus.mockReturnValue('success');

      const pendingTransaction = {
        ...mockTransaction,
        status: 'pending',
        payment_gateway: 'flutterwave',
      };
      model('transaction').findFirst.mockResolvedValue(pendingTransaction);
      model('transaction').update.mockResolvedValue({
        ...mockTransaction,
        status: 'success',
      });

      const result = await service.handleWebhook(
        JSON.stringify({ event: 'charge.completed', data: {} }),
        'valid-signature',
        'flutterwave',
      );

      expect(result.processed).toBe(true);
    });

    it('should reject invalid webhook signature', async () => {
      paystack.validateWebhookSignature.mockReturnValue(false);

      await expect(service.handleWebhook('{}', 'invalid-signature', 'paystack')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip non-charge events', async () => {
      paystack.parseWebhookEvent.mockReturnValue({
        event: 'invoice.created',
        reference: '',
      });

      const result = await service.handleWebhook(
        JSON.stringify({ event: 'invoice.created', data: {} }),
        'sig',
        'paystack',
      );

      expect(result.processed).toBe(false);
    });

    it('should be idempotent for terminal states', async () => {
      paystack.parseWebhookEvent.mockReturnValue({
        event: 'charge.success',
        reference: 'TITHSEED123abc',
        channel: 'card',
      });
      paystack.mapEventToStatus.mockReturnValue('success');

      model('transaction').findFirst.mockResolvedValue(mockTransaction);

      const result = await service.handleWebhook(
        JSON.stringify({ event: 'charge.success', data: {} }),
        'sig',
        'paystack',
      );

      expect(result.processed).toBe(true);
      expect(model('transaction').update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for unknown gateway', async () => {
      await expect(service.handleWebhook('{}', 'sig', 'unknown')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── CASH/BANK GIVING ────────────────────────────────────────────

  describe('recordCashGiving', () => {
    it('should record cash giving with manual gateway', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);
      model('transaction').count.mockResolvedValue(0);
      model('transaction').create.mockResolvedValue({
        ...mockTransaction,
        type: 'cash',
        status: 'success',
        payment_gateway: 'manual',
      });

      const result = await service.recordCashGiving(
        { categoryId: mockCategoryId, amount: 5000, type: 'cash' },
        mockChurchId,
        mockUserId,
      );

      expect(result.status).toBe('success');
      expect(result.type).toBe('cash');
    });

    it('should record bank transfer giving', async () => {
      model('givingCategory').findUnique.mockResolvedValue(mockCategory);
      model('transaction').count.mockResolvedValue(0);
      model('transaction').create.mockResolvedValue({
        ...mockTransaction,
        type: 'bank_transfer',
        status: 'success',
        payment_gateway: 'manual',
      });

      const result = await service.recordCashGiving(
        { categoryId: mockCategoryId, amount: 25000, type: 'bank_transfer' },
        mockChurchId,
        mockUserId,
      );

      expect(result.status).toBe('success');
    });

    it('should throw NotFoundException if category not found', async () => {
      model('givingCategory').findUnique.mockResolvedValue(null);

      await expect(
        service.recordCashGiving(
          { categoryId: 'nonexistent', amount: 1000, type: 'cash' },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if category is inactive', async () => {
      model('givingCategory').findUnique.mockResolvedValue({
        ...mockCategory,
        is_active: false,
      });

      await expect(
        service.recordCashGiving(
          { categoryId: mockCategoryId, amount: 1000, type: 'cash' },
          mockChurchId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── TRANSACTION QUERIES ─────────────────────────────────────────

  describe('listTransactions', () => {
    it('should return paginated transactions', async () => {
      model('transaction').findMany.mockResolvedValue([mockTransaction]);
      model('transaction').count.mockResolvedValue(1);

      const result = await service.listTransactions(mockChurchId, {});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply category filter', async () => {
      model('transaction').findMany.mockResolvedValue([]);
      model('transaction').count.mockResolvedValue(0);

      await service.listTransactions(mockChurchId, { categoryId: mockCategoryId });

      expect(model('transaction').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category_id: mockCategoryId }),
        }),
      );
    });

    it('should apply gateway filter', async () => {
      model('transaction').findMany.mockResolvedValue([]);
      model('transaction').count.mockResolvedValue(0);

      await service.listTransactions(mockChurchId, { gateway: 'flutterwave' });

      expect(model('transaction').findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment_gateway: 'flutterwave' }),
        }),
      );
    });

    it('should apply custom pagination', async () => {
      model('transaction').findMany.mockResolvedValue([]);
      model('transaction').count.mockResolvedValue(0);

      await service.listTransactions(mockChurchId, { page: 2, limit: 5 });

      expect(model('transaction').findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction by ID', async () => {
      model('transaction').findUnique.mockResolvedValue(mockTransaction);

      const result = await service.getTransactionById(mockTransactionId, mockChurchId);

      expect(result.transactionId).toBe(mockTransactionId);
    });

    it('should throw NotFoundException if not found', async () => {
      model('transaction').findUnique.mockResolvedValue(null);

      await expect(service.getTransactionById('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if belongs to another church', async () => {
      model('transaction').findUnique.mockResolvedValue({
        ...mockTransaction,
        church_id: 'other-church',
      });

      await expect(service.getTransactionById(mockTransactionId, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── RECEIPTS ─────────────────────────────────────────────────────

  describe('generateReceipt', () => {
    it('should generate a PDF receipt', async () => {
      model('transaction').findUnique.mockResolvedValue(mockTransaction);
      model('church').findUnique.mockResolvedValue({
        id: mockChurchId,
        name: 'Grace Community Church',
        address: '12 Allen Avenue',
      });
      model('member').findUnique.mockResolvedValue({
        id: mockMemberId,
        first_name: 'Adebayo',
        last_name: 'Ogundimu',
        email: 'adebayo@example.com',
      });

      const result = await service.generateReceipt(mockTransactionId, mockChurchId);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('receipt-');
      expect(receipt.generateReceipt).toHaveBeenCalled();
    });

    it('should throw NotFoundException if transaction not found', async () => {
      model('transaction').findUnique.mockResolvedValue(null);

      await expect(service.generateReceipt('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-successful transaction', async () => {
      model('transaction').findUnique.mockResolvedValue({
        ...mockTransaction,
        status: 'pending',
      });

      await expect(service.generateReceipt(mockTransactionId, mockChurchId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
