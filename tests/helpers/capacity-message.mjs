export function capacityFailure(p95, budget) {
  return `Search timing budget failed: measured p95 ${p95.toFixed(2)} ms; required p95 < ${budget} ms. This test measures this computer's speed using local D1. Rerun: node --test --test-concurrency=1 tests/launch-capacity-search.mjs`
}
