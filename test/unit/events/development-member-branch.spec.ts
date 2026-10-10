import { alignDevelopmentMemberBranch } from '../../../prisma/seeds/development/users.seed';

describe('Development login member branch consistency', () => {
  it('aligns the linked member with the login branch within the same church', async () => {
    const prisma = { member: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await alignDevelopmentMemberBranch(prisma as never, 'church-1', 'kunle-member', 'lekki');
    expect(prisma.member.updateMany).toHaveBeenCalledWith({
      where: { id: 'kunle-member', church_id: 'church-1' },
      data: { branch_id: 'lekki' },
    });
  });
  it('fails instead of linking a member from a different church or a missing member', async () => {
    const prisma = { member: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(
      alignDevelopmentMemberBranch(prisma as never, 'church-1', 'foreign-member', 'lekki'),
    ).rejects.toThrow('another church');
  });
});
