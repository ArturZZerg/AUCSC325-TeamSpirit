// Local runs use half the cores; one suite at a time took about 9 minutes, parallel about 1.
// CI (CI=true) stays serial: the shared server caps the container at 1.5 CPU / 2 GB (ADR 028),
// and Jest sizes its pool from the host's cores, not the container's. JEST_MAX_WORKERS
// overrides both, e.g. for the parallel CI mode on a developer PC (ADR 029).
// Parallel load slows the heavier editor tests, so the local per-test limit is 15 s;
// JEST_TEST_TIMEOUT lets slow hosts (the server uses 30 s) raise it further.
module.exports = { preset: 'jest-expo', testMatch: ['**/__tests__/**/*.test.ts?(x)'], setupFiles: ['<rootDir>/jest.setup.js'],
  maxWorkers: process.env.JEST_MAX_WORKERS || (process.env.CI ? 1 : '50%'),
  testTimeout: Number(process.env.JEST_TEST_TIMEOUT) || 15000 };
