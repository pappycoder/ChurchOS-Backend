/**
 * @file flutterwave.service.spec.ts
 * @description Unit tests for FlutterwaveService.
 *
 * Tests payment initialization, verification, webhook signature validation,
 * event parsing, and status mapping.
 *
 * @module test/unit/giving/flutterwave.service.spec
 * @since 1.0.0
 */

import { FlutterwaveService } from '../../../src/giving/services/flutterwave.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';

describe('FlutterwaveService', () => {
  let service: FlutterwaveService;
  let config: { get: jest.Mock };

  const mockSecretKey = 'FLWSECK-test-secret-key-1234567890';

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue(mockSecretKey) };
    service = new FlutterwaveService(config as unknown as ConfigService);
  });

  describe('isConfigured', () => {
    it('should return true when FLUTTERWAVE_SECRET_KEY is set', () => {
      config.get.mockReturnValue(mockSecretKey);

      const svc = new FlutterwaveService(config as unknown as ConfigService);

      expect(svc.isConfigured()).toBe(true);
    });

    it('should return false when FLUTTERWAVE_SECRET_KEY is not set', () => {
      config.get.mockReturnValue('');

      const svc = new FlutterwaveService(config as unknown as ConfigService);

      expect(svc.isConfigured()).toBe(false);
    });
  });

  describe('initializeTransaction', () => {
    beforeEach(() => {
      config.get.mockReturnValue(mockSecretKey);
    });

    it('should initialize a payment and return authorization URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 'success',
          message: 'Payment link generated',
          data: { link: 'https://checkout.flutterwave.com/pay/abc123' },
        }),
      });

      const result = await service.initializeTransaction(
        'test@example.com',
        5000,
        'TITHSEED123abc',
        { transaction_id: 'tx-123' },
      );

      expect(result.authorizationUrl).toBe('https://checkout.flutterwave.com/pay/abc123');
      expect(result.reference).toBe('TITHSEED123abc');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.flutterwave.com/v3/payments',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should throw BadRequestException when not configured', async () => {
      config.get.mockReturnValue('');

      const svc = new FlutterwaveService(config as unknown as ConfigService);

      await expect(svc.initializeTransaction('test@example.com', 5000, 'ref')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 'error',
          message: 'Invalid amount',
        }),
      });

      await expect(service.initializeTransaction('test@example.com', 50, 'ref')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ServiceUnavailableException when the gateway is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND api.flutterwave.com'));

      await expect(
        service.initializeTransaction('test@example.com', 5000, 'TITHSEED123abc'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('verifyTransaction', () => {
    beforeEach(() => {
      config.get.mockReturnValue(mockSecretKey);
    });

    it('should verify a successful transaction', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 'success',
          message: 'Transaction verified',
          data: {
            id: 12345,
            tx_ref: 'TITHSEED123abc',
            amount: 5000,
            currency: 'NGN',
            status: 'successful',
            created_at: '2026-07-20T10:00:00.000Z',
            payment_type: 'card',
            customer: { name: 'Test User', email: 'test@example.com' },
          },
        }),
      });

      const result = await service.verifyTransaction('TITHSEED123abc');

      expect(result.amount).toBe(5000);
      expect(result.status).toBe('success');
      expect(result.channel).toBe('card');
      expect(result.customerEmail).toBe('test@example.com');
    });

    it('should throw BadRequestException when not configured', async () => {
      config.get.mockReturnValue('');

      const svc = new FlutterwaveService(config as unknown as ConfigService);

      await expect(svc.verifyTransaction('ref')).rejects.toThrow(BadRequestException);
    });

    it('should throw ServiceUnavailableException when the gateway is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(service.verifyTransaction('TITHSEED123abc')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('validateWebhookSignature', () => {
    beforeEach(() => {
      config.get.mockReturnValue(mockSecretKey);
    });

    it('should validate a correct signature', () => {
      const payload = '{"event":"charge.completed","data":{}}';
      const signature = createHmac('sha512', mockSecretKey).update(payload).digest('hex');

      expect(service.validateWebhookSignature(payload, signature)).toBe(true);
    });

    it('should reject an incorrect signature', () => {
      const payload = '{"event":"charge.completed","data":{}}';

      expect(service.validateWebhookSignature(payload, 'wrong-signature')).toBe(false);
    });

    it('should reject when not configured', () => {
      config.get.mockReturnValue('');

      const svc = new FlutterwaveService(config as unknown as ConfigService);

      expect(svc.validateWebhookSignature('{}', 'sig')).toBe(false);
    });

    it('should reject when signature is empty', () => {
      expect(service.validateWebhookSignature('{}', '')).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse a valid webhook payload', () => {
      const payload = JSON.stringify({
        event: 'charge.completed',
        data: {
          tx_ref: 'TITHSEED123abc',
          amount: 5000,
          payment_type: 'card',
          customer: { email: 'test@example.com' },
        },
      });

      const result = service.parseWebhookEvent(payload);

      expect(result.event).toBe('charge.completed');
      expect(result.reference).toBe('TITHSEED123abc');
      expect(result.amount).toBe(5000);
      expect(result.channel).toBe('card');
      expect(result.customerEmail).toBe('test@example.com');
    });

    it('should throw BadRequestException for invalid JSON', () => {
      expect(() => service.parseWebhookEvent('not json')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing event field', () => {
      expect(() => service.parseWebhookEvent('{"data": {}}')).toThrow(BadRequestException);
    });
  });

  describe('mapEventToStatus', () => {
    it('should map charge.completed to success', () => {
      expect(service.mapEventToStatus('charge.completed')).toBe('success');
    });

    it('should map charge.failed to failed', () => {
      expect(service.mapEventToStatus('charge.failed')).toBe('failed');
    });

    it('should map refund.completed to reversed', () => {
      expect(service.mapEventToStatus('refund.completed')).toBe('reversed');
    });

    it('should return null for unknown events', () => {
      expect(service.mapEventToStatus('invoice.created')).toBeNull();
    });
  });

  describe('mapChannelToPaymentMethod', () => {
    it('should map card to card', () => {
      expect(service.mapChannelToPaymentMethod('card')).toBe('card');
    });

    it('should map banktransfer to bank_transfer', () => {
      expect(service.mapChannelToPaymentMethod('banktransfer')).toBe('bank_transfer');
    });

    it('should map ussd to ussd', () => {
      expect(service.mapChannelToPaymentMethod('ussd')).toBe('ussd');
    });

    it('should map unknown to digital', () => {
      expect(service.mapChannelToPaymentMethod('unknown')).toBe('digital');
    });
  });
});
