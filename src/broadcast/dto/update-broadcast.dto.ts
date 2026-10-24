import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Recipient changes are allowed only before scheduled sending begins. */
export class UpdateBroadcastDto {
  @ApiProperty({ description: 'New audience branch' })
  @IsUUID()
  branchId!: string;
}
