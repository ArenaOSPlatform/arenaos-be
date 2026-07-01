const defaultCorsOrigins = [
  'http://localhost:5173',
  'https://arenaos-fe.vercel.app',
];

const vercelArenaOsOriginPattern =
  /^https:\/\/arenaos[-a-z0-9]*\.vercel\.app$/i;

export function getCorsOrigins(): string[] {
  const envOrigins =
    process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [];

  return [...new Set([...defaultCorsOrigins, ...envOrigins].filter(Boolean))];
}

export function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  // Allow localhost and vercel preview deployments
  return (
    getCorsOrigins().includes(origin) || vercelArenaOsOriginPattern.test(origin)
  );
}
