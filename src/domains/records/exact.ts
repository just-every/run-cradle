export type Exact = {
    units: bigint;
    scale: number;
};
export function decimal(value: string): Exact {
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) || value === '-0')
        throw new Error('Expected canonical finite decimal text');
    const [whole, fraction = ''] = value.replace('-', '').split('.');
    if (whole.length > 128 || fraction.length > 32)
        throw new Error('Decimal exceeds 128 integer / 32 fractional digits');
    return { units: BigInt((value.startsWith('-') ? '-' : '') + whole + fraction), scale: fraction.length };
}
export function format(value: Exact): string { const negative = value.units < 0n; let s = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, '0'); if (value.scale)
    s = s.slice(0, -value.scale) + '.' + s.slice(-value.scale); s = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; return (negative && s !== '0' ? '-' : '') + s; }
export function normalize(value: string): string { return format(decimal(value)); }
export function compare(a: string, b: string): number { const x = decimal(a), y = decimal(b), scale = Math.max(x.scale, y.scale), left = x.units * 10n ** BigInt(scale - x.scale), right = y.units * 10n ** BigInt(scale - y.scale); return left < right ? -1 : left > right ? 1 : 0; }
export function add(a: string, b: string): string { const x = decimal(a), y = decimal(b), scale = Math.max(x.scale, y.scale); return format({ units: x.units * 10n ** BigInt(scale - x.scale) + y.units * 10n ** BigInt(scale - y.scale), scale }); }
export function multiply(a: string, b: string): string { const x = decimal(a), y = decimal(b); const out = format({ units: x.units * y.units, scale: x.scale + y.scale }); decimal(out); return out; }
export function divide(a: string, b: string): string { const x = decimal(a), y = decimal(b); if (y.units === 0n)
    throw new Error('Division by zero'); const numerator = x.units * 10n ** BigInt(y.scale + 32), denominator = y.units * 10n ** BigInt(x.scale); if (numerator % denominator !== 0n)
    throw new Error('Non-terminating or excessive precision division'); return format({ units: numerator / denominator, scale: 32 }); }
/** Fixed-width decimal order embedding; SQLite byte order equals exact mathematical order. */
export function sortKey(value: string): string { const x = decimal(value), digits = (x.units < 0n ? -x.units : x.units).toString().padStart(x.scale + 1, '0'), whole = x.scale ? digits.slice(0, -x.scale) : digits, fraction = x.scale ? digits.slice(-x.scale) : ''; const magnitude = whole.padStart(128, '0') + fraction.padEnd(32, '0'); return x.units < 0n ? '0' + [...magnitude].map(c => String(9 - Number(c))).join('') : '1' + magnitude; }
