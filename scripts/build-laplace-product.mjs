import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const messages = JSON.parse(await readFile('src/i18n/zh-CN.json', 'utf8'));
// 事件展示包使用固定中文标签，不携带软件操作界面的语言资源。
const fixedLabels = {
  name: 'fixed-event-labels',
  setup(builder) {
    builder.onLoad({ filter: /\.tsx?$/ }, async ({ path: file }) => {
      if (!file.startsWith(path.resolve('src') + path.sep)) return;
      const source = await readFile(file, 'utf8');
      if (!source.includes('uiText(')) return;
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const edits = [];
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'uiText' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          if (key in messages) edits.push({ start: node.getStart(tree), end: node.end, text: JSON.stringify(messages[key]) });
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
      let contents = source;
      for (const edit of edits.sort((a, b) => b.start - a.start)) contents = contents.slice(0, edit.start) + edit.text + contents.slice(edit.end);
      return { contents, loader: file.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
};

await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], plugins: [fixedLabels], bundle: true, format: 'iife', platform: 'browser', target: ['chrome111'], outfile: 'public/laplace/product/renderer.js', minify: false, legalComments: 'linked', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile('src/compat/laplace/source.css', 'utf8');
await writeFile('public/laplace/product/default.css', css);
