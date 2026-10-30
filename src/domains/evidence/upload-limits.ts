// Shared by the browser and streaming service; declared in seed.json limits.
export const directUploadBytes = 100 * 1024 * 1024
export const directUploadLimit = `100 MB (${directUploadBytes.toLocaleString('en-US')} bytes)`
