/**
 * @file org.seed.ts
 * @description Seeds departments + members, cell groups + members + attendance,
 * and asset inventory (categories, assets, maintenance, depreciation, loans, scan logs).
 */

import {
  Prisma,
  PrismaClient,
  AssetCondition,
  AssetStatus,
  MaintenanceStatus,
  AssetLoanStatus,
  DepreciationMethod,
} from '@prisma/client';

export interface OrgSeedResult {
  departmentCount: number;
  cellGroupCount: number;
  assetCount: number;
}

// ── Department definitions ─────────────────────────────────────────
// [name, description?]
const DEPT_DEFS: Array<[string, string?]> = [
  ['Choir', 'Worship and music ministry'],
  ['Ushering', 'Welcome and seating ministry'],
  ['Media', 'Audio-visual and livestream ministry'],
  ['Youth', 'Youth and young adults fellowship'],
];

// [deptIdx, memberIdx, role]
const DEPT_MEMBER_DEFS: Array<[number, number, string]> = [
  [0, 0, 'coordinator'],
  [0, 1, 'member'],
  [1, 4, 'coordinator'],
  [1, 10, 'member'],
  [2, 11, 'member'],
  [2, 12, 'coordinator'],
  [3, 14, 'coordinator'],
  [3, 15, 'member'],
  [3, 16, 'member'],
];

// ── Cell group definitions ─────────────────────────────────────────
// [name, branch, meetingDay, meetingTime, leaderMemberIdx, address?]
const CELL_DEFS: Array<[string, 'hq' | 'lekki', string, string, number?, string?]> = [
  ['Lekki Phase1 Fellowship', 'lekki', 'Sunday', '17:00', 15, '15A Admiralty Way, Lekki'],
  ['Lekki Youth Cell', 'lekki', 'Friday', '18:00', 16],
  ['Ikeja Central Cell', 'hq', 'Thursday', '18:30', 0, '12 Allen Avenue, Ikeja'],
];

// [cellIdx, memberIdx, role]
const CELL_MEMBER_DEFS: Array<[number, number, string]> = [
  [0, 15, 'leader'],
  [0, 17, 'member'],
  [0, 18, 'member'],
  [1, 16, 'leader'],
  [1, 20, 'member'],
  [2, 0, 'leader'],
  [2, 11, 'member'],
  [2, 12, 'member'],
];

// ── Asset definitions ──────────────────────────────────────────────
// [name, assetTag, category, branch, departmentIdx, custodianMemberIdx,
//  condition, status, purchaseDate, purchasePrice, location]
const ASSET_DEFS: Array<
  [
    string,
    string,
    string,
    'hq' | 'lekki',
    number | undefined,
    number | undefined,
    AssetCondition,
    AssetStatus,
    string | undefined,
    number | undefined,
    string | undefined,
  ]
> = [
  [
    'Toyota Hiace Bus',
    'AST-001',
    'Vehicles',
    'hq',
    undefined,
    undefined,
    AssetCondition.good,
    AssetStatus.active,
    '2022-03-15',
    18500000,
    'Church HQ',
  ],
  [
    'HP Laptop (Media)',
    'AST-002',
    'Electronics',
    'hq',
    2,
    3,
    AssetCondition.good,
    AssetStatus.active,
    '2023-01-20',
    850000,
    'Media Room, HQ',
  ],
  [
    'Yamaha Keyboard',
    'AST-003',
    'Musical Instruments',
    'hq',
    0,
    1,
    AssetCondition.fair,
    AssetStatus.active,
    '2021-06-11',
    1200000,
    'Choir Room, HQ',
  ],
  [
    'Canon EOS 90D',
    'AST-004',
    'Electronics',
    'lekki',
    2,
    undefined,
    AssetCondition.good,
    AssetStatus.active,
    '2023-09-02',
    1450000,
    'Lekki Media, Lekki',
  ],
  [
    'Folding Chairs (200)',
    'AST-005',
    'Furniture',
    'lekki',
    1,
    undefined,
    AssetCondition.good,
    AssetStatus.active,
    '2024-01-10',
    2400000,
    'Lekki Auditorium',
  ],
  [
    'Projector (Epson)',
    'AST-006',
    'Electronics',
    'lekki',
    2,
    14,
    AssetCondition.good,
    AssetStatus.maintenance,
    '2023-11-15',
    950000,
    'Lekki Auditorium',
  ],
];

// ── Maintenance definitions ────────────────────────────────────────
// [assetIdx, type, status, scheduledDate, completedDate?, cost?, performedBy?]
const MAINT_DEFS: Array<[number, string, MaintenanceStatus, string, string?, number?, string?]> = [
  [0, 'service', MaintenanceStatus.completed, '2026-05-10', '2026-05-10', 250000, 'Mechanic'],
  [0, 'service', MaintenanceStatus.scheduled, '2026-09-20', undefined, 250000],
  [5, 'repair', MaintenanceStatus.in_progress, '2026-08-28', undefined, 120000],
];

