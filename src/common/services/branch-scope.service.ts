import { Injectable } from '@nestjs/common';

/**
 * Describes the viewer context needed to compute data scoping.
 * Mirrors the fields attached to `AuthenticatedRequest.profile` by the
 * request-context middleware. `roles` is the full role set (rank-descending);
 * `role` is the primary (highest-rank) role.
 */
export interface ViewerScope {
  church_id: string;
  branch_id?: string;
  /** Linked member id (used to scope cell_leader to the groups they lead) */
  member_id?: string;
  role: string;
  roles?: string[];
  /** HQ override: when true, the viewer sees data from ALL branches in their church */
  is_admin_hq?: boolean;
}

/**
 * Result of resolving a viewer's data scope.
 *
 * - `churchOnly` is true when the viewer should see every branch in the church
 *   (i.e. the `admin-hq` override is set).
 * - `branchId` is the effective branch filter to apply when not church-wide.
 */
export interface ResolvedBranchScope {
  /** True when data should NOT be restricted to a single branch */
  churchOnly: boolean;
  /** Branch to filter by when `churchOnly` is false; undefined when the viewer has no branch */
  branchId?: string;
}

/**
 * Computes the effective data-scoping rule for a viewer based on their
 * `is_admin_hq` flag and branch membership.
 *
 * Without `admin-hq`, a viewer only sees rows from THEIR OWN branch. With
 * `admin-hq`, they see every branch in the church (within their permission
 * scope). The `admin-hq` flag is a per-profile boolean that can be applied to
 * any role and is defaulted ON for `church_admin`.
 *
 * This service is the single point of truth for the branch-vs-church-wide
 * decision so the rule lives in one place instead of being scattered across
 * services.
 *
 * @module common/services/branch-scope
 */
@Injectable()
export class BranchScopeService {
  /**
   * Resolves the branch-scoping rule for a viewer.
   *
   * @param viewer - The request profile (or an object shaped like it).
   * @returns `{ churchOnly, branchId }` — `churchOnly: true` when the viewer is
   *   an `admin-hq` override holder (see every branch), otherwise
   *   `branchId` is the viewer's own branch (undefined when they have none).
   */
  resolve(viewer?: ViewerScope | null): ResolvedBranchScope {
    if (!viewer) {
      return { churchOnly: true };
    }

    if (viewer.is_admin_hq) {
      return { churchOnly: true };
    }

    return {
      churchOnly: false,
      branchId: viewer.branch_id,
    };
  }

  /**
   * True when the viewer's data should be restricted to a single branch.
   * Equivalent to `!resolve(viewer).churchOnly`.
   */
  isBranchRestricted(viewer?: ViewerScope | null): boolean {
    return !this.resolve(viewer).churchOnly;
  }

  /**
   * True when the viewer should only see resources in the given branch —
   * i.e. they are branch-restricted (not HQ) and the row's branch either
   * differs from theirs or the viewer has no branch.
   *
   * @param viewer - The request profile.
   * @param rowBranchId - The branch a candidate row belongs to (may be null).
   */
  isVisible(viewer: ViewerScope | null | undefined, rowBranchId?: string | null): boolean {
    if (!viewer || viewer.is_admin_hq) {
      return true;
    }
    return !!viewer.branch_id && viewer.branch_id === rowBranchId;
  }

  /**
   * The scoping rule for CELL GROUPS, which is stricter than the generic
   * branch rule:
   *
   * - `admin-hq` holders see every cell group in the church.
   * - `cell_leader` (without admin-hq) sees ONLY the groups they lead
   *   (`leader_id` = their linked member id) — NOT other groups in their branch.
   * - everyone else (branch_pastor, secretary, department_head, treasurer, …)
   *   sees the groups in their own branch.
   *
   * @param viewer - The request profile.
   * @returns
   *   `{ churchOnly: true }` for admin-hq holders;
   *   `{ leaderId }` for a branch-restricted cell_leader (own-group only);
   *   `{ branchId }` for everyone else who has a branch.
   */
  resolveCellGroupScope(
    viewer?: ViewerScope | null,
  ):
    | { churchOnly: true; leaderId?: undefined; branchId?: undefined }
    | { churchOnly: false; leaderId?: string; branchId?: string } {
    if (!viewer || viewer.is_admin_hq) {
      return { churchOnly: true };
    }

    const isCellLeader = viewer.role === 'cell_leader' || viewer.roles?.includes('cell_leader');

    if (isCellLeader) {
      return { churchOnly: false, leaderId: viewer.member_id };
    }

    return { churchOnly: false, branchId: viewer.branch_id };
  }
}
