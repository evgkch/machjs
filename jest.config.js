/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  // Let ESM-style `./x.js` specifiers resolve to their `.ts` sources.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/test/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};