export async function seedOrg(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: { id: string }[],
): Promise<OrgSeedResult> {
  console.log('📦 Seeding org (departments, cell groups, assets...)');

  const branchIdFor = (branch: 'hq' | 'lekki'): string =>
    branch === 'hq' ? hqBranchId : lekkiBranchId;

  // ── Departments ──────────────────────────────────────────────────
  const departments: { id: string }[] = [];
  let depCount = 0;

  for (const departmentDef of DEPT_DEFS) {
    const [name, description] = departmentDef;

    const existing = await prisma.department.findFirst({
      where: {
        church_id: churchId,
        name,
      },
    });

    if (existing) {
      departments.push({ id: existing.id });
      depCount++;
      continue;
    }

    const created = await prisma.department.create({
      data: {
        church_id: churchId,
        name,
        description: description ?? undefined,
      },
    });

    departments.push({ id: created.id });
    depCount++;

    console.log(`  ✅ Department: ${created.name}`);
  }

  // ── Department members ───────────────────────────────────────────
  for (const departmentMemberDef of DEPT_MEMBER_DEFS) {
    const [departmentIndex, memberIndex, role] = departmentMemberDef;

    const department = departments[departmentIndex];
    const member = members[memberIndex];

    if (!department || !member) {
      continue;
    }

    const existing = await prisma.departmentMember.findFirst({
      where: {
        department_id: department.id,
        member_id: member.id,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.departmentMember.create({
      data: {
        department_id: department.id,
        member_id: member.id,
        role,
      },
    });
  }

  // ── Cell groups ──────────────────────────────────────────────────
  const cells: { id: string }[] = [];
  let cellCount = 0;

  for (const cellDef of CELL_DEFS) {
    const [name, branch, meetingDay, meetingTime, leaderIndex, address] = cellDef;

    const existing = await prisma.cellGroup.findFirst({
      where: {
        church_id: churchId,
        name,
      },
    });

    if (existing) {
      cells.push({ id: existing.id });
      cellCount++;
      continue;
    }

    const leaderId = leaderIndex !== undefined ? members[leaderIndex]?.id : undefined;

    const created = await prisma.cellGroup.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        name,
        meeting_day: meetingDay,
        meeting_time: meetingTime,
        leader_id: leaderId,
        address: address ?? undefined,
      },
    });

    cells.push({ id: created.id });
    cellCount++;

    console.log(`  ✅ Cell Group: ${created.name}`);
  }

  // ── Cell group members ───────────────────────────────────────────
  for (const cellMemberDef of CELL_MEMBER_DEFS) {
    const [cellIndex, memberIndex, role] = cellMemberDef;

    const cell = cells[cellIndex];
    const member = members[memberIndex];

    if (!cell || !member) {
      continue;
    }

    const existing = await prisma.cellGroupMember.findFirst({
      where: {
        cell_group_id: cell.id,
        member_id: member.id,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.cellGroupMember.create({
      data: {
        cell_group_id: cell.id,
        member_id: member.id,
        role,
      },
    });
  }

  // ── Cell group attendance ────────────────────────────────────────
  // One meeting per cell.
  if (members[0]) {
    for (const cell of cells) {
      const meetingDate = new Date(2026, 8, 30);

      const existing = await prisma.cellGroupAttendance.findFirst({
        where: {
          cell_group_id: cell.id,
          member_id: members[0].id,
          meeting_date: meetingDate,
        },
      });

      if (existing) {
        continue;
      }

      await prisma.cellGroupAttendance.create({
        data: {
          cell_group_id: cell.id,
          member_id: members[0].id,
          meeting_date: meetingDate,
          status: 'present',
        },
      });
    }
  }

  // ── Asset inventory ──────────────────────────────────────────────
  const categories: { id: string; name: string }[] = [];

  const categoryNames = Array.from(new Set(ASSET_DEFS.map((asset) => asset[2])));

  for (const categoryName of categoryNames) {
    const existing = await prisma.assetCategory.findFirst({
      where: {
        church_id: churchId,
        name: categoryName,
      },
    });

    if (existing) {
      categories.push({
        id: existing.id,
        name: categoryName,
      });
      continue;
    }

    const created = await prisma.assetCategory.create({
      data: {
        church_id: churchId,
        name: categoryName,
        description: `${categoryName} category`,
      },
    });

    categories.push({
      id: created.id,
      name: categoryName,
    });
  }

  // ── Assets ───────────────────────────────────────────────────────
  const assets: { id: string }[] = [];
  let assetCount = 0;

  for (const assetDef of ASSET_DEFS) {
    const [
      name,
      assetTag,
      categoryName,
      branch,
      departmentIndex,
      custodianIndex,
      condition,
      status,
      purchaseDate,
      purchasePrice,
      location,
    ] = assetDef;

    const existing = await prisma.asset.findFirst({
      where: {
        church_id: churchId,
        asset_tag: assetTag,
      },
    });

    if (existing) {
      assets.push({ id: existing.id });
      assetCount++;
      continue;
    }

    const categoryId = categories.find((category) => category.name === categoryName)?.id;

    const departmentId =
      departmentIndex !== undefined ? departments[departmentIndex]?.id : undefined;

    const custodianId = custodianIndex !== undefined ? members[custodianIndex]?.id : undefined;

    const created = await prisma.asset.create({
      data: {
        church_id: churchId,
        asset_tag: assetTag,
        name,
        description: `${name} (seeded)`,
        branch_id: branchIdFor(branch),
        category_id: categoryId,
        department_id: departmentId,
        custodian_id: custodianId,

        serial_number: `SN-${assetTag.split('-')[1]}-${Date.now().toString().slice(-4)}`,

        brand: name.includes('Toyota')
          ? 'Toyota'
          : name.includes('HP')
            ? 'HP'
            : name.includes('Yamaha')
              ? 'Yamaha'
              : name.includes('Canon')
                ? 'Canon'
                : name.includes('Epson')
                  ? 'Epson'
                  : 'Generic',

        model: name,
        condition,
        status,
        purchase_date: purchaseDate ? new Date(purchaseDate) : undefined,
        purchase_price: purchasePrice ?? undefined,
        salvage_value: purchasePrice ? Math.round(purchasePrice * 0.1) : 0,
        useful_life_years: purchasePrice
          ? Math.max(1, Math.round(purchasePrice / 1000000))
          : undefined,
        depreciation_method: DepreciationMethod.straight_line,
        current_value: purchasePrice ?? undefined,
        location: location ?? undefined,
        qr_code: `QR-${assetTag}`,
      },
    });

    assets.push({ id: created.id });
    assetCount++;

    console.log(`  ✅ Asset: ${created.name} (${created.asset_tag})`);
  }

  // ── Maintenance ─────────────────────────────────────────────────
  for (const maintenanceDef of MAINT_DEFS) {
    const [assetIndex, type, status, scheduledDate, completedDate, cost, performedBy] =
      maintenanceDef;

    const asset = assets[assetIndex];

    if (!asset) {
      continue;
    }

    const scheduledDateValue = new Date(scheduledDate);

    const existing = await prisma.assetMaintenance.findFirst({
      where: {
        asset_id: asset.id,
        type,
        status,
        scheduled_date: scheduledDateValue,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.assetMaintenance.create({
      data: {
        asset_id: asset.id,
        type,
        status,
        scheduled_date: scheduledDateValue,
        completed_date: completedDate ? new Date(completedDate) : undefined,
        cost: cost ?? undefined,
        performed_by: performedBy ?? undefined,
      },
    });
  }

  // ── Depreciation ─────────────────────────────────────────────────
  // Current year for each asset.
  for (const asset of assets) {
    const existing = await prisma.assetDepreciation.findFirst({
      where: {
        asset_id: asset.id,
        year: 2026,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.assetDepreciation.create({
      data: {
        asset_id: asset.id,
        year: 2026,
        opening_value: 1000000,
        depreciation_amount: 100000,
        closing_value: 900000,
      },
    });
  }

  // ── Asset loans ──────────────────────────────────────────────────
  if (assets[0] && members[4]) {
    const existing = await prisma.assetLoan.findFirst({
      where: {
        asset_id: assets[0].id,
        borrower_member_id: members[4].id,
        status: AssetLoanStatus.borrowed,
      },
    });

    if (!existing) {
      await prisma.assetLoan.create({
        data: {
          asset_id: assets[0].id,
          borrower_member_id: members[4].id,
          loan_date: new Date(2026, 8, 15),
          expected_return_date: new Date(2026, 9, 15),
          status: AssetLoanStatus.borrowed,
          condition_before: AssetCondition.good,
        },
      });
    }
  }

  // ── Asset scan logs ───────────────────────────────────────────────
  if (assets[2]) {
    const existing = await prisma.assetScanLog.findFirst({
      where: {
        asset_id: assets[2].id,
        scan_type: 'check',
      },
    });

    if (!existing) {
      await prisma.assetScanLog.create({
        data: {
          asset_id: assets[2].id,
          scan_type: 'check',
          metadata: {
            scanned_by: 'seed',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  console.log(`  🎉 Departments: ${depCount}, cell groups: ${cellCount}, assets: ${assetCount}`);

  return {
    departmentCount: depCount,
    cellGroupCount: cellCount,
    assetCount,
  };
}
