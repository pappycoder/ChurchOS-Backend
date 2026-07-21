/**
 * @file giving.controller.ts
 * @description HTTP endpoints for giving operations.
 *
 * Provides category CRUD, digital payment initialization/verification,
 * webhook handling, cash/bank recording, transaction queries, and
 * receipt generation.
 *
 * @module giving/giving.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { GivingService } from './giving.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { RecordCashDto } from './dto/record-cash.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { CreateRecurringGivingDto } from './dto/create-recurring-giving.dto';
import { RecurringGivingResponseDto } from './dto/recurring-giving-response.dto';
import { ListRecurringGivingDto } from './dto/list-recurring-giving.dto';

/**
 * Controller for giving operations.
 * Provides endpoints for categories, payments, transactions, and receipts.
 */
@ApiTags('Giving')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('giving')
export class GivingController {
  constructor(private readonly givingService: GivingService) {}

  // ─── CATEGORIES ───────────────────────────────────────────────────

  /**
   * Create a new giving category.
   */
  @Post('categories')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @ApiCreateEndpoint('Create a giving category', 'Creates a new giving category for the church.')
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<CategoryResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.createCategory(dto, churchId, user.sub);
  }

  /**
   * List all giving categories.
   */
  @Get('categories')
  @ApiPaginatedResponse(CategoryResponseDto)
  @ApiOperation({
    summary: 'List giving categories',
    description: 'Retrieves all giving categories for the church, ordered by display order.',
  })
  async listCategories(
    @Query() query: ListCategoriesDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ data: CategoryResponseDto[] }> {
    const churchId = req.profile?.church_id || '';
    const data = await this.givingService.listCategories(churchId, query.isActive);
    return { data };
  }

  /**
   * Get a single giving category.
   */
  @Get('categories/:categoryId')
  @ApiGetEndpoint('Get a giving category', 'Retrieves a single giving category by ID.')
  async getCategory(
    @Param('categoryId') categoryId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CategoryResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.getCategoryById(categoryId, churchId);
  }

  /**
   * Update a giving category.
   */
  @Patch('categories/:categoryId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @ApiUpdateEndpoint('Update a giving category', 'Updates a giving category with partial data.')
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<CategoryResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.updateCategory(categoryId, dto, churchId, user.sub);
  }

  /**
   * Soft-delete a giving category.
   */
  @Delete('categories/:categoryId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @ApiDeleteEndpoint('Delete a giving category', 'Deactivates a giving category.')
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.givingService.deleteCategory(categoryId, churchId, user.sub);
    return { success: true };
  }

  // ─── DIGITAL GIVING ──────────────────────────────────────────────

  /**
   * Initialize a Paystack payment.
   */
  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint(
    'Initialize a digital payment',
    'Creates a pending transaction and returns a payment authorization URL. Supports multiple gateways (Paystack, Flutterwave).',
  )
  async initializePayment(
    @Body() dto: InitializePaymentDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    return this.givingService.initializePayment(dto, churchId, user.sub);
  }

  /**
   * Verify a payment by reference.
   */
  @Get('verify/:reference')
  @ApiGetEndpoint(
    'Verify a payment',
    'Checks the status of a payment with Paystack and updates the transaction.',
  )
  async verifyPayment(
    @Param('reference') reference: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransactionResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.verifyPayment(reference, churchId);
  }

  // ─── WEBHOOK ──────────────────────────────────────────────────────

  /**
   * Paystack webhook handler.
   *
   * This endpoint is NOT authenticated — it verifies the Paystack signature.
   */
  @Post('webhook/paystack')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-paystack-signature', description: 'Paystack webhook signature' })
  @ApiOperation({
    summary: 'Paystack webhook',
    description: 'Receives and processes Paystack webhook events.',
  })
  async handlePaystackWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = JSON.stringify(payload);
    return this.givingService.handleWebhook(rawBody, signature || '', 'paystack');
  }

  /**
   * Flutterwave webhook handler.
   *
   * This endpoint is NOT authenticated — it verifies the Flutterwave signature.
   */
  @Post('webhook/flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'verif-hash', description: 'Flutterwave webhook signature' })
  @ApiOperation({
    summary: 'Flutterwave webhook',
    description: 'Receives and processes Flutterwave webhook events.',
  })
  async handleFlutterwaveWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('verif-hash') signature: string,
  ) {
    const rawBody = JSON.stringify(payload);
    return this.givingService.handleWebhook(rawBody, signature || '', 'flutterwave');
  }

  // ─── CASH/BANK GIVING ────────────────────────────────────────────

  /**
   * Record cash or bank transfer giving.
   */
  @Post('cash')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'secretary', 'treasurer')
  @ApiCreateEndpoint(
    'Record cash/bank giving',
    'Records an offline cash or bank transfer giving transaction with auto-generated receipt number.',
  )
  async recordCashGiving(
    @Body() dto: RecordCashDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransactionResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.recordCashGiving(dto, churchId, user.sub);
  }

  // ─── RECURRING GIVING ────────────────────────────────────────────

  /**
   * Create a recurring giving schedule.
   */
  @Post('recurring')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint(
    'Create recurring giving',
    'Sets up an automated recurring charge schedule for a giving category.',
  )
  async createRecurringGiving(
    @Body() dto: CreateRecurringGivingDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<RecurringGivingResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.createRecurringGiving(dto, churchId, user.sub);
  }

  /**
   * List recurring giving schedules.
   */
  @Get('recurring')
  @ApiPaginatedResponse(RecurringGivingResponseDto)
  @ApiOperation({
    summary: 'List recurring givings',
    description: 'Retrieves paginated recurring giving schedules for the church.',
  })
  async listRecurringGiving(
    @Query() query: ListRecurringGivingDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    const result = await this.givingService.listRecurringGiving(churchId, query);
    return {
      data: result.data,
      meta: {
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 20,
        totalPages: Math.ceil(result.total / (query.limit || 20)),
      },
    };
  }

  /**
   * Get a single recurring giving by ID.
   */
  @Get('recurring/:id')
  @ApiGetEndpoint('Get recurring giving', 'Retrieves a single recurring giving schedule by ID.')
  async getRecurringGiving(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<RecurringGivingResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.getRecurringGivingById(id, churchId);
  }

  /**
   * Cancel a recurring giving schedule.
   */
  @Patch('recurring/:id/cancel')
  @ApiOperation({
    summary: 'Cancel recurring giving',
    description: 'Soft-cancels a recurring giving schedule. No further charges will be made.',
  })
  async cancelRecurringGiving(
    @Param('id') id: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const churchId = req.profile?.church_id || '';
    await this.givingService.cancelRecurringGiving(id, churchId, user.sub);
    return { success: true };
  }

  // ─── TRANSACTIONS ────────────────────────────────────────────────

  /**
   * List transactions with pagination and filters.
   */
  @Get('transactions')
  @ApiPaginatedResponse(TransactionResponseDto)
  @ApiOperation({
    summary: 'List transactions',
    description: 'Retrieves a paginated list of giving transactions with optional filters.',
  })
  async listTransactions(
    @Query() query: ListTransactionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    const result = await this.givingService.listTransactions(churchId, query);
    return {
      data: result.data,
      meta: {
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 20,
        totalPages: Math.ceil(result.total / (query.limit || 20)),
      },
    };
  }

  /**
   * Get a single transaction by ID.
   */
  @Get('transactions/:transactionId')
  @ApiGetEndpoint('Get transaction details', 'Retrieves a single giving transaction by ID.')
  async getTransaction(
    @Param('transactionId') transactionId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TransactionResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.givingService.getTransactionById(transactionId, churchId);
  }

  /**
   * Download a PDF receipt for a transaction.
   */
  @Get('transactions/:transactionId/receipt')
  @ApiOperation({
    summary: 'Download receipt',
    description: 'Generates and downloads a PDF receipt for a successful transaction.',
  })
  async downloadReceipt(
    @Param('transactionId') transactionId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    const { buffer, filename } = await this.givingService.generateReceipt(transactionId, churchId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
