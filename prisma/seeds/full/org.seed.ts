/**
 * @file org.seed.ts
 * @description Seeds departments + members, cell groups + members + attendance,
 * and asset inventory (categories, assets, maintenance, depreciation, loans, scan logs).
 */

import { PrismaClient, AssetCondition, AssetStatus, MaintenanceStatus, AssetLoanStatus, DepreciationMethod } from '@prisma/client';

export interface OrgSeedResult {
  departmentCount: number;
  cellGroupCount: number;
  assetCount: number;
}

// [name, description?]
const DEPT_DEFS: Array<[string, string?]> = [
  ['Choir','Worship and music ministry'],
  ['Ushering','Welcome and seating ministry'],
  ['Media','Audio-visual and livestream ministry'],
  ['Youth','Youth and young adults fellowship'],
];

// [deptIdx, memberIdx, role]
const DEPT_MEMBER_DEFS: Array<[number, number, string]> = [
  [0,0,'coordinator'],
  [0,1,'member'],
  [1,4,'coordinator'],
  [1,10,'member'],
  [2,11,'member'],
  [2,12,'coordinator'],
  [3,14,'coordinator'],
  [3,15,'member'],
  [3,16,'member'],
];

// [name, branch, meetingDay, meetingTime, leaderMemberIdx, address?]
const CELL_DEFS: Array<[string,'hq' | 'lekki', string, string, number?, string?]> = [
  ['Lekki Phase1 Fellowship','lekki','Sunday','17:00',15,'15A Admiralty Way, Lekki'],
  ['Lekki Youth Cell','lekki','Friday','18:00',16,,],
  ['Ikeja Central Cell','hq','Thursday','18:30',0,'12 Allen Avenue, Ikeja'],
];

