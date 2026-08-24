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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { ConvertVisitorDto } from './dto/convert-visitor.dto';
import { ListVisitorsDto } from './dto/list-visitors.dto';
import { VisitorResponseDto } from './dto/visitor-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';

@ApiTags('Visitors')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('visitors')
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('visitors:create')
  @UseGuards(RolesGuard)
  @ApiCreateEndpoint('Register a new visitor', 'Registers a new visitor for follow-up.')
  async create(
    @Body() dto: CreateVisitorDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.create(dto, churchId, user.id);
  }

  @Get()
  @RequirePermissions('visitors:read')
  @ApiPaginatedResponse(VisitorResponseDto)
  @ApiOperation({
    summary: 'List visitors',
    description: 'List visitors with pagination, search, and filters.',
  })
  async findAll(@Query() query: ListVisitorsDto, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    const result = await this.visitorsService.findAll(churchId, query);
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

  @Get(':visitorId')
  @RequirePermissions('visitors:read')
  @ApiGetEndpoint('Get a visitor by ID', 'Retrieves a single visitor by its UUID.')
  async findOne(
    @Param('visitorId') visitorId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.findOne(visitorId, churchId);
  }

  @Patch(':visitorId')
  @RequirePermissions('visitors:update')
  @UseGuards(RolesGuard)
  @ApiUpdateEndpoint('Update a visitor', 'Updates a visitor with partial data.')
  async update(
    @Param('visitorId') visitorId: string,
    @Body() dto: UpdateVisitorDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.update(visitorId, dto, churchId, user.id);
  }

  @Post(':visitorId/convert')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('visitors:update')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Convert visitor to member',
    description:
      'Creates a new member record from the visitor (carrying gender and custom fields) and marks them as converted.',
  })
  async convert(
    @Param('visitorId') visitorId: string,
    @Body() dto: ConvertVisitorDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ visitor: VisitorResponseDto; memberId: string }> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.convertToMember(visitorId, dto, churchId, user.id);
  }

  @Delete(':visitorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('visitors:delete')
  @UseGuards(RolesGuard)
  @ApiDeleteEndpoint('Delete a visitor', 'Permanently deletes a visitor record.')
  async remove(
    @Param('visitorId') visitorId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.visitorsService.remove(visitorId, churchId, user.id);
  }
}
