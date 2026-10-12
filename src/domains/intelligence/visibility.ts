/** Only explicit access denials or tombstones suppress a collection item. Operational faults propagate. */
export function hiddenArtifact(error:unknown):boolean {
 if(!error||typeof error!=='object')return false;
 const code=(error as {code?:unknown}).code;
 return code==='forbidden'||code==='not_found';
}
