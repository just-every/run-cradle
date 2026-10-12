import { cloudflare } from '../../vendor/base/modules/deploy-kit/provider.mjs'

// Cloudflare's live consumer list uses `script`; its documented response and
// Base use `script_name`. Normalize this field at the provider boundary while
// preserving Base's ownership, settings and mutation checks.
export function consumerResponseApi(api) {
  return {
    ...api,
    async request(path, options) {
      const result = await api.request(path, options)
      if ((options?.method ?? 'GET') !== 'GET' || !/^\/queues\/[a-f0-9]+\/consumers$/.test(path)) return result
      if (!Array.isArray(result)) throw new Error('invalid-queue-consumers')
      return result.map(row => {
        if (row?.type !== 'worker') return row
        const names = ['script', 'script_name'].filter(key => Object.hasOwn(row, key)).map(key => row[key])
        if (!names.length || names.some(name => typeof name !== 'string' || !name) || new Set(names).size !== 1) {
          throw new Error('invalid-queue-consumer-worker')
        }
        return { ...row, script_name: names[0] }
      })
    },
  }
}

export const deploymentApi = options => consumerResponseApi(cloudflare(options))
