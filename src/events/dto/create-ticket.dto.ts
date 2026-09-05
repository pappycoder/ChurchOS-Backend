import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiPropertyOptional({ description: 'Member UUID to assign ticket to' })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Visitor UUID to assign ticket to' })
  @IsOptional()
  @IsString()
  visitorId?: string;

  @ApiPropertyOptional({ description: 'Ticket tier UUID (optional)' })
  @IsOptional()
  @IsString()
  tierId?: string;
}
