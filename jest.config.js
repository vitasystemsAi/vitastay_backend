module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['controllers/**/*.js', 'services/**/*.js', 'middleware/**/*.js'],
  coverageDirectory: 'coverage',
  verbose: true,
};
