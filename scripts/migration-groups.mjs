import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const migrationGroups = ['core', 'base', 'import', 'updates']
export const migrationRoot = fileURLToPath(new URL('../migrations/', import.meta.url))
export function migrationInventory(groups = migrationGroups) {
 const seen = new Set()
 return groups.flatMap(group => readdirSync(join(migrationRoot, group)).filter(name => name.endsWith('.sql')).sort().map(name => {
  if (seen.has(name)) throw new Error(`Duplicate migration name: ${name}`)
  seen.add(name)
  return { group, name, sql: readFileSync(join(migrationRoot, group, name), 'utf8') }
 }))
}
export function migrationConfiguration(group) {
 if (!migrationGroups.includes(group)) throw new Error('Unknown migration group')
 return {name:'cradle',compatibility_date:'2026-09-08',d1_databases:[{binding:'DB',database_name:'cradle',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:join(migrationRoot,group)}]}
}
