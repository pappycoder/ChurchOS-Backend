import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { RateLimit, RATE_LIMITS } from '../common/guards/rate-limit.guard';
import { MessagingCredentialsService } from './messaging-credentials.service';
import {
  SaveMessagingIntegrationDto,
  TestMessagingIntegrationDto,
} from './messaging-integrations.dto';
import { ResendService } from '../communication/resend.service';
import { TermiiService } from '../communication/termii.service';

@Controller('church/messaging-integrations')
@UseGuards(JwtAuthGuard)
export class MessagingIntegrationsController {
  constructor(
    private readonly credentials: MessagingCredentialsService,
    private readonly resend: ResendService,
    private readonly termii: TermiiService,
  ) {}

  @Get()
  @RequirePermissions('messaging_integrations:read')
  status(@Request() req: AuthenticatedRequest) {
    return this.credentials.status(req.profile!.church_id);
  }

  @Put(':provider')
  @RequirePermissions('messaging_integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  save(
    @Param('provider') provider: string,
    @Body() dto: SaveMessagingIntegrationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const { mode, ...input } = dto;
    return this.credentials.save(
      req.profile!.church_id,
      this.credentials.provider(provider),
      mode,
      input,
      req.user!.id,
    );
  }

  @Post(':provider/test')
  @RequirePermissions('messaging_integrations:update')
  @RateLimit(RATE_LIMITS.sensitive)
  async test(
    @Param('provider') value: string,
    @Body() dto: TestMessagingIntegrationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const provider = this.credentials.provider(value);
    const churchId = req.profile!.church_id;
    if (provider === 'resend' && dto.channel === 'email' && isEmail(dto.recipient)) {
      await this.resend.sendEmail(
        dto.recipient,
        'ChurchOS connection test',
        '<p>Your ChurchOS email connection is working.</p>',
        churchId,
      );
    } else if (
      provider === 'termii' &&
      dto.channel !== 'email' &&
      /^\+[1-9]\d{7,14}$/.test(dto.recipient)
    ) {
      if (dto.channel === 'sms')
        await this.termii.sendSms(dto.recipient, 'ChurchOS SMS connection test.', churchId);
      else
        await this.termii.sendWhatsAppMessage(
          dto.recipient,
          'ChurchOS WhatsApp connection test.',
          churchId,
        );
    } else
      throw new BadRequestException(
        'Use a valid email or international phone number for the selected provider/channel',
      );
    return {
      accepted: true,
      message: 'Provider accepted the test. Confirm receipt on the destination device.',
    };
  }
}
