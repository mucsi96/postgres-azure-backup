import { cp, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Publish the tested bundles unchanged, with documents and assets separated.
export async function prepareClient(directory, destination, assetBaseUrl, appOrigin) {
  const root = resolve(directory);
  const index = await readFile(join(root, 'index.html'), 'utf8');
  for (const entry of await readdir(root, { recursive: true })) {
    if ((await lstat(join(root, entry))).isSymbolicLink()) throw new Error(`Unexpected symlink: ${entry}`);
  }
  const assets = join(destination, 'assets');
  const documents = join(destination, 'documents');
  await mkdir(documents, { recursive: true });
  await cp(root, assets, { recursive: true });
  const html = index.replace(/<(script|link)\b[^>]*>/gi, tag => {
    const attribute = /^<script\b/i.test(tag) ? 'src' : 'href';
    const pattern = new RegExp(`\\b${attribute}=(['"])(.*?)\\1`, 'i');
    if (!pattern.test(tag)) return tag;
    const rewritten = tag.replace(pattern, (_, quote, path) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) throw new Error(`Build assets must be local: ${path}`);
      const url = new URL(path.replace(/^\/+/, ''), assetBaseUrl).href;
      return `${attribute}="${url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`;
    }).replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
    return rewritten.replace(/\s*\/?>(?=$)/, ' crossorigin="anonymous">');
  });
  await rename(join(assets, 'index.html'), join(documents, 'index.html'));
  await writeFile(join(documents, 'index.html'), html);
  const manifestPath = join(assets, 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const key of ['id', 'start_url', 'scope']) {
    manifest[key] = new URL(manifest[key] ?? '/', `${appOrigin}/`).href;
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 6) throw new Error('Usage: prepare-client.mjs <build> <output> <asset-base-url> <app-origin>');
  await prepareClient(...process.argv.slice(2));
}
