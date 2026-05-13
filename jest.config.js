// Jest configuration (Phase 10.1)
//
// - ts-jest for CommonJS-output TypeScript
// - testMatch limited to tests/ directory so src/ files aren't accidentally
//   picked up as suites
// - testTimeout 15s — some unit tests touch Sharp/PDF helpers that need
//   to lazy-init their underlying native modules
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(test|spec).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testTimeout: 15_000,
  // Skip coverage by default; CI can opt-in with --coverage
  collectCoverageFrom: [
    'src/services/tds.service.ts',
    'src/services/bunnyToken.service.ts',
    'src/services/webhookEvents.service.ts',
    'src/utils/helpers.ts',
  ],
  coverageDirectory: 'coverage',
  // Quiet noisy pino logs from src code
  silent: false,
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
