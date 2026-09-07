/**
 * @file index.seed.ts
 * @description PRODUCTION seed orchestration — reference data only.
 *
 * Seeds the platform-wide role/permission catalog (roles, permissions, and the
 * default role-permission mappings) so a fresh install has its enforcement
 * foundation in place. Everything church-scoped — the church, branches, giving
 * categories, services, form templates, and actual people — is deliberately NOT
 * seeded here: those are created by the church's admin through the app's
 * registration page after logging in.
 *
 * Idempotent — safe to rerun (reconciliation keeps template grants exact).
 *
 * @module seeds/production/index.seed
 */

import { PrismaClient } from '@prisma/client';

import { seedPermissions } from '../shared/permissions.seed';

export interface ProductionSeedResult {
  roleCount: number;
}

export async function runProductionSeed(prisma: PrismaClient): Promise<ProductionSeedResult> {
  console.log('🌱 Starting PRODUCTION seed...\n');

  await seedPermissions(prisma);

  const roleCount = await prisma.role.count({ where: { church_id: null } });

  console.log('\n🎉 Production seed completed successfully!\n');
  console.log('Summary:');
  console.log(
    `  • Global roles/permissions/mappings seeded (see permissions.seed.ts output above)`,
  );
  console.log(
    '  • Note: church, branches, and church-scoped data are NOT seeded — ' +
      'the admin creates them via registration after login.',
  );
  console.log(`  • Global roles in database: ${roleCount}`);

  return { roleCount };
}
