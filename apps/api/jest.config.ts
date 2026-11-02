module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@simoncodes-ca/core/testing$': '<rootDir>/../../libs/core/src/testing.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/../../dist/test-results/apps/api', outputName: 'junit.xml' }],
  ],
};
