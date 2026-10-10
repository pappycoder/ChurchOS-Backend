import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { BadRequestException } from '@nestjs/common';

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  const normalized = address.toLowerCase();
  // Restrict IPv6 to native global unicast; reject mapped/tunnel/documentation ranges.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/.test(normalized) &&
    !normalized.startsWith('2002:') &&
    !(
      parseInt(normalized.split(':')[0], 16) === 0x2001 &&
      (parseInt(normalized.split(':')[1] || '0', 16) < 0x200 ||
        parseInt(normalized.split(':')[1] || '0', 16) === 0xdb8)
    )
  );
}

export async function resolveWebhookUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Invalid webhook URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443')
  ) {
    throw new BadRequestException(
      'Webhooks require an HTTPS URL on port 443 without credentials or fragments',
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) {
    throw new BadRequestException('Webhook destinations must resolve to public internet addresses');
  }
  return { url, address: addresses[0] };
}

export async function sendWebhook(
  value: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const { url, address } = await resolveWebhookUrl(value);
  return new Promise((resolve, reject) => {
    // Pin the validated DNS answer to the connection, preventing DNS rebinding.
    // Native HTTPS does not follow redirects; TLS still validates the original host.
    const req = request(
      url,
      {
        method: 'POST',
        headers,
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > 65536) {
            response.destroy(new Error('Webhook response exceeds 64 KB'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 502,
            body: Buffer.concat(chunks).toString('utf8').slice(0, 2000),
          }),
        );
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Webhook delivery timed out')), 10000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(body);
  });
}
