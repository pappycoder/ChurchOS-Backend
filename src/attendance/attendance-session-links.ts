import { PrismaService } from '../prisma/prisma.service';
import { ViewerScope } from '../common/services/branch-scope.service';
import type { AttendanceContext } from './attendance-sessions.service';

/** Never guess a branch for HQ shared meetings; unassigned details stay optional. */
export async function attendanceSessionId(
  prisma: PrismaService,
  type: AttendanceContext,
  contextId: string,
  churchId: string,
  date: Date,
  parentBranch?: string | null,
  viewer?: ViewerScope | null,
): Promise<string | undefined> {
  const branchId = parentBranch ?? (!viewer?.is_admin_hq ? viewer?.branch_id : undefined);
  if (!branchId) return undefined;
  const field = {
    service: 'service_id',
    event: 'event_id',
    department: 'department_id',
    cell_group: 'cell_group_id',
  }[type];
  const session = await prisma.attendanceSession.findFirst({
    where: {
      church_id: churchId,
      branch_id: branchId,
      [field]: contextId,
      attendance_date: new Date(date.toISOString().slice(0, 10)),
    },
    select: { id: true },
  });
  return session?.id;
}
