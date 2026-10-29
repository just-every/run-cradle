import { isActiveOperator, type Operator, type OperatorAuth } from '../../vendor/base/modules/operator-auth/index.mjs'
import type { PeopleAdapter, Person } from '../../vendor/base/modules/agent-door/types'

/** Door identities are the product's existing authority principals, never email aliases. */
export interface CradleAgentPerson extends Person {
  baseOperatorId: string
  humanId: string
  authenticationEpoch: number
  baseVersion: number
  initialOwner: boolean
}
interface NativeRow {
  id: string; human_id: string; authentication_epoch: number; initial_owner: number
  principal_state: string; native_active: number; base_id: string; email: string
  display_name: string; role: Operator['role']; status: Operator['status']; version: number; created_at: number
}
const nativePersonSql = `SELECT p.id,p.human_id,p.authentication_epoch,p.initial_owner,p.state AS principal_state,
  native.active AS native_active,o.id AS base_id,o.email,o.display_name,o.role,o.status,o.version,o.created_at
  FROM authority_principals p JOIN operators native ON native.id=p.human_id
  JOIN cradle_base_operators projection ON projection.principal_id=p.id
  JOIN oa_operators o ON o.id=projection.base_id WHERE p.kind='human' AND p.id=?`

/** Re-read all native admission state before constructing a sponsor's product context. */
export async function readCradleAgentPerson(db: D1Database, id: string, allowList?: string[]): Promise<CradleAgentPerson | null> {
  const row = await db.prepare(nativePersonSql).bind(id).first<NativeRow>()
  if (!row || row.principal_state !== 'active' || row.native_active !== 1 || !isActiveOperator({
    id: row.base_id, email: row.email, displayName: row.display_name, role: row.role,
    status: row.status, version: row.version, createdAt: row.created_at,
  }, allowList)) return null
  return {
    id: row.id, humanId: row.human_id, baseOperatorId: row.base_id,
    email: row.email, name: row.display_name, role: row.role, active: true,
    authenticationEpoch: row.authentication_epoch, baseVersion: row.version, initialOwner: row.initial_owner === 1,
  }
}

export function createCradlePeople(options: {
  db: D1Database; baseAuth: Pick<OperatorAuth, 'getSession'>; allowList?: string[]
}): PeopleAdapter {
  const { db, baseAuth, allowList } = options
  const read = (id: string) => readCradleAgentPerson(db, id, allowList)
  const settings = () => db.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0')
    .first<{ owner_id: string | null }>()
  // initial_owner is Cradle's canonical installation-owner flag, maintained by
  // native bootstrap/ownership transfer. Imported installations need no claim-id alias.
  const owner = async () => {
    const rows = (await db.prepare(`SELECT p.id FROM authority_principals p
      JOIN cradle_base_operators projection ON projection.principal_id=p.id
      JOIN oa_operators o ON o.id=projection.base_id
      WHERE p.kind='human' AND p.initial_owner=1 AND o.role='owner' LIMIT 2`).all<{ id: string }>()).results
    return rows.length === 1 ? read(rows[0]!.id) : null
  }
  return {
    person: read,
    async session(request) {
      const session = await baseAuth.getSession(request)
      if (!session) return null
      const binding = await db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?')
        .bind(session.operatorId).first<{ principal_id: string }>()
      return binding ? read(binding.principal_id) : null
    },
    async sponsor({ sub }) {
      const current = await settings()
      if (!current) return null
      if (current.owner_id === sub) return owner()
      const binding = await db.prepare(`SELECT projection.principal_id FROM bs_team team
        JOIN cradle_base_operators projection ON projection.base_id=team.operator_id
        WHERE team.business_id=? AND team.state IN ('invited','active')`).bind(sub).first<{ principal_id: string }>()
      return binding ? read(binding.principal_id) : null
    },
    // For an unpaired installation only. Paired policy refs use businessMember
    // below; a native promotion never supplies a signed Business policy role.
    businessRole: person => person.role === 'owner' ? 'owner' : person.role === 'admin' ? 'editor' : null,
    async businessMember(person) {
      const current = await read(person.id), adopted = await settings()
      if (!current || !adopted) return null
      if (adopted.owner_id && (await owner())?.id === current.id) return { id: adopted.owner_id, role: 'owner' }
      const rows = (await db.prepare(`SELECT business_id,business_role FROM bs_team
        WHERE operator_id=? AND state IN ('invited','active') AND business_id IS NOT NULL LIMIT 2`)
        .bind(current.baseOperatorId).all<{ business_id: string; business_role: 'admin' | 'member' | null }>()).results
      if (rows.length !== 1 || !rows[0]!.business_role) return null
      return { id: rows[0]!.business_id, role: rows[0]!.business_role === 'admin' ? 'editor' : null }
    },
  }
}
