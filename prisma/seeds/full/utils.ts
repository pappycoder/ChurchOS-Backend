/**
 * @file utils.ts
 * @description Shared helpers for the full ChurchOS seed.
 */

import { PrismaClient } from '@prisma/client';

/** Idempotent create-or-skip for church-scoped rows with a stable natural key. */
export async function findOrCreate<T extends { id: string }>(
  prisma: PrismaClient,
  model: { findFirst: (args: any) => Promise<T | null>; create: (args: any) => Promise<T> },
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ row: T; created: boolean }> {
  const existing = await model.findFirst({ where });
  if (existing) return { row: existing, created: false };
  const row = await model.create({ data });
  return { row, created: true };
}

/** Deterministic pseudo-random (so reruns produce the same data). */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}