/**
 * @file appointments.controller.spec.ts
 * @description Source-scan regression guards for AppointmentsController.
 *
 * Asserts every appointment route carries the correct `@RequirePermissions`
 * and that the literal routes (contacts) are declared before the
 * `:appointmentId` param route to avoid Express shadowing. Asserted against
 * source text to avoid pulling the controller's transitive ESM-only deps into
 * Jest.
 */

import * as fs from 'fs';
import * as path from 'path';

const APPT_CONTROLLER_PATH = path.join(
  __dirname,
  '../../../src/appointments/appointments.controller.ts',
);

describe('AppointmentsController permission decorators + route order', () => {
  const source = fs.readFileSync(APPT_CONTROLLER_PATH, 'utf8');

  const blockBetween = (start: string, end: string): string => {
    const startIdx = source.indexOf(start);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = source.indexOf(end, startIdx);
    expect(endIdx).toBeGreaterThan(-1);
    return source.slice(startIdx, endIdx);
  };

  const controllerIsGuarded =
    source.includes('@UseGuards(JwtAuthGuard)') && source.includes("@Controller('appointments')");

  it('controller is auth-guarded under /appointments', () => {
    expect(controllerIsGuarded).toBe(true);
  });

  it('lists contacts under GET /appointments/contacts (appointments:read)', () => {
    const block = blockBetween("@Get('contacts')", 'async listContacts(');
    expect(block).toContain("@RequirePermissions('appointments:read')");
  });

  it('lists appointments under GET /appointments (appointments:read)', () => {
    const block = blockBetween('@Get()', 'async list(');
    expect(block).toContain("@RequirePermissions('appointments:read')");
  });

  it('creates under POST /appointments (appointments:create)', () => {
    const block = blockBetween('@Post()', 'async create(');
    expect(block).toContain("@RequirePermissions('appointments:create')");
  });

  it('reads a single appointment under GET /appointments/:appointmentId (appointments:read)', () => {
    const block = blockBetween("@Get(':appointmentId')", 'async getOne(');
    expect(block).toContain("@RequirePermissions('appointments:read')");
  });

  it('updates under PATCH /appointments/:appointmentId (appointments:update)', () => {
    const block = blockBetween("@Patch(':appointmentId')", 'async update(');
    expect(block).toContain("@RequirePermissions('appointments:update')");
  });

  it('archives under POST /appointments/:appointmentId/archive (appointments:update)', () => {
    const block = blockBetween("@Post(':appointmentId/archive')", 'async archive(');
    expect(block).toContain("@RequirePermissions('appointments:update')");
  });

  it('restores under POST /appointments/:appointmentId/restore (appointments:update)', () => {
    const block = blockBetween("@Post(':appointmentId/restore')", 'async restore(');
    expect(block).toContain("@RequirePermissions('appointments:update')");
  });

  it('hard-deletes under DELETE /appointments/:appointmentId (appointments:delete)', () => {
    const block = blockBetween("@Delete(':appointmentId')", 'async deleteForever(');
    expect(block).toContain("@RequirePermissions('appointments:delete')");
  });

  it('declares contacts before the :appointmentId param route', () => {
    const contactsIdx = source.indexOf("@Get('contacts')");
    const paramIdx = source.indexOf("@Get(':appointmentId')");
    expect(contactsIdx).toBeGreaterThan(-1);
    expect(paramIdx).toBeGreaterThan(-1);
    expect(contactsIdx).toBeLessThan(paramIdx);
  });
});
