import { Reflector } from '@nestjs/core';
import { CallsController } from '../../../src/integrations/calls.controller';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';

describe('Live staff-to-member calling', () => {
  const request = { profile: { church_id: 'church-a' }, user: { id: 'staff-a' } } as never;
  it('requires both calling and member-read grants', () => {
    expect(new Reflector().get(PERMISSIONS_KEY, CallsController.prototype.create)).toEqual([
      'calls:create',
      'members:all:read',
    ]);
  });
  it('loads only a visible member and derives the staff phone from the authenticated profile', async () => {
    const prisma = {
      member: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-a', phone: '+2348012345678' }),
      },
      profile: { findFirst: jest.fn().mockResolvedValue({ phone: '+12345678901' }) },
      message: { create: jest.fn() },
    };
    const account = {
      provider: 'twilio',
      accountId: 'account-a',
      settings: { from: '+12345678902' },
    };
    const accounts = {
      resolve: jest.fn().mockResolvedValue(account),
      deliver: jest.fn().mockResolvedValue('CAcall-id'),
    };
    const controller = new CallsController(
      prisma as never,
      accounts as never,
      { branchWhere: () => ({ branch_id: 'branch-a' }) } as never,
    );
    await controller.create({ memberId: 'member-a' }, request);
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-a', church_id: 'church-a', archived_at: null, branch_id: 'branch-a' },
    });
    expect(prisma.profile.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'staff-a', church_id: 'church-a' },
      select: { phone: true },
    });
    expect(accounts.deliver).toHaveBeenCalledWith(account, 'voice', {
      staffPhone: '+12345678901',
      to: '+2348012345678',
      from: '+12345678902',
      text: '',
    });
  });
  it('does not place calls to members outside the authorized branch', async () => {
    const accounts = { deliver: jest.fn() };
    const controller = new CallsController(
      { member: { findFirst: jest.fn().mockResolvedValue(null) } } as never,
      accounts as never,
      { branchWhere: () => ({ branch_id: 'branch-a' }) } as never,
    );
    await expect(controller.create({ memberId: 'other-branch-member' }, request)).rejects.toThrow(
      'Member not found',
    );
    expect(accounts.deliver).not.toHaveBeenCalled();
  });
});
