/**
 * Loads apps/api/.env before the test run so `npm test` works the same way
 * as `npm run dev` (both need DATABASE_URL, API_TOKEN_SECRET, etc). Safe to
 * run in CI, where these are already real environment variables and no
 * .env file exists.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file present — assume the environment already has the required variables (e.g. CI).
}
