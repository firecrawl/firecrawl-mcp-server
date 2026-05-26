const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isPrivateNetworkAllowed(): boolean {
  return TRUE_VALUES.has(
    (process.env.FIRECRAWL_ALLOW_PRIVATE_NETWORKS || '').toLowerCase()
  );
}

function parseIPv4(hostname: string): number[] | undefined {
  const parts = hostname.split('.');
  if (parts.length !== 4) return undefined;

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    if (part.length > 1 && part.startsWith('0')) return Number.NaN;
    return Number(part);
  });

  if (
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return undefined;
  }

  return octets;
}

function isPrivateIPv4(hostname: string): boolean {
  const octets = parseIPv4(hostname);
  if (!octets) return false;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
}

function mappedIPv4FromIPv6(hostname: string): string | undefined {
  if (!hostname.toLowerCase().startsWith('::ffff:')) return undefined;

  const suffix = hostname.slice('::ffff:'.length);
  if (suffix.includes('.')) return suffix;

  const hextets = suffix.split(':');
  if (hextets.length !== 2) return undefined;

  const values = hextets.map((hextet) => Number.parseInt(hextet, 16));
  if (
    values.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 0xffff
    )
  ) {
    return undefined;
  }

  return [
    values[0] >> 8,
    values[0] & 0xff,
    values[1] >> 8,
    values[1] & 0xff,
  ].join('.');
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

export function isBlockedLocalUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const hostname = normalizeHostname(parsed.hostname.toLowerCase());
  if (!hostname) return false;

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;

  const mappedIPv4 = mappedIPv4FromIPv6(hostname);
  if (mappedIPv4) return isPrivateIPv4(mappedIPv4);

  return isPrivateIPv4(hostname) || isPrivateIPv6(hostname);
}

export function assertSafeExternalUrl(rawUrl: string, fieldName = 'url'): void {
  if (isPrivateNetworkAllowed()) return;

  if (isBlockedLocalUrl(rawUrl)) {
    throw new Error(
      `${fieldName} targets a local or private network address. Set FIRECRAWL_ALLOW_PRIVATE_NETWORKS=true only for trusted self-hosted deployments.`
    );
  }
}

export function assertSafeExternalUrls(
  urls: string[],
  fieldName = 'urls'
): void {
  for (const url of urls) {
    assertSafeExternalUrl(url, fieldName);
  }
}
