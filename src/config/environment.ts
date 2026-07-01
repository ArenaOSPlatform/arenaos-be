const TEST_ACCESS_SECRET = 'arenaos-test-access-secret-at-least-32-characters';
const TEST_REFRESH_SECRET =
  'arenaos-test-refresh-secret-at-least-32-characters';

function cleanEnv(value: string | undefined): string | undefined {
  return value?.trim().replace(/^["'<]+|[>"']+$/g, '') || undefined;
}

export function getOptionalEnv(name: string): string | undefined {
  return cleanEnv(process.env[name]);
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getRequiredSecret(name: string, testFallback: string): string {
  const value = getOptionalEnv(name);

  if (!value && process.env.NODE_ENV === 'test') {
    return testFallback;
  }

  if (!value || value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }

  return value;
}

export function getJwtAccessSecret(): string {
  return getRequiredSecret('JWT_SECRET', TEST_ACCESS_SECRET);
}

export function getJwtRefreshSecret(): string {
  return getRequiredSecret('JWT_REFRESH_SECRET', TEST_REFRESH_SECRET);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function validateEnvironment(): void {
  getRequiredEnv('DATABASE_URL');
  getJwtAccessSecret();
  getJwtRefreshSecret();

  const port = Number(process.env.PORT ?? 3000);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  if (isProduction() && process.env.UPLOAD_REQUIRE_CLOUDINARY !== 'true') {
    throw new Error('UPLOAD_REQUIRE_CLOUDINARY must be true in production');
  }

  if (isProduction() && process.env.SMTP_REQUIRE_CONFIG !== 'true') {
    throw new Error('SMTP_REQUIRE_CONFIG must be true in production');
  }
}
