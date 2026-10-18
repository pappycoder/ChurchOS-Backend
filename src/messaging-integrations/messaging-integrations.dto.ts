import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { MessagingMode } from './messaging-credentials.service';
export class SaveMessagingIntegrationDto {
  @IsIn(['custom', 'disabled']) mode!: MessagingMode;
  @IsOptional() @IsString() @MaxLength(512) apiKey?: string;
  @IsOptional() @IsIn(['https://api.termii.com', 'https://api.ng.termii.com']) baseUrl?: string;
  @IsOptional() @IsString() @MaxLength(254) from?: string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,128}$/) deviceId?: string;
  @IsOptional() @IsString() @MaxLength(512) webhookSecret?: string;
  @IsOptional() @IsString() @MaxLength(512) verifyToken?: string;
}
export class TestMessagingIntegrationDto {
  @IsIn(['email', 'sms', 'whatsapp']) channel!: 'email' | 'sms' | 'whatsapp';
  @IsString() @MaxLength(254) recipient!: string;
}
