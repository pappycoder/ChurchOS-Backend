import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
export class GeneralAttendanceCountsDto {
  @IsInt() @Min(0) @Max(2147483647) total!: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) adultCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) childrenCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) maleCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) femaleCount?: number;
}
export class RecordAttendanceSessionDto extends GeneralAttendanceCountsDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) attendanceDate!: string;
}
export class RecordGeneralAttendanceDto extends RecordAttendanceSessionDto {
  @IsUUID() serviceId!: string;
}
export class GeneralAttendanceQueryDto {
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
export function validateGeneralCounts(counts: GeneralAttendanceCountsDto): void {
  for (const value of [
    counts.total,
    counts.adultCount,
    counts.childrenCount,
    counts.maleCount,
    counts.femaleCount,
  ])
    if (value != null && (!Number.isInteger(value) || value < 0 || value > 2147483647))
      throw new Error('Counts must be non-negative whole numbers');
  if (counts.total == null) throw new Error('Total attendance is required');
  if ((counts.adultCount ?? 0) + (counts.childrenCount ?? 0) > counts.total)
    throw new Error('Adults and children cannot exceed total attendance');
  if ((counts.maleCount ?? 0) + (counts.femaleCount ?? 0) > counts.total)
    throw new Error('Male and female counts cannot exceed total attendance');
}
