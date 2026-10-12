import { mkdir, writeFile, readdir, lstat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { canonical, hash } from './integrity.mjs';
export const MAX_ARTIFACT = 16 * 1024 * 1024;
export function safePath(path) {
  if (typeof path !== 'string' || path.length > 240 || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..') || !/^[a-zA-Z0-9_./@+ -]+$/.test(path)) throw new Error('unsafe_artifact_path');
  return path;
}
export function parseBundle(bytes) {
  if (bytes.length > MAX_ARTIFACT) throw new Error('artifact_too_large');
  const bundle = JSON.parse(bytes);
  if (bundle.version !== 1 || !Array.isArray(bundle.files) || bundle.files.length > 2000) throw new Error('invalid_source_bundle');
  const seen = new Set(); let size = 0;
  for (const file of bundle.files) {
    safePath(file.path);
    if (seen.has(file.path) || typeof file.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new Error('invalid_source_file');
    seen.add(file.path); size += Buffer.from(file.content, 'base64').length;
  }
  if (size > MAX_ARTIFACT) throw new Error('artifact_too_large');
  return bundle;
}
export async function materialize(bundle, directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const file of bundle.files) {
    const path = resolve(directory, safePath(file.path));
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, Buffer.from(file.content, 'base64'), { flag: 'wx', mode: 0o444 });
  }
}
export async function collect(directory) {
  const files = []; let size = 0;
  async function walk(relative = '') {
    for (const name of (await readdir(join(directory, relative))).sort()) {
      const path = relative ? `${relative}/${name}` : name; safePath(path);
      const stat = await lstat(join(directory, path));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) throw new Error('unsafe_output_file');
      if (stat.isDirectory()) { await walk(path); continue; }
      size += stat.size;
      if (size > MAX_ARTIFACT || files.length >= 2000) throw new Error('artifact_too_large');
      files.push({ path, content: (await readFile(join(directory, path))).toString('base64') });
    }
  }
  await walk();
  const bytes = Buffer.from(canonical({ version: 1, files }));
  return { bytes, sha256: hash(bytes) };
}
export function command(bundle, kind) {
  const descriptor = bundle.files.find(f => f.path === 'cradle-build.json');
  if (!descriptor) throw new Error('missing_cradle_build_manifest');
  const manifest = JSON.parse(Buffer.from(descriptor.content, 'base64'));
  const argv = manifest.commands?.[kind];
  if (!Array.isArray(argv) || !argv.length || argv.length > 64 || argv.some(v => typeof v !== 'string' || !v || v.length > 4096)) throw new Error(`missing_${kind}_command`);
  return argv;
}
