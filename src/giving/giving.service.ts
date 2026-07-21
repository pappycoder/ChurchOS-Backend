/**
 * @file giving.service.ts
 * @description Business logic for giving categories, transactions, and receipts.
 *
 * Handles category CRUD, digital payment initialization/verification,
 * cash/bank recording, webhook processing, and PDF receipt generation.
 * Supports multiple payment gateways via the PaymentGatewayProvider interface.
 *
 * @module giving/giving.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import {
  PaymentGatewayProvider,
  PAYMENT_GATEWAY_REGISTRY,
} from './services/payment-gateway.interface';
import { ReceiptService, ReceiptTransactionData } from './services/receipt.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { RecordCashDto } from './dto/record-cash.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { CreateRecurringGivingDto } from './dto/create-recurring-giving.dto';
import { RecurringGivingResponseDto } from './dto/recurring-giving-response.dto';
import { ListRecurringGivingDto } from './dto/list-recurring-giving.dto';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

/** Default payment gateway when church config does not specify one */
const DEFAULT_GATEWAY = 'paystack';

/**
 * Service for managing giving operations.
 * Provides category management, payment processing, transaction recording,
 * and receipt generation. Supports multiple payment gateways.
 */
@Injectable()
export class GivingService {
  private readonly logger = new Logger(GivingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
    @Inject(PAYMENT_GATEWAY_REGISTRY)
    private readonly gatewayRegistry: Map<string, PaymentGatewayProvider>,
    private readonly receipt: ReceiptService,
  ) {}

  /**
   * Resolves a payment gateway provider by name.
   *
   * @param gatewayName - The gateway identifier (e.g. 'paystack', 'flutterwave')
   * @returns The PaymentGatewayProvider instance
   * @throws BadRequestException if the gateway is not registered or not configured
   */
  private resolveGateway(gatewayName: string): PaymentGatewayProvider {
    const provider = this.gatewayRegistry.get(gatewayName);
    if (!provider) {
      throw new BadRequestException(
        `Payment gateway "${gatewayName}" is not available. Supported gateways: ${Array.from(this.gatewayRegistry.keys()).join(', ')}`,
      );
    }
    if (!provider.isConfigured()) {
      throw new BadRequestException(
        `Payment gateway "${gatewayName}" is not configured. Please check your environment variables.`,
      );
    }
    return provider;
  }

