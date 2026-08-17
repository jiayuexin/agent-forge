const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254',
  'metadata.google.internal',
]);

export const DEFAULT_MAX_HTTP_RESPONSE_BYTES = 1_048_576;

export class UnsafeHttpTargetError extends Error {
  readonly code = 'UNSAFE_HTTP_TARGET';

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeHttpTargetError';
  }
}

export function assertSafeHttpTarget(target: string): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new UnsafeHttpTargetError(`HTTP tool target is not a valid URL: ${target}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeHttpTargetError(`HTTP tool protocol "${url.protocol}" is not allowed`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new UnsafeHttpTargetError(`HTTP tool target host "${hostname}" is blocked`);
  }
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new UnsafeHttpTargetError(`HTTP tool target host "${hostname}" is blocked`);
  }
  if (isPrivateOrLinkLocalAddress(hostname)) {
    throw new UnsafeHttpTargetError(`HTTP tool target host "${hostname}" is a private address`);
  }

  return url;
}

function isPrivateOrLinkLocalAddress(hostname: string): boolean {
  if (
    hostname === '::1' ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe80:')
  ) {
    return hostname.includes(':');
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}
