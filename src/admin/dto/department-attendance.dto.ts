import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
export class DepartmentAttendanceQueryDto {
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  meetingDate?: string;
}
export class RecordDepartmentAttendanceDto {
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsString() @MaxLength(200) visitorName?: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) meetingDate!: string;
  @IsIn(['present', 'late', 'absent', 'excused']) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
