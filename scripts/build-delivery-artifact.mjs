import {readFile} from 'node:fs/promises';
import {produceSeedArtifact} from './delivery/base/package.mjs';
const config=JSON.parse(await readFile(new URL('../packaging.json',import.meta.url),'utf8'));
try{console.log(JSON.stringify({artifact:await produceSeedArtifact({root:process.cwd(),config})}));}
catch{console.error('Delivery packaging failed; inspect the actual build and source policy.');process.exitCode=1;}
