/** Owner setup permissions only; provider effects still require their own scope and grants. */
export const connectionManagementActions = ['connection.read', 'connection.configure', 'connection.begin-consent', 'connection.check', 'connection.revoke']
export const ownerConnectionControl = (action: string) => connectionManagementActions.includes(action) && action !== 'connection.read'
