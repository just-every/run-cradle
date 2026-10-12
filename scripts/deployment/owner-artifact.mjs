import {execFileSync} from 'node:child_process';
import {packageBuild} from '../../vendor/base/modules/deploy-kit/prepare.mjs';
import {hash} from '../../vendor/base/modules/deploy-kit/validation.mjs';
import {validateMigrations} from '../../vendor/base/modules/deploy-kit/migrations.mjs';
import {migrationInventory,migrationGroups} from '../migration-groups.mjs';
/** Package the seed's already-built source with the complete append-only migration inventory. */
export async function ownerArtifact(root){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(git('status','--porcelain','--untracked-files=no'))throw new Error('owner-source-not-committed');
 const artifact=await packageBuild({root,source:{sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')},runIdentity:{id:'0',attempt:'1'},productDirectory:''});
 for(const {name,sql} of migrationInventory(migrationGroups.filter(group=>group!=='core')))artifact.migrations.push({binding:'DB',name,sql,sha256:hash(sql)});
 validateMigrations(artifact.migrations);return artifact;
}
