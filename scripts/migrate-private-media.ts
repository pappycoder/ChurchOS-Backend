/** Copy restricted managed files, rewrite references transactionally, then optionally prune public bytes. */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const prune = process.argv.includes('--prune-public');
if (prune && !apply) throw new Error('--prune-public requires --apply');
const storage = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  }),
});
const sourceBucket = process.env.SUPABASE_STORAGE_BUCKET || 'media';
const targetBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || 'media-private';
const webURL = process.env.WEB_URL;
if (!webURL || !/^https?:\/\//.test(webURL) || targetBucket === sourceBucket)
  throw new Error('Set WEB_URL and distinct public/private buckets');
function replace(value: Prisma.JsonValue, old: string, next: string): Prisma.InputJsonValue {
  if (typeof value === 'string') return value === old ? next : value;
  if (Array.isArray(value))
    return value.map((item) => (item == null ? null : replace(item, old, next)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item == null ? null : replace(item, old, next),
      ]),
    );
  return value as Prisma.InputJsonValue;
}
async function main() {
  if (apply) {
    const { data, error } = await storage.storage.getBucket(targetBucket);
    if (error) {
      if (String(error.statusCode) !== '404') throw new Error('Cannot inspect target bucket');
      const created = await storage.storage.createBucket(targetBucket, {
        public: false,
        fileSizeLimit: 52428800,
      });
      if (created.error) throw new Error('Cannot create private bucket');
    } else if (data.public) throw new Error('Target bucket must be private');
  }
  let cursor: string | undefined,
    count = 0;
  while (true) {
    const rows = await prisma.mediaAsset.findMany({
      where: {
        folder: { notIn: ['churches', 'branches', 'profiles'] },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 50,
    });
    if (!rows.length) break;
    for (const row of rows) {
      const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${sourceBucket}/`;
      const path =
        row.storage_path ??
        (row.url.startsWith(prefix)
          ? decodeURIComponent(row.url.slice(prefix.length).split('?')[0])
          : undefined);
      if (
        !path ||
        path.split('/')[1] !== row.church_id ||
        path.split('/').some((part) => !part || part === '..' || part === '.')
      )
        throw new Error(`Unmanaged storage path for ${row.id}; resolve manually before continuing`);
      const nextURL = `${webURL!.replace(/\/$/, '')}/api/backend/media/files/${row.id}`;
      if (apply && row.storage_bucket !== targetBucket) {
        const { data, error } = await storage.storage.from(sourceBucket).download(path);
        if (error || !data) throw new Error(`Cannot download asset ${row.id}`);
        const uploaded = await storage.storage
          .from(targetBucket)
          .upload(path, data, { contentType: row.mime_type, upsert: true });
        if (uploaded.error) throw new Error(`Cannot copy asset ${row.id}`);
        await prisma.$transaction(
          async (tx) => {
            await tx.member.updateMany({
              where: { church_id: row.church_id, photo_url: row.url },
              data: { photo_url: nextURL },
            });
            await tx.profile.updateMany({
              where: { church_id: row.church_id, avatar_url: row.url },
              data: { avatar_url: nextURL },
            });
            await tx.asset.updateMany({
              where: { church_id: row.church_id, image_url: row.url },
              data: { image_url: nextURL },
            });
            await tx.sermon.updateMany({
              where: { church_id: row.church_id, audio_url: row.url },
              data: { audio_url: nextURL },
            });
            await tx.sermon.updateMany({
              where: { church_id: row.church_id, video_url: row.url },
              data: { video_url: nextURL },
            });
            // JSON documents may contain nested attachment links. Scan only matching documents.
            const submissions = await tx.$queryRaw<
              { id: string; data: Prisma.JsonValue; attachments: Prisma.JsonValue }[]
            >`SELECT id, data, attachments FROM form_submissions WHERE church_id = ${row.church_id} AND (strpos(data::text, ${row.url}) > 0 OR strpos(attachments::text, ${row.url}) > 0)`;
            for (const submission of submissions)
              await tx.formSubmission.update({
                where: { id: submission.id },
                data: {
                  data: replace(submission.data, row.url, nextURL),
                  attachments: replace(submission.attachments, row.url, nextURL),
                },
              });
            await tx.mediaAsset.update({
              where: { id: row.id },
              data: { url: nextURL, storage_path: path, storage_bucket: targetBucket },
            });
          },
          { timeout: 60000 },
        );
      }
      if (apply && prune) {
        const removed = await storage.storage.from(sourceBucket).remove([path]);
        if (removed.error) throw new Error(`Cannot prune asset ${row.id}; rerun to retry`);
      }
      count++;
    }
    cursor = rows[rows.length - 1].id;
  }
  console.log(
    `${apply ? 'Processed' : 'Would process'} ${count} restricted media records. Public branding files are preserved. Public originals ${prune ? 'were pruned' : 'remain until --apply --prune-public'}.`,
  );
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Migration stopped');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
