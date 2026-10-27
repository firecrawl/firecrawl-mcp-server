/**
 * Makes a value safe for a quoted-string parameter of a `WWW-Authenticate`
 * header: runs of characters outside printable ASCII (CR, LF, other controls,
 * non-ASCII) become one space, so the header stays a single valid line, then
 * backslashes and double quotes are escaped.
 */
export function escapeWWWAuthenticateValue(value: string): string {
  return value
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
