/**
 * Produce a deterministic 10,000-row CSV byte stream for size and limit probes.
 * This corpus is not semantic evidence and has no expected import result.
 */
export function makeBaseTransferCapacityCsv() {
  const lines = ['Record,Value'];
  for (let index = 1; index <= 10_000; index += 1) {
    const ordinal = String(index).padStart(5, '0');
    lines.push(`capacity-${ordinal},${index}`);
  }
  return new TextEncoder().encode(`${lines.join('\r\n')}\r\n`);
}
