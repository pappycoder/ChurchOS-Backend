import { BillingCycle, SubscriptionGateway, SubscriptionPlan } from '@prisma/client';
import { IsEnum, IsIn, IsString, MaxLength, Matches, IsOptional } from 'class-validator';
import { PRICING_CURRENCIES } from './subscription-pricing.service';
export class CheckoutDto {
  @IsOptional() @IsIn(PRICING_CURRENCIES) currency?: string;
  @IsOptional() @Matches(/^COSQ_[a-f0-9]{32}$/) quoteId?: string;
  @IsIn([SubscriptionPlan.essentials, SubscriptionPlan.community, SubscriptionPlan.network])
  plan!: Exclude<SubscriptionPlan, 'enterprise'>;
  @IsEnum(BillingCycle)
  cycle!: BillingCycle;
  @IsIn([SubscriptionGateway.flutterwave])
  gateway!: SubscriptionGateway;
}
export class VerifySubscriptionDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^COSUB_[a-f0-9]{32}$/)
  reference!: string;
}

export class SchedulePlanDto {
  @IsOptional() @IsIn(['essentials', 'community', 'network']) plan?:
    'essentials' | 'community' | 'network';
  @IsOptional() @IsEnum(BillingCycle) cycle?: BillingCycle;
}
