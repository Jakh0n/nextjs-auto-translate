import generateDefault from '@babel/generator';
import { parse } from '@babel/parser';
import traverseDefault, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import path from 'path';
import { RUNTIME_PATHS } from '../constants';
import { findTranslationInstructions } from '../parser/utils';
import { ElementPropDescriptor, ScopeData, ScopeMap } from '../types';

// @babel/traverse and @babel/generator have different exports for ESM vs CommonJS
const traverse = (traverseDefault as any).default || traverseDefault;
const generate = (generateDefault as any).default || generateDefault;

type JsxChild = t.JSXElement['children'][number];

function valueToExpression(value: unknown): t.Expression {
  if (value === null || value === undefined) {
    return t.identifier('undefined');
  }
  if (typeof value === 'string') return t.stringLiteral(value);
  if (typeof value === 'number') return t.numericLiteral(value);
  if (typeof value === 'boolean') return t.booleanLiteral(value);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const props = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => t.objectProperty(t.stringLiteral(k), valueToExpression(v))
    );
    return t.objectExpression(props);
  }
  return t.identifier('undefined');
}

function elementPropsToArrayExpression(
  elementProps: ElementPropDescriptor[]
): t.ArrayExpression {
  return t.arrayExpression(
    elementProps.map((desc) =>
      t.objectExpression([
        t.objectProperty(t.identifier('tag'), t.stringLiteral(desc.tag)),
        t.objectProperty(
          t.identifier('props'),
          t.objectExpression(
            Object.entries(desc.props).map(([k, v]) =>
              t.objectProperty(t.stringLiteral(k), valueToExpression(v))
            )
          )
        ),
      ])
    )
  );
}

function insertAfterDirectives(ast: t.File, node: t.Statement) {
  const body = ast.program.body;
  let idx = 0;
  while (idx < body.length) {
    const stmt = body[idx];
    if (
      t.isExpressionStatement(stmt) &&
      t.isStringLiteral(stmt.expression) &&
      typeof (stmt as any).directive === 'string'
    ) {
      idx++;
      continue;
    }
    break;
  }
  body.splice(idx, 0, node);
}

// Injects <Translated tKey="scope" /> (optionally with fallback children, elementProps, components)
export function injectTranslated(
  scope: string,
  fallbackChildren: JsxChild[] = [],
  options?: {
    elementProps?: ElementPropDescriptor[];
    components?: t.Expression;
  }
): t.JSXElement {
  const attributes: t.JSXAttribute[] = [
    t.jsxAttribute(t.jsxIdentifier('tKey'), t.stringLiteral(scope)),
  ];
  if (
    options?.elementProps &&
    Array.isArray(options.elementProps) &&
    options.elementProps.length > 0
  ) {
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('elementProps'),
        t.jsxExpressionContainer(
          elementPropsToArrayExpression(options.elementProps)
        )
      )
    );
  }
  if (options?.components) {
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('components'),
        t.jsxExpressionContainer(options.components)
      )
    );
  }

  if (fallbackChildren.length > 0) {
    return t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier('Translated'), attributes, false),
      t.jsxClosingElement(t.jsxIdentifier('Translated')),
      fallbackChildren,
      false
    );
  }

  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('Translated'), attributes, true),
    null,
    [],
    true
  );
}

// Injects <Translated tKey="scope" params={{...}} /> for template literals with parameters
export function injectTranslatedWithParams(
  scope: string,
  params: Record<string, t.Expression>,
  fallbackChildren: JsxChild[] = [],
  options?: {
    elementProps?: ElementPropDescriptor[];
    components?: t.Expression;
  }
): t.JSXElement {
  const attributes: t.JSXAttribute[] = [
    t.jsxAttribute(t.jsxIdentifier('tKey'), t.stringLiteral(scope)),
  ];

  if (Object.keys(params).length > 0) {
    const properties = Object.entries(params).map(([key, value]) =>
      t.objectProperty(t.identifier(key), value)
    );
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('params'),
        t.jsxExpressionContainer(t.objectExpression(properties))
      )
    );
  }
  if (
    options?.elementProps &&
    Array.isArray(options.elementProps) &&
    options.elementProps.length > 0
  ) {
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('elementProps'),
        t.jsxExpressionContainer(
          elementPropsToArrayExpression(options.elementProps)
        )
      )
    );
  }
  if (options?.components) {
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier('components'),
        t.jsxExpressionContainer(options.components)
      )
    );
  }

  if (fallbackChildren.length > 0) {
    return t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier('Translated'), attributes, false),
      t.jsxClosingElement(t.jsxIdentifier('Translated')),
      fallbackChildren,
      false
    );
  }

  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('Translated'), attributes, true),
    null,
    [],
    true
  );
}

// Ensures import Translated from the package runtime path exists
export function ensureImportTranslated(ast: t.File) {
  let hasImport = false;
  traverse(ast, {
    ImportDeclaration(path: any) {
      if (
        path.node.source.value === RUNTIME_PATHS.CLIENT_TRANSLATED &&
        path.node.specifiers.some(
          (s: any) =>
            t.isImportDefaultSpecifier(s) &&
            t.isIdentifier(s.local) &&
            s.local.name === 'Translated'
        )
      ) {
        hasImport = true;
        path.stop();
      }
    },
  });
  if (!hasImport) {
    const importDecl = t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('Translated'))],
      t.stringLiteral(RUNTIME_PATHS.CLIENT_TRANSLATED)
    );
    insertAfterDirectives(ast, importDecl);
  }
}

