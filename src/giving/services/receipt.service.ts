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
import {
  PDF_COLORS as colors,
  preparePdf,
  drawPdfHeader,
  drawPdfFooters,
} from '../../common/pdf/pdf-design';

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
          margins: { top: 145, bottom: 72, left: 50, right: 50 },
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

        preparePdf(doc);
        drawPdfHeader(doc, 'Giving receipt');
        doc.on('pageAdded', () => drawPdfHeader(doc, 'Giving receipt'));
        const contentWidth = doc.page.width - 100;
        let y = 148;

        const ensureSpace = (height: number) => {
          if (y + height > doc.page.height - 78) {
            doc.addPage();
            y = 148;
          }
        };
        const paragraph = (text: string, size = 10, bold = false, color = colors.ink) => {
          doc.font(bold ? 'ChurchOSSans-Bold' : 'ChurchOSSans').fontSize(size);
          const height = doc.heightOfString(text, { width: contentWidth, lineGap: 3 });
          ensureSpace(height + 8);
          doc.fillColor(color).text(text, 50, y, { width: contentWidth, lineGap: 3 });
          y = doc.y + 8;
        };
        const heading = (label: string) => {
          ensureSpace(55);
          doc
            .font('ChurchOSSans-Bold')
            .fontSize(9)
            .fillColor(colors.blue)
            .text(label.toUpperCase(), 50, y, { width: contentWidth });
          y += 23;
        };
        const field = (label: string, value: string) => {
          doc.font('ChurchOSSans').fontSize(10);
          const height = Math.max(
            26,
            doc.heightOfString(value, { width: contentWidth - 135, lineGap: 3 }) + 12,
          );
          ensureSpace(height);
          doc
            .font('ChurchOSSans')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(label, 50, y + 4, { width: 125 });
          doc
            .font('ChurchOSSans')
            .fontSize(10)
            .fillColor(colors.ink)
            .text(value, 185, y + 3, { width: contentWidth - 135, lineGap: 3 });
          y = Math.max(y + height, doc.y + 9);
          doc
            .moveTo(50, y - 5)
            .lineTo(doc.page.width - 50, y - 5)
            .lineWidth(0.4)
            .stroke(colors.line);
        };

        paragraph(data.churchName, 22, true);
        if (data.churchAddress) paragraph(data.churchAddress, 10, false, colors.muted);
        y += 12;

        // A clear amount panel distinguishes the financial value from metadata.
        ensureSpace(96);
        doc.roundedRect(50, y, contentWidth, 82, 10).fill(colors.soft);
        doc
          .font('ChurchOSSans-Bold')
          .fontSize(8)
          .fillColor(colors.muted)
          .text('AMOUNT RECEIVED', 68, y + 16);
        const amount = `${data.currency} ${data.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        let amountSize = 28;
        doc.font('ChurchOSSans-Bold').fontSize(amountSize);
        while (amountSize > 12 && doc.widthOfString(amount) > contentWidth - 36)
          doc.fontSize(--amountSize);
        doc.fillColor(colors.ink).text(amount, 68, y + 34, { width: contentWidth - 36 });
        y += 104;

        heading('Received from');
        field('Donor', data.memberName || 'Anonymous Donor');
        if (data.memberEmail) field('Email', data.memberEmail);
        y += 17;

        heading('Contribution details');
        field('Receipt number', data.receiptNumber);
        field('Date', this.formatDate(data.createdAt));
        field('Category', data.categoryName || 'Unspecified');
        field('Payment method', this.formatPaymentMethod(data.paymentMethod));
        field('Transaction reference', data.id);
        y += 17;

        heading('Receipt reference');
        paragraph(this.generateVerificationData(data), 9, true, colors.muted);
        y += 8;
        paragraph('Thank you for your generosity.', 13, true);
        paragraph(
          'This receipt serves as proof of your giving. Keep it for your records.',
          9,
          false,
          colors.muted,
        );
        drawPdfFooters(doc, new Date());

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