  /**
   * Gets the default payment gateway from church config.
   * Falls back to DEFAULT_GATEWAY if not configured.
   */
  private async getDefaultGateway(churchId: string): Promise<string> {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { config: true },
    });

    if (church?.config) {
      const config = church.config as Record<string, unknown>;
      if (typeof config.default_payment_gateway === 'string') {
        return config.default_payment_gateway;
      }
    }

    return DEFAULT_GATEWAY;
  }

  // ─── CATEGORY CRUD ────────────────────────────────────────────────

  /**
   * Creates a new giving category.
   */
  async createCategory(
    dto: CreateCategoryDto,
    churchId: string,
    userId: string,
  ): Promise<CategoryResponseDto> {
    const existing = await this.prisma.givingCategory.findFirst({
      where: { church_id: churchId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const category = await this.prisma.givingCategory.create({
      data: {
        church_id: churchId,
        name: dto.name,
        description: dto.description,
        display_order: dto.displayOrder ?? 0,
        is_recurring: dto.isRecurring ?? false,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'giving_category',
      action: 'CREATE',
      entityId: category.id,
      newValues: { name: dto.name },
    });

    this.logger.log(`Giving category created: ${category.id} (${dto.name})`);
    return this.mapCategoryToDto(category);
  }

  /**
   * Lists all giving categories for a church.
   */
  async listCategories(churchId: string, isActive?: boolean): Promise<CategoryResponseDto[]> {
    const where: Prisma.GivingCategoryWhereInput = { church_id: churchId };
    if (isActive !== undefined) {
      where.is_active = isActive;
    }

    const categories = await this.prisma.givingCategory.findMany({
      where,
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
    });

    return categories.map((c) => this.mapCategoryToDto(c));
  }

  /**
   * Gets a single giving category by ID.
   */
  async getCategoryById(categoryId: string, churchId: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.givingCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category || category.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    return this.mapCategoryToDto(category);
  }

  /**
   * Updates a giving category.
   */
  async updateCategory(
    categoryId: string,
    dto: UpdateCategoryDto,
    churchId: string,
    userId: string,
  ): Promise<CategoryResponseDto> {
    const existing = await this.prisma.givingCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.givingCategory.findFirst({
        where: { church_id: churchId, name: dto.name, id: { not: categoryId } },
      });
      if (duplicate) {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.displayOrder !== undefined) updateData.display_order = dto.displayOrder;
    if (dto.isRecurring !== undefined) updateData.is_recurring = dto.isRecurring;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    if (Object.keys(updateData).length === 0) {
      return this.mapCategoryToDto(existing);
    }

    const updated = await this.prisma.givingCategory.update({
      where: { id: categoryId },
      data: updateData,
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'giving_category',
      action: 'UPDATE',
      entityId: categoryId,
      newValues: updateData,
    });

    return this.mapCategoryToDto(updated);
  }

  /**
   * Soft-deletes a giving category (sets isActive to false).
   */
  async deleteCategory(categoryId: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.givingCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    await this.prisma.givingCategory.update({
      where: { id: categoryId },
      data: { is_active: false },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'giving_category',
      action: 'DELETE',
      entityId: categoryId,
      oldValues: { isActive: existing.is_active },
      newValues: { isActive: false },
    });

    this.logger.log(`Giving category deactivated: ${categoryId}`);
  }

  // ─── DIGITAL GIVING ──────────────────────────────────────────────

  /**
   * Initializes a digital payment via the configured gateway.
   *
   * Creates a pending transaction and returns an authorization URL.
   * Gateway is determined by DTO parameter or church config default.
   */
  async initializePayment(
    dto: InitializePaymentDto,
    churchId: string,
    userId: string,
  ): Promise<{
    authorizationUrl: string;
    reference: string;
    transactionId: string;
    gateway: string;
  }> {
    // Resolve which gateway to use
    const gatewayName = dto.gateway || (await this.getDefaultGateway(churchId));
    const provider = this.resolveGateway(gatewayName);

    // Verify category exists
    const category = await this.prisma.givingCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || category.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    if (!category.is_active) {
      throw new BadRequestException('This giving category is no longer active');
    }

    // Generate unique reference
    const reference = this.generatePaymentReference(category.name);

    // Create pending transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        church_id: churchId,
        branch_id: dto.branchId,
        member_id: dto.memberId,
        category_id: dto.categoryId,
        amount: dto.amount,
        currency: 'NGN',
        type: 'digital',
        status: 'pending',
        payment_reference: reference,
        payment_gateway: gatewayName as 'paystack' | 'flutterwave',
        notes: dto.notes,
        metadata: { payerEmail: dto.email },
      },
    });

    // Initialize payment with the resolved gateway
    const metadata = {
      transaction_id: transaction.id,
      church_id: churchId,
      category_id: dto.categoryId,
    };

    const result = await provider.initializeTransaction(dto.email, dto.amount, reference, metadata);

    await this.audit.log({
      userId,
      churchId,
      entity: 'transaction',
      action: 'CREATE',
      entityId: transaction.id,
      newValues: {
        amount: dto.amount,
        categoryId: dto.categoryId,
        reference,
        gateway: gatewayName,
      },
    });

    this.logger.log(`Payment initialized: ${reference} for NGN ${dto.amount} via ${gatewayName}`);

    return {
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
      transactionId: transaction.id,
      gateway: gatewayName,
    };
  }

  /**
   * Verifies a payment by reference.
   *
   * Routes to the correct gateway provider based on the transaction's
   * payment_gateway field.
   */
  async verifyPayment(reference: string, churchId: string): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { payment_reference: reference, church_id: churchId },
      include: { category: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // If already successful, return as-is
    if (transaction.status === 'success') {
      return this.mapTransactionToDto(transaction);
    }

    // Resolve gateway from the transaction's stored gateway
    const provider = this.gatewayRegistry.get(transaction.payment_gateway);
    if (!provider || !provider.isConfigured()) {
      this.logger.warn(
        `Gateway ${transaction.payment_gateway} not available for verification of ${reference}`,
      );
      return this.mapTransactionToDto(transaction);
    }

    try {
      const verification = await provider.verifyTransaction(reference);

      if (verification.status === 'success') {
        const paymentMethod = provider.mapChannelToPaymentMethod(verification.channel);
        const receiptNumber = await this.generateReceiptNumber(
          transaction.category?.name ?? '',
          churchId,
        );

        const updated = await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'success',
            payment_method: paymentMethod,
            receipt_number: receiptNumber,
          },
          include: { category: true },
        });

        return this.mapTransactionToDto(updated);
      }
    } catch (error) {
      this.logger.warn(
        `${transaction.payment_gateway} verification failed for ${reference}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.mapTransactionToDto(transaction);
  }

  // ─── WEBHOOK HANDLING ────────────────────────────────────────────

  /**
   * Processes a webhook event from a payment gateway.
   *
   * Validates the signature using the correct gateway provider,
   * parses the event, and updates the corresponding transaction.
   *
   * @param payload - Raw webhook body
   * @param signature - Webhook signature header value
   * @param gatewayName - Which gateway sent this webhook
   * @returns Whether the event was processed successfully
   */
  async handleWebhook(
    payload: string,
    signature: string,
    gatewayName: string,
  ): Promise<{ processed: boolean; event?: string }> {
    const provider = this.gatewayRegistry.get(gatewayName);
    if (!provider) {
      throw new BadRequestException(`Unknown gateway: ${gatewayName}`);
    }

    // Validate signature
    if (!provider.validateWebhookSignature(payload, signature)) {
      this.logger.warn(`Invalid webhook signature from ${gatewayName}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = provider.parseWebhookEvent(payload);

    // Only process charge events
    if (!event.event.startsWith('charge.') && !event.event.startsWith('chargecompleted')) {
      return { processed: false, event: event.event };
    }

    const status = provider.mapEventToStatus(event.event);
    if (!status) {
      return { processed: false, event: event.event };
    }

    // Find the transaction by payment reference
    const transaction = await this.prisma.transaction.findFirst({
      where: { payment_reference: event.reference },
      include: { category: true },
    });

    if (!transaction) {
      this.logger.warn(`Webhook: transaction not found for reference ${event.reference}`);
      return { processed: false, event: event.event };
    }

    // Idempotent — skip if already in terminal state
    if (transaction.status === 'success' || transaction.status === 'failed') {
      return { processed: true, event: event.event };
    }

    const paymentMethod = event.channel
      ? provider.mapChannelToPaymentMethod(event.channel)
      : undefined;

    const updateData: Prisma.TransactionUpdateInput = {
      status,
    };

    if (paymentMethod) {
      updateData.payment_method = paymentMethod;
    }

    // Generate receipt number on success
    if (status === 'success') {
      updateData.receipt_number = await this.generateReceiptNumber(
        transaction.category?.name ?? '',
        transaction.church_id,
      );
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    await this.audit.log({
      userId: 'webhook',
      churchId: transaction.church_id,
      entity: 'transaction',
      action: 'UPDATE',
      entityId: transaction.id,
      oldValues: { status: transaction.status },
      newValues: { status, paymentMethod },
    });

    this.logger.log(
      `Webhook processed (${gatewayName}): ${event.event} → ${status} (${event.reference})`,
    );

    // Capture authorization_code for recurring giving (Paystack charge.success)
    if (status === 'success' && event.authorizationCode && transaction.member_id) {
      await this.captureAuthorizationCode(
        transaction.church_id,
        transaction.member_id,
        transaction.category_id,
        event.authorizationCode,
      );
    }

    return { processed: true, event: event.event };
  }

  // ─── CASH/BANK GIVING ────────────────────────────────────────────

  /**
   * Records a cash or bank transfer giving transaction.
   *
   * Uses the 'manual' gateway since no external payment API is involved.
   */
  async recordCashGiving(
    dto: RecordCashDto,
    churchId: string,
    userId: string,
  ): Promise<TransactionResponseDto> {
    // Verify category exists
    const category = await this.prisma.givingCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || category.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    if (!category.is_active) {
      throw new BadRequestException('This giving category is no longer active');
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber(category.name, churchId);

    // Create transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        church_id: churchId,
        branch_id: dto.branchId,
        member_id: dto.memberId,
        category_id: dto.categoryId,
        amount: dto.amount,
        currency: dto.currency || 'NGN',
        type: dto.type,
        status: 'success', // Cash/bank is immediately confirmed
        payment_gateway: 'manual',
        receipt_number: receiptNumber,
        notes: dto.notes,
      },
      include: { category: true },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'transaction',
      action: 'CREATE',
      entityId: transaction.id,
      newValues: { amount: dto.amount, type: dto.type, categoryId: dto.categoryId },
    });

    this.logger.log(`Cash giving recorded: ${receiptNumber} for NGN ${dto.amount}`);

    return this.mapTransactionToDto(transaction);
  }

  // ─── TRANSACTION QUERIES ─────────────────────────────────────────

  /**
   * Lists transactions with pagination and filters.
   */
  async listTransactions(
    churchId: string,
    query: ListTransactionsDto,
  ): Promise<{ data: TransactionResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = { church_id: churchId };

    if (query.categoryId) where.category_id = query.categoryId;
    if (query.memberId) where.member_id = query.memberId;
    if (query.status) where.status = query.status as Prisma.EnumTransactionStatusFilter;
    if (query.type) where.type = query.type as Prisma.EnumTransactionTypeFilter;
    if (query.gateway)
      where.payment_gateway = query.gateway as 'paystack' | 'flutterwave' | 'manual';

    if (query.startDate || query.endDate) {
      where.created_at = {};
      if (query.startDate) where.created_at.gte = new Date(query.startDate);
      if (query.endDate) where.created_at.lte = new Date(query.endDate + 'T23:59:59.999Z');
    }

    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [];
    if (query.sortBy) {
      orderBy.push({ [query.sortBy]: (query.sortOrder || 'desc') as Prisma.SortOrder });
    } else {
      orderBy.push({ created_at: 'desc' });
    }

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { category: true },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: items.map((t) => this.mapTransactionToDto(t)),
      total,
    };
  }

  /**
   * Gets a single transaction by ID.
   */
  async getTransactionById(
    transactionId: string,
    churchId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { category: true },
    });

    if (!transaction || transaction.church_id !== churchId) {
      throw new NotFoundException('Transaction not found');
    }

    return this.mapTransactionToDto(transaction);
  }

  // ─── RECURRING GIVING ───────────────────────────────────────────

  /**
   * Creates a recurring giving schedule.
   *
   * The category must have is_recurring enabled. The authorization code
   * is captured from the first successful payment via webhook.
   */
  async createRecurringGiving(
    dto: CreateRecurringGivingDto,
    churchId: string,
    userId: string,
  ): Promise<RecurringGivingResponseDto> {
    const category = await this.prisma.givingCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || category.church_id !== churchId) {
      throw new NotFoundException('Giving category not found');
    }

    if (!category.is_active) {
      throw new BadRequestException('This giving category is no longer active');
    }

    if (!category.is_recurring) {
      throw new BadRequestException(
        'This category does not support recurring giving. Enable recurring in the category settings.',
      );
    }

    // Check for existing active recurring giving for this member+category
    if (dto.memberId) {
      const existing = await this.prisma.recurringGiving.findFirst({
        where: {
          church_id: churchId,
          member_id: dto.memberId,
          category_id: dto.categoryId,
          is_active: true,
        },
      });

      if (existing) {
        throw new ConflictException(
          'An active recurring giving already exists for this member and category',
        );
      }
    }

    const nextChargeDate = this.calculateNextChargeDate(dto.frequency);

    const recurring = await this.prisma.recurringGiving.create({
      data: {
        church_id: churchId,
        member_id: dto.memberId || userId,
        category_id: dto.categoryId,
        amount: dto.amount,
        currency: 'NGN',
        frequency: dto.frequency,
        is_active: true,
        next_charge_date: nextChargeDate,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'recurring_giving',
      action: 'CREATE',
      entityId: recurring.id,
      newValues: {
        categoryId: dto.categoryId,
        amount: dto.amount,
        frequency: dto.frequency,
      },
    });

    this.logger.log(`Recurring giving created: ${recurring.id} (${dto.frequency})`);

    return this.mapRecurringGivingToDto(recurring, category.name);
  }

  /**
   * Lists recurring giving schedules for a church.
   */
  async listRecurringGiving(
    churchId: string,
    query: ListRecurringGivingDto,
  ): Promise<{ data: RecurringGivingResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RecurringGivingWhereInput = { church_id: churchId };
    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    const [items, total] = await Promise.all([
      this.prisma.recurringGiving.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.recurringGiving.count({ where }),
    ]);

    // Batch-fetch category names
    const categoryIds = [...new Set(items.map((r) => r.category_id))];
    const categories = await this.prisma.givingCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return {
      data: items.map((r) => this.mapRecurringGivingToDto(r, categoryMap.get(r.category_id) || '')),
      total,
    };
  }

  /**
   * Gets a single recurring giving by ID.
   */
  async getRecurringGivingById(id: string, churchId: string): Promise<RecurringGivingResponseDto> {
    const recurring = await this.prisma.recurringGiving.findUnique({
      where: { id },
    });

    if (!recurring || recurring.church_id !== churchId) {
      throw new NotFoundException('Recurring giving not found');
    }

    const category = await this.prisma.givingCategory.findUnique({
      where: { id: recurring.category_id },
      select: { name: true },
    });

    return this.mapRecurringGivingToDto(recurring, category?.name || '');
  }

  /**
   * Cancels a recurring giving schedule (soft-cancel).
   */
  async cancelRecurringGiving(id: string, churchId: string, userId: string): Promise<void> {
    const recurring = await this.prisma.recurringGiving.findUnique({
      where: { id },
    });

    if (!recurring || recurring.church_id !== churchId) {
      throw new NotFoundException('Recurring giving not found');
    }

    if (!recurring.is_active) {
      throw new BadRequestException('Recurring giving is already cancelled');
    }

    await this.prisma.recurringGiving.update({
      where: { id },
      data: { is_active: false },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'recurring_giving',
      action: 'UPDATE',
      entityId: id,
      oldValues: { isActive: true },
      newValues: { isActive: false },
    });

    this.logger.log(`Recurring giving cancelled: ${id}`);
  }

  /**
   * Processes a recurring giving charge.
   *
   * Charges the member's saved authorization via the configured gateway,
   * creates a Transaction record, and updates the schedule.
   *
   * @returns Whether the charge was successful
   */
  async processRecurringCharge(recurringGivingId: string, churchId: string): Promise<boolean> {
    const recurring = await this.prisma.recurringGiving.findUnique({
      where: { id: recurringGivingId },
    });

    if (!recurring || recurring.church_id !== churchId) {
      this.logger.warn(`Recurring giving not found: ${recurringGivingId}`);
      return false;
    }

    if (!recurring.is_active) {
      this.logger.log(`Recurring giving ${recurringGivingId} is inactive, skipping`);
      return false;
    }

    if (!recurring.authorization_code) {
      this.logger.warn(`Recurring giving ${recurringGivingId} has no authorization code, skipping`);
      return false;
    }

    // Resolve gateway (default to paystack for recurring)
    const provider = this.gatewayRegistry.get('paystack');
    if (!provider || !provider.isConfigured() || !provider.chargeAuthorization) {
      this.logger.error('Paystack gateway not available for recurring charge');
      return false;
    }

    try {
      const result = await provider.chargeAuthorization(
        recurring.authorization_code,
        recurring.amount,
        recurring.currency,
        {
          recurring_giving_id: recurring.id,
          church_id: churchId,
          category_id: recurring.category_id,
        },
      );

      // Create transaction record
      const receiptNumber = await this.generateReceiptNumber('Recurring', churchId);

      await this.prisma.transaction.create({
        data: {
          church_id: churchId,
          member_id: recurring.member_id,
          category_id: recurring.category_id,
          amount: recurring.amount,
          currency: recurring.currency,
          type: 'digital',
          status: result.success ? 'success' : 'failed',
          payment_reference: result.reference,
          payment_gateway: 'paystack',
          payment_method: 'card',
          receipt_number: receiptNumber,
          metadata: {
            recurring_giving_id: recurring.id,
            is_recurring_charge: true,
          },
        },
      });

      // Update recurring schedule
      const nextChargeDate = this.calculateNextChargeDate(
        recurring.frequency as 'weekly' | 'monthly' | 'quarterly',
      );

      await this.prisma.recurringGiving.update({
        where: { id: recurringGivingId },
        data: {
          last_charge_date: new Date(),
          next_charge_date: result.success ? nextChargeDate : recurring.next_charge_date,
          failed_attempt_count: result.success ? 0 : recurring.failed_attempt_count + 1,
          is_active: result.success || recurring.failed_attempt_count + 1 < 3,
        },
      });

      await this.audit.log({
        userId: 'system',
        churchId,
        entity: 'recurring_giving',
        action: 'UPDATE',
        entityId: recurringGivingId,
        newValues: {
          chargeSuccess: result.success,
          reference: result.reference,
          nextChargeDate: result.success ? nextChargeDate : undefined,
        },
      });

      this.logger.log(
        `Recurring charge ${result.success ? 'succeeded' : 'failed'}: ${recurringGivingId} (${result.reference})`,
      );

      return result.success;
    } catch (error) {
      this.logger.error(
        `Recurring charge error for ${recurringGivingId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Increment failed attempt count
      const newFailedCount = recurring.failed_attempt_count + 1;
      await this.prisma.recurringGiving.update({
        where: { id: recurringGivingId },
        data: {
          failed_attempt_count: newFailedCount,
          is_active: newFailedCount < 3,
        },
      });

      return false;
    }
  }

  /**
   * Calculates the next charge date based on frequency.
   */
  private calculateNextChargeDate(frequency: 'weekly' | 'monthly' | 'quarterly'): Date {
    const now = new Date();
    switch (frequency) {
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
      case 'quarterly':
        now.setMonth(now.getMonth() + 3);
        break;
    }
    return now;
  }

  /**
   * Maps a Prisma RecurringGiving to the response DTO.
   */
  private mapRecurringGivingToDto(
    recurring: {
      id: string;
      church_id: string;
      member_id: string;
      category_id: string;
      amount: number;
      currency: string;
      frequency: string;
      is_active: boolean;
      next_charge_date: Date | null;
      last_charge_date: Date | null;
      failed_attempt_count: number;
      created_at: Date;
      updated_at: Date;
    },
    categoryName: string,
  ): RecurringGivingResponseDto {
    return {
      id: recurring.id,
      churchId: recurring.church_id,
      memberId: recurring.member_id,
      categoryId: recurring.category_id,
      categoryName,
      amount: recurring.amount,
      currency: recurring.currency,
      frequency: recurring.frequency,
      isActive: recurring.is_active,
      nextChargeDate: recurring.next_charge_date?.toISOString(),
      lastChargeDate: recurring.last_charge_date?.toISOString(),
      failedAttemptCount: recurring.failed_attempt_count,
      createdAt: recurring.created_at.toISOString(),
      updatedAt: recurring.updated_at.toISOString(),
    };
  }

  // ─── RECEIPTS ─────────────────────────────────────────────────────

  /**
   * Generates a PDF receipt for a transaction.
   */
  async generateReceipt(
    transactionId: string,
    churchId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { category: true },
    });

    if (!transaction || transaction.church_id !== churchId) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== 'success') {
      throw new BadRequestException('Receipts can only be generated for successful transactions');
    }

    // Get church details
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { name: true, address: true },
    });

    // Get member name if available
    let memberName: string | undefined;
    let memberEmail: string | undefined;
    if (transaction.member_id) {
      const member = await this.prisma.member.findUnique({
        where: { id: transaction.member_id },
        select: { first_name: true, last_name: true, email: true },
      });
      if (member) {
        memberName = `${member.first_name} ${member.last_name}`;
        memberEmail = member.email || undefined;
      }
    }

    const receiptData: ReceiptTransactionData = {
      id: transaction.id,
      receiptNumber: transaction.receipt_number || 'PENDING',
      amount: transaction.amount,
      currency: transaction.currency,
      categoryName: transaction.category?.name ?? '',
      paymentMethod: transaction.payment_method || 'unknown',
      createdAt: transaction.created_at,
      churchName: church?.name || 'Church',
      churchAddress: church?.address || undefined,
      memberName,
      memberEmail,
    };

    const buffer = await this.receipt.generateReceipt(receiptData);
    const filename = `receipt-${transaction.receipt_number || transaction.id}.pdf`;

    return { buffer, filename };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────

  /**
   * Captures an authorization code from a successful payment and stores it
   * on the matching RecurringGiving record for future automated charges.
   */
  private async captureAuthorizationCode(
    churchId: string,
    memberId: string,
    categoryId: string | null,
    authorizationCode: string,
  ): Promise<void> {
    if (!categoryId) return;

    try {
      const existing = await this.prisma.recurringGiving.findFirst({
        where: {
          church_id: churchId,
          member_id: memberId,
          category_id: categoryId,
          is_active: true,
        },
      });

      if (existing) {
        await this.prisma.recurringGiving.update({
          where: { id: existing.id },
          data: { authorization_code: authorizationCode },
        });
        this.logger.log(`Authorization code captured for recurring giving ${existing.id}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to capture authorization code: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generates a unique payment reference.
   */
  private generatePaymentReference(categoryName: string): string {
    const prefix = categoryName.substring(0, 3).toUpperCase();
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}SEED${timestamp}${random}`;
  }

  /**
   * Gets the next sequential receipt number for a category in a church.
   */
  private async generateReceiptNumber(categoryName: string, churchId: string): Promise<string> {
    const prefix = this.receipt.getCategoryPrefix(categoryName);
    const year = new Date().getFullYear();

    // Count existing receipts for this category + year
    const count = await this.prisma.transaction.count({
      where: {
        church_id: churchId,
        category: { name: categoryName },
        receipt_number: { not: null },
        created_at: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31T23:59:59.999Z`),
        },
      },
    });

    return this.receipt.generateReceiptNumber(prefix, count + 1);
  }

  /**
   * Maps a Prisma GivingCategory to the response DTO.
   */
  private mapCategoryToDto(category: {
    id: string;
    church_id: string;
    name: string;
    description: string | null;
    display_order: number;
    is_recurring: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): CategoryResponseDto {
    return {
      categoryId: category.id,
      churchId: category.church_id,
      name: category.name,
      description: category.description || undefined,
      displayOrder: category.display_order,
      isRecurring: category.is_recurring,
      isActive: category.is_active,
      createdAt: category.created_at.toISOString(),
      updatedAt: category.updated_at.toISOString(),
    };
  }

  /**
   * Maps a Prisma Transaction to the response DTO.
   */
  private mapTransactionToDto(transaction: {
    id: string;
    church_id: string;
    branch_id: string | null;
    member_id: string | null;
    category_id: string | null;
    amount: number;
    currency: string;
    type: string;
    status: string;
    payment_reference: string | null;
    payment_gateway: string;
    payment_method: string | null;
    receipt_number: string | null;
    receipt_url: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    category: { name: string } | null;
  }): TransactionResponseDto {
    return {
      transactionId: transaction.id,
      churchId: transaction.church_id,
      branchId: transaction.branch_id || undefined,
      memberId: transaction.member_id || undefined,
      categoryId: transaction.category_id ?? '',
      categoryName: transaction.category?.name ?? '',
      amount: transaction.amount,
      currency: transaction.currency,
      type: transaction.type,
      status: transaction.status,
      paymentReference: transaction.payment_reference || undefined,
      paymentGateway: transaction.payment_gateway,
      paymentMethod: transaction.payment_method || undefined,
      receiptNumber: transaction.receipt_number || undefined,
      receiptUrl: transaction.receipt_url || undefined,
      notes: transaction.notes || undefined,
      createdAt: transaction.created_at.toISOString(),
      updatedAt: transaction.updated_at.toISOString(),
    };
  }
}
