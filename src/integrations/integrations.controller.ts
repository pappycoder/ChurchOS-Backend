import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { RateLimit, RATE_LIMITS } from '../common/guards/rate-limit.guard';
import { IntegrationAccountsService } from './integration-accounts.service';
import {
  ConfigureIntegrationChannelDto,
  CreateIntegrationAccountDto,
  TestIntegrationChannelDto,
} from './integrations.dto';
@Controller('church/integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly accounts: IntegrationAccountsService) {}
  @Get()
  @RequirePermissions('integrations:read')
  list(@Request() req: AuthenticatedRequest) {
    return this.accounts.list(req.profile!.church_id);
  }
  @Post('accounts')
  @RequirePermissions('integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  create(@Body() dto: CreateIntegrationAccountDto, @Request() req: AuthenticatedRequest) {
    return this.accounts.create(
      req.profile!.church_id,
      dto.provider,
      dto.label,
      dto.credentials,
      req.user!.id,
    );
  }
  @Post('accounts/:id/verify')
  @RequirePermissions('integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  verify(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.accounts.verify(req.profile!.church_id, id, req.user!.id);
  }
  @Post('accounts/:id/archive')
  @RequirePermissions('integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  archive(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.accounts.archive(req.profile!.church_id, id, req.user!.id);
  }
  @Put('channels/:channel')
  @RequirePermissions('integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  configure(
    @Param('channel') channel: string,
    @Body() dto: ConfigureIntegrationChannelDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accounts.configure(req.profile!.church_id, channel, dto, req.user!.id);
  }
  @Post('channels/:channel/test')
  @RequirePermissions('integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  test(
    @Param('channel') channel: string,
    @Body() dto: TestIntegrationChannelDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accounts.test(req.profile!.church_id, channel, dto.recipient, req.user!.id);
  }
}
