/** Read-only audit: no seeds, grants, profiles or overrides are modified. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_ROLES,
  generateAllPermissions,
} from '../prisma/seeds/shared/permissions.seed';

async function main() {
  if (!process.env.DATABASE_URL) {
    process.stdout.write(
      `${JSON.stringify({ databaseChecked: false, reason: 'DATABASE_URL is not configured' })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    }),
  });
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const roles = await tx.role.findMany({
          where: { church_id: null },
          select: {
            name: true,
            permissions: { select: { permission: { select: { name: true } } } },
          },
        });
        const permissions = await tx.permission.findMany({ select: { name: true } });
        const overrides = await tx.churchRolePermission.count();
        const customRoles = await tx.role.count({ where: { church_id: { not: null } } });
        const unassigned = await tx.profile.count({
          where: { status: 'active', archived_at: null, is_admin_hq: false, branch_id: null },
        });
        const catalog = generateAllPermissions().map((permission) => permission.name);
        const actualCatalog = new Set(permissions.map((permission) => permission.name));
        const differences = DEFAULT_ROLES.flatMap(({ name }) => {
          const role = roles.find((candidate) => candidate.name === name);
          const expected = name === 'super_admin' ? catalog : DEFAULT_PERMISSION_MATRIX[name];
          const actual = new Set(role?.permissions.map((grant) => grant.permission.name) ?? []);
          const desired = new Set(expected);
          const missing = expected.filter((grant) => !actual.has(grant));
          const extra = [...actual].filter((grant) => !desired.has(grant));
          return !role || missing.length || extra.length
            ? [{ role: name, missingTemplate: !role, missing, extra }]
            : [];
        });
        return {
          databaseChecked: true,
          missingCatalogPermissions: catalog.filter((name) => !actualCatalog.has(name)),
          globalTemplateDifferences: differences,
          churchOverrides: overrides,
          customRoles,
          activeNonHqProfilesWithoutBranch: unassigned,
        };
      },
      { timeout: 30000, maxWait: 5000 },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.missingCatalogPermissions.length || result.globalTemplateDifferences.length)
      process.exitCode = 1;
  } catch {
    // Never print database URLs or provider errors which may contain credentials.
    process.stdout.write(
      `${JSON.stringify({ databaseChecked: false, reason: 'Read-only database audit could not connect or complete; no data was changed' })}\n`,
    );
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
