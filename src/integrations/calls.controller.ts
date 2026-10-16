import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { RequestContextService } from '../common/services/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit, RATE_LIMITS } from '../common/guards/rate-limit.guard';
import { IntegrationAccountsService } from './integration-accounts.service';
export class CreateVoiceCallDto {
  @IsUUID() memberId!: string;
}
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: IntegrationAccountsService,
    private readonly context: RequestContextService,
  ) {}
  @Post()
  @RequirePermissions('calls:create', 'members:all:read')
  @RateLimit(RATE_LIMITS.sensitive)
  async create(@Body() dto: CreateVoiceCallDto, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile!.church_id;
    const member = await this.prisma.member.findFirst({
      where: {
        id: dto.memberId,
        church_id: churchId,
        archived_at: null,
        ...this.context.branchWhere(churchId),
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (!member.phone || !/^\+[1-9]\d{7,14}$/.test(member.phone))
      throw new BadRequestException('Member needs a valid international phone number');
    const account = await this.accounts.resolve(churchId, 'voice');
    if (!account) throw new BadRequestException('Configure a voice provider account first');
    const staff = await this.prisma.profile.findFirst({
      where: { user_id: req.user!.id, church_id: churchId },
      select: { phone: true },
    });
    if (!staff?.phone)
      throw new BadRequestException('Set your staff phone number on your profile first');
    const id = await this.accounts.deliver(account, 'voice', {
      staffPhone: staff.phone,
      to: member.phone,
      from: account.settings.from,
      text: '',
    });
    await this.prisma.message.create({
      data: {
        church_id: churchId,
        member_id: member.id,
        phone: member.phone,
        direction: 'outbound',
        channel: 'voice',
        content: 'Live staff-to-member call',
        status: 'queued',
        metadata: {
          provider: account.provider,
          provider_id: id,
          integration_account_id: account.accountId,
        },
      },
    });
    return { accepted: true };
  }
}
