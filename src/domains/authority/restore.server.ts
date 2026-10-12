/** Applied by E in the same atomic transaction as validated archive restoration.
 * Revoked/expired states are never changed. Imported active grants remain permanently
 * held; a current human must issue a distinct replacement under current policy.
 */
export const authorityRestoreGuards=(db:D1Database):D1PreparedStatement[]=>[
 db.prepare('UPDATE authority_grants SET restore_hold=1'),
 db.prepare("UPDATE authority_sessions SET revoked_at=COALESCE(revoked_at,unixepoch('subsec')*1000),version=version+1"),
 db.prepare("UPDATE authority_credentials SET revoked_at=COALESCE(revoked_at,unixepoch('subsec')*1000),version=version+1"),
 db.prepare("UPDATE authority_magic_tokens SET consumed_at=COALESCE(consumed_at,unixepoch('subsec')*1000)"),
 db.prepare('UPDATE authority_principals SET authentication_epoch=authentication_epoch+1'),
]
