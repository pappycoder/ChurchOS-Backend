/**
 * @file forms.controller.ts
 * @description HTTP endpoints for authenticated form management.
 *
 * Provides REST endpoints for form CRUD, template cloning, submissions,
 * and approval workflows. All endpoints require JWT authentication.
 *
 * @module forms/forms.controller
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
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { FormsService } from './forms.service';
import {
  CreateFormDto,
  CreateFormSubmissionDto,
  FormResponseDto,
  FormSubmissionResponseDto,
  ListFormsDto,
  ListFormSubmissionsDto,
  UpdateFormDto,
  UpdateSubmissionStatusDto,
} from './dto';

const WRITE_ROLES = ['church_admin', 'branch_pastor', 'secretary'] as const;

@ApiTags('Forms')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  private getChurchId(req: AuthenticatedRequest): string {
    return req.profile?.church_id ?? '';
  }

  /**
   * Creates a new form.
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Create a form')
  async createForm(
    @Body() dto: CreateFormDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.createForm(this.getChurchId(req), dto, user.sub);
  }

  /**
   * Lists forms for the current church.
   */
  @Get()
  @ApiPaginatedResponse(FormResponseDto)
  @ApiListEndpoint('List forms')
  async listForms(
    @Query() query: ListFormsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    data: FormResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const result = await this.formsService.listForms(this.getChurchId(req), query);

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
   * Gets a single form by ID.
   */
  @Get(':formId')
  @ApiGetEndpoint('Get form by ID')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async getForm(
    @Param('formId') formId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.getForm(this.getChurchId(req), formId);
  }

  /**
   * Updates a form.
   */
  @Patch(':formId')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Update a form')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async updateForm(
    @Param('formId') formId: string,
    @Body() dto: UpdateFormDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.updateForm(this.getChurchId(req), formId, dto, user.sub);
  }

  /**
   * Closes a form.
   */
  @Delete(':formId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'secretary')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteEndpoint('Close a form')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async deleteForm(
    @Param('formId') formId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    await this.formsService.deleteForm(this.getChurchId(req), formId, user.sub);
    return { success: true };
  }

  /**
   * Archives a form.
   */
  @Post(':formId/archive')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint('Archive a form')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async archiveForm(
    @Param('formId') formId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.archiveForm(this.getChurchId(req), formId, user.sub);
  }

  /**
   * Restores an archived form.
   */
  @Post(':formId/restore')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint('Restore a form')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async restoreForm(
    @Param('formId') formId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.restoreForm(this.getChurchId(req), formId, user.sub);
  }

  /**
   * Regenerates the public submission link (invalidates any previously shared link).
   */
  @Post(':formId/regenerate-link')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiUpdateEndpoint('Regenerate the public submission link')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async regenerateLink(
    @Param('formId') formId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.regeneratePublicToken(this.getChurchId(req), formId, user.sub);
  }

  /**
   * Clones a form into a new draft form.
   */
  @Post(':formId/clone')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Clone a form')
  @ApiParam({ name: 'formId', description: 'Form UUID to clone' })
  async cloneForm(
    @Param('formId') formId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormResponseDto> {
    return this.formsService.cloneForm(this.getChurchId(req), formId, user.sub);
  }

  /**
   * Submits a form.
   */
  @Post(':formId/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Submit a form')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async submitForm(
    @Param('formId') formId: string,
    @Body() dto: CreateFormSubmissionDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormSubmissionResponseDto> {
    return this.formsService.submitForm(this.getChurchId(req), formId, dto, user.sub);
  }

  /**
   * Lists submissions for a form.
   */
  @Get(':formId/submissions')
  @ApiPaginatedResponse(FormSubmissionResponseDto)
  @ApiListEndpoint('List form submissions')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  async listSubmissions(
    @Param('formId') formId: string,
    @Query() query: ListFormSubmissionsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    data: FormSubmissionResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const result = await this.formsService.listSubmissions(this.getChurchId(req), formId, query);

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
   * Gets a single submission by ID.
   */
  @Get(':formId/submissions/:submissionId')
  @ApiGetEndpoint('Get form submission by ID')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiParam({ name: 'submissionId', description: 'Submission UUID' })
  async getSubmission(
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormSubmissionResponseDto> {
    return this.formsService.getSubmission(this.getChurchId(req), formId, submissionId);
  }

  /**
   * Updates the approval status of a submission.
   */
  @Patch(':formId/submissions/:submissionId/status')
  @UseGuards(RolesGuard)
  @RequireRoles(...WRITE_ROLES)
  @ApiUpdateEndpoint('Update submission status')
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiParam({ name: 'submissionId', description: 'Submission UUID' })
  async updateSubmissionStatus(
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateSubmissionStatusDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<FormSubmissionResponseDto> {
    return this.formsService.updateSubmissionStatus(
      this.getChurchId(req),
      formId,
      submissionId,
      dto,
      user.sub,
    );
  }
}
