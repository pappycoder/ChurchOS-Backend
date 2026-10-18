import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export interface GeneralAttendanceSummary {
  reportCount: number;
  total: number;
  adultCount: number;
  childrenCount: number;
  maleCount: number;
  femaleCount: number;
  unspecifiedAgeCount: number;
  unspecifiedGenderCount: number;
}
export async function summarizeGeneralAttendance(
  prisma: PrismaService,
  where: Prisma.AttendanceSessionWhereInput,
): Promise<GeneralAttendanceSummary> {
  const result = await prisma.attendanceSession.aggregate({
    where,
    _count: { _all: true },
    _sum: {
      total: true,
      adult_count: true,
      children_count: true,
      male_count: true,
      female_count: true,
    },
  });
  const sum = result?._sum;
  const total = sum?.total ?? 0,
    adultCount = sum?.adult_count ?? 0,
    childrenCount = sum?.children_count ?? 0,
    maleCount = sum?.male_count ?? 0,
    femaleCount = sum?.female_count ?? 0;
  return {
    reportCount: result?._count?._all ?? 0,
    total,
    adultCount,
    childrenCount,
    maleCount,
    femaleCount,
    unspecifiedAgeCount: total - adultCount - childrenCount,
    unspecifiedGenderCount: total - maleCount - femaleCount,
  };
}
