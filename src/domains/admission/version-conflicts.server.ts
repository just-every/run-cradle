import { AdmissionError } from './errors'
import type { VersionDependency } from './ports'

/** Diagnose the refused transaction; never retry it or disclose an unauthorized row. */
export async function versionConflict(dependencies:readonly VersionDependency[]|undefined,message:string) {
 for(const dependency of dependencies??[]) {
  const current=await dependency.current()
  if(current!==null&&current!==dependency.version)
   return new AdmissionError('version_conflict',`${dependency.label} has current version ${current}`,current)
 }
 return new AdmissionError('version_conflict',message)
}
