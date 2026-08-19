/**
 * @file paystack.service.ts
 * @description Paystack payment integration service.
 *
 * Handles payment initialization, transaction verification, and webhook
 * signature validation. All API calls go to Paystack's REST API.
 *
 * @module giving/services/paystack.service
 * @since 1.0.0
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import {
  PaymentGatewayProvider,
  PaymentInitializeResult,
  PaymentVerifyResult,
  ChargeAuthorizationResult,
  WebhookEvent,
} from './payment-gateway.interface';

/**
 * Paystack initialization response.
 */
interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

/**
 * Paystack verification response.
 */
interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    amount: number;
    currency: string;
    reference: string;
    status: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    metadata: Record<string, unknown>;
    customer: {
      id: number;
      email: string;
    };
    authorization?: {
      authorization_code: string;
      card_type: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      bank: string;
    };
  };
}

/**
 * Service for interacting with the Paystack payment API.
 * Provides payment initialization, verification, and webhook validation.
 */
@Injectable()
export class PaystackService implements PaymentGatewayProvider {
  readonly name = 'paystack';
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
  }

  /**
   * Checks if Paystack is configured.
   */
  isConfigured(): boolean {
    return !!this.secretKey;
  }

  /**
   * Initializes a Paystack transaction.
   *
   * @param email - Payer email address
   * @param amount - Amount in Naira (converted to Kobo internally)
   * @param reference - Unique transaction reference
   * @param metadata - Additional metadata to attach to the transaction
   * @returns Authorization URL and access code
   * @throws BadRequestException if Paystack is not configured or API call fails
   */
  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentInitializeResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Paystack is not configured. Set PAYSTACK_SECRET_KEY.');
    }

    // Convert Naira to Kobo (Paystack expects smallest currency unit)
    const amountInKobo = Math.round(amount * 100);

    const body: Record<string, unknown> = {
      email,
      amount: amountInKobo,
      reference,
      currency: 'NGN',
    };

    if (metadata) {
      body.metadata = metadata;
    }

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as PaystackInitializeResponse;

    if (!result.status) {
      this.logger.error(`Paystack initialize failed: ${result.message}`);
      throw new BadRequestException(`Payment initialization failed: ${result.message}`);
    }

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  }

  /**
   * Verifies a Paystack transaction by reference.
   *
   * @param reference - Transaction reference to verify
   * @returns Verification data including amount, status, and payment details
   * @throws BadRequestException if Paystack is not configured or verification fails
   */
  async verifyTransaction(reference: string): Promise<PaymentVerifyResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Paystack is not configured. Set PAYSTACK_SECRET_KEY.');
    }

    const response = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    const result = (await response.json()) as PaystackVerifyResponse;

    if (!result.status) {
      this.logger.error(`Paystack verify failed: ${result.message}`);
      throw new BadRequestException(`Payment verification failed: ${result.message}`);
    }

    return {
      amount: result.data.amount / 100, // Convert Kobo to Naira
      status: result.data.status as PaymentVerifyResult['status'],
      paidAt: result.data.paid_at,
      channel: result.data.channel,
      customerEmail: result.data.customer.email,
      authorization: result.data.authorization,
    };
  }

  /**
   * Validates a Paystack webhook signature.
   *
   * Uses HMAC-SHA512 with the secret key to verify the webhook payload
   * was sent by Paystack.
   *
   * @param payload - Raw webhook body (string)
   * @param signature - Value from x-paystack-signature header
   * @returns true if signature is valid, false otherwise
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.isConfigured() || !signature) {
      return false;
    }

    try {
      const expected = createHmac('sha512', this.secretKey).update(payload).digest('hex');

      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      this.logger.warn('Webhook signature validation failed');
      return false;
    }
  }

  /**
   * Parses a Paystack webhook event payload.
   *
   * @param payload - Raw webhook body string
   * @returns Parsed event object with standardized fields
   * @throws BadRequestException if payload is invalid JSON
   */
  parseWebhookEvent(payload: string): WebhookEvent {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if (!parsed.event || !parsed.data) {
        throw new BadRequestException('Invalid webhook payload structure');
      }

      const data = parsed.data as Record<string, unknown>;
      const authorization = data.authorization as Record<string, unknown> | undefined;

      return {
        event: parsed.event as string,
        reference: (data.reference as string) || '',
        amount: data.amount as number | undefined,
        channel: data.channel as string | undefined,
        customerEmail: (data.customer as Record<string, unknown>)?.email as string | undefined,
        authorizationCode: authorization?.authorization_code as string | undefined,
        rawData: parsed,
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Invalid webhook payload');
    }
  }

  /**
   * Maps Paystack event to a transaction status.
   *
   * @param event - Paystack event name
   * @returns Mapped TransactionStatus or null if event is not relevant
   */
  mapEventToStatus(event: string): 'success' | 'failed' | 'reversed' | null {
    switch (event) {
      case 'charge.success':
        return 'success';
      case 'charge.failed':
        return 'failed';
      case 'refund.processed':
      case 'refund.failed':
        return 'reversed';
      default:
        return null;
    }
  }

  /**
   * Maps Paystack channel to transaction payment method.
   *
   * @param channel - Paystack payment channel
   * @returns Mapped payment method string
   */
  mapChannelToPaymentMethod(channel: string): string {
    switch (channel) {
      case 'card':
        return 'card';
      case 'bank':
        return 'bank_transfer';
      case 'ussd':
        return 'ussd';
      case 'mobile_money':
        return 'mobile_money';
      default:
        return 'digital';
    }
  }

  /**
   * Charges a saved payment authorization for recurring giving.
   *
   * @param authorizationCode - Paystack authorization code from a previous successful charge
   * @param amount - Amount in Naira (converted to Kobo internally)
   * @param currency - Currency code (e.g. 'NGN')
   * @param metadata - Additional metadata to attach to the transaction
   * @returns Charge result with reference and status
   * @throws BadRequestException if Paystack is not configured or API call fails
   */
  async chargeAuthorization(
    authorizationCode: string,
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChargeAuthorizationResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Paystack is not configured. Set PAYSTACK_SECRET_KEY.');
    }

    const amountInKobo = Math.round(amount * 100);
    const reference = `RCHG${Date.now()}${randomBytes(4).toString('hex')}`;

    const body: Record<string, unknown> = {
      authorization_code: authorizationCode,
      amount: amountInKobo,
      currency,
      reference,
    };

    if (metadata) {
      body.metadata = metadata;
    }

    const response = await fetch(`${this.baseUrl}/transaction/charge_authorization`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as {
      status: boolean;
      message: string;
      data: {
        reference: string;
        amount: number;
        status: string;
        paid_at?: string;
        channel?: string;
      };
    };

    if (!result.status) {
      this.logger.error(`Paystack charge authorization failed: ${result.message}`);
      throw new BadRequestException(`Recurring charge failed: ${result.message}`);
    }

    return {
      success: result.data.status === 'success',
      reference: result.data.reference,
      amount: result.data.amount / 100,
      paidAt: result.data.paid_at,
      channel: result.data.channel,
    };
  }
}
