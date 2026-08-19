/**
 * @file assets.controller.ts
 * @description HTTP endpoints for asset and inventory management.
 *
 * Provides REST endpoints for asset categories, asset register, maintenance,
 * depreciation, loans, QR codes, and scan workflows.
 * Write operations are restricted to church_admin, branch_pastor, secretary,
 * treasurer, and cell_leader roles.
 *
 * @module assets/assets.controller
 * @since 1.0.0
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import {
  ApiCreateEndpoint,
  ApiDeleteEndpoint,
  ApiGetEndpoint,
  ApiListEndpoint,
  ApiUpdateEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import {
  AuthenticatedRequest,
  CurrentUser,
  SupabaseUser,
} from '../common/decorators/current-user.decorator';
import { AssetsService } from './assets.service';
import {
  AssetCategoryResponseDto,
  AssetResponseDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  CreateLoanDto,
  CreateMaintenanceDto,
  DepreciationResponseDto,
  DepreciationSummaryResponseDto,
  ListAssetsDto,
  LoanResponseDto,
  MaintenanceResponseDto,
  QrResponseDto,
  ScanAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
  UpdateLoanDto,
} from './dto';

const WRITE_ROLES = [
  'church_admin',
  'branch_pastor',
  'secretary',
  'treasurer',
  'cell_leader',
] as const;

@ApiTags('Assets')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  private getChurchId(req: AuthenticatedRequest): string {
    return req.profile?.church_id ?? '';
  }

  /**
   * Creates a new asset category.
   */
  @Post('categories')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Create an asset category')
  async createCategory(
    @Body() dto: CreateAssetCategoryDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<AssetCategoryResponseDto> {
    return this.assetsService.createCategory(this.getChurchId(req), dto, user.sub);
  }

  /**
   * Lists asset categories.
   */
  @Get('categories')
  @ApiListEndpoint('List asset categories')
  async listCategories(@Request() req: AuthenticatedRequest): Promise<AssetCategoryResponseDto[]> {
    return this.assetsService.listCategories(this.getChurchId(req));
  }

  /**
   * Updates an asset category.
   */
  @Patch('categories/:categoryId')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Update an asset category')
  @ApiParam({ name: 'categoryId', description: 'Asset category UUID' })
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateAssetCategoryDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<AssetCategoryResponseDto> {
    return this.assetsService.updateCategory(this.getChurchId(req), categoryId, dto, user.sub);
  }

  /**
   * Deletes an asset category.
   */
  @Delete('categories/:categoryId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'treasurer')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint('Delete an asset category')
  @ApiParam({ name: 'categoryId', description: 'Asset category UUID' })
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    await this.assetsService.deleteCategory(this.getChurchId(req), categoryId, user.sub);
    return { success: true };
  }

  /**
   * Registers a new asset.
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Register a new asset')
  async createAsset(
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<AssetResponseDto> {
    return this.assetsService.createAsset(this.getChurchId(req), dto, user.sub);
  }

  /**
   * Lists assets with filters and pagination.
   */
  @Get()
  @ApiPaginatedResponse(AssetResponseDto)
  @ApiOperation({ summary: 'List assets', description: 'List assets with filters and pagination.' })
  async listAssets(
    @Query() query: ListAssetsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    data: AssetResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const result = await this.assetsService.listAssets(this.getChurchId(req), query);

    return {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  /**
   * Gets a single asset by ID.
   */
  @Get(':assetId')
  @ApiGetEndpoint('Get asset by ID')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async getAsset(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AssetResponseDto> {
    return this.assetsService.getAsset(this.getChurchId(req), assetId);
  }

  /**
   * Updates an asset.
   */
  @Patch(':assetId')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Update an asset')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async updateAsset(
    @Param('assetId') assetId: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<AssetResponseDto> {
    return this.assetsService.updateAsset(this.getChurchId(req), assetId, dto, user.sub);
  }

  /**
   * Soft-deletes an asset.
   */
  @Delete(':assetId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'treasurer')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint('Delete an asset')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async deleteAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    await this.assetsService.deleteAsset(this.getChurchId(req), assetId, user.sub);
    return { success: true };
  }

  /**
   * Generates or refreshes an asset QR code.
   */
  @Post(':assetId/qr')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiCreateEndpoint('Generate asset QR code')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async generateQr(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<QrResponseDto> {
    return this.assetsService.generateQrCode(this.getChurchId(req), assetId);
  }

  /**
   * Gets asset QR code data.
   */
  @Get(':assetId/qr')
  @ApiGetEndpoint('Get asset QR code data')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async getQr(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<QrResponseDto> {
    return this.assetsService.getQrCode(this.getChurchId(req), assetId);
  }

  /**
   * Scans an asset by QR code or asset tag.
   */
  @Post('scan')
  @ApiCreateEndpoint('Scan an asset')
  async scanAsset(
    @Body() dto: ScanAssetDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    data: {
      asset: AssetResponseDto;
      activeLoan?: LoanResponseDto;
      upcomingMaintenance?: MaintenanceResponseDto;
    };
    scanLog: unknown;
  }> {
    const result = await this.assetsService.scanAsset(this.getChurchId(req), dto, req.profile?.id);

    return {
      data: {
        asset: result.asset,
        activeLoan: result.activeLoan,
        upcomingMaintenance: result.upcomingMaintenance,
      },
      scanLog: result.scanLog,
    };
  }

  /**
   * Creates a maintenance record for an asset.
   */
  @Post(':assetId/maintenance')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Create asset maintenance record')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async createMaintenance(
    @Param('assetId') assetId: string,
    @Body() dto: CreateMaintenanceDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceResponseDto> {
    return this.assetsService.createMaintenance(this.getChurchId(req), assetId, dto, user.sub);
  }

  /**
   * Lists maintenance records for an asset.
   */
  @Get(':assetId/maintenance')
  @ApiListEndpoint('List asset maintenance records')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async listMaintenance(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceResponseDto[]> {
    return this.assetsService.listMaintenance(this.getChurchId(req), assetId);
  }

  /**
   * Updates a maintenance record.
   */
  @Patch(':assetId/maintenance/:maintenanceId')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Update asset maintenance record')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  @ApiParam({ name: 'maintenanceId', description: 'Maintenance record UUID' })
  async updateMaintenance(
    @Param('assetId') assetId: string,
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: CreateMaintenanceDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceResponseDto> {
    return this.assetsService.updateMaintenance(
      this.getChurchId(req),
      assetId,
      maintenanceId,
      dto,
      user.sub,
    );
  }

  /**
   * Creates a depreciation entry for the current year.
   */
  @Post(':assetId/depreciation')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'treasurer')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Record asset depreciation')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async createDepreciation(
    @Param('assetId') assetId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<DepreciationResponseDto> {
    return this.assetsService.createDepreciation(this.getChurchId(req), assetId, user.sub);
  }

  /**
   * Lists depreciation entries for an asset.
   */
  @Get(':assetId/depreciation')
  @ApiListEndpoint('List asset depreciation entries')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async listDepreciation(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<DepreciationResponseDto[]> {
    return this.assetsService.listDepreciation(this.getChurchId(req), assetId);
  }

  /**
   * Gets a depreciation summary for an asset.
   */
  @Get(':assetId/depreciation/summary')
  @ApiGetEndpoint('Get asset depreciation summary')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async getDepreciationSummary(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<DepreciationSummaryResponseDto> {
    return this.assetsService.getDepreciationSummary(this.getChurchId(req), assetId);
  }

  /**
   * Creates a loan record for an asset.
   */
  @Post(':assetId/loans')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Loan an asset')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async createLoan(
    @Param('assetId') assetId: string,
    @Body() dto: CreateLoanDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<LoanResponseDto> {
    return this.assetsService.createLoan(this.getChurchId(req), assetId, dto, user.sub);
  }

  /**
   * Lists loan records for an asset.
   */
  @Get(':assetId/loans')
  @ApiListEndpoint('List asset loan records')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  async listLoans(
    @Param('assetId') assetId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<LoanResponseDto[]> {
    return this.assetsService.listLoans(this.getChurchId(req), assetId);
  }

  /**
   * Records the return of a loaned asset.
   */
  @Patch(':assetId/loans/:loanId/return')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Return a loaned asset')
  @ApiParam({ name: 'assetId', description: 'Asset UUID' })
  @ApiParam({ name: 'loanId', description: 'Loan record UUID' })
  async returnLoan(
    @Param('assetId') assetId: string,
    @Param('loanId') loanId: string,
    @Body() dto: UpdateLoanDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<LoanResponseDto> {
    return this.assetsService.returnLoan(this.getChurchId(req), assetId, loanId, dto, user.sub);
  }
}
