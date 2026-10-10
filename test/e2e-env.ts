// Integration tests must never run against a deployed/application database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to an isolated local database');
const target = new URL(databaseUrl);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  !/test/i.test(target.pathname)
) {
  throw new Error('Integration tests require a local database with "test" in its name');
}
process.env.DATABASE_URL = databaseUrl;
