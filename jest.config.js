export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.ts?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  }
};
