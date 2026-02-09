import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { transformProject } from '../src/transformer/Injector';
import type { ScopeMap } from '../src/types';
import { getRelativeScopePath } from '../src/parser/utils';
import { RUNTIME_PATHS } from '../src/constants';

// @babel/traverse has different exports for ESM vs CommonJS
const traverse = (traverseDefault as any).default || traverseDefault;

describe('Injector - opt-in object literals', () => {
  it('rewrites extracted object literal properties to t() and injects useTranslation()', () => {
    const code = `
export default function Component() {
  // @algb-translate-obj-[title,placeholder]
  const meta = {
    title: "Text Translation",
    placeholder: "Enter text",
    id: "nope"
  };
  return <div>{meta.title}</div>;
}
`.trim();

    const fileAbs = `${process.cwd()}/src/Component.tsx`;
    const relativePath = path
      .relative(process.cwd(), fileAbs)
      .split(path.sep)
      .join('/');

    // Build expected scope keys by parsing and reading Babel path locations.
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      attachComment: true,
    });

    let titleKey: string | null = null;
    let placeholderKey: string | null = null;
    traverse(ast, {
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
        if (propName === 'title') titleKey = k;
        if (propName === 'placeholder') placeholderKey = k;
      },
    });

    expect(titleKey).toBeTruthy();
    expect(placeholderKey).toBeTruthy();

    const sourceMap: ScopeMap = {
      files: {
        [relativePath]: {
          scopes: {
            [titleKey!]: {
              type: 'text',
              content: 'Text Translation',
              hash: 'h1',
              context: '',
              skip: false,
              overrides: {},
            },
            [placeholderKey!]: {
              type: 'text',
              content: 'Enter text',
              hash: 'h2',
              context: '',
              skip: false,
              overrides: {},
            },
          },
        },
      },
    };

    const out = transformProject(code, { filePath: fileAbs, sourceMap });

    // Should rewrite the object property values to t("file::key")
    expect(out).toContain(`title: t("${relativePath}::${titleKey}")`);
    expect(out).toContain(
      `placeholder: t("${relativePath}::${placeholderKey}")`
    );

    // Should inject hook + import
    expect(out).toContain('useTranslation');
    expect(out).toContain(RUNTIME_PATHS.CLIENT_USE_TRANSLATION);
  });
});
