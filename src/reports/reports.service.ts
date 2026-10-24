import { summarizeGeneralAttendance } from '../attendance/general-attendance-summary';
/**
 * @file reports.service.ts
 * @description Service for generating church reports.
 *
 * Provides financial, attendance, and member reports with
 * aggregation queries scoped by church_id and optional date ranges.
 *
 * @module reports/reports.service
 * @since 1.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialReportDto,
  AttendanceReportDto,
  MemberReportDto,
  CategoryBreakdownDto,
  MonthlyTrendDto,
  ServiceAttendanceDto,
  MemberStatusDto,
  MemberGenderDto,
} from './dto/reports-response.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a financial report for the given period.
   */
  async getFinancialReport(
    churchId: string,
    startDate?: string,
    endDate?: string,
    branchId?: string,
    currency = 'NGN',
  ): Promise<FinancialReportDto> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const end = endDate
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate)
      : new Date();

    const where: Record<string, unknown> = {
      church_id: churchId,
      status: 'success',
      currency,
      giving_date: { gte: start, lte: end },
    };

    if (branchId) {
      where.branch_id = branchId;
    }

    const [transactions, categoryBreakdown, monthlyTrend] = await Promise.all([
      this.prisma.transaction.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.transaction.groupBy({
        by: ['category_id'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.getMonthlyTrend(churchId, start, end, 'transaction', branchId, currency),
    ]);

    const grandTotal = Number(transactions._sum.amount) || 0;
    const transactionCount = transactions._count || 0;

    const categoryIds = categoryBreakdown.map((c) => c.category_id).filter(Boolean);
    const categories = categoryIds.length
      ? await this.prisma.givingCategory.findMany({
          where: { id: { in: categoryIds as string[] }, church_id: churchId },
        })
      : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const byCategory: CategoryBreakdownDto[] = categoryBreakdown.map((c) => ({
      name: categoryMap.get(c.category_id || '') || 'Unknown',
      total: Number(c._sum.amount) || 0,
      count: c._count || 0,
    }));

    this.logger.log(`Financial report generated for church ${churchId}`);

    return {
      currency,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      grandTotal,
      transactionCount,
      averageAmount:
        transactionCount > 0 ? Math.round((grandTotal / transactionCount) * 100) / 100 : 0,
      byCategory,
      monthlyTrend,
    };
  }

  /**
   * Generate an attendance report for the given period.
   */
  async getAttendanceReport(
    churchId: string,
    startDate?: string,
    endDate?: string,
    branchId?: string,
  ): Promise<AttendanceReportDto> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const end = endDate
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate)
      : new Date();

    const attendanceWhere: Record<string, unknown> = {
      church_id: churchId,
      checkin_at: { gte: start, lte: end },
    };
    if (branchId) {
      attendanceWhere.service = { is: { branch_id: branchId } };
    }

    const serviceWhere: Record<string, unknown> = {
      church_id: churchId,
    };
    if (branchId) {
      serviceWhere.branch_id = branchId;
    }

    const totalAttendance = await this.prisma.attendance.aggregate({
      where: attendanceWhere,
      _count: true,
    });
    const serviceCount = await this.prisma.service.count({ where: serviceWhere });
    const byService = await this.prisma.service.findMany({
      where: serviceWhere,
      select: {
        name: true,
        _count: { select: { attendance: true } },
      },
    });

    const total = totalAttendance._count || 0;

    const serviceBreakdown: ServiceAttendanceDto[] = byService.reduce((acc, s) => {
      const existing = acc.find((a) => a.name === s.name);
      if (existing) {
        existing.total += s._count.attendance;
        existing.serviceCount += 1;
        existing.average = Math.round((existing.total / existing.serviceCount) * 10) / 10;
      } else {
        acc.push({
          name: s.name,
          total: s._count.attendance,
          serviceCount: 1,
          average: s._count.attendance,
        });
      }
      return acc;
    }, [] as ServiceAttendanceDto[]);

    const monthlyTrend = await this.getMonthlyAttendanceTrend(churchId, start, end, branchId);
    const generalAttendance = await summarizeGeneralAttendance(this.prisma, {
      service_id: { not: null },
      church_id: churchId,
      ...(branchId ? { branch_id: branchId } : {}),
      attendance_date: {
        gte: new Date(start.toISOString().slice(0, 10)),
        lte: new Date(end.toISOString().slice(0, 10)),
      },
    });

    this.logger.log(`Attendance report generated for church ${churchId}`);

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalAttendance: total,
      serviceCount,
      averagePerService: serviceCount > 0 ? Math.round((total / serviceCount) * 10) / 10 : 0,
      ...(generalAttendance.reportCount ? { generalAttendance } : {}),
      byService: serviceBreakdown,
      monthlyTrend,
    };
  }

  /**
   * Generate a member report for the given period.
   */
  async getMemberReport(
    churchId: string,
    startDate?: string,
    endDate?: string,
    branchId?: string,
  ): Promise<MemberReportDto> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const end = endDate
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate)
      : new Date();

    const memberWhere: Prisma.MemberWhereInput = { church_id: churchId };
    if (branchId) memberWhere.branch_id = branchId;
    const totalMembers = await this.prisma.member.count({ where: memberWhere });
    const newMembers = await this.prisma.member.count({
      where: {
        ...memberWhere,
        created_at: { gte: start, lte: end },
      },
    });
    const byStatus = await this.prisma.member.groupBy({
      by: ['status'],
      where: memberWhere,
      _count: true,
    });
    const byGender = await this.prisma.member.groupBy({
      by: ['gender'],
      where: { ...memberWhere, gender: { not: null } },
      _count: true,
    });

    const statusBreakdown: MemberStatusDto[] = byStatus.map((s) => ({
      status: s.status,
      count: s._count || 0,
    }));

    const genderBreakdown: MemberGenderDto[] = byGender.map((g) => ({
      gender: g.gender || 'unspecified',
      count: g._count || 0,
    }));

    const activeMembers = statusBreakdown.find((s) => s.status === 'active')?.count || 0;

    const monthlyGrowth = await this.getMonthlyMemberGrowth(churchId, start, end, branchId);

    this.logger.log(`Member report generated for church ${churchId}`);

    return {
      totalMembers,
      newMembersInPeriod: newMembers,
      activeMembers,
      byStatus: statusBreakdown,
      byGender: genderBreakdown,
      monthlyGrowth,
    };
  }

  private async getMonthlyTrend(
    churchId: string,
    start: Date,
    end: Date,
    _entity: string,
    branchId?: string,
    currency = 'NGN',
  ): Promise<MonthlyTrendDto[]> {
    return this.monthlyRows(Prisma.sql`
      SELECT to_char(giving_date, 'YYYY-MM') AS month, SUM(amount) AS total
      FROM transactions
      WHERE church_id = ${churchId} AND status = 'success' AND currency = ${currency}
        AND giving_date >= ${start} AND giving_date <= ${end}
        ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
      GROUP BY 1 ORDER BY 1
    `);
  }

  private async getMonthlyAttendanceTrend(
    churchId: string,
    start: Date,
    end: Date,
    branchId?: string,
  ): Promise<MonthlyTrendDto[]> {
    return this.monthlyRows(Prisma.sql`
      SELECT to_char(a.checkin_at, 'YYYY-MM') AS month, COUNT(*) AS total
      FROM attendance a
      WHERE a.church_id = ${churchId} AND a.checkin_at >= ${start} AND a.checkin_at <= ${end}
        ${
          branchId
            ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM services s WHERE s.id = a.service_id AND s.church_id = ${churchId}
            AND s.branch_id = ${branchId}
        )`
            : Prisma.empty
        }
      GROUP BY 1 ORDER BY 1
    `);
  }

  private async getMonthlyMemberGrowth(
    churchId: string,
    start: Date,
    end: Date,
    branchId?: string,
  ): Promise<MonthlyTrendDto[]> {
    return this.monthlyRows(Prisma.sql`
      SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*) AS total
      FROM members
      WHERE church_id = ${churchId} AND created_at >= ${start} AND created_at <= ${end}
        ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
      GROUP BY 1 ORDER BY 1
    `);
  }

  /** PostgreSQL returns monthly aggregates, never an unbounded list of people/gifts. */
  private async monthlyRows(query: Prisma.Sql): Promise<MonthlyTrendDto[]> {
    const rows =
      await this.prisma.$queryRaw<
        Array<{ month: string; total: Prisma.Decimal | bigint | number }>
      >(query);
    return rows.map(({ month, total }) => ({ month, total: Number(total) }));
  }
}
