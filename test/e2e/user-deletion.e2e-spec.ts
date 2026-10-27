import { randomUUID } from 'node:crypto';
import { ProfileService } from '../../src/profile/profile.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('user account deletion preserves church records', () => {
  const prisma = new PrismaService();
  const churchIds: string[] = [];
  const auth = { deleteUser: jest.fn().mockResolvedValue({ error: null }) };
  const service = new ProfileService(
    prisma,
    { branchWhere: () => ({}) } as never,
    { log: jest.fn() } as never,
    {} as never,
    { client: { auth: { admin: auth } } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  afterAll(async () => {
    for (const churchId of churchIds) {
      await prisma.visitor.deleteMany({ where: { church_id: churchId } });
      await prisma.profile.deleteMany({ where: { church_id: churchId } });
      await prisma.member.deleteMany({ where: { church_id: churchId } });
      await prisma.auditLog.deleteMany({ where: { church_id: churchId } });
      await prisma.church.delete({ where: { id: churchId } });
    }
    await prisma.$disconnect();
  });
  it('removes the login/profile and clears visitor assignment while keeping the member and visitor', async () => {
    const church = await prisma.church.create({ data: { name: 'Account deletion test' } });
    churchIds.push(church.id);
    await prisma.platformSubscription.create({
      data: {
        church_id: church.id,
        plan: 'community',
        cycle: 'monthly',
        paid_until: new Date(Date.now() + 86400000),
      },
    });
    const member = await prisma.member.create({
      data: { church_id: church.id, first_name: 'Ada', last_name: 'Ola' },
    });
    const profile = await prisma.profile.create({
      data: {
        user_id: randomUUID(),
        church_id: church.id,
        member_id: member.id,
        first_name: 'Ada',
        last_name: 'Ola',
        role: ['usher'],
      },
    });
    const visitor = await prisma.visitor.create({
      data: { church_id: church.id, first_name: 'Visitor', assigned_to_id: profile.id },
    });
    await service.deleteUserAccount(profile.id, church.id, randomUUID());
    expect(auth.deleteUser).toHaveBeenCalledWith(profile.user_id);
    expect(await prisma.profile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeTruthy();
    expect(await prisma.visitor.findUnique({ where: { id: visitor.id } })).toMatchObject({
      assigned_to_id: null,
    });
  });
});
