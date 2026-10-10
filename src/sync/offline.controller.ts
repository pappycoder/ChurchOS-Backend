import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { OfflinePushDto, OfflineSnapshotDto } from './dto/offline.dto';
import { OfflineService } from './offline.service';

@ApiTags('Offline')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('offline')
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}
  @Get('snapshot')
  snapshot(@Request() req: AuthenticatedRequest, @Query() query: OfflineSnapshotDto) {
    return this.offline.snapshot(req.profile!, query.branchId);
  }
  @Post('push')
  push(@Request() req: AuthenticatedRequest, @Body() body: OfflinePushDto) {
    if (req.profile?.id !== body.profileId || req.profile?.church_id !== body.churchId)
      throw new ForbiddenException('Queued changes belong to a different account');
    return this.offline.push(req.profile!, req.user.sub, body.mutations);
  }
}
