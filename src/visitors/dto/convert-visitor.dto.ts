import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class ConvertVisitorDto {
  @ApiProperty({ description: 'First name for the new member' })
  @IsString()
  @MaxLength(100)
  first_name!: string;

  @ApiProperty({ description: 'Last name for the new member' })
  @IsString()
  @MaxLength(100)
  last_name!: string;

  @ApiPropertyOptional({ description: 'Email for the new member' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone for the new member' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Branch ID for the new member' })
  @IsOptional()
  @IsString()
  branch_id?: string;
}
