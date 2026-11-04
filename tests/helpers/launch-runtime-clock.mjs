// Browser assets and document requests can overlap at the same fixture instant.
// Restore the real clock only after the last such request finishes, rather than
// retaining another request's temporary Date constructor as the original clock.
export const launchTestClockSource = `
 const RuntimeDate = globalThis.Date;
 let clockReaders = 0, instant;
 async function withTestClock(testNow, run) {
  if (testNow === undefined) return run();
  if (!Number.isFinite(testNow) || clockReaders && instant !== testNow) throw new Error('Conflicting fixture clocks');
  if (!clockReaders++) {
   instant = testNow;
   globalThis.Date = class extends RuntimeDate {
    constructor(...args) { super(...(args.length ? args : [testNow])); }
    static now() { return testNow; }
   };
  }
  try { return await run(); } finally { if (!--clockReaders) globalThis.Date = RuntimeDate; }
 }
`;
