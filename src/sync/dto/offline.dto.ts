import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class OfflineMutationDto {
  @IsUUID('4') mutationId!: string;
  @IsIn(['member', 'visitor', 'submission']) entity!: 'member' | 'visitor' | 'submission';
  @IsUUID('4') entityId!: string;
  @IsIn(['create', 'update']) action!: 'create' | 'update';
  @IsISO8601() @IsOptional() baseVersion?: string;
  @IsUUID() branchId!: string;
  @IsUUID() @IsOptional() formId?: string;
  @IsObject() data!: Record<string, unknown>;
}

export class OfflinePushDto {
  @IsUUID() profileId!: string;
  @IsUUID() churchId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => OfflineMutationDto)
  mutations!: OfflineMutationDto[];
}

export class OfflineSnapshotDto {
  @IsUUID() branchId!: string;
}
