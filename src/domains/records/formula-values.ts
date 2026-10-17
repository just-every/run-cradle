import type { CellValue, Money } from '../../contracts/primitives';
import { add, divide, multiply } from './exact';
export function truthy(v: CellValue): boolean { return isMoney(v)?v.minor!=='0':v !== null && v !== false && v !== '' && v !== '0'; }
export function isMoney(v: CellValue): v is Money { return !!v && !Array.isArray(v) && typeof v === 'object' && 'minor' in v; }
export function arithmetic(fn: string, args: CellValue[]): CellValue {
    if (args.length !== 2)
        throw new Error('Arithmetic expects two arguments');
    const [a, b] = args;
    if (isMoney(a) || isMoney(b)) {
        if (!isMoney(a) || !isMoney(b) || a.currency !== b.currency || a.scale !== b.scale)
            throw new Error('mixed_currency');
        if (fn !== 'add' && fn !== 'subtract')
            throw new Error('Money supports same-currency addition and subtraction');
        return { ...a, minor: fn === 'add' ? add(a.minor, b.minor) : add(a.minor, b.minor === '0' ? '0' : b.minor.startsWith('-') ? b.minor.slice(1) : '-' + b.minor) };
    }
    if (typeof a !== 'string' || typeof b !== 'string')
        throw new Error('Numeric arguments must be exact decimal strings');
    if (fn === 'add')
        return add(a, b);
    if (fn === 'subtract')
        return add(a, b === '0' ? '0' : b.startsWith('-') ? b.slice(1) : '-' + b);
    if (fn === 'multiply')
        return multiply(a, b);
    return divide(a, b);
}
