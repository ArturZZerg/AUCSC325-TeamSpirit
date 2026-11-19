// JEST_TEST_TIMEOUT lets slow CI hosts (ADR 028: capped CPU on the shared server) raise
// the per-test limit; everywhere else it stays at Jest's 5 s default.
module.exports = { preset: 'jest-expo', testMatch: ['**/__tests__/**/*.test.ts?(x)'], setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: Number(process.env.JEST_TEST_TIMEOUT) || 5000 };
