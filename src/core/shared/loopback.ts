/** Only literal loopback hosts qualify; suffixes and forwarded headers do not. */
export const isLoopbackHostname = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
