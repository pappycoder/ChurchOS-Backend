import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

describe('Database role-plan boundaries', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const churches: string[] = [];
  async function church(plan: string) {
    const id = randomUUID();
    churches.push(id);
    await pool.query('INSERT INTO churches(id,name,updated_at) VALUES ($1,$1,now())', [id]);
    await pool.query(
      "INSERT INTO platform_subscriptions(church_id,plan,cycle,paid_until) VALUES ($1,$2,'monthly',now()+interval '30 days')",
      [id, plan],
    );
    return id;
  }
  async function profile(churchId: string, roles: string[]) {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO profiles(id,user_id,church_id,role,first_name,last_name,email,updated_at) VALUES ($1,$2,$3,$4,'Test','Staff',$5,now())",
      [id, randomUUID(), churchId, roles, `${id}@example.test`],
    );
    return id;
  }
  async function customRole(churchId: string) {
    return pool.query(
      "INSERT INTO roles(id,church_id,name,label) VALUES ($1,$2,'test_volunteer','Volunteer')",
      [randomUUID(), churchId],
    );
  }
  afterAll(async () => {
    for (const id of churches) {
      await pool.query('DELETE FROM profiles WHERE church_id=$1', [id]);
      await pool.query('DELETE FROM roles WHERE church_id=$1', [id]);
      await pool.query('DELETE FROM notifications WHERE church_id=$1', [id]);
      await pool.query('DELETE FROM platform_subscriptions WHERE church_id=$1', [id]);
      await pool.query('DELETE FROM audit_logs WHERE church_id=$1', [id]);
      await pool.query('DELETE FROM churches WHERE id=$1', [id]);
    }
    await pool.end();
  });
  it('Essentials allows the administrator plus one permitted staff user, enforcing the final seat concurrently', async () => {
    const id = await church('essentials');
    await profile(id, ['church_admin']);
    await expect(profile(id, ['church_admin'])).rejects.toThrow(
      'PLAN_FEATURE_REQUIRED:staff_roles',
    );
    await expect(profile(id, ['treasurer'])).rejects.toThrow('PLAN_FEATURE_REQUIRED:staff_roles');
    const result = await Promise.allSettled([
      profile(id, ['secretary']),
      profile(id, ['senior_pastor']),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it.each(['essentials', 'community'])('%s rejects custom-role creation', async (plan) => {
    const id = await church(plan);
    await expect(customRole(id)).rejects.toThrow('PLAN_FEATURE_REQUIRED:custom_roles');
  });
  it('Community supports the full built-in staff catalog and rejects custom assignments', async () => {
    const id = await church('community');
    await expect(profile(id, ['usher', 'treasurer'])).resolves.toBeDefined();
    await expect(profile(id, ['test_volunteer'])).rejects.toThrow(
      'PLAN_FEATURE_REQUIRED:custom_roles',
    );
  });
  it('Network creates custom roles, then retains records and blocks new assignments after downgrade', async () => {
    const id = await church('network');
    await customRole(id);
    const staff = await profile(id, ['test_volunteer']);
    await pool.query("UPDATE platform_subscriptions SET plan='community' WHERE church_id=$1", [id]);
    expect(
      (await pool.query('SELECT role FROM profiles WHERE id=$1', [staff])).rows[0].role,
    ).toEqual(['test_volunteer']);
    await expect(profile(id, ['test_volunteer'])).rejects.toThrow(
      'PLAN_FEATURE_REQUIRED:custom_roles',
    );
    await expect(
      pool.query("UPDATE roles SET label='Updated' WHERE church_id=$1", [id]),
    ).rejects.toThrow('PLAN_FEATURE_REQUIRED:custom_roles');
    await pool.query("UPDATE profiles SET role=ARRAY['secretary']::TEXT[] WHERE id=$1", [staff]);
  });
});
