import { assertSafeE2eDatabaseUrl } from '../scripts/e2e-database-safety';

const testDatabaseUrl = assertSafeE2eDatabaseUrl({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  databaseUrl: process.env.DATABASE_URL,
});

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters';
