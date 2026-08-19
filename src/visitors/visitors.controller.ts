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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { ConvertVisitorDto } from './dto/convert-visitor.dto';
import { VisitorResponseDto } from './dto/visitor-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';

@ApiTags('Visitors')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('visitors')
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new visitor' })
  async create(
    @Body() dto: CreateVisitorDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.create(dto, churchId, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List visitors with optional filters' })
  @ApiQuery({ name: 'follow_up_status', required: false, type: String })
  @ApiQuery({ name: 'assigned_to_id', required: false, type: String })
  async findAll(
    @Query('follow_up_status') followUpStatus: string,
    @Query('assigned_to_id') assignedToId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.findAll(churchId, {
      follow_up_status: followUpStatus,
      assigned_to_id: assignedToId,
    });
  }

  @Get(':visitorId')
  @ApiOperation({ summary: 'Get a visitor by ID' })
  async findOne(
    @Param('visitorId') visitorId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<VisitorResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.visitorsService.findOne(visitorId, churchId);
  }

  @Patch(':visitorId')
  @ApiOperation({ summary: 'Update a visitor' })
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
  @ApiOperation({
    summary: 'Convert visitor to member',
    description: 'Creates a new member record from the visitor and marks them as converted.',
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
  @ApiOperation({ summary: 'Delete a visitor' })
  async remove(
    @Param('visitorId') visitorId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.visitorsService.remove(visitorId, churchId, user.id);
  }
}