// Ensures import useTranslation hook exists
export function ensureImportUseTranslation(ast: t.File) {
  let hasImport = false;
  traverse(ast, {
    ImportDeclaration(path: any) {
      if (
        path.node.source.value === RUNTIME_PATHS.CLIENT_USE_TRANSLATION &&
        path.node.specifiers.some(
          (s: any) =>
            t.isImportSpecifier(s) &&
            t.isIdentifier(s.imported) &&
            s.imported.name === 'useTranslation'
        )
      ) {
        hasImport = true;
        path.stop();
      }
    },
  });
  if (!hasImport) {
    const importDecl = t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier('useTranslation'),
          t.identifier('useTranslation')
        ),
      ],
      t.stringLiteral(RUNTIME_PATHS.CLIENT_USE_TRANSLATION)
    );
    insertAfterDirectives(ast, importDecl);
  }
}

function ensureUseClientDirective(ast: t.File) {
  // Next.js requires 'use client' to be the first statement (before imports)
  const first = ast.program.body[0];
  const hasUseClient =
    first &&
    t.isExpressionStatement(first) &&
    t.isStringLiteral(first.expression) &&
    first.expression.value === 'use client';

  if (hasUseClient) return;

  const useClientStmt = t.expressionStatement(t.stringLiteral('use client'));
  (useClientStmt as any).directive = 'use client';
  ast.program.body.unshift(useClientStmt);
}

// Ensures import LocalesSwitcher exists
export function ensureImportLocalesSwitcher(ast: t.File) {
  let hasImport = false;
  traverse(ast, {
    ImportDeclaration(path: any) {
      if (
        path.node.source.value === RUNTIME_PATHS.CLIENT_LOCALE_SWITCHER &&
        path.node.specifiers.some(
          (s: any) =>
            t.isImportDefaultSpecifier(s) &&
            t.isIdentifier(s.local) &&
            s.local.name === 'LocalesSwitcher'
        )
      ) {
        hasImport = true;
        path.stop();
      }
    },
  });
  if (!hasImport) {
    const importDecl = t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('LocalesSwitcher'))],
      t.stringLiteral(RUNTIME_PATHS.CLIENT_LOCALE_SWITCHER)
    );
    insertAfterDirectives(ast, importDecl);
  }
}

// Create the language switcher element
function createSwitcherElement(): t.JSXElement {
  return t.jsxElement(
    t.jsxOpeningElement(
      t.jsxIdentifier('div'),
      [
        t.jsxAttribute(
          t.jsxIdentifier('className'),
          t.stringLiteral('fixed top-4 right-4 z-[9999]')
        ),
      ],
      false
    ),
    t.jsxClosingElement(t.jsxIdentifier('div')),
    [
      t.jsxText('\n          '),
      t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('LocalesSwitcher'), [], true),
        null,
        [],
        true
      ),
      t.jsxText('\n        '),
    ],
    false
  );
}

// Inject LocalesSwitcher into the page component's return statement
export function injectLocaleSwitcher(ast: t.File) {
  let injected = false;

  // Strategy 1: Find return statement and inject into its JSX
  traverse(ast, {
    ReturnStatement(path: any) {
      if (injected) return;

      const returnArg = path.node.argument;

      // If return has a JSX element, try to inject into it
      if (t.isJSXElement(returnArg)) {
        const switcherElement = createSwitcherElement();

        // Try to inject as first child
        if (Array.isArray(returnArg.children)) {
          returnArg.children.unshift(t.jsxText('\n        '), switcherElement);
          injected = true;
          path.stop();
        }
      }
      // If return has a JSX fragment, inject into it
      else if (t.isJSXFragment(returnArg)) {
        const switcherElement = createSwitcherElement();

        if (Array.isArray(returnArg.children)) {
          returnArg.children.unshift(t.jsxText('\n        '), switcherElement);
          injected = true;
          path.stop();
        }
      }
      // If return has a parenthesized expression (common in JSX), unwrap and try again
      else if (
        t.isParenthesizedExpression(returnArg) &&
        t.isJSXElement(returnArg.expression)
      ) {
        const jsxElement = returnArg.expression;
        const switcherElement = createSwitcherElement();

        if (Array.isArray(jsxElement.children)) {
          jsxElement.children.unshift(t.jsxText('\n        '), switcherElement);
          injected = true;
          path.stop();
        }
      }
    },
  });

  // Strategy 2: Handle arrow function expressions (common in Next.js pages)
  if (!injected) {
    traverse(ast, {
      ArrowFunctionExpression(path: any) {
        if (injected) return;

        const body = path.node.body;

        // If arrow function returns JSX directly
        if (t.isJSXElement(body)) {
          const switcherElement = createSwitcherElement();
          if (Array.isArray(body.children)) {
            body.children.unshift(t.jsxText('\n        '), switcherElement);
            injected = true;
            path.stop();
          }
        }
        // If arrow function returns a fragment
        else if (t.isJSXFragment(body)) {
          const switcherElement = createSwitcherElement();
          if (Array.isArray(body.children)) {
            body.children.unshift(t.jsxText('\n        '), switcherElement);
            injected = true;
            path.stop();
          }
        }
        // If arrow function returns parenthesized JSX
        else if (
          t.isParenthesizedExpression(body) &&
          t.isJSXElement(body.expression)
        ) {
          const jsxElement = body.expression;
          const switcherElement = createSwitcherElement();
          if (Array.isArray(jsxElement.children)) {
            jsxElement.children.unshift(
              t.jsxText('\n        '),
              switcherElement
            );
            injected = true;
            path.stop();
          }
        }
      },
    });
  }

  // Strategy 3: If we didn't find a return statement, try to find any JSX element
  // (fallback for different patterns)
  if (!injected) {
    traverse(ast, {
      JSXElement(path: any) {
        if (injected) return;

        const openingElement = path.node.openingElement;
        const tagName = openingElement.name;

        // Look for common container elements: main, section, div, article
        if (
          t.isJSXIdentifier(tagName) &&
          (tagName.name === 'main' ||
            tagName.name === 'section' ||
            tagName.name === 'div' ||
            tagName.name === 'article')
        ) {
          const switcherElement = createSwitcherElement();

          // Inject as first child
          if (Array.isArray(path.node.children)) {
            path.node.children.unshift(
              t.jsxText('\n        '),
              switcherElement
            );
            injected = true;
            path.stop();
          }
        }
      },
    });
  }

  // Strategy 4: If still not injected, wrap the entire return in a fragment
  if (!injected) {
    traverse(ast, {
      ReturnStatement(path: any) {
        if (injected) return;

        const returnArg = path.node.argument;
        const switcherElement = createSwitcherElement();

        // Wrap return value in a fragment with the switcher
        const fragment = t.jsxFragment(
          t.jsxOpeningFragment(),
          t.jsxClosingFragment(),
          [switcherElement, t.jsxText('\n        '), returnArg]
        );

        path.node.argument = fragment;
        injected = true;
        path.stop();
      },
    });
  }

  // Log if injection failed (for debugging)
  if (!injected) {
    console.warn(
      '[AutoIntl] Failed to inject LocaleSwitcher - no suitable injection point found'
    );
  }
}

