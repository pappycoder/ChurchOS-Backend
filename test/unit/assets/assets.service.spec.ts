/**
 * @file assets.service.spec.ts
 * @description Unit tests for AssetsService.
 *
 * Tests asset categories, asset register, maintenance, depreciation,
 * loans, QR codes, and scan workflows.
 *
 * @module test/unit/assets/assets.service.spec
 * @since 1.0.0
 */

import { AssetsService } from '../../../src/assets/assets.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AssetCondition,
  AssetStatus,
  DepreciationMethod,
  MaintenanceStatus,
  AssetLoanStatus,
} from '@prisma/client';

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: { log: jest.Mock };

  const mockChurchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockCategoryId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const mockAssetId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const mockMemberId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const mockCategory = {
    id: mockCategoryId,
    church_id: mockChurchId,
    name: 'Sound Equipment',
    description: 'Audio devices',
    created_at: new Date('2026-07-20T10:00:00.000Z'),
    updated_at: new Date('2026-07-20T10:00:00.000Z'),
  };

  const mockAsset = {
    id: mockAssetId,
    church_id: mockChurchId,
    asset_tag: 'AUD-001',
    name: 'Yamaha Mixer',
    description: '16-channel mixer',
    category_id: mockCategoryId,
    serial_number: 'SN123',
    brand: 'Yamaha',
    model: 'MG16XU',
    department_id: null,
    branch_id: null,
    custodian_id: null,
    condition: AssetCondition.good,
    status: AssetStatus.active,
    purchase_date: new Date('2023-01-15'),
    purchase_price: 250000,
    salvage_value: 0,
    useful_life_years: 5,
    depreciation_method: DepreciationMethod.straight_line,
    current_value: 250000,
    location: 'Main Sanctuary',
    qr_code: `CHURCHOS:ASSET:${mockAssetId}`,
    notes: null,
    created_at: new Date('2026-07-20T10:00:00.000Z'),
    updated_at: new Date('2026-07-20T10:00:00.000Z'),
    category: mockCategory,
    branch: null,
    department: null,
    custodian: null,
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AssetsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
    );
  });

  describe('createCategory', () => {
    it('should create an asset category', async () => {
      prisma.assetCategory.findUnique.mockResolvedValue(null);
      prisma.assetCategory.create.mockResolvedValue(mockCategory);

      const result = await service.createCategory(
        mockChurchId,
        { name: 'Sound Equipment', description: 'Audio devices' },
        mockUserId,
      );

      expect(result.name).toBe('Sound Equipment');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'asset_category', action: 'CREATE' }),
      );
    });

    it('should throw BadRequestException if category name exists', async () => {
      prisma.assetCategory.findUnique.mockResolvedValue(mockCategory);

      await expect(
        service.createCategory(mockChurchId, { name: 'Sound Equipment' }, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listCategories', () => {
    it('should return categories ordered by name', async () => {
      prisma.assetCategory.findMany.mockResolvedValue([mockCategory]);

      const result = await service.listCategories(mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockCategoryId);
    });
  });

  describe('createAsset', () => {
    it('should create an asset and generate QR code with asset ID', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      prisma.assetCategory.findFirst.mockResolvedValue(mockCategory);
      prisma.asset.create
        .mockResolvedValueOnce({
          ...mockAsset,
          qr_code: null,
          image_url: 'https://img.example/mixer.jpg',
        })
        .mockResolvedValueOnce({
          ...mockAsset,
          image_url: 'https://img.example/mixer.jpg',
        });
      prisma.asset.update.mockResolvedValue({
        ...mockAsset,
        image_url: 'https://img.example/mixer.jpg',
      });

      const result = await service.createAsset(
        mockChurchId,
        {
          assetTag: 'AUD-001',
          name: 'Yamaha Mixer',
          categoryId: mockCategoryId,
          purchasePrice: 250000,
          usefulLifeYears: 5,
          imageUrl: 'https://img.example/mixer.jpg',
        },
        mockUserId,
      );

      expect(result.assetTag).toBe('AUD-001');
      expect(result.imageUrl).toBe('https://img.example/mixer.jpg');
      expect(result.qrCode).toBe(`CHURCHOS:ASSET:${mockAssetId}`);
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            image_url: 'https://img.example/mixer.jpg',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'asset', action: 'CREATE' }),
      );
    });

    it('should throw BadRequestException if asset tag exists', async () => {
      prisma.asset.findUnique.mockResolvedValue(mockAsset);

      await expect(
        service.createAsset(mockChurchId, { assetTag: 'AUD-001', name: 'Duplicate' }, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listAssets', () => {
    it('should return paginated assets', async () => {
      prisma.asset.findMany.mockResolvedValue([mockAsset]);
      prisma.asset.count.mockResolvedValue(1);

      const result = await service.listAssets(mockChurchId, {});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].categoryName).toBe('Sound Equipment');
    });

    it('should apply status filter', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.listAssets(mockChurchId, { status: AssetStatus.active });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: AssetStatus.active }),
        }),
      );
    });
  });

  describe('getAsset', () => {
    it('should return asset by ID', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.getAsset(mockChurchId, mockAssetId);

      expect(result.id).toBe(mockAssetId);
    });

    it('should throw NotFoundException if asset not found', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.getAsset(mockChurchId, mockAssetId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAsset', () => {
    it('should mark asset as disposed and clear QR code', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.asset.update.mockResolvedValue({
        ...mockAsset,
        status: AssetStatus.disposed,
        qr_code: null,
      });

      await service.deleteAsset(mockChurchId, mockAssetId, mockUserId);

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssetStatus.disposed,
            qr_code: null,
          }),
        }),
      );
    });
  });

  describe('generateQrCode', () => {
    it('should return CHURCHOS:ASSET prefixed data', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.asset.update.mockResolvedValue(mockAsset);

      const result = await service.generateQrCode(mockChurchId, mockAssetId);

      expect(result.qrData).toBe(`CHURCHOS:ASSET:${mockAssetId}`);
    });
  });

  describe('scanAsset', () => {
    it('should find asset by QR code and log scan', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetScanLog.create.mockResolvedValue({
        id: 'scan-1',
        asset_id: mockAssetId,
        scanned_by_id: mockUserId,
        scan_type: 'check',
        metadata: {},
        created_at: new Date(),
      });
      prisma.assetLoan.findFirst.mockResolvedValue(null);
      prisma.assetMaintenance.findFirst.mockResolvedValue(null);

      const result = await service.scanAsset(
        mockChurchId,
        { qrData: `CHURCHOS:ASSET:${mockAssetId}` },
        mockUserId,
      );

      expect(result.asset.id).toBe(mockAssetId);
      expect(result.scanLog.scanType).toBe('check');
    });

    it('should find asset by asset tag', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: mockAssetId });
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetScanLog.create.mockResolvedValue({
        id: 'scan-1',
        asset_id: mockAssetId,
        scanned_by_id: null,
        scan_type: 'check',
        metadata: {},
        created_at: new Date(),
      });
      prisma.assetLoan.findFirst.mockResolvedValue(null);
      prisma.assetMaintenance.findFirst.mockResolvedValue(null);

      const result = await service.scanAsset(mockChurchId, { assetTag: 'AUD-001' });

      expect(result.asset.id).toBe(mockAssetId);
    });

    it('should throw BadRequestException for invalid QR format', async () => {
      await expect(service.scanAsset(mockChurchId, { qrData: 'INVALID' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createMaintenance', () => {
    it('should create a maintenance record', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetMaintenance.create.mockResolvedValue({
        id: 'maint-1',
        asset_id: mockAssetId,
        type: 'Routine service',
        description: null,
        status: MaintenanceStatus.scheduled,
        scheduled_date: new Date('2026-08-01'),
        completed_date: null,
        cost: null,
        performed_by: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.createMaintenance(
        mockChurchId,
        mockAssetId,
        { type: 'Routine service', scheduledDate: '2026-08-01' },
        mockUserId,
      );

      expect(result.type).toBe('Routine service');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'asset_maintenance', action: 'CREATE' }),
      );
    });
  });

  describe('createDepreciation', () => {
    it('should calculate straight-line depreciation', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        ...mockAsset,
        depreciation: [],
      });
      prisma.assetDepreciation.findUnique.mockResolvedValue(null);
      prisma.assetDepreciation.create.mockResolvedValue({
        id: 'dep-1',
        asset_id: mockAssetId,
        year: new Date().getFullYear(),
        opening_value: 250000,
        depreciation_amount: 50000,
        closing_value: 200000,
        created_at: new Date(),
      });
      prisma.asset.update.mockResolvedValue(mockAsset);

      const result = await service.createDepreciation(mockChurchId, mockAssetId, mockUserId);

      expect(result.depreciationAmount).toBe(50000);
      expect(result.closingValue).toBe(200000);
    });

    it('should throw BadRequestException if asset lacks purchase price', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        ...mockAsset,
        purchase_price: null,
      });

      await expect(
        service.createDepreciation(mockChurchId, mockAssetId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createLoan', () => {
    it('should create a loan for an asset', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetLoan.findFirst.mockResolvedValue(null);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId });
      prisma.assetLoan.create.mockResolvedValue({
        id: 'loan-1',
        asset_id: mockAssetId,
        borrower_member_id: mockMemberId,
        borrowed_by_name: null,
        loan_date: new Date(),
        expected_return_date: new Date('2026-08-15'),
        actual_return_date: null,
        status: AssetLoanStatus.borrowed,
        condition_before: AssetCondition.good,
        condition_after: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        member: { first_name: 'John', last_name: 'Doe' },
      });
      prisma.asset.update.mockResolvedValue(mockAsset);

      const result = await service.createLoan(
        mockChurchId,
        mockAssetId,
        { borrowerMemberId: mockMemberId, expectedReturnDate: '2026-08-15' },
        mockUserId,
      );

      expect(result.status).toBe(AssetLoanStatus.borrowed);
      expect(result.borrowerName).toBe('John Doe');
    });

    it('should throw BadRequestException if asset is already on loan', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetLoan.findFirst.mockResolvedValue({ id: 'loan-1' });

      await expect(
        service.createLoan(
          mockChurchId,
          mockAssetId,
          { borrowedByName: 'Vendor', expectedReturnDate: '2026-08-15' },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('returnLoan', () => {
    it('should record asset return and activate asset', async () => {
      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      prisma.assetLoan.findFirst.mockResolvedValue({
        id: 'loan-1',
        asset_id: mockAssetId,
        borrower_member_id: null,
        borrowed_by_name: 'Vendor',
        loan_date: new Date(),
        expected_return_date: new Date('2026-08-15'),
        actual_return_date: null,
        status: AssetLoanStatus.borrowed,
        condition_before: null,
        condition_after: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        member: null,
      });
      prisma.assetLoan.update.mockResolvedValue({
        id: 'loan-1',
        asset_id: mockAssetId,
        borrower_member_id: null,
        borrowed_by_name: 'Vendor',
        loan_date: new Date(),
        expected_return_date: new Date('2026-08-15'),
        actual_return_date: new Date(),
        status: AssetLoanStatus.returned,
        condition_before: null,
        condition_after: AssetCondition.good,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        member: null,
      });
      prisma.asset.update.mockResolvedValue(mockAsset);

      const result = await service.returnLoan(
        mockChurchId,
        mockAssetId,
        'loan-1',
        { conditionAfter: AssetCondition.good },
        mockUserId,
      );

      expect(result.status).toBe(AssetLoanStatus.returned);
      expect(result.conditionAfter).toBe(AssetCondition.good);
    });
  });
});
