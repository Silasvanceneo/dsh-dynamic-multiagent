// Bundle the browser half into the shape dsh's client module loader expects:
// `window.__ModuleLoader__.load({ id, factory(require) })`, with React, slots and primitives
// taken from the shell's shared module table instead of being bundled.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const SHARED = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'];

const cssPlugin = {
  name: 'inline-css',
  setup(api) {
    api.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await readFile(args.path, 'utf8');
      return {
        loader: 'js',
        contents: `const css = ${JSON.stringify(css)};
const tagId = ${JSON.stringify(`${pkg.name}/${args.path.split(/[\\/]/).pop()}`)};
if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
  const tag = document.createElement('style');
  tag.dataset.plugin = ${JSON.stringify(pkg.name)};
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default css;`,
      };
    });
  },
};

const result = await build({
  entryPoints: [join(root, 'client/index.jsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: SHARED,
  plugins: [cssPlugin],
  legalComments: 'none',
  minifySyntax: true,
  logLevel: 'warning',
});

const body = result.outputFiles[0].text;
const bundle = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`;
await mkdir(join(root, 'lib'), { recursive: true });
await writeFile(join(root, 'lib/client.js'), bundle);
console.log(`lib/client.js ${(bundle.length / 1024).toFixed(1)} KiB`);
