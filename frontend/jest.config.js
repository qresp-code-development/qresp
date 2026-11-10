// next/jest wires Next's SWC transform, CSS/module mocks and env for Jest,
// replacing the old babel-jest + custom cssTransform setup.
const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

// HOW MANY SUITES MAY RUN AT ONCE.
//
// Jest's default is one worker per core minus one — sixteen cores here, so
// fifteen jsdom environments started together. Each one holds a React tree
// and the whole of MUI, and this suite is almost entirely MUI: fifteen of
// them do not fit in memory on a developer machine that is also running an
// editor and a browser. The machine then pages to disk, a render that takes
// 1.5s takes 6, and tests fail on the five-second budget without anything
// being wrong with them.
//
// Measured here, full suite, one process per row:
//
//   workers   result                                    elapsed
//   default   FAIL — 27 timeouts across 11 suites         348s
//   1         pass                                        618s
//   2         pass                                        307s
//   3         pass                                        217s
//   4         pass                                        204s
//
// Four is both the fastest and stable; five consecutive full runs at four
// passed with Jest's ordinary five-second per-test budget. The budget is NOT
// raised anywhere — the fix is to stop starving the machine, not to give
// slow tests more time.
//
// A machine with more memory can say so: JEST_WORKERS=8 yarn test. An
// explicit --maxWorkers on the command line still wins over both.
const maxWorkers = Number(process.env.JEST_WORKERS) || 4;

const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/setupTests.js"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  maxWorkers,
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

module.exports = createJestConfig(customJestConfig);
