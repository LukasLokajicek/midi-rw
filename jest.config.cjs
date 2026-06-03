/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'js'],
    coverageThreshold: {
        global: {
            lines: 80,
            branches: 80,
            functions: 80,
            statements: 80,
        },
    },
};