import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CustomFieldResponseDto } from './dto/custom-field-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';

@ApiTags('Custom Fields')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a custom field definition' })
  async create(
    @Body() dto: CreateCustomFieldDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<CustomFieldResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.customFieldsService.create(dto, churchId, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom fields for this church' })
  async findAll(@Request() req: AuthenticatedRequest): Promise<CustomFieldResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.customFieldsService.findAll(churchId);
  }

  @Get(':fieldId')
  @ApiOperation({ summary: 'Get a custom field by ID' })
  async findOne(
    @Param('fieldId') fieldId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CustomFieldResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.customFieldsService.findOne(fieldId, churchId);
  }

  @Patch(':fieldId')
  @ApiOperation({ summary: 'Update a custom field definition' })
  async update(
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<CustomFieldResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.customFieldsService.update(fieldId, dto, churchId, user.id);
  }

  @Delete(':fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom field definition' })
  async remove(
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.customFieldsService.remove(fieldId, churchId, user.id);
  }
}
