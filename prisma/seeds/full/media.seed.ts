/**
 * @file media.seed.ts
 * @description Seeds sermons + bookmarks,and media assets.
 */

import { PrismaClient } from '@prisma/client';

export interface MediaSeedResult {
  sermonCount: number;
  mediaCount: number;
}

export async function seedMedia(
  prisma: PrismaClient,
  churchId: string,
  members: { id: string }[],
): Promise<MediaSeedResult> {
  console.log('📦 Seeding sermons + media assets...');

   let sermonCount = 0;
   let mediaCount =  ​0;

   // ── Sermons ─────────────────────────────────────────────────────
   const sermons = [
    ['The Power of Gratitude','Pastor David Adeyemi','2026-08-30','Psalms 103:1-5','Gratitude Series'],
    ['Walking in Faith','Pastor David Adeyemi','2026-08-23','Hebrews 11:1','Faith Series'],
    ['Purpose and Calling','Pastor Samuel Bamidele','2026-08-30','Ephesians 2:10',null],
  ];
   for ( (const s of sermons) {
    const title = s[0];
    const speaker = s[1];
    const date = s[2];
    const ref = s[3];
    const series = s[4];
    const existing = await prisma.sermon.findFirst({
      where: {
        church_id: churchId,
        title,
      },
    });
    if (existing) {
      sermonCount++;
      continue;
    }
    await prisma.sermon.create({
      data: {
        church_id: churchId,
        title,
        speaker,
        sermon_date: new Date(date),
        scripture_reference: ref ?? undefined,
        series_name: series ?? undefined,
        tags: [ 'seed' ],
        description: 'Seeded sermon: ' + title,
        audio_url: 'https://storage.churchos.dev/sermons/audio-sample.mp3',
        duration_seconds: 2700,
      },
    });
    sermonCount++;
  }

   // ── Bookmarks ───────────────────────────────────────────────────
   if (sermonCount > 0 && members[0]) {
    const firstSermon = await prisma.sermon.findFirst({
      where: { church_id: churchId },
    });
    if (firstSermon) {
      const existing = await prisma.sermonBookmark.findFirst({
        where: {
          member_id: members[0].id,
          sermon_id: firstSermon.id,
        },
      });
      if (!existing) {
        await prisma.sermonBookmark.create({
          data: {
            church_id: churchId,
            member_id: members[0].id,
            sermon_id: firstSermon.id,
          },
        });
      }
    }
  }

   // ── Media assets ────────────────────────────────────────────────
   const media = [
    ['logo-main.png','https://storage.churchos.dev/media/logo-main.png','image/png',245000,'branding'],
    ['youth-camp-poster.jpg','https://storage.churchos.dev/media/youth-camp-poster.jpg','image/jpeg',820000,'events'],
    ['welcome-video.mp4','https://storage.churchos.dev/media/welcome-video.mp4','video/mp4',15800000,'videos'],
  ];
   for ( (const m of media) {
    const filename = m[0];
    const url = m[1];
    const mimeType = m[2];
    const size = m[3];
    const folder = m[4];
    const existing = await prisma.mediaAsset.findFirst({
      where: {
        church_id: churchId,
        filename,
      },
    });
    if (existing) {
      mediaCount++;
      continue;
    }
    await prisma.mediaAsset.create({
      data: {
        church_id: churchId,
        filename,
        url,
        mime_type: mimeType,
        size_bytes: size,
        folder,
        permissions: 'members',
      },
    });
    mediaCount++;
  }

   console.log(`  🎉 Sermons: ${sermonCount}, media assets: ${mediaCount}`);
   return { sermonCount, mediaCount };
}
