import sharp from 'sharp';

/** Only the configured storage service and this church's public uploads are eligible. */
export async function loadChurchLogo(
  value: string | undefined,
  churchId: string | undefined,
  storageOrigin: string | undefined,
  bucket: string,
): Promise<Buffer | undefined> {
  if (!value || !churchId || !storageOrigin) return;
  try {
    const url = new URL(value);
    const prefix = `/storage/v1/object/public/${bucket}/churches/${churchId}/`;
    const filename = url.pathname.slice(prefix.length);
    if (
      url.origin !== new URL(storageOrigin).origin ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(prefix) ||
      !/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/i.test(filename)
    )
      return;
    // No redirects, credentials, cookies or user-selected destinations.
    const response = await fetch(`${url.origin}${url.pathname}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > 2_000_000
    )
      return;
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    const raster =
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ||
      (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!raster) return;
    return await sharp(bytes, { limitInputPixels: 16_777_216 })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fcfcf9' })
      .png()
      .toBuffer();
  } catch {
    return;
  }
}
