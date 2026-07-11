import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

const METADATA_HOSTNAMES = new Set(['metadata.google.internal']);
const LOCAL_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function parseIpv4(value: string): number[] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const bytes = parts.map((part) => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    const n = Number(part);
    return n >= 0 && n <= 255 ? n : Number.NaN;
  });
  return bytes.some(Number.isNaN) ? undefined : bytes;
}

function parseIpv6Words(value: string): number[] | undefined {
  let input = value.toLowerCase();
  const zoneIndex = input.indexOf('%');
  if (zoneIndex >= 0) input = input.slice(0, zoneIndex);

  let ipv4Tail: number[] | undefined;
  const lastColon = input.lastIndexOf(':');
  if (lastColon >= 0 && input.slice(lastColon + 1).includes('.')) {
    ipv4Tail = parseIpv4(input.slice(lastColon + 1));
    if (!ipv4Tail) return undefined;
    const firstWord = ((ipv4Tail[0] << 8) | ipv4Tail[1]).toString(16);
    const secondWord = ((ipv4Tail[2] << 8) | ipv4Tail[3]).toString(16);
    input = `${input.slice(0, lastColon)}:${firstWord}:${secondWord}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const parseWord = (part: string): number | undefined => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined;
    return Number.parseInt(part, 16);
  };
  const words = [...left, ...right].map(parseWord);
  if (words.some((word) => word === undefined)) return undefined;
  const missing = halves.length === 2 ? 8 - words.length : 0;
  if ((halves.length === 1 && words.length !== 8) || missing < 0) {
    return undefined;
  }
  return [
    ...(left.map(parseWord) as number[]),
    ...Array(missing).fill(0),
    ...(right.map(parseWord) as number[]),
  ];
}

function ipv4In(
  bytes: number[],
  first: number,
  secondStart?: number,
  secondEnd?: number
): boolean {
  if (bytes[0] !== first) return false;
  if (secondStart === undefined) return true;
  return bytes[1] >= secondStart && bytes[1] <= (secondEnd ?? secondStart);
}

export function isPublicIpLiteral(value: string): boolean {
  const ipVersion = net.isIP(value);
  if (ipVersion === 4) {
    const bytes = parseIpv4(value);
    if (!bytes) return false;
    if (ipv4In(bytes, 0)) return false;
    if (ipv4In(bytes, 10)) return false;
    if (ipv4In(bytes, 100, 64, 127)) return false; // CGNAT
    if (ipv4In(bytes, 127)) return false;
    if (ipv4In(bytes, 169, 254)) return false;
    if (ipv4In(bytes, 172, 16, 31)) return false;
    if (ipv4In(bytes, 192, 0, 0)) return false;
    if (ipv4In(bytes, 192, 0, 2)) return false; // TEST-NET-1
    if (ipv4In(bytes, 192, 88, 99)) return false; // 6to4 relay anycast
    if (ipv4In(bytes, 192, 168)) return false;
    if (ipv4In(bytes, 198, 18, 19)) return false; // benchmark
    if (ipv4In(bytes, 198, 51, 100)) return false; // TEST-NET-2
    if (ipv4In(bytes, 203, 0, 113)) return false; // TEST-NET-3
    if (bytes[0] >= 224) return false;
    return true;
  }

  if (ipVersion === 6) {
    const words = parseIpv6Words(value);
    if (!words) return false;
    const first = words[0];
    const isAllZero = words.every((word) => word === 0);
    if (isAllZero) return false;
    if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return false; // ::1
    if ((first & 0xffc0) === 0xfe80) return false; // link-local
    if ((first & 0xfe00) === 0xfc00) return false; // unique local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if ((first & 0xfff0) === 0x2001 && words[1] === 0x0db8) return false; // documentation
    if (first === 0x2002) return false; // 6to4 embeds IPv4
    if (first === 0x64 && words[1] === 0xff9b) return false; // well-known NAT64
    const isMapped =
      words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
    if (isMapped) {
      const bytes = [
        words[6] >> 8,
        words[6] & 0xff,
        words[7] >> 8,
        words[7] & 0xff,
      ];
      return isPublicIpLiteral(bytes.join('.'));
    }
    return true;
  }

  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '').toLowerCase();
}

export async function assertPublicHttpUrl(
  rawUrl: string,
  label = 'URL'
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must use http or https`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (
    LOCAL_HOSTNAMES.has(hostname) ||
    METADATA_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error(`${label} host is not public`);
  }

  const literalVersion = net.isIP(hostname);
  if (literalVersion) {
    if (!isPublicIpLiteral(hostname)) {
      throw new Error(`${label} host is not public`);
    }
    return rawUrl;
  }

  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`${label} host could not be resolved safely`);
  }
  if (
    !records.length ||
    records.some((record) => !isPublicIpLiteral(record.address))
  ) {
    throw new Error(`${label} host resolves to a non-public address`);
  }
  return rawUrl;
}

export function extractSinglePublicClientIp(
  rawForwardedFor: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(rawForwardedFor)
    ? rawForwardedFor[0]
    : rawForwardedFor;
  if (typeof raw !== 'string') return undefined;
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  // The hosted nginx edge overwrites X-Forwarded-For with one client address.
  // Multi-hop values are client-supplied/spoofable at the app boundary and fail closed.
  if (parts.length !== 1) return undefined;
  const candidate = normalizeHostname(parts[0]);
  return isPublicIpLiteral(candidate) ? candidate : undefined;
}

export function assertLocalPathWithinRoot(filePath: string): string {
  const root = process.env.FIRECRAWL_PARSE_LOCAL_ROOT;
  if (!root) {
    throw new Error(
      'Local parse file access is disabled. Set FIRECRAWL_PARSE_LOCAL_ROOT to an explicit directory to enable it.'
    );
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(filePath);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}/`)
  ) {
    throw new Error('Local parse file path must stay within FIRECRAWL_PARSE_LOCAL_ROOT');
  }
  return resolvedPath;
}
