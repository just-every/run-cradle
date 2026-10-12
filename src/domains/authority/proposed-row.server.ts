import type { SqlPredicate, SqlScalar } from '../admission/ports';
import { trustedPredicate, identifier } from '../admission/sql.server';
import type { PolicyEntity } from './scope.server';
import { canonical } from '../admission/canonical';
/** Evaluate exactly the server-prepared insertion, never an unrelated existing row. */
export function proposedRowPredicate(entity: PolicyEntity, row: Record<string, SqlScalar>, predicate: SqlPredicate): SqlPredicate {
 const columns = new Set([entity.idColumn, ...(entity.appColumn ? [entity.appColumn] : []), ...entity.fields.flatMap(f => [f.column, ...(f.currencyColumn ? [f.currencyColumn] : []), ...(f.scaleColumn ? [f.scaleColumn] : [])]), ...Object.keys(row)]);
 const projection = [...columns].map(c => `json_extract(payload,'$.${identifier(c).slice(1,-1)}') AS ${identifier(c)}`).join(',');
 return trustedPredicate(`EXISTS(SELECT 1 FROM (SELECT ${projection} FROM (SELECT ? AS payload)) AS ${identifier(entity.table)} WHERE ${predicate.sql})`, [canonical(row), ...predicate.values]);
}
