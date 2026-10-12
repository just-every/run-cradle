/** Two persisted formats: original activity prose and command-bound activity facts. */
export function readActivityMessage(value: string): { actionId: string | null; message: string } {
 if (!value.startsWith('{"commandId":')) return { actionId: null, message: value }
 let metadata: unknown
 try { metadata = JSON.parse(value) } catch { throw new Error('Campaign activity command metadata is invalid.') }
 if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Campaign activity command metadata is invalid.')
 const stored = metadata as Record<string, unknown>
 if (typeof stored.commandId !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(stored.commandId) || typeof stored.message !== 'string' || Object.keys(stored).some(key => !['commandId','message'].includes(key))) throw new Error('Campaign activity command metadata is invalid.')
 return { actionId: stored.commandId, message: stored.message }
}
