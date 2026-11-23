/** Lê o cabeçalho Cookie; nome repetido fica com o primeiro valor, como nos navegadores. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';').map((piece) => piece.trim())) {
    const separatorIndex = part.indexOf('=');
    // Sem `=` ou com nome vazio não é cookie.
    if (separatorIndex < 1) continue;
    const name = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      // Cookie malformado de outro site no mesmo domínio: ignora.
    }
  }
  return cookies;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
  path?: string;
}

/** Set-Cookie sempre HttpOnly e SameSite=Lax; Max-Age 0 apaga o cookie. */
export function serializeCookie(name: string, value: string, { maxAgeSeconds, secure, path = '/' }: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
