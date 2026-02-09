import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import { describe, expect, it } from 'vitest';
import { Parser } from '../src/parser/Parser';
import { getRelativeScopePath } from '../src/parser/utils';

// @babel/traverse has different exports for ESM vs CommonJS
const traverse = (traverseDefault as any).default || traverseDefault;

describe('Parser - opt-in non-JSX literals', () => {
  it('extracts opt-in object keys + arrays into scope map', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algb-intl-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const fileAbs = path.join(srcDir, 'Component.tsx');
    const code = `
export default function Component() {
  // @algb-translate-obj-[title,placeholder]
  const meta = {
    title: "Text Translation",
    placeholder: "Enter text",
    id: "should-not-extract"
  };

  // @algb-translate-arr
  const tabs = ["Playground", "Settings"];

  return <div>{meta.title} {tabs[0]}</div>;
}
`.trim();
    fs.writeFileSync(fileAbs, code, 'utf-8');

    const prevCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const parser = new Parser({ outputDir: '.intl' });
      const scopeMap = parser.parseProject();

      const relFile = path.relative(tmpDir, fileAbs).split(path.sep).join('/');
      expect(scopeMap.files[relFile]).toBeTruthy();

      // Compute expected keys by parsing the same file and using getPathLocation()
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        attachComment: true,
      });

      let metaTitleKey: string | null = null;
      let metaPlaceholderKey: string | null = null;
      let tabs0Key: string | null = null;
      let tabs1Key: string | null = null;

      traverse(ast, {
        VariableDeclarator(p: any) {
          if (!p.node.init) return;

          if (p.node.id?.type === 'Identifier' && p.node.id.name === 'tabs') {
            const declScopePath = getRelativeScopePath(p.getPathLocation());
            tabs0Key = `${declScopePath}_arr_0`;
            tabs1Key = `${declScopePath}_arr_1`;
          }
        },
        ObjectProperty(p: any) {
          const keyNode = p.node.key;
          const propName =
            keyNode?.type === 'Identifier'
              ? keyNode.name
              : keyNode?.type === 'StringLiteral'
                ? keyNode.value
                : null;
          if (!propName) return;
          if (propName !== 'title' && propName !== 'placeholder') return;

          const base = getRelativeScopePath(p.getPathLocation());
          const k = `${base}_obj_${propName}`;
          if (propName === 'title') metaTitleKey = k;
          if (propName === 'placeholder') metaPlaceholderKey = k;
        },
      });

      const scopes = scopeMap.files[relFile]!.scopes;

      expect(metaTitleKey).toBeTruthy();
      expect(metaPlaceholderKey).toBeTruthy();
      expect(tabs0Key).toBeTruthy();
      expect(tabs1Key).toBeTruthy();

      expect(scopes[metaTitleKey!]?.content).toBe('Text Translation');
      expect(scopes[metaPlaceholderKey!]?.content).toBe('Enter text');
      expect(scopes[tabs0Key!]?.content).toBe('Playground');
      expect(scopes[tabs1Key!]?.content).toBe('Settings');

      // Ensure non-allowed object keys aren't extracted.
      const extractedContents = Object.values(scopes).map((s) => s.content);
      expect(extractedContents.includes('should-not-extract')).toBe(false);

      // Sanity: hashes are md5 of content (matches Parser behavior)
      const expectedHash = crypto
        .createHash('md5')
        .update('Text Translation')
        .digest('hex');
      expect(scopes[metaTitleKey!]?.hash).toBe(expectedHash);
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
