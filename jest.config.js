export default {
  testEnvironment: 'node',
  coverageDirectory: './coverage/',
  collectCoverage: true,
  testMatch: ['**/test/**/*.js?(x)', '**/?(*.)+(spec|test).js?(x)'],
  transform: {
    '^.+\\.m?jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@aiswarm)/)'
  ]
}