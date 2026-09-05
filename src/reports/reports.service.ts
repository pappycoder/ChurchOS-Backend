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
  ): Promise<FinancialReportDto> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const end = endDate ? new Date(endDate) : new Date();

    const where: Record<string, unknown> = {
      church_id: churchId,
      status: 'success',
      created_at: { gte: start, lte: end },
    };

    if (branchId) {
      where.branch_id = branchId;
    }

    const [transactions, categoryBreakdown] = await Promise.all([
      this.prisma.transaction.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.transaction.groupBy({
        by: ['category_id'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
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

    const monthlyTrend = await this.getMonthlyTrend(churchId, start, end, 'transaction', branchId);

    this.logger.log(`Financial report generated for church ${churchId}`);

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      grandTotal,
      transactionCount,
      averageAmount: transactionCount > 0 ? Math.round(grandTotal / transactionCount) : 0,
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
    const end = endDate ? new Date(endDate) : new Date();

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

    const [totalAttendance, serviceCount, byService] = await Promise.all([
      this.prisma.attendance.aggregate({
        where: attendanceWhere,
        _count: true,
      }),
      this.prisma.service.count({ where: serviceWhere }),
      this.prisma.service.findMany({
        where: serviceWhere,
        select: {
          name: true,
          _count: { select: { attendance: true } },
        },
      }),
    ]);

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

    this.logger.log(`Attendance report generated for church ${churchId}`);

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalAttendance: total,
      serviceCount,
      averagePerService: serviceCount > 0 ? Math.round((total / serviceCount) * 10) / 10 : 0,
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
  ): Promise<MemberReportDto> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
    const end = endDate ? new Date(endDate) : new Date();

    const [totalMembers, newMembers, byStatus, byGender] = await Promise.all([
      this.prisma.member.count({ where: { church_id: churchId } }),
      this.prisma.member.count({
        where: {
          church_id: churchId,
          created_at: { gte: start, lte: end },
        },
      }),
      this.prisma.member.groupBy({
        by: ['status'],
        where: { church_id: churchId },
        _count: true,
      }),
      this.prisma.member.groupBy({
        by: ['gender'],
        where: { church_id: churchId, gender: { not: null } },
        _count: true,
      }),
    ]);

    const statusBreakdown: MemberStatusDto[] = byStatus.map((s) => ({
      status: s.status,
      count: s._count || 0,
    }));

    const genderBreakdown: MemberGenderDto[] = byGender.map((g) => ({
      gender: g.gender || 'unspecified',
      count: g._count || 0,
    }));

    const activeMembers = statusBreakdown.find((s) => s.status === 'active')?.count || 0;

    const monthlyGrowth = await this.getMonthlyMemberGrowth(churchId, start, end);

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
  ): Promise<MonthlyTrendDto[]> {
    const where: Record<string, unknown> = {
      church_id: churchId,
      status: 'success',
      created_at: { gte: start, lte: end },
    };
    if (branchId) {
      where.branch_id = branchId;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      select: { amount: true, created_at: true },
    });

    return this.aggregateMonthly(transactions, 'created_at', 'amount');
  }

  private async getMonthlyAttendanceTrend(
    churchId: string,
    start: Date,
    end: Date,
    branchId?: string,
  ): Promise<MonthlyTrendDto[]> {
    const attendanceWhere: Record<string, unknown> = {
      church_id: churchId,
      checkin_at: { gte: start, lte: end },
    };
    if (branchId) {
      attendanceWhere.service = { is: { branch_id: branchId } };
    }

    const attendances = await this.prisma.attendance.findMany({
      where: attendanceWhere,
      select: { checkin_at: true },
    });

    return this.aggregateMonthly(attendances, 'checkin_at', null);
  }

  private async getMonthlyMemberGrowth(
    churchId: string,
    start: Date,
    end: Date,
  ): Promise<MonthlyTrendDto[]> {
    const members = await this.prisma.member.findMany({
      where: {
        church_id: churchId,
        created_at: { gte: start, lte: end },
      },
      select: { created_at: true },
    });

    return this.aggregateMonthly(members, 'created_at', null);
  }

  private aggregateMonthly(
    items: Array<Record<string, unknown>>,
    dateField: string,
    valueField: string | null,
  ): MonthlyTrendDto[] {
    const map = new Map<string, number>();

    for (const item of items) {
      const date = item[dateField] as Date;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = map.get(month) || 0;
      map.set(month, current + (valueField ? Number(item[valueField]) || 1 : 1));
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));
  }
}
