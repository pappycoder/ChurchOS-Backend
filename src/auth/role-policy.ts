/** Retired login roles stay reserved so custom roles cannot recreate them. */
export const RETIRED_ROLE_NAMES = ['member'] as const;

export function isRetiredRole(role: string): boolean {
  return (RETIRED_ROLE_NAMES as readonly string[]).includes(role);
}

/** No implicit role or permissions are granted to a profile without staff roles. */
export function accessRoles(roles: readonly string[] | null | undefined): string[] {
  return (roles ?? []).filter((role) => role.trim().length > 0 && !isRetiredRole(role));
}
