/**
 * @file flutterwave.service.ts
 * @description Flutterwave payment integration service.
 *
 * Handles payment initialization, transaction verification, and webhook
 * signature validation for Flutterwave's v3 REST API.
 *
 * @module giving/services/flutterwave.service
 * @since 1.0.0
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  PaymentGatewayProvider,
  PaymentInitializeResult,
  PaymentVerifyResult,
  WebhookEvent,
} from './payment-gateway.interface';

/**
 * Flutterwave initialize response.
 */
interface FlutterwaveInitializeResponse {
  status: string;
  message: string;
  data: {
    link: string;
  };
}

/**
 * Flutterwave verify response.
 */
interface FlutterwaveVerifyResponse {
  status: string;
  message: string;
  data: {
    id: number;
    tx_ref: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    payment_type: string;
    customer: {
      name: string;
      email: string;
    };
  };
}

/**
 * Service for interacting with the Flutterwave payment API.
 * Provides payment initialization, verification, and webhook validation.
 *
 * Flutterwave API docs: https://developer.flutterwave.com/docs
 */
@Injectable()
export class FlutterwaveService implements PaymentGatewayProvider {
  readonly name = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');
  }

  /**
   * Checks if Flutterwave is configured.
   */
  isConfigured(): boolean {
    return !!this.secretKey;
  }

  /**
   * Initializes a Flutterwave payment.
   *
   * @param email - Payer email address
   * @param amount - Amount in Naira (no conversion needed — Flutterwave uses Naira directly)
   * @param reference - Unique transaction reference
   * @param metadata - Additional metadata to attach to the transaction
   * @returns Authorization URL for the payer
   * @throws BadRequestException if Flutterwave is not configured or API call fails
   */
  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentInitializeResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY.');
    }

    const body: Record<string, unknown> = {
      tx_ref: reference,
      amount,
      currency: 'NGN',
      redirect_url: metadata?.redirect_url || '',
      customer: { email },
      meta: metadata,
    };

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as FlutterwaveInitializeResponse;

    if (result.status !== 'success') {
      this.logger.error(`Flutterwave initialize failed: ${result.message}`);
      throw new BadRequestException(`Payment initialization failed: ${result.message}`);
    }

    return {
      authorizationUrl: result.data.link,
      reference,
    };
  }

  /**
   * Verifies a Flutterwave transaction by reference.
   *
   * Note: Flutterwave verify uses tx_ref, not a numeric ID.
   * We query by tx_ref using the transactions endpoint.
   *
   * @param reference - Transaction reference (tx_ref) to verify
   * @returns Verification data including amount, status, and payment details
   * @throws BadRequestException if Flutterwave is not configured or verification fails
   */
  async verifyTransaction(reference: string): Promise<PaymentVerifyResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY.');
    }

    // Flutterwave verify endpoint requires transaction ID, not tx_ref.
    // We use the /transactions/verify_by_tx_ref endpoint instead.
    const response = await fetch(
      `${this.baseUrl}/transactions/verify_by_tx_ref?tx_ref=${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      },
    );

    const result = (await response.json()) as FlutterwaveVerifyResponse;

    if (result.status !== 'success') {
      this.logger.error(`Flutterwave verify failed: ${result.message}`);
      throw new BadRequestException(`Payment verification failed: ${result.message}`);
    }

    const status = this.mapFlutterwaveStatus(result.data.status);

    return {
      amount: result.data.amount,
      status,
      paidAt: result.data.created_at,
      channel: result.data.payment_type,
      customerEmail: result.data.customer.email,
    };
  }

  /**
   * Validates a Flutterwave webhook signature.
   *
   * Flutterwave uses HMAC-SHA512 with the secret key, sending the
   * hash in the `verif-hash` header.
   *
   * @param payload - Raw webhook body (string)
   * @param signature - Value from verif-hash header
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
   * Parses a Flutterwave webhook event payload.
   *
   * @param payload - Raw webhook body string
   * @returns Parsed event object with standardized fields
   * @throws BadRequestException if payload is invalid JSON
   */
  parseWebhookEvent(payload: string): WebhookEvent {
    try {
      const event = JSON.parse(payload) as Record<string, unknown>;
      if (!event.event || !event.data) {
        throw new BadRequestException('Invalid webhook payload structure');
      }

      const data = event.data as Record<string, unknown>;

      return {
        event: event.event as string,
        reference: (data.tx_ref as string) || '',
        amount: data.amount as number | undefined,
        channel: data.payment_type as string | undefined,
        customerEmail: (data.customer as Record<string, unknown>)?.email as string | undefined,
        rawData: event as Record<string, unknown>,
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Invalid webhook payload');
    }
  }

  /**
   * Maps Flutterwave event to a transaction status.
   *
   * @param event - Flutterwave event name
   * @returns Mapped TransactionStatus or null if event is not relevant
   */
  mapEventToStatus(event: string): 'success' | 'failed' | 'reversed' | null {
    switch (event) {
      case 'charge.completed':
        return 'success';
      case 'charge.failed':
        return 'failed';
      case 'refund.completed':
        return 'reversed';
      default:
        return null;
    }
  }

  /**
   * Maps Flutterwave payment type to internal payment method.
   *
   * @param channel - Flutterwave payment type
   * @returns Mapped payment method string
   */
  mapChannelToPaymentMethod(channel: string): string {
    switch (channel) {
      case 'card':
        return 'card';
      case 'banktransfer':
        return 'bank_transfer';
      case 'bank_transfer':
        return 'bank_transfer';
      case 'ussd':
        return 'ussd';
      case 'mobile_money':
        return 'mobile_money';
      case 'account':
        return 'bank_transfer';
      default:
        return 'digital';
    }
  }

  /**
   * Maps Flutterwave transaction status to internal status.
   */
  private mapFlutterwaveStatus(status: string): 'success' | 'failed' | 'reversed' | 'pending' {
    switch (status) {
      case 'successful':
        return 'success';
      case 'failed':
        return 'failed';
      case 'reversed':
        return 'reversed';
      default:
        return 'pending';
    }
  }
}
