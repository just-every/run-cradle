import { test } from 'node:test'

export const contract = (id, name, fn) => {
  test(`[${id}] ${name}`, fn)
}