// Transforms the specified file, injecting t() calls
export function transformProject(
  code: string,
  options: {
    sourceMap: ScopeMap;
    filePath: string;
  }
) {
  const { filePath } = options;

  // Normalize path to match sourceMap format (forward slashes)
  const relativePath = path
    .relative(process.cwd(), filePath)
    .split(path.sep)
    .join('/');
  const isPageFile =
    relativePath.includes('page.tsx') || relativePath.includes('page.jsx');
  const isInSourceMap =
    options.sourceMap.files && options.sourceMap.files[relativePath];

  // For page files, always parse AST to inject language switcher
  // For other files, only process if they exist in sourceMap
  if (!isPageFile && !isInSourceMap) {
    return code;
  }

  let ast;

  try {
    ast = parse(code, {
      attachComment: true,
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch (e) {
    console.warn(`[Injector] Failed to parse ${relativePath}:`, e);
    return code;
  }

  let changed = false;

  // Only do text transformation if file is in sourceMap
  if (isInSourceMap) {
    const fileScopes = options.sourceMap.files[relativePath]?.scopes || {};
    const processedElements = new Set<string>();
    const componentsNeedingHook = new Set<string>();

    // Compute a stable scope path compatible with Parser's getRelativeScopePath().
    // Parser stores scope keys like: program/bodyX/... (no dots, no [N]).
    const getRelativeScopePath = (fullPath: string): string => {
      const parts = fullPath.split('.');
      const bodyIndex = parts.findIndex((part) => part === 'body');
      if (bodyIndex !== -1 && parts[bodyIndex - 1] === 'program') {
        const relativeParts = parts.slice(bodyIndex + 1);
        return relativeParts.join('/').replace(/\[(\d+)\]/g, '$1');
      }
      return fullPath.replace(/\[(\d+)\]/g, '$1').replace(/\./g, '/');
    };

    // Build __intlComponents map for PascalCase tags used in <element:...> and get inject options helper
    const pascalCaseTags = new Set<string>();
    for (const scopeData of Object.values(fileScopes) as ScopeData[]) {
      if (scopeData.elementProps) {
        for (const { tag } of scopeData.elementProps) {
          if (
            tag.length > 0 &&
            tag[0] === tag[0].toUpperCase() &&
            tag[0] !== tag[0].toLowerCase()
          ) {
            pascalCaseTags.add(tag);
          }
        }
      }
    }
    const bindings = new Map<string, string>();
    if (pascalCaseTags.size > 0) {
      traverse(ast, {
        ImportDeclaration(importPath: NodePath<t.ImportDeclaration>) {
          const specifiers = importPath.node.specifiers;
          for (const spec of specifiers) {
            const local = t.isImportDefaultSpecifier(spec)
              ? spec.local.name
              : t.isImportSpecifier(spec) && spec.local.name
                ? spec.local.name
                : null;
            if (local && pascalCaseTags.has(local)) bindings.set(local, local);
          }
        },
        FunctionDeclaration(fnPath: NodePath<t.FunctionDeclaration>) {
          if (fnPath.node.id && t.isIdentifier(fnPath.node.id)) {
            const name = fnPath.node.id.name;
            if (pascalCaseTags.has(name)) bindings.set(name, name);
          }
        },
        VariableDeclarator(varPath: NodePath<t.VariableDeclarator>) {
          if (
            t.isIdentifier(varPath.node.id) &&
            (t.isArrowFunctionExpression(varPath.node.init) ||
              t.isFunctionExpression(varPath.node.init))
          ) {
            const name = varPath.node.id.name;
            if (pascalCaseTags.has(name)) bindings.set(name, name);
          }
        },
      });
    }
    let intlComponentsRef: t.Expression | undefined;
    if (pascalCaseTags.size > 0 && bindings.size > 0) {
      const componentProps = Array.from(bindings.entries())
        .filter(([name]) => pascalCaseTags.has(name))
        .map(([name]) =>
          t.objectProperty(t.stringLiteral(name), t.identifier(name))
        );
      if (componentProps.length > 0) {
        const varDecl = t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__intlComponents'),
            t.objectExpression(componentProps)
          ),
        ]);
        insertAfterDirectives(ast, varDecl);
        intlComponentsRef = t.identifier('__intlComponents');
      }
    }
    const getInjectOptions = (scopePath: string) => {
      const scopeData = fileScopes[scopePath] as ScopeData | undefined;
      return {
        elementProps: scopeData?.elementProps,
        components: intlComponentsRef,
      };
    };

    // Pass 0: Translate static string-array literals that the Parser extracted as per-element entries.
    // This enables loop scenarios like:
    //   const items = ['First','Second'];
    //   {items.map((item) => <div>{item}</div>)}
    //
    // The Parser creates scope keys:
    //   {variableDeclaratorScopePath}_arr_{index}
    // and we rewrite each string literal element into:
    //   t(`${relativePath}::{key}`)
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        const init = path.node.init;
        if (!init || !t.isArrayExpression(init)) return;

        const declScopePath = getRelativeScopePath(path.getPathLocation());

        let didReplace = false;
        init.elements = init.elements.map((el, index) => {
          if (!el) return el;
          const isStaticTemplate =
            t.isTemplateLiteral(el) && el.expressions.length === 0;
          if (!t.isStringLiteral(el) && !isStaticTemplate) return el;
          const key = `${declScopePath}_arr_${index}`;
          if (!fileScopes[key]) return el;

          didReplace = true;
          return t.callExpression(t.identifier('t'), [
            t.stringLiteral(`${relativePath}::${key}`),
          ]);
        });

        if (!didReplace) return;

        // This requires t() which comes from the useTranslation() hook.
        const functionPath = path.findParent((p: any) => {
          return (
            p.isFunctionDeclaration() ||
            p.isArrowFunctionExpression() ||
            p.isFunctionExpression() ||
            (p.isVariableDeclarator() &&
              p.node.init &&
              (t.isArrowFunctionExpression(p.node.init) ||
                t.isFunctionExpression(p.node.init)))
          );
        });
        if (functionPath) {
          componentsNeedingHook.add(functionPath.getPathLocation());
        }

        changed = true;
      },
    });

    // Pass 0b: Translate opt-in object-literal string properties extracted by the Parser.
    // The Parser emits scope keys:
    //   {objectPropertyScopePath}_obj_{propName}
    //   {objectPropertyScopePath}_obj_{propName}_arr_{index}
    // We rewrite those string literals to:
    //   t(`${relativePath}::{key}`)
    traverse(ast, {
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        const keyNode = path.node.key;
        const propName = t.isIdentifier(keyNode)
          ? keyNode.name
          : t.isStringLiteral(keyNode)
            ? keyNode.value
            : null;
        if (!propName) return;

        // This requires t() which comes from the useTranslation() hook.
        const functionPath = path.findParent((p: any) => {
          return (
            p.isFunctionDeclaration() ||
            p.isArrowFunctionExpression() ||
            p.isFunctionExpression() ||
            (p.isVariableDeclarator() &&
              p.node.init &&
              (t.isArrowFunctionExpression(p.node.init) ||
                t.isFunctionExpression(p.node.init)))
          );
        });
        if (!functionPath) return;

        const baseScopePath = getRelativeScopePath(path.getPathLocation());

        let didReplace = false;
        const value = path.node.value;

        // Case 1: string literal value
        if (t.isStringLiteral(value)) {
          const key = `${baseScopePath}_obj_${propName}`;
          if (!fileScopes[key]) return;

          path.node.value = t.callExpression(t.identifier('t'), [
            t.stringLiteral(`${relativePath}::${key}`),
          ]);
          didReplace = true;
        }

        // Case 2: static template literal value (no expressions)
        if (
          !didReplace &&
          t.isTemplateLiteral(value) &&
          value.expressions.length === 0
        ) {
          const key = `${baseScopePath}_obj_${propName}`;
          if (!fileScopes[key]) return;

          path.node.value = t.callExpression(t.identifier('t'), [
            t.stringLiteral(`${relativePath}::${key}`),
          ]);
          didReplace = true;
        }

        // Case 3: array literal value
        if (!didReplace && t.isArrayExpression(value)) {
          const elements = value.elements || [];
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (!el) continue;
            const isStaticTemplate =
              t.isTemplateLiteral(el) && el.expressions.length === 0;
            if (!t.isStringLiteral(el) && !isStaticTemplate) continue;

            const key = `${baseScopePath}_obj_${propName}_arr_${i}`;
            if (!fileScopes[key]) continue;

            elements[i] = t.callExpression(t.identifier('t'), [
              t.stringLiteral(`${relativePath}::${key}`),
            ]);
            didReplace = true;
          }
        }

        if (!didReplace) return;

        componentsNeedingHook.add(functionPath.getPathLocation());
        changed = true;
      },
    });

    // Pass 0a: Handle template literals with parameters (professional approach)
    // TemplateLiteral → combine into single message → replace expressions with placeholders → extract one translation key
    // Transform template literals to use <Translated params={{...}} />
    // This follows ICU MessageFormat standard where variables are runtime parameters
    traverse(ast, {
      JSXExpressionContainer(path: NodePath<t.JSXExpressionContainer>) {
        const expr = path.node.expression;
        if (!t.isTemplateLiteral(expr)) return;

        // Find the parent JSXElement to get the scope path
        // The parser creates scope entries for JSXElements that contain template literals
        let parentElement: NodePath<t.JSXElement> | null = null;
        let currentPath: NodePath<any> | null = path.parentPath;

        while (currentPath) {
          if (currentPath.isJSXElement && currentPath.isJSXElement()) {
            parentElement = currentPath as NodePath<t.JSXElement>;
            break;
          }
          currentPath = currentPath.parentPath;
        }

        if (!parentElement) return;

        // Get the scope path using the same logic as the parser
        const elementScopePath = getRelativeScopePath(
          parentElement.getPathLocation()
        );

        // Check if this parent element has a scope entry
        // The parser extracts template literals as single messages
        // Static variables are resolved directly: `Hello, ${name}!` → "Hello, World!" (if name="World")
        // Runtime variables remain as placeholders: `Hello, ${name}!` → "Hello, {name}!" (if name is runtime)
        const scopeEntry = fileScopes[elementScopePath];
        if (!scopeEntry) return;

        // Verify the content matches a template literal pattern
        // Static variables are resolved directly, only runtime variables remain as placeholders
        const content = scopeEntry.content;
        if (!content) {
          return;
        }

        // Extract parameters from template literal expressions
        // Only include variables that are NOT static (runtime variables)
        // Static variables are already resolved in the content string
        const params: Record<string, t.Expression> = {};
        let hasParams = false;

        for (let i = 0; i < expr.expressions.length; i++) {
          const templateExpr = expr.expressions[i];
          if (t.isIdentifier(templateExpr)) {
            // Check if this is a runtime variable by looking for placeholder in content
            // If the content has a placeholder for this variable, it's runtime
            const placeholderPattern = `{${templateExpr.name}}`;
            if (content.includes(placeholderPattern)) {
              // This is a runtime variable - pass it as a param
              params[templateExpr.name] = templateExpr;
              hasParams = true;
            }
            // If placeholder not found, variable was resolved statically, skip it
          } else if (t.isMemberExpression(templateExpr)) {
            // Member expressions are always runtime
            if (t.isIdentifier(templateExpr.property)) {
              params[templateExpr.property.name] = templateExpr;
              hasParams = true;
            }
          }
        }

        const fallbackChildren: JsxChild[] = [t.jsxExpressionContainer(expr)];
        const injectOpts = getInjectOptions(elementScopePath);
        const translatedComponent = hasParams
          ? injectTranslatedWithParams(
              `${relativePath}::${elementScopePath}`,
              params,
              fallbackChildren,
              injectOpts
            )
          : injectTranslated(
              `${relativePath}::${elementScopePath}`,
              fallbackChildren,
              injectOpts
            );

        // Replace the JSXExpressionContainer with the Translated component
        path.replaceWith(translatedComponent);

        // Mark the parent element as processed so Pass 1 doesn't replace it again
        // This prevents conflicts when the template literal is the only content
        processedElements.add(elementScopePath);

        changed = true;
      },
    });

    // Pass 0: Handle runtime ternaries first.
    // We inject <Translated /> into the consequent/alternate branches and mark the
    // containing element as "processed" so it won't be replaced wholesale later.
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const elementScopePath = getRelativeScopePath(path.getPathLocation());

        let conditionalIndex = 0;
        let didInject = false;

        for (const child of path.node.children) {
          if (!t.isJSXExpressionContainer(child)) continue;
          const expr = child.expression;
          if (!t.isConditionalExpression(expr)) continue;

          const consequentKey = `${elementScopePath}_cond_${conditionalIndex}_consequent`;
          const alternateKey = `${elementScopePath}_cond_${conditionalIndex}_alternate`;

          if (fileScopes[consequentKey]) {
            const original = expr.consequent;
            const fallback: JsxChild[] = [
              t.isJSXElement(original) || t.isJSXFragment(original)
                ? original
                : t.jsxExpressionContainer(original as unknown as t.Expression),
            ];
            expr.consequent = injectTranslated(
              `${relativePath}::${consequentKey}`,
              fallback,
              getInjectOptions(consequentKey)
            );
            didInject = true;
          }
          if (fileScopes[alternateKey]) {
            const original = expr.alternate;
            const fallback: JsxChild[] = [
              t.isJSXElement(original) || t.isJSXFragment(original)
                ? original
                : t.jsxExpressionContainer(original as unknown as t.Expression),
            ];
            expr.alternate = injectTranslated(
              `${relativePath}::${alternateKey}`,
              fallback,
              getInjectOptions(alternateKey)
            );
            didInject = true;
          }

          conditionalIndex++;
        }

        if (didInject) {
          processedElements.add(elementScopePath);
          changed = true;
        }
      },
    });

    // Pass 0b: Handle runtime logical expressions safely.
    // We only translate the RIGHT operand when it is a string literal:
    // - condition && "Text"  -> condition && <Translated .../>
    // - value || "Fallback"  -> value || <Translated .../>
    //
    // Also supports TemplateLiteral on the right side by translating only static quasis
    // (e.g. "Error: "), keeping interpolations untouched, and preserving short-circuit behavior.
    // We mark the containing element as processed to prevent wholesale replacement.
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const elementScopePath = getRelativeScopePath(path.getPathLocation());

        let logicalIndex = 0;
        let didInject = false;

        for (const child of path.node.children) {
          if (!t.isJSXExpressionContainer(child)) continue;
          const expr = child.expression;
          if (!t.isLogicalExpression(expr)) continue;

          const opName =
            expr.operator === '&&'
              ? 'and'
              : expr.operator === '||'
                ? 'or'
                : null;
          if (!opName) {
            logicalIndex++;
            continue;
          }

          // Case 1: right operand is a string literal -> inject <Translated />
          if (t.isStringLiteral(expr.right)) {
            const rightKey = `${elementScopePath}_logic_${logicalIndex}_${opName}_right`;
            if (fileScopes[rightKey]) {
              const original = expr.right;
              const fallback: JsxChild[] = [t.jsxExpressionContainer(original)];
              expr.right = injectTranslated(
                `${relativePath}::${rightKey}`,
                fallback,
                getInjectOptions(rightKey)
              );
              didInject = true;
            }
            logicalIndex++;
            continue;
          }

          // Case 2: right operand is a template literal -> translate only static quasis via t()
          // and keep the original expressions as-is.
          if (t.isTemplateLiteral(expr.right)) {
            const template = expr.right;
            let out: t.Expression | null = null;
            let usedT = false;

            for (let i = 0; i < template.quasis.length; i++) {
              const quasi = template.quasis[i];
              const quasiText = quasi.value.cooked ?? quasi.value.raw ?? '';

              if (quasiText) {
                const quasiKey = `${elementScopePath}_logic_${logicalIndex}_${opName}_right_quasi_${i}`;
                const quasiExpr = fileScopes[quasiKey]
                  ? t.callExpression(t.identifier('t'), [
                      t.stringLiteral(`${relativePath}::${quasiKey}`),
                    ])
                  : t.stringLiteral(quasiText);

                if (fileScopes[quasiKey]) {
                  usedT = true;
                }

                out = out ? t.binaryExpression('+', out, quasiExpr) : quasiExpr;
              }

              if (i < template.expressions.length) {
                const interp = template.expressions[i];
                if (!t.isExpression(interp)) {
                  // Shouldn't happen for real TemplateLiteral expressions, but can occur in TS AST edge cases.
                  continue;
                }
                out = out ? t.binaryExpression('+', out, interp) : interp;
              }
            }

            if (usedT && out) {
              expr.right = out;
              didInject = true;

              // This requires t() which comes from the useTranslation() hook.
              const functionPath = path.findParent((p: any) => {
                return (
                  p.isFunctionDeclaration() ||
                  p.isArrowFunctionExpression() ||
                  p.isFunctionExpression() ||
                  (p.isVariableDeclarator() &&
                    p.node.init &&
                    (t.isArrowFunctionExpression(p.node.init) ||
                      t.isFunctionExpression(p.node.init)))
                );
              });
              if (functionPath) {
                componentsNeedingHook.add(functionPath.getPathLocation());
              }
            }

            logicalIndex++;
            continue;
          }

          logicalIndex++;
        }

        if (didInject) {
          processedElements.add(elementScopePath);
          changed = true;
        }
      },
    });

    // Pass 0c: Handle conditional-return function call expressions.
    // Example: {getMessage(status)} or {getStatusText(status)}
    // We translate by rewriting into a runtime lookup:
    //   ({ 'loading': t(key1), 'error': t(key2) }[status] || t(defaultKey))
    // This preserves runtime behavior without trying to statically evaluate the call.
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const elementScopePath = getRelativeScopePath(path.getPathLocation());

        let callIndex = 0;
        let didInject = false;

        for (const child of path.node.children) {
          if (!t.isJSXExpressionContainer(child)) continue;
          const expr = child.expression;
          if (!t.isCallExpression(expr)) continue;
          if (!t.isIdentifier(expr.callee)) {
            callIndex++;
            continue;
          }

          const funcName = expr.callee.name;
          const arg0 = expr.arguments[0];
          if (!arg0 || !t.isExpression(arg0)) {
            callIndex++;
            continue;
          }

          const prefix = `${elementScopePath}_call_${callIndex}_${funcName}_`;
          const casePrefix = `${prefix}case_`;
          const defaultKey = `${prefix}default`;

          if (!fileScopes[defaultKey]) {
            callIndex++;
            continue;
          }

          const caseEntries: Array<{ caseValue: string; scopeKey: string }> =
            [];
          for (const scopeKey of Object.keys(fileScopes)) {
            if (!scopeKey.startsWith(casePrefix)) continue;
            const encoded = scopeKey.slice(casePrefix.length);
            let decoded = encoded;
            try {
              decoded = decodeURIComponent(encoded);
            } catch {
              // Keep encoded if decoding fails
            }
            caseEntries.push({ caseValue: decoded, scopeKey });
          }

          if (caseEntries.length === 0) {
            callIndex++;
            continue;
          }

          const objExpr = t.objectExpression(
            caseEntries.map(({ caseValue, scopeKey }) =>
              t.objectProperty(
                t.stringLiteral(caseValue),
                t.callExpression(t.identifier('t'), [
                  t.stringLiteral(`${relativePath}::${scopeKey}`),
                ])
              )
            )
          );

          const lookupExpr = t.memberExpression(objExpr, arg0, true);
          const defaultExpr = t.callExpression(t.identifier('t'), [
            t.stringLiteral(`${relativePath}::${defaultKey}`),
          ]);

          // Use || fallback to default when status is unknown.
          child.expression = t.logicalExpression('||', lookupExpr, defaultExpr);
          didInject = true;

          // This requires t() which comes from the useTranslation() hook.
          const functionPath = path.findParent((p: any) => {
            return (
              p.isFunctionDeclaration() ||
              p.isArrowFunctionExpression() ||
              p.isFunctionExpression() ||
              (p.isVariableDeclarator() &&
                p.node.init &&
                (t.isArrowFunctionExpression(p.node.init) ||
                  t.isFunctionExpression(p.node.init)))
            );
          });
          if (functionPath) {
            componentsNeedingHook.add(functionPath.getPathLocation());
          }

          callIndex++;
        }

        if (didInject) {
          processedElements.add(elementScopePath);
          changed = true;
        }
      },
    });

    // First pass: Replace entire elements that have scope entries
    // This handles cases where an element contains both text and nested elements
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const scopePath = path
          .getPathLocation()
          .replace(/\[(\d+)\]/g, '$1')
          .replace(/\./g, '/');

        if (!fileScopes[scopePath]) return;
        if (processedElements.has(scopePath)) return;

        // If the element contains a ternary (ConditionalExpression) rendered in JSX,
        // we must preserve runtime logic. We'll translate its branches in a later pass.
        const containsConditionalExpression = path.node.children.some(
          (child: any) =>
            t.isJSXExpressionContainer(child) &&
            t.isConditionalExpression(child.expression)
        );
        if (containsConditionalExpression) {
          return;
        }

        // If the element contains a logical expression (&& / ||), preserve runtime semantics.
        // We either injected the right operand in Pass 0b (processedElements), or we skip replacing.
        const containsLogicalExpression = path.node.children.some(
          (child: any) =>
            t.isJSXExpressionContainer(child) &&
            t.isLogicalExpression(child.expression)
        );
        if (containsLogicalExpression) {
          return;
        }

        // Check if any ancestor element also has a scope entry
        // If so, this element is nested inside it and shouldn't be replaced separately
        let parentPath: NodePath<any> | null = path.parentPath;
        while (parentPath) {
          if (parentPath.isJSXElement && parentPath.isJSXElement()) {
            const parentScopePath = parentPath
              .getPathLocation()
              .replace(/\[(\d+)\]/g, '$1')
              .replace(/\./g, '/');

            if (fileScopes[parentScopePath]) {
              return;
            }
          }
          parentPath = parentPath.parentPath;
        }

        // Check if this element has translatable content (JSXText or JSXExpressionContainer)
        const hasTranslatableContent = path.node.children.some((child: any) => {
          if (t.isJSXText(child) && child.value.trim()) {
            return true;
          }
          if (t.isJSXExpressionContainer(child)) {
            const expr = child.expression;
            // Check for translatable expressions
            if (
              t.isStringLiteral(expr) ||
              t.isTemplateLiteral(expr) ||
              t.isConditionalExpression(expr) ||
              t.isLogicalExpression(expr) ||
              (t.isBinaryExpression(expr) && expr.operator === '+') ||
              t.isCallExpression(expr) ||
              t.isIdentifier(expr) ||
              t.isMemberExpression(expr)
            ) {
              return true;
            }
          }
          return false;
        });

        if (hasTranslatableContent) {
          const fallbackChildren = [...path.node.children];
          path.node.children = [
            injectTranslated(
              `${relativePath}::${scopePath}`,
              fallbackChildren,
              getInjectOptions(scopePath)
            ),
          ];
          processedElements.add(scopePath);
          changed = true;
        }
      },
    });

    // Second pass: Handle any remaining JSXText nodes that weren't part of replaced elements
    traverse(ast, {
      JSXText(path: NodePath<t.JSXText>) {
        const text = path.node.value.trim();
        if (!text) return;

        // Find the closest JSXElement ancestor
        const jsxElement = path.findParent((p) => p.isJSXElement());
        if (!jsxElement) return;

        // Find the scope for this element
        const scopePath = jsxElement
          .getPathLocation()
          .replace(/\[(\d+)\]/g, '$1')
          .replace(/\./g, '/');

        // Skip if this element was already processed in the first pass
        if (processedElements.has(scopePath)) return;
        if (!fileScopes[scopePath]) return;

        // Check if any ancestor element also has a scope entry
        let parentPath: NodePath<any> | null = jsxElement.parentPath;
        while (parentPath) {
          if (parentPath.isJSXElement && parentPath.isJSXElement()) {
            const parentScopePath = parentPath
              .getPathLocation()
              .replace(/\[(\d+)\]/g, '$1')
              .replace(/\./g, '/');

            if (fileScopes[parentScopePath]) {
              return;
            }
          }
          parentPath = parentPath.parentPath;
        }

        path.replaceWith(
          injectTranslated(
            `${relativePath}::${scopePath}`,
            [t.jsxText(path.node.value)],
            getInjectOptions(scopePath)
          )
        );
        changed = true;
      },
    });

    // Third pass: Handle JSXAttribute nodes when translation instructions are present
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        // Find translation instructions for this element
        // Pass source code to extract comment text directly if comments aren't attached
        const instructions = findTranslationInstructions(path, code);
        if (!instructions) return;

        const openingElement = path.node.openingElement;
        if (!openingElement || !openingElement.attributes) return;

        // Process attributes if there are attribute instructions
        if (instructions.translateAttributes.size > 0) {
          for (const attr of openingElement.attributes) {
            if (!t.isJSXAttribute(attr)) continue;
            const attrName = attr.name;
            if (!t.isJSXIdentifier(attrName)) continue;

            const attrNameStr = attrName.name;
            if (!instructions.translateAttributes.has(attrNameStr)) {
              continue;
            }

            // Get the scope path for this attribute
            const fullScopePath = path.getPathLocation();
            const scopePath = getRelativeScopePath(fullScopePath);

            // Check for attribute entry: {scopePath}_attr_{attrName}
            const attributeKey = `${scopePath}_attr_${attrNameStr}`;
            const scopeEntry = fileScopes[attributeKey];

            if (!scopeEntry || scopeEntry.type !== 'attribute') continue;

            // Find the parent component/function to track which components need the hook
            const functionPath = path.findParent((p: any) => {
              return (
                p.isFunctionDeclaration() ||
                p.isArrowFunctionExpression() ||
                p.isFunctionExpression() ||
                (p.isVariableDeclarator() &&
                  p.node.init &&
                  (t.isArrowFunctionExpression(p.node.init) ||
                    t.isFunctionExpression(p.node.init)))
              );
            });

            if (functionPath) {
              const functionLocation = functionPath.getPathLocation();
              componentsNeedingHook.add(functionLocation);
            }

            // Handle string literal attributes: placeholder="Text"
            if (t.isStringLiteral(attr.value)) {
              // Replace with t() call
              const tCall = t.callExpression(t.identifier('t'), [
                t.stringLiteral(`${relativePath}::${attributeKey}`),
              ]);
              attr.value = t.jsxExpressionContainer(tCall);
              changed = true;
              continue;
            }

            // Handle expression attributes: placeholder={variable} or placeholder={`Hello ${name}`}
            if (t.isJSXExpressionContainer(attr.value)) {
              const expr = attr.value.expression;

              // For string literals in expressions, replace with t() call
              if (t.isStringLiteral(expr)) {
                const tCall = t.callExpression(t.identifier('t'), [
                  t.stringLiteral(`${relativePath}::${attributeKey}`),
                ]);
                attr.value.expression = tCall;
                changed = true;
                continue;
              }

              // For template literals, we need to check if the content matches
              // If it's a simple template literal that matches the extracted content,
              // we can replace it with t() call
              if (t.isTemplateLiteral(expr)) {
                // For now, if the template literal has no expressions (static),
                // we can replace it with t() call
                if (expr.expressions.length === 0) {
                  const tCall = t.callExpression(t.identifier('t'), [
                    t.stringLiteral(`${relativePath}::${attributeKey}`),
                  ]);
                  attr.value.expression = tCall;
                  changed = true;
                }
                // For template literals with expressions, we'd need more complex handling
                continue;
              }
            }
          }
        }

        // Process props if there are prop instructions
        if (instructions.translateProps.size > 0) {
          for (const attr of openingElement.attributes) {
            if (!t.isJSXAttribute(attr)) continue;
            const attrName = attr.name;
            if (!t.isJSXIdentifier(attrName)) continue;

            const attrNameStr = attrName.name;
            if (!instructions.translateProps.has(attrNameStr)) {
              continue;
            }

            // Get the scope path for this prop
            const fullScopePath = path.getPathLocation();
            const scopePath = getRelativeScopePath(fullScopePath);

            // Check for prop entry: {scopePath}_prop_{propName}
            const propKey = `${scopePath}_prop_${attrNameStr}`;
            const scopeEntry = fileScopes[propKey];

            if (!scopeEntry || scopeEntry.type !== 'attribute') continue;

            // Find the parent component/function to track which components need the hook
            const functionPath = path.findParent((p: any) => {
              return (
                p.isFunctionDeclaration() ||
                p.isArrowFunctionExpression() ||
                p.isFunctionExpression() ||
                (p.isVariableDeclarator() &&
                  p.node.init &&
                  (t.isArrowFunctionExpression(p.node.init) ||
                    t.isFunctionExpression(p.node.init)))
              );
            });

            if (functionPath) {
              const functionLocation = functionPath.getPathLocation();
              componentsNeedingHook.add(functionLocation);
            }

            // Handle string literal props: title="Text"
            if (t.isStringLiteral(attr.value)) {
              // Replace with t() call
              const tCall = t.callExpression(t.identifier('t'), [
                t.stringLiteral(`${relativePath}::${propKey}`),
              ]);
              attr.value = t.jsxExpressionContainer(tCall);
              changed = true;
              continue;
            }

            // Handle expression props: title={variable} or title={`Hello ${name}`}
            if (t.isJSXExpressionContainer(attr.value)) {
              const expr = attr.value.expression;

              // For string literals in expressions, replace with t() call
              if (t.isStringLiteral(expr)) {
                const tCall = t.callExpression(t.identifier('t'), [
                  t.stringLiteral(`${relativePath}::${propKey}`),
                ]);
                attr.value.expression = tCall;
                changed = true;
                continue;
              }

              // For template literals, we need to check if the content matches
              // If it's a simple template literal that matches the extracted content,
              // we can replace it with t() call
              if (t.isTemplateLiteral(expr)) {
                // For now, if the template literal has no expressions (static),
                // we can replace it with t() call
                if (expr.expressions.length === 0) {
                  const tCall = t.callExpression(t.identifier('t'), [
                    t.stringLiteral(`${relativePath}::${propKey}`),
                  ]);
                  attr.value.expression = tCall;
                  changed = true;
                }
                // For template literals with expressions, we'd need more complex handling
                continue;
              }
            }
          }
        }
      },
    });

    // Fourth pass: Add useTranslation hook to components that need it
    if (componentsNeedingHook.size > 0) {
      traverse(ast, {
        FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
          const functionLocation = path.getPathLocation();
          if (!componentsNeedingHook.has(functionLocation)) return;

          // Check if hook is already called
          let hasHook = false;
          path.traverse({
            VariableDeclarator(declPath: any) {
              if (
                t.isIdentifier(declPath.node.id) &&
                declPath.node.id.name === 't' &&
                t.isCallExpression(declPath.node.init) &&
                t.isIdentifier(declPath.node.init.callee) &&
                declPath.node.init.callee.name === 'useTranslation'
              ) {
                hasHook = true;
              }
            },
          });

          if (
            !hasHook &&
            path.node.body &&
            t.isBlockStatement(path.node.body)
          ) {
            // Add const { t } = useTranslation(); at the beginning of the function body
            const hookCall = t.variableDeclaration('const', [
              t.variableDeclarator(
                t.objectPattern([
                  t.objectProperty(
                    t.identifier('t'),
                    t.identifier('t'),
                    false,
                    true
                  ),
                ]),
                t.callExpression(t.identifier('useTranslation'), [])
              ),
            ]);
            path.node.body.body.unshift(hookCall);
            changed = true;
          }
        },
        ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
          // For arrow functions, we need to check if they're component definitions
          // and if they have a block body
          if (!t.isBlockStatement(path.node.body)) return;

          const parent = path.parentPath;
          if (
            !parent ||
            (!t.isVariableDeclarator(parent.node) &&
              !t.isExportDefaultDeclaration(parent.node))
          ) {
            return;
          }

          // Check if this is a component (export default function or const Component = ...)
          const functionLocation = path.getPathLocation();
          if (!componentsNeedingHook.has(functionLocation)) return;

          // Check if hook is already called
          let hasHook = false;
          path.traverse({
            VariableDeclarator(declPath: any) {
              if (
                t.isIdentifier(declPath.node.id) &&
                declPath.node.id.name === 't' &&
                t.isCallExpression(declPath.node.init) &&
                t.isIdentifier(declPath.node.init.callee) &&
                declPath.node.init.callee.name === 'useTranslation'
              ) {
                hasHook = true;
              }
            },
          });

          if (!hasHook) {
            // Add const { t } = useTranslation(); at the beginning of the function body
            const hookCall = t.variableDeclaration('const', [
              t.variableDeclarator(
                t.objectPattern([
                  t.objectProperty(
                    t.identifier('t'),
                    t.identifier('t'),
                    false,
                    true
                  ),
                ]),
                t.callExpression(t.identifier('useTranslation'), [])
              ),
            ]);
            path.node.body.body.unshift(hookCall);
            changed = true;
          }
        },
      });
    }

    // Add useTranslation import if we made attribute changes
    if (changed && componentsNeedingHook.size > 0) {
      ensureUseClientDirective(ast);
      ensureImportUseTranslation(ast);
    }

    // Add Translated import if we made text changes
    if (changed) {
      ensureImportTranslated(ast);
    }
  }

  if (changed) {
    const output = generate(ast, {
      retainLines: true,
      retainFunctionParens: true,
    });
    return output.code;
  }

  return code;
}
