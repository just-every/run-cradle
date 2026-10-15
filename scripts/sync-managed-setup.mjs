import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deploymentSpec} from './delivery/base/spec.mjs';
import {loadSetupManifest} from './delivery/base/setup-manifest.mjs';
import {generateProjectDescriptor} from './delivery/base/generators/project.mjs';
import {managedOwnerDeclaration} from './deployment/declaration.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(await read('packaging.json'));

// Local development opens through the checkout key. The hosted form must
// offer only providers accepted by the production Worker, with their inputs.
const hosted = JSON.parse(await read('rer-setup.json'));
hosted.groups.find(group => group.id === 'hosting-mail').help = 'Managed mail needs no provider account. For your own hosting, choose a provider and verified sender.';
hosted.fields.find(field => field.name === 'OWNER_EMAIL').help = 'Use your Run Edit Run account email to claim this workspace and sign in.';
const provider = hosted.fields.find(field => field.name === 'MAIL_PROVIDER');
provider.required = true;
provider.default = 'resend';
provider.options = provider.options.filter(option => option.value !== 'development');
const setupBytes = json(hosted);
const setupPath = config.setup.manifestFile;
const spec = await deploymentSpec(root, config.artifact.specInputs);
const descriptor = {
  ...generateProjectDescriptor(config.project),
  setup: {path: setupPath, sha256: createHash('sha256').update(setupBytes).digest('hex')},
};
const outputs = [
  ['deploy-owner.json', json(await managedOwnerDeclaration(root))],
  [setupPath, setupBytes],
  ['management/integration/deployment-spec.json', json(spec)],
  ['rer-project.json', json(descriptor)],
];
for (const [path, expected] of outputs) {
  if (check) {
    if (await read(path).catch(() => null) !== expected) throw Error(`${path} drifted; run pnpm build:app && pnpm deployment:spec, then commit the generated files.`);
  } else {
    const url = new URL(`../${path}`, import.meta.url);
    await mkdir(new URL('.', url), {recursive: true});
    await writeFile(url, expected);
  }
}
await loadSetupManifest(root, config.setup, config.artifact.specInputs.mail);
console.log(`Managed setup ${check ? 'matches' : 'generated from'} Base's build-derived deployment specification (${spec.migrations.length} migrations).`);