// [cellIdx, memberIdx, role]
const CELL_MEMBER_DEFS: Array<[number, number, string]> = [
  [0','15','leader'],
  [0','17','member'],
  [0','18','member'],
  [1','16','leader'],
  [1','20','member'],
  [2','0','leader'],
  [2','11','member'],
  [2','12','member'],
];

// [name, assetTag, category, branch, departmentIdx, custodianMemberIdx, condition, status, purchaseDate, purchasePrice, location]
const ASSET_DEFS: Array<[string, string, string, 'hq' | 'lekki', number?, number?, AssetCondition, AssetStatus, string?, number?, string?]> = [
  ['Toyota Hiace Bus','AST-001','Vehicles','hq',undefined,undefined,'good','active','2022-03-15',18500000,'Church HQ'],
  ['HP Laptop (Media)','AST-002','Electronics','hq',2,3,'good','active','2023-01-20',850000,'Media Room, HQ'],
  ['Yamaha Keyboard','AST-003','Musical Instruments','hq',0,1,'fair','active','2021-06-11',1200000,'Choir Room, HQ'],
  ['Canon EOS 90D','AST-004','Electronics','lekki',2,,12,'good','active','2023-09-02',1450000,'Lekki Media, Lekki'],
  ['Folding Chairs (200)','AST-005','Furniture','lekki',1,,undefined,'good','active','2024-01-10',2400000,'Lekki Auditorium'],
  ['Projector (Epson)','AST-006','Electronics','lekki',2,,14,'good','maintenance','2023-11-15',950000,'Lekki Auditorium'],
];

// [assetIdx, type, status, scheduledDate, completedDate?, cost?, performedBy?]
const MAINT_DEFS: Array<[number, string, MaintenanceStatus, string, string?, number?, string?]> = [
  ['0','service','completed','2026-05-10','2026-05-10',250000,'Mechanic'],
  ['0','service','scheduled','2026-09-20',undefined,250000,,],
  ['5','repair','in_progress','2026-08-28',undefined,120000,,],
];

export async function seedOrg(
  prisma: PrismaClient,
  churchId: string,
  hqBranchId: string,
  lekkiBranchId: string,
  members: { id: string }[],
): Promise<OrgSeedResult> {
  console.log('📦 Seeding org (departments, cell groups, assets...');

   const branchIdFor = (b: 'hq' | 'lekki'): string => (b === 'hq' ? hqBranchId : lekkiBranchId);

   // ── Departments ────────────────────────────────────────────────
   const departments: { id: string }[] = [];
   let depCount = ;
   for ( (const d of DEPT_DEFS) {
    const [name, desc] = d;
    const existing = await prisma.department.findFirst({ where: { church_id: churchId, name } } });
    if (existing) { departments.push({ id: existing.id }); depCount++; continue; }
    const created = await prisma.department.create({ data: { church_id: churchId, name, description: desc ?? undefined } } });
    departments.push({ id: created.id });
    depCount++;
    console.log(`  ✅ Department: ${created.name}`);
  }

   for ( (const dm of DEPT_MEMBER_DEFS) {
    const [di, mi,, role] = dm;
    const dept = departments[di];
    const member = members[mi];
    if (!dept || !member) continue;
    const existing = await prisma.departmentMember.findFirst({ where: { department_id: dept.id, member_id: member.id } } });
    if (existing) continue;
    await prisma.departmentMember.create({ data: { department_id: dept.id, member_id: member.id, role } } });
  }

   // ── Cell groups ─────────────────────────────────────────────────
   const cells: { id: string }[] = [];
   let cellCount = ;
   for ( (const c of CELL_DEFS) {
    const [name,, branch,, day,, time,, leaderIdx,, addr] = c;
    const existing = await prisma.cellGroup.findFirst({ where: { church_id: churchId, name } } });
    if (existing) { cells.push({ id: existing.id }); cellCount++; continue; }
    const created = await prisma.cellGroup.create({
      data: {
        church_id: churchId,
        branch_id: branchIdFor(branch),
        name,
        meeting_day: day,
        meeting_time: time,
        leader_id: leaderIdx !== undefined ? members[leaderIdx]?.id : undefined,
        address: addr ?? undefined,
      },
    });
    cells.push({ id: created.id });
    cellCount++;
    console.log(`  ✅ Cell Group: ${created.name}`);
  }

   for ( (const cm of CELL_MEMBER_DEFS) {
    const [ci,, mi,, role] = cm;
    const cell = cells[ci];
    const member = members[mi];
    if (!cell || !member) continue;
    const existing = await prisma.cellGroupMember.findFirst({ where: { cell_group_id: cell.id, member_id: member.id } } });
    if (existing) continue;
    await prisma.cellGroupMember.create({ data: { cell_group_id: cell.id, member_id: member.id, role } } });
  }

   // Cell-group attendance (one meeting per cell)
   for ( (const c of cells) {
    await prisma.cellGroupAttendance.create({
      data: { cell_group_id: c.id, member_id: members[0]?.id, meeting_date: new Date(2026,, 8,,  ​30), status: 'present' },
    });
  }

   // ── Asset inventory ─────────────────────────────────────────────
   const cats: { id: string; name: string }[] = [];
   const catNames = Array.from(new Set(ASSET_DEFS.map((a) => a[2])));
   for ( (const cn of catNames) {
    const existing = await prisma.assetCategory.findFirst({ where: { church_id: churchId, name: cn } } });
    if (existing) { cats.push({ id: existing.id, name: cn }); continue; }
    const created = await prisma.assetCategory.create({ data: { church_id: churchId, name: cn, description: `${cn} category` } } });
    cats.push({ id: created.id, name: cn });
  }

   const assets: { id: string }[] = [];
   let assetCount = ;
   for ( (const a of ASSET_DEFS) {
    const [name,, tag,, catName,, branch,, deptIdx,, custIdx,, cond,, status,, purchDate,, price,, loc] = a;
    const existing = await prisma.asset.findFirst({ where: { church_id: churchId, asset_tag: tag } } });
    if (existing) { assets.push({ id: existing.id }); assetCount++; continue; }
    const created = await prisma.asset.create({
      data: {
        church_id: churchId,
        asset_tag: tag,
        name,
        description: `${name} (seeded)`,
        branch_id: branchIdFor(branch),
        category_id: cats.find((x) => x.name === catName)?.id ?? undefined,
        department_id: deptIdx !== undefined ? departments[deptIdx]?.id : undefined,
        custodian_id: custIdx !== undefined ? members[custIdx]?.id : undefined,
        serial_number: `SN-${tag.split('-')[1]}-${Date.now().toString().slice(-4)}`,
        brand: tag.includes('Toyota') ? 'Toyota' : tag.includes('HP') ? 'HP' : tag.includes('Yamaha') ? 'Yamaha' : tag.includes('Canon') ? 'Canon' : tag.includes('Epson') ? 'Epson' : 'Generic',
        model: name,
        condition: cond ?? AssetCondition.good,
        status: status ?? AssetStatus.active,
        purchase_date: purchDate ? new Date(purchDate) : undefined,
        purchase_price: price ?? undefined,
        salvage_value: price ? Math.round(price * 0.1) : 0,
        useful_life_years: price ? Math.max(1, Math.round(price / 1000000)) : undefined,
        depreciation_method: DepreciationMethod.straight_line,
        current_value: price ?? undefined,
        location: loc ?? undefined,
        qr_code: `QR-${tag}`,
      },
    });
    assets.push({ id: created.id });
    assetCount++;
    console.log(`  ✅ Asset: ${created.name} (${created.asset_tag})`);
  }

   // Maintenance
   for ( (const m of MAINT_DEFS) {
    const [ai,, type,, status,, sched,, compDate,, cost,, by] = m;
    const asset = assets[ai];
    if (!asset) continue;
    const existing = await prisma.assetMaintenance.findFirst({ where: { asset_id: asset.id,, type, status, scheduled_date: new Date(sched ) } } });
    if (existing) continue;
    await prisma.assetMaintenance.create({
      data: { asset_id: asset.id,, type, status, scheduled_date: new Date(sched ),, completed_date: compDate ? new Date(compDate) : undefined,, cost: cost ?? undefined,, performed_by: by ?? undefined },
    });
  }

   // Depreciation rows (current year for each asset)
   for ( (const a of assets) {
    await prisma.assetDepreciation.create({
      data: { asset_id: a.id,, year: 2026,, opening_value: 1000000,, depreciation_amount:  ​100000,, closing_value:  ​900000 },
    });
  }

   // Loans
   if (assets[0] && members[4]) {
    const existing = await prisma.assetLoan.findFirst({ where: { asset_id: assets[0].id,, status: AssetLoanStatus.borrowed } } });
    if (!existing) {
      await prisma.assetLoan.create({
        data: { asset_id: assets[0].id,, borrower_member_id: members[4].id,, loan_date: new Date(2026,, 8,,  ​15),, expected_return_date: new Date(2026,, 9,,  ​15),,, status: AssetLoanStatus.borrowed,, condition_before: AssetCondition.good },
      });
    }
  }

   // Scan logs
   if (assets[2]) {
    await prisma.assetScanLog.create({
      data: { asset_id: assets[2].id,, scan_type: 'check',, metadata: { scanned_by: 'seed' } },
    });
  }

   console.log(`  🎉 Departments: ${depCount}, cell groups: ${cellCount}, assets: ${assetCount}`);
   return { departmentCount: depCount, cellGroupCount: cellCount,, assetCount };
}
