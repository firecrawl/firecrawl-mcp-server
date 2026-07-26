import net from 'node:net';

/**
 * Accept exactly one syntactically valid source IP from the hosting edge.
 *
 * The hosted nginx proxy overwrites X-Forwarded-For with its remote peer, so
 * the application must reject multi-hop/client-crafted values. That peer can
 * legitimately be a private address between trusted ingress hops; requiring a
 * public address would disable keyless traffic in that deployment topology.
 */
export function extractSingleTrustedClientIp(
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
  if (parts.length !== 1) return undefined;

  const candidate = parts[0].replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return net.isIP(candidate) ? candidate : undefined;
}
