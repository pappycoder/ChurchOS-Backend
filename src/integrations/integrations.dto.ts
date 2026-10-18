import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
export class CreateIntegrationAccountDto {
  @IsString() @MaxLength(32) provider!: string;
  @IsString() @MaxLength(80) label!: string;
  @IsObject() credentials!: Record<string, string>;
}
export class ConfigureIntegrationChannelDto {
  @IsIn(['custom', 'disabled']) mode!: 'custom' | 'disabled';
  @IsOptional() @IsString() @MaxLength(32) provider?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsObject() settings?: Record<string, string>;
}
export class TestIntegrationChannelDto {
  @IsString() @MaxLength(254) recipient!: string;
}
