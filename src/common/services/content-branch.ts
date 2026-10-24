import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedBranchScope } from './branch-scope.service';

/** Resolve an owned branch without accepting another tenant or a scoped reassignment. */
export async function contentBranch(
  prisma: PrismaService,
  scope: ResolvedBranchScope,
  churchId: string,
  requested?: string,
): Promise<string | null> {
  if (requested !== undefined && (typeof requested !== 'string' || !requested)) {
    throw new BadRequestException('Select a branch');
  }
  if (!scope.churchOnly && requested !== undefined && requested !== scope.branchId) {
    throw new ForbiddenException('You can only manage records in your branch');
  }
  const branchId = scope.churchOnly ? requested : scope.branchId;
  if (!scope.churchOnly && (!branchId || branchId === '00000000-0000-0000-0000-000000000000')) {
    throw new ForbiddenException('A branch assignment is required');
  }
  if (!branchId) return null; // Preserve existing church-wide API/background creation.
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, church_id: churchId, archived_at: null },
    select: { id: true },
  });
  if (!branch) throw new NotFoundException('Active branch not found in this church');
  return branchId;
}
