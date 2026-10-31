import seed from '../../../seed.json'

export const directUploadBytes = seed.limits.attachmentUploadBytes
export const directUploadLimit = `100 MB (${directUploadBytes} bytes)`
