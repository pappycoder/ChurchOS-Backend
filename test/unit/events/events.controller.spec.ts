/**
 * @file Regression guards for EventsController archive/restore permission
 * decorators.
 *
 * The global PermissionsGuard only enforces routes that carry
 * @RequirePermissions. The archive/restore lifecycle endpoints (event and
 * ticket tier) must carry `events:update` on top of the existing role ceiling
 * (church_admin / branch_pastor), matching the update-style mutation
 * convention.
 *
 * Asserted against the source text to avoid pulling the controller's
 * transitive ESM-only dependencies into the Jest runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const EVENTS_CONTROLLER_PATH = path.join(__dirname, '../../../src/events/events.controller.ts');

describe('EventsController archive/restore permission decorators', () => {
  const source = fs.readFileSync(EVENTS_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  const collapse = (s: string): string => s.replace(/[\s,]/g, '');

  const hasRequireRoles = (block: string, roles: string): void => {
    expect(collapse(block)).toContain(collapse(`@RequireRoles(${roles})`));
  };

  it('requires events:update on POST /events/:eventId/archive', () => {
    const block = blockBetween("@Post(':eventId/archive')", 'async archiveEvent(');
    expect(block).toContain("@RequirePermissions('events:update')");
    hasRequireRoles(block, "'church_admin', 'branch_pastor'");
  });

  it('requires events:update on POST /events/:eventId/restore', () => {
    const block = blockBetween("@Post(':eventId/restore')", 'async restoreEvent(');
    expect(block).toContain("@RequirePermissions('events:update')");
    hasRequireRoles(block, "'church_admin', 'branch_pastor'");
  });

  it('requires events:tickets:update on POST /events/:eventId/tiers/:tierId/archive', () => {
    const block = blockBetween(
      "@Post(':eventId/tiers/:tierId/archive')",
      'async archiveTicketTier(',
    );
    expect(block).toContain("@RequirePermissions('events:tickets:update')");
    hasRequireRoles(block, "'church_admin', 'branch_pastor'");
  });

  it('requires events:tickets:update on POST /events/:eventId/tiers/:tierId/restore', () => {
    const block = blockBetween(
      "@Post(':eventId/tiers/:tierId/restore')",
      'async restoreTicketTier(',
    );
    expect(block).toContain("@RequirePermissions('events:tickets:update')");
    hasRequireRoles(block, "'church_admin', 'branch_pastor'");
  });

  it('requires events:list:read on GET /events (staff list)', () => {
    const block = blockBetween('@Get()', 'async listEvents(');
    expect(block).toContain("@RequirePermissions('events:list:read')");
  });

  it('requires events:registrations:read on GET /events/:eventId/registrations', () => {
    const block = blockBetween("@Get(':eventId/registrations')", 'async listRegistrations(');
    expect(block).toContain("@RequirePermissions('events:registrations:read')");
  });

  it('requires events:registrations:update on DELETE /events/:eventId/register/:memberId', () => {
    const block = blockBetween("@Delete(':eventId/register/:memberId')", 'async cancelRegistration(');
    expect(block).toContain("@RequirePermissions('events:registrations:update')");
  });

  it('requires events:checkin:read on GET /events/:eventId/attendance', () => {
    const block = blockBetween("@Get(':eventId/attendance')", 'async getEventAttendance(');
    expect(block).toContain("@RequirePermissions('events:checkin:read')");
  });

  it('routes the archive/restore methods to the service with church scoping', () => {
    const archiveBlock = blockBetween('async archiveEvent(', 'async restoreEvent(');
    expect(archiveBlock).toContain('eventsService.archiveEvent');
    expect(archiveBlock).toContain('req.profile?.church_id');

    const restoreBlock = blockBetween('async restoreEvent(', '@Delete');
    expect(restoreBlock).toContain('eventsService.restoreEvent');
    expect(restoreBlock).toContain('req.profile?.church_id');
  });
});
