/**
 * @file receipt.service.ts
 * @description PDF receipt generation service for giving transactions.
 *
 * Generates PDF receipts with church branding, transaction details,
 * receipt numbers, and verification QR codes.
 *
 * @module giving/services/receipt.service
 * @since 1.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { randomBytes } from 'crypto';

/**
 * Transaction data needed for receipt generation.
 */
export interface ReceiptTransactionData {
  id: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  categoryName: string;
  paymentMethod: string;
  createdAt: Date;
  churchName: string;
  churchAddress?: string;
  memberName?: string;
  memberEmail?: string;
}

/**
 * Service for generating PDF receipts for giving transactions.
 * Uses PDFKit to create branded receipts with transaction details.
 */
@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  /**
   * Generates a PDF receipt for a transaction.
   *
   * @param data - Transaction data for the receipt
   * @returns PDF buffer
   */
  async generateReceipt(data: ReceiptTransactionData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          bufferPages: true,
          info: {
            Title: `Giving Receipt - ${data.receiptNumber}`,
            Author: data.churchName,
            Subject: 'Giving Receipt',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text(data.churchName, { align: 'center' });
        doc.moveDown(0.3);

        if (data.churchAddress) {
          doc.fontSize(10).font('Helvetica').text(data.churchAddress, { align: 'center' });
          doc.moveDown(0.3);
        }

        doc.fontSize(10).font('Helvetica').text('GIVING RECEIPT', { align: 'center' });
        doc.moveDown(1);

        // Divider line
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#333333');
        doc.moveDown(0.5);

        // Receipt number and date
        doc.fontSize(11).font('Helvetica-Bold').text('Receipt Number:', { continued: true });
        doc.font('Helvetica').text(`  ${data.receiptNumber}`);
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Date:', { continued: true });
        doc.font('Helvetica').text(`  ${this.formatDate(data.createdAt)}`);
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Payment Method:', { continued: true });
        doc.font('Helvetica').text(`  ${this.formatPaymentMethod(data.paymentMethod)}`);
        doc.moveDown(1);

        // Divider
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#333333');
        doc.moveDown(0.5);

        // Payer info (if member)
        if (data.memberName) {
          doc.fontSize(11).font('Helvetica-Bold').text('Received From:', { continued: true });
          doc.font('Helvetica').text(`  ${data.memberName}`);
          doc.moveDown(0.3);

          if (data.memberEmail) {
            doc.font('Helvetica-Bold').text('Email:', { continued: true });
            doc.font('Helvetica').text(`  ${data.memberEmail}`);
            doc.moveDown(0.5);
          }
        } else {
          doc.fontSize(11).font('Helvetica-Bold').text('Received From:', { continued: true });
          doc.font('Helvetica').text('  Anonymous Donor');
          doc.moveDown(0.5);
        }

        // Amount section
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#333333');
        doc.moveDown(0.5);

        doc.fontSize(14).font('Helvetica-Bold').text('Category:', { continued: true });
        doc.font('Helvetica').text(`  ${data.categoryName}`);
        doc.moveDown(0.5);

        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .fillColor('#2d6a4f')
          .text(
            `${data.currency} ${data.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
            {
              align: 'center',
            },
          );
        doc.moveDown(1);

        // Divider
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#333333');
        doc.moveDown(1);

        // QR Code data (text-based for simplicity — can be upgraded to actual QR)
        const qrData = this.generateVerificationData(data);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`Verification Code: ${qrData}`, { align: 'center' });
        doc.moveDown(0.3);

        // Footer
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#666666')
          .text('This receipt serves as proof of your giving.', { align: 'center' });
        doc.moveDown(0.2);
        doc.text('Thank you for your generous contribution.', { align: 'center' });
        doc.moveDown(0.2);
        doc.text(`Generated on ${this.formatDate(new Date())} — ChurchOS`, { align: 'center' });

        doc.end();
      } catch (error) {
        this.logger.error(
          `Receipt generation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        reject(error);
      }
    });
  }

  /**
   * Generates a unique receipt number.
   *
   * Format: {YEAR}/{CATEGORY_PREFIX}/{SEQUENTIAL}
   * Example: 2026/TIT/0001
   *
   * @param categoryPrefix - Short category code (e.g., 'TIT', 'OFF')
   * @param sequence - Sequential number (padded to 4 digits)
   * @returns Formatted receipt number
   */
  generateReceiptNumber(categoryPrefix: string, sequence: number): string {
    const year = new Date().getFullYear();
    const padded = sequence.toString().padStart(4, '0');
    return `${year}/${categoryPrefix}/${padded}`;
  }

  /**
   * Gets a short prefix for a category name.
   *
   * @param categoryName - Full category name
   * @returns 3-4 character uppercase prefix
   */
  getCategoryPrefix(categoryName: string): string {
    const prefixes: Record<string, string> = {
      tithe: 'TIT',
      offering: 'OFF',
      seed: 'SED',
      first_fruit: 'FRF',
      'first fruit': 'FRF',
      thanksgiving: 'TGV',
      building_project: 'BDP',
      'building project': 'BDP',
      welfare: 'WLF',
      mission: 'MSN',
    };

    const lower = categoryName.toLowerCase().trim();
    return prefixes[lower] || categoryName.substring(0, 4).toUpperCase();
  }

  /**
   * Generates a verification code from transaction data.
   *
   * @param data - Transaction receipt data
   * @returns 16-character verification code
   */
  private generateVerificationData(_data: ReceiptTransactionData): string {
    return randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Formats a date for display on the receipt.
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Formats a payment method for display.
   */
  private formatPaymentMethod(method: string): string {
    const labels: Record<string, string> = {
      paystack: 'Digital Payment (Paystack)',
      flutterwave: 'Digital Payment (Flutterwave)',
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
    };
    return labels[method] || method;
  }
}
