import 'dotenv/config';

import { spawn } from 'node:child_process';

import { assertSafeE2eDatabaseUrl } from './e2e-database-safety';

async function main() {
  const testDatabaseUrl = assertSafeE2eDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  });

  await runPrisma([
    'migrate',
    'reset',
    '--force',
    '--skip-generate',
  ], testDatabaseUrl);
}

function runPrisma(args: string[], testDatabaseUrl: string) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['prisma', ...args], {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: 'test',
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
