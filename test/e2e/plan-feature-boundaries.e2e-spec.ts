import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { FEATURE_LEVELS, PLAN_RANK, SubscriptionPlan } from '../../src/billing/plans';

describe('Plan feature SQL and persistence boundaries', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let db: PoolClient;
  beforeAll(async () => {
    db = await pool.connect();
    await db.query('BEGIN');
  });
  afterAll(async () => {
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  });
  async function church(plan: string) {
    const id = randomUUID();
    await db.query('INSERT INTO churches(id,name,updated_at) VALUES ($1,$1,now())', [id]);
    await db.query(
      "INSERT INTO platform_subscriptions(church_id,plan,cycle,paid_until) VALUES ($1,$2,'monthly',now()+interval '30 days')",
      [id, plan],
    );
    return id;
  }
  async function rejected(query: string, values: unknown[], feature: string) {
    await db.query('SAVEPOINT feature_rejection');
    await expect(db.query(query, values)).rejects.toThrow('PLAN_FEATURE_REQUIRED:' + feature);
    await db.query('ROLLBACK TO SAVEPOINT feature_rejection');
  }
  it.each(Object.keys(PLAN_RANK) as SubscriptionPlan[])(
    'matches the entire %s feature catalog in SQL',
    async (plan) => {
      const id = await church(plan);
      for (const [feature, level] of Object.entries(FEATURE_LEVELS)) {
        const { rows } = await db.query('SELECT churchos_has_feature($1,$2) AS allowed', [
          id,
          feature,
        ]);
        expect(rows[0].allowed).toBe(PLAN_RANK[plan] >= level);
      }
      await db.query(
        "UPDATE platform_subscriptions SET paid_until=now()-interval '1 second' WHERE church_id=$1",
        [id],
      );
      expect(
        (await db.query("SELECT churchos_has_feature($1,'media') AS allowed", [id])).rows[0]
          .allowed,
      ).toBe(false);
    },
  );
  it('keeps branding on Essentials while rejecting library uploads and sermons', async () => {
    const id = await church('essentials');
    const media =
      "INSERT INTO media_assets(id,church_id,filename,url,mime_type,size_bytes,folder) VALUES ($1,$2,'file','https://example.org/file','image/png',10,$3)";
    for (const folder of ['profiles', 'churches', 'branches'])
      await db.query(media, [randomUUID(), id, folder]);
    await rejected(media, [randomUUID(), id, 'uploads'], 'media');
    await rejected(media, [randomUUID(), id, 'assets'], 'assets');
    await rejected(media, [randomUUID(), id, 'form-attachments'], 'forms');
    await rejected(
      "INSERT INTO sermons(id,church_id,title,sermon_date,tags,updated_at) VALUES ($1,$2,'Message',now(),'{}',now())",
      [randomUUID(), id],
      'media',
    );
  });
  it('requires Network to create a paid event or change a free event to paid', async () => {
    const id = await church('community');
    const query =
      "INSERT INTO events(id,church_id,title,start_date,is_free,price,updated_at) VALUES ($1,$2,'Event',now(),false,100,now())";
    await rejected(query, [randomUUID(), id], 'tickets');
    const eventId = randomUUID();
    await db.query(
      "INSERT INTO events(id,church_id,title,start_date,updated_at) VALUES ($1,$2,'Free',now(),now())",
      [eventId, id],
    );
    await rejected('UPDATE events SET is_free=false,price=100 WHERE id=$1', [eventId], 'tickets');
    await db.query("UPDATE platform_subscriptions SET plan='network' WHERE church_id=$1", [id]);
    await db.query(query, [randomUUID(), id]);
  });

  it('allows Community library uploads, keeps asset uploads and webhooks on Network, and retains rows on downgrade', async () => {
    const id = await church('community');
    const media =
      "INSERT INTO media_assets(id,church_id,filename,url,mime_type,size_bytes,folder) VALUES ($1,$2,'file','https://example.org/file','image/png',10,$3)";
    await db.query(media, [randomUUID(), id, 'uploads']);
    await rejected(media, [randomUUID(), id, 'assets'], 'assets');
    const webhook =
      "INSERT INTO webhook_subscriptions(id,church_id,url,events,secret,updated_at) VALUES ($1,$2,'https://example.org/hook','{}','test',now())";
    await rejected(webhook, [randomUUID(), id], 'webhooks');
    await db.query("UPDATE platform_subscriptions SET plan='network' WHERE church_id=$1", [id]);
    await db.query(media, [randomUUID(), id, 'assets']);
    await db.query(webhook, [randomUUID(), id]);
    await db.query("UPDATE platform_subscriptions SET plan='essentials' WHERE church_id=$1", [id]);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM media_assets WHERE church_id=$1', [id]))
        .rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query('SELECT count(*)::int AS n FROM webhook_subscriptions WHERE church_id=$1', [
          id,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
});
