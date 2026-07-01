const allowNonTestDatabase =
  process.env.E2E_ALLOW_NON_TEST_DATABASE === 'true';

export function assertSafeE2eDatabaseUrl(params: {
  testDatabaseUrl: string | undefined;
  databaseUrl: string | undefined;
}) {
  const testDatabaseUrl = params.testDatabaseUrl?.trim();
  const databaseUrl = params.databaseUrl?.trim();

  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for E2E tests. Refusing to use DATABASE_URL to protect development data.',
    );
  }

  if (databaseUrl && databaseUrl === testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL must not be the same as DATABASE_URL. Use an isolated test database.',
    );
  }

  const databaseName = getDatabaseName(testDatabaseUrl);

  if (!allowNonTestDatabase && !databaseName.toLowerCase().includes('test')) {
    throw new Error(
      `TEST_DATABASE_URL database name must include "test" for safety. Current database: ${databaseName}. Set E2E_ALLOW_NON_TEST_DATABASE=true only for disposable CI databases.`,
    );
  }

  return testDatabaseUrl;
}

function getDatabaseName(databaseUrl: string) {
  try {
    const parsedUrl = new URL(databaseUrl);
    const databaseName = decodeURIComponent(parsedUrl.pathname)
      .replace(/^\/+/, '')
      .split('/')[0];

    if (!databaseName) {
      throw new Error('missing database name');
    }

    return databaseName;
  } catch (error) {
    throw new Error(
      `TEST_DATABASE_URL must be a valid database URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
