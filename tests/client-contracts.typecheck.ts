import type { CommandInput, Money, RecordRow, Grant } from '../src/contracts'
const amount: Money = { minor: '9007199254740993', currency: 'AUD', scale: 2 }
declare const row: RecordRow
declare const grant: Grant
const input: CommandInput<{ amount: Money }> = { commandId: '01K00000000000000000000000', expected: [{ ref: row.ref, version: row.version }], input: { amount } }
void input; void grant
