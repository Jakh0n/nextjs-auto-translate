"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
// src/parser/Parser.ts
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SourceStore_1 = require("../storage/SourceStore");
const utils_1 = require("./utils");
// @babel/traverse has different exports for ESM vs CommonJS
const traverse = traverse_1.default.default || traverse_1.default;
class Parser {
    options;
    lockPath;
    sourceStore;
    constructor(options = {}) {
        this.options = options;
        const outputDir = options.outputDir || '.intl';
        this.lockPath = path_1.default.resolve(process.cwd(), outputDir, '.lock');
        this.sourceStore = new SourceStore_1.SourceStore(outputDir);
    }
    isPluginRepoRoot(cwd) {
        try {
            const pkgPath = path_1.default.join(cwd, 'package.json');
            if (!fs_1.default.existsSync(pkgPath))
                return false;
            const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
            return pkg?.name === '@dima-algebras/algebras-auto-intl';
        }
        catch {
            return false;
        }
    }
    findFilesSync(dir, extensions, ignorePatterns) {
        const files = [];
        const isIgnored = (filePath) => {
            // Normalize path separators to forward slashes for consistent matching
            // This handles Windows paths (backslashes) correctly
            const normalizedPath = filePath.replace(/\\/g, '/');
            return ignorePatterns.some((pattern) => {
                // Convert glob pattern to regex-like matching.
                // IMPORTANT: do NOT replace "*" after replacing "**" directly, otherwise ".*" becomes corrupted.
                // Example bug: "**/node_modules/**" -> ".*\/node_modules\/.*" -> ".[^/]*\/node_modules\/.[^/]*"
                const GLOBSTAR = '__GLOBSTAR__';
                const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&'); // keep '*' and '/' as glob tokens
                let regexPattern = escaped
                    .replace(/\*\*/g, GLOBSTAR)
                    .replace(/\*/g, '[^/]*')
                    .replace(new RegExp(GLOBSTAR, 'g'), '.*')
                    .replace(/\//g, '\\/');
                // Fix: Patterns starting with **/ should also match at the beginning of the path
                // This handles cases like **/node_modules/** matching "node_modules/..." (no leading /)
                // path.relative() returns paths without leading slash, so we need to handle both cases
                if (regexPattern.startsWith('.*\\/')) {
                    // Allow matching at start of string (^) OR after a forward slash (.*\/)
                    regexPattern = '(^|.*\\/)' + regexPattern.substring(4);
                }
                const regex = new RegExp(regexPattern);
                return regex.test(normalizedPath);
            });
        };
        const walkDir = (currentDir) => {
            try {
                const entries = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path_1.default.join(currentDir, entry.name);
                    const relativePath = path_1.default.relative(dir, fullPath);
                    // IMPORTANT:
                    // Ignore patterns like "**/node_modules/**" or "**/demo/**" are meant to match directories too.
                    // When we compute `relativePath` for a directory, it looks like "node_modules" (no trailing "/"),
                    // so those patterns would never match and we'd still traverse into the folder.
                    // Appending "/" for directories makes the glob intent work as expected.
                    const ignorePath = entry.isDirectory()
                        ? `${relativePath}${path_1.default.sep}`
                        : relativePath;
                    if (isIgnored(ignorePath)) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        walkDir(fullPath);
                    }
                    else if (entry.isFile()) {
                        const ext = path_1.default.extname(entry.name);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            }
            catch (error) {
                // Skip directories we can't read
                console.warn(`[Parser] Cannot read directory: ${currentDir}`);
            }
        };
        walkDir(dir);
        return files;
    }
    parseProject() {
        // Ensure .intl directory exists
        const intlDir = path_1.default.dirname(this.sourceStore['path']);
        fs_1.default.mkdirSync(intlDir, { recursive: true });
        // Lock file check
        if (fs_1.default.existsSync(this.lockPath)) {
            console.log('🟡 Skipping parse: lock file present.');
            return this.sourceStore.load();
        }
        // Create lock file
        fs_1.default.writeFileSync(this.lockPath, '');
        try {
            console.log('[Parser] Scanning project for translatable strings...');
            const ignore = ['**/.next/**', '**/dist/**'];
            // When developing this package locally, avoid scanning its own demo apps.
            // In real usage (inside a consumer Next.js app), cwd is the app root, not this package.
            if (this.isPluginRepoRoot(process.cwd())) {
                ignore.push('**/demo/**');
            }
            if (!this.options.includeNodeModules) {
                ignore.push('**/node_modules/**');
            }
            const files = this.findFilesSync(process.cwd(), ['.tsx', '.jsx'], ignore);
            console.log(`[Parser] Found ${files.length} files to scan.`);
            const scopeMap = {
                version: 0.1,
                files: {},
            };
            const projectRoot = process.cwd();
            for (const file of files) {
                const code = fs_1.default.readFileSync(file, 'utf-8');
                let ast;
                try {
                    ast = (0, parser_1.parse)(code, {
                        sourceType: 'module',
                        plugins: ['jsx', 'typescript'],
                        attachComment: true,
                    });
                }
                catch {
                    console.warn(`[Parser] Skipping file with parse error: ${file}`);
                    continue;
                }
                // Get relative file path from project root
                const relativeFilePath = path_1.default.relative(projectRoot, file);
                const fileScopes = {};
                // Map to store variable scopes per function/component
                // Key: function path location, Value: Map<variableName, stringValue>
                const functionScopes = new Map();
                // Map to store static string-array scopes per function/component
                // Key: function path location (or file scope key), Value: Map<variableName, { declScopePath, values }>
                const functionStringArrayScopes = new Map();
                // Map to store function return scopes per function/component
                // Key: function path location, Value: Map<functionName, stringReturnValue>
                const functionReturnScopes = new Map();
                // Map to store conditional-return function scopes (string-returning based on param value)
                // Key: function path location, Value: Map<functionName, { cases, defaultReturn }>
                const functionConditionalReturnScopes = new Map();
                // First pass: Build variable and function scope maps for each function/component
                traverse(ast, {
                    // Track variable declarations with string literal initializers
                    VariableDeclarator(path) {
                        if (t.isIdentifier(path.node.id) &&
                            path.node.init &&
                            t.isStringLiteral(path.node.init)) {
                            const varName = path.node.id.name;
                            const stringValue = path.node.init.value;
                            // Find the parent function/component
                            const functionPath = path.findParent((p) => {
                                return (p.isFunctionDeclaration() ||
                                    p.isArrowFunctionExpression() ||
                                    p.isFunctionExpression() ||
                                    (p.isVariableDeclarator() &&
                                        p.node.init &&
                                        (t.isArrowFunctionExpression(p.node.init) ||
                                            t.isFunctionExpression(p.node.init))));
                            });
                            if (functionPath) {
                                const functionLocation = functionPath.getPathLocation();
                                if (!functionScopes.has(functionLocation)) {
                                    functionScopes.set(functionLocation, new Map());
                                }
                                const scope = functionScopes.get(functionLocation);
                                scope.set(varName, stringValue);
                            }
                            else {
                                // Top-level variable - use file path as scope key
                                const fileScopeKey = `file:${relativeFilePath}`;
                                if (!functionScopes.has(fileScopeKey)) {
                                    functionScopes.set(fileScopeKey, new Map());
                                }
                                const scope = functionScopes.get(fileScopeKey);
                                scope.set(varName, stringValue);
                            }
                        }
                        // Track variable declarations with static string-array initializers
                        // Example: const items = ['First', 'Second'];
                        if (t.isIdentifier(path.node.id) &&
                            path.node.init &&
                            t.isArrayExpression(path.node.init) &&
                            path.node.init.elements.length > 0 &&
                            path.node.init.elements.every((el) => el && t.isStringLiteral(el))) {
                            const varName = path.node.id.name;
                            const values = path.node.init.elements
                                .filter(Boolean)
                                .filter((el) => t.isStringLiteral(el))
                                .map((el) => el.value)
                                .filter((v) => v.trim().length > 0);
                            if (values.length === 0)
                                return;
                            const declScopePath = (0, utils_1.getRelativeScopePath)(path.getPathLocation());
                            // Find the parent function/component
                            const functionPath = path.findParent((p) => {
                                return (p.isFunctionDeclaration() ||
                                    p.isArrowFunctionExpression() ||
                                    p.isFunctionExpression() ||
                                    (p.isVariableDeclarator() &&
                                        p.node.init &&
                                        (t.isArrowFunctionExpression(p.node.init) ||
                                            t.isFunctionExpression(p.node.init))));
                            });
                            if (functionPath) {
                                const functionLocation = functionPath.getPathLocation();
                                if (!functionStringArrayScopes.has(functionLocation)) {
                                    functionStringArrayScopes.set(functionLocation, new Map());
                                }
                                functionStringArrayScopes
                                    .get(functionLocation)
                                    .set(varName, { declScopePath, values });
                            }
                            else {
                                const fileScopeKey = `file:${relativeFilePath}`;
                                if (!functionStringArrayScopes.has(fileScopeKey)) {
                                    functionStringArrayScopes.set(fileScopeKey, new Map());
                                }
                                functionStringArrayScopes
                                    .get(fileScopeKey)
                                    .set(varName, { declScopePath, values });
                            }
                        }
                    },
                });
                // First pass (continued): Build function return scopes for deterministic string-returning functions.
                // We only record functions when we can prove the return value is a single stable string
                // (e.g., `function getGreeting(){ return 'Hello' }`).
                traverse(ast, {
                    FunctionDeclaration(path) {
                        if (!path.node.id || !t.isIdentifier(path.node.id))
                            return;
                        const funcName = path.node.id.name;
                        // Collect string literal returns for this function body only (skip nested functions).
                        const returnValues = new Set();
                        path.traverse({
                            Function(inner) {
                                if (inner.node !== path.node) {
                                    inner.skip();
                                }
                            },
                            ReturnStatement(retPath) {
                                const arg = retPath.node.argument;
                                if (!arg)
                                    return;
                                if (!t.isStringLiteral(arg)) {
                                    // Non-string return -> not deterministic for our purposes
                                    returnValues.add('__NON_STRING__');
                                    return;
                                }
                                returnValues.add(arg.value);
                            },
                        });
                        if (returnValues.size !== 1 || returnValues.has('__NON_STRING__')) {
                            return;
                        }
                        const onlyValue = Array.from(returnValues)[0];
                        // Determine scope key (file-level or enclosing function/component)
                        const enclosingFunctionPath = path.findParent((p) => {
                            if (p === path)
                                return false;
                            return (p.isFunctionDeclaration() ||
                                p.isArrowFunctionExpression() ||
                                p.isFunctionExpression() ||
                                (p.isVariableDeclarator() &&
                                    p.node.init &&
                                    (t.isArrowFunctionExpression(p.node.init) ||
                                        t.isFunctionExpression(p.node.init))));
                        });
                        const fileScopeKey = `file:${relativeFilePath}`;
                        const scopeKey = enclosingFunctionPath
                            ? enclosingFunctionPath.getPathLocation()
                            : fileScopeKey;
                        if (!functionReturnScopes.has(scopeKey)) {
                            functionReturnScopes.set(scopeKey, new Map());
                        }
                        functionReturnScopes.get(scopeKey).set(funcName, onlyValue);
                    },
                    VariableDeclarator(path) {
                        if (!t.isIdentifier(path.node.id) || !path.node.init)
                            return;
                        const varName = path.node.id.name;
                        const init = path.node.init;
                        const enclosingFunctionPath = path.findParent((p) => {
                            return (p.isFunctionDeclaration() ||
                                p.isArrowFunctionExpression() ||
                                p.isFunctionExpression() ||
                                (p.isVariableDeclarator() &&
                                    p.node.init &&
                                    (t.isArrowFunctionExpression(p.node.init) ||
                                        t.isFunctionExpression(p.node.init))));
                        });
                        const fileScopeKey = `file:${relativeFilePath}`;
                        const scopeKey = enclosingFunctionPath
                            ? enclosingFunctionPath.getPathLocation()
                            : fileScopeKey;
                        const ensureScopeMap = () => {
                            if (!functionReturnScopes.has(scopeKey)) {
                                functionReturnScopes.set(scopeKey, new Map());
                            }
                            return functionReturnScopes.get(scopeKey);
                        };
                        const extractDeterministicReturnFromFunctionLike = (fn) => {
                            // Arrow: () => 'Hello'
                            if (t.isArrowFunctionExpression(fn)) {
                                if (t.isStringLiteral(fn.body)) {
                                    return fn.body.value;
                                }
                                if (t.isBlockStatement(fn.body)) {
                                    const returnValues = new Set();
                                    for (const stmt of fn.body.body) {
                                        if (!t.isReturnStatement(stmt))
                                            continue;
                                        const arg = stmt.argument;
                                        if (!arg)
                                            continue;
                                        if (!t.isStringLiteral(arg))
                                            return null;
                                        returnValues.add(arg.value);
                                    }
                                    return returnValues.size === 1
                                        ? Array.from(returnValues)[0]
                                        : null;
                                }
                                return null;
                            }
                            // FunctionExpression / ObjectMethod: function(){ return 'Hello' }
                            if ((t.isFunctionExpression(fn) || t.isObjectMethod(fn)) &&
                                t.isBlockStatement(fn.body)) {
                                const returnValues = new Set();
                                for (const stmt of fn.body.body) {
                                    if (!t.isReturnStatement(stmt))
                                        continue;
                                    const arg = stmt.argument;
                                    if (!arg)
                                        continue;
                                    if (!t.isStringLiteral(arg))
                                        return null;
                                    returnValues.add(arg.value);
                                }
                                return returnValues.size === 1
                                    ? Array.from(returnValues)[0]
                                    : null;
                            }
                            return null;
                        };
                        // Handle: const obj = { getText: () => 'Hello' } or const obj = { getText() { return 'Hello' } }
                        if (t.isObjectExpression(init)) {
                            const scopeMap = ensureScopeMap();
                            for (const prop of init.properties) {
                                if (t.isSpreadElement(prop))
                                    continue;
                                // obj: { getText: () => 'Hello' }
                                if (t.isObjectProperty(prop)) {
                                    if (!t.isIdentifier(prop.key))
                                        continue;
                                    const methodName = prop.key.name;
                                    const value = prop.value;
                                    if (!t.isArrowFunctionExpression(value) &&
                                        !t.isFunctionExpression(value)) {
                                        continue;
                                    }
                                    const onlyValue = extractDeterministicReturnFromFunctionLike(value);
                                    if (!onlyValue)
                                        continue;
                                    scopeMap.set(`${varName}.${methodName}`, onlyValue);
                                }
                                // obj: { getText() { return 'Hello' } }
                                if (t.isObjectMethod(prop)) {
                                    if (!t.isIdentifier(prop.key))
                                        continue;
                                    const methodName = prop.key.name;
                                    const onlyValue = extractDeterministicReturnFromFunctionLike(prop);
                                    if (!onlyValue)
                                        continue;
                                    scopeMap.set(`${varName}.${methodName}`, onlyValue);
                                }
                            }
                            return;
                        }
                        // Handle: const getGreeting = () => 'Hello'
                        if (!t.isArrowFunctionExpression(init) &&
                            !t.isFunctionExpression(init)) {
                            return;
                        }
                        const onlyValue = extractDeterministicReturnFromFunctionLike(init);
                        if (!onlyValue)
                            return;
                        ensureScopeMap().set(varName, onlyValue);
                    },
                });
                // First pass (continued): Build conditional-return function scopes.
                // We record functions that return different stable strings based on a single param, e.g.:
                // - if (status === 'loading') return 'Loading...'
                // - switch (status) { case 'pending': return 'Pending' }
                traverse(ast, {
                    FunctionDeclaration(path) {
                        if (!path.node.id || !t.isIdentifier(path.node.id))
                            return;
                        if (path.node.params.length !== 1)
                            return;
                        const param = path.node.params[0];
                        if (!t.isIdentifier(param))
                            return;
                        if (!t.isBlockStatement(path.node.body))
                            return;
                        const funcName = path.node.id.name;
                        const paramName = param.name;
                        const cases = new Map();
                        let defaultReturn = null;
                        const extractFirstReturnString = (stmts) => {
                            for (const stmt of stmts) {
                                if (!t.isReturnStatement(stmt))
                                    continue;
                                const arg = stmt.argument;
                                if (arg && t.isStringLiteral(arg)) {
                                    return arg.value;
                                }
                            }
                            return null;
                        };
                        // Pattern 1: switch(param) { case 'x': return '...'; default: return '...'; }
                        const switchStmt = path.node.body.body.find((s) => t.isSwitchStatement(s));
                        if (switchStmt &&
                            t.isIdentifier(switchStmt.discriminant) &&
                            switchStmt.discriminant.name === paramName) {
                            for (const cs of switchStmt.cases) {
                                const ret = extractFirstReturnString(cs.consequent);
                                if (!ret)
                                    continue;
                                if (!cs.test) {
                                    defaultReturn = ret;
                                    continue;
                                }
                                if (t.isStringLiteral(cs.test)) {
                                    cases.set(cs.test.value, ret);
                                }
                            }
                        }
                        else {
                            // Pattern 2: if (param === 'x') return '...'; ...; return '...';
                            for (const stmt of path.node.body.body) {
                                if (!t.isIfStatement(stmt))
                                    continue;
                                const test = stmt.test;
                                if (!t.isBinaryExpression(test) || test.operator !== '===') {
                                    continue;
                                }
                                const left = test.left;
                                const right = test.right;
                                const match = (t.isIdentifier(left) &&
                                    left.name === paramName &&
                                    t.isStringLiteral(right) &&
                                    right.value) ||
                                    (t.isIdentifier(right) &&
                                        right.name === paramName &&
                                        t.isStringLiteral(left) &&
                                        left.value);
                                if (!match)
                                    continue;
                                const value = t.isStringLiteral(left)
                                    ? left.value
                                    : t.isStringLiteral(right)
                                        ? right.value
                                        : '';
                                const consequentStmts = t.isBlockStatement(stmt.consequent)
                                    ? stmt.consequent.body
                                    : t.isStatement(stmt.consequent)
                                        ? [stmt.consequent]
                                        : [];
                                const ret = extractFirstReturnString(consequentStmts);
                                if (ret) {
                                    cases.set(value, ret);
                                }
                            }
                            // Default: first top-level string literal return statement (commonly the final return)
                            defaultReturn = extractFirstReturnString(path.node.body.body);
                        }
                        if (cases.size === 0 || !defaultReturn)
                            return;
                        const enclosingFunctionPath = path.findParent((p) => {
                            if (p === path)
                                return false;
                            return (p.isFunctionDeclaration() ||
                                p.isArrowFunctionExpression() ||
                                p.isFunctionExpression() ||
                                (p.isVariableDeclarator() &&
                                    p.node.init &&
                                    (t.isArrowFunctionExpression(p.node.init) ||
                                        t.isFunctionExpression(p.node.init))));
                        });
                        const fileScopeKey = `file:${relativeFilePath}`;
                        const scopeKey = enclosingFunctionPath
                            ? enclosingFunctionPath.getPathLocation()
                            : fileScopeKey;
                        if (!functionConditionalReturnScopes.has(scopeKey)) {
                            functionConditionalReturnScopes.set(scopeKey, new Map());
                        }
                        functionConditionalReturnScopes
                            .get(scopeKey)
                            .set(funcName, { cases, defaultReturn });
                    },
                });
                // Pass 1.5: Opt-in extraction for object/array literals (non-JSX).
                //
                // This intentionally does NOTHING unless the developer opts in with a leading comment.
                // Supported directives (line or block comment):
                // - @algb-translate-obj
                // - @algb-translate-obj-[title,label,header,placeholder,description]
                // - @algb-translate-arr
                //
                // Notes:
                // - We only extract literals that are inside a function/component so the Injector can safely
                //   rewrite them to `t(...)` (from `useTranslation()`).
                // - We support nested objects/arrays by walking the initializer subtree when opted in.
                const DEFAULT_OBJECT_LITERAL_KEYS = new Set([
                    'title',
                    'label',
                    'header',
                    'placeholder',
                    'description',
                ]);
                const parseTranslateObjKeysFromComment = (commentText) => {
                    const trimmed = commentText.trim();
                    const listMatch = trimmed.match(/@algb-translate-obj-\[([^\]]+)\]/);
                    if (listMatch) {
                        const keys = listMatch[1]
                            .split(',')
                            .map((k) => k.trim())
                            .filter(Boolean);
                        return keys.length > 0 ? new Set(keys) : new Set();
                    }
                    if (trimmed.includes('@algb-translate-obj')) {
                        return new Set(DEFAULT_OBJECT_LITERAL_KEYS);
                    }
                    return null;
                };
                const hasTranslateArrDirective = (commentText) => {
                    return commentText.trim().includes('@algb-translate-arr');
                };
                const readCommentValues = (node) => {
                    const buckets = [
                        ...(node?.leadingComments ?? []),
                        ...(node?.innerComments ?? []),
                        ...(node?.trailingComments ?? []),
                    ];
                    const values = [];
                    for (const c of buckets) {
                        const comment = c;
                        if (!comment || typeof comment.value !== 'string')
                            continue;
                        values.push(comment.value);
                    }
                    return values;
                };
                const getLiteralDirectives = (path) => {
                    const objKeys = new Set();
                    let sawObjDirective = false;
                    let translateArrayElements = false;
                    const nodesToCheck = [
                        path?.node,
                        path?.parentPath?.node,
                        path?.parentPath?.parentPath?.node,
                    ].filter(Boolean);
                    for (const node of nodesToCheck) {
                        for (const text of readCommentValues(node)) {
                            if (hasTranslateArrDirective(text))
                                translateArrayElements = true;
                            const keys = parseTranslateObjKeysFromComment(text);
                            if (keys) {
                                sawObjDirective = true;
                                for (const k of keys)
                                    objKeys.add(k);
                            }
                        }
                    }
                    return {
                        translateArrayElements,
                        objectKeys: sawObjDirective ? objKeys : null,
                    };
                };
                const extractStaticTextFromExpression = (expr) => {
                    if (t.isStringLiteral(expr))
                        return expr.value;
                    if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) {
                        const text = expr.quasis
                            .map((q) => q.value.cooked ?? q.value.raw ?? '')
                            .join('');
                        return text;
                    }
                    return null;
                };
                const getEnclosingFunctionPath = (path) => {
                    const fnPath = path.findParent((p) => {
                        return (p.isFunctionDeclaration() ||
                            p.isArrowFunctionExpression() ||
                            p.isFunctionExpression() ||
                            (p.isVariableDeclarator() &&
                                p.node.init &&
                                (t.isArrowFunctionExpression(p.node.init) ||
                                    t.isFunctionExpression(p.node.init))));
                    });
                    return fnPath || null;
                };
                traverse(ast, {
                    VariableDeclarator(path) {
                        const init = path.node.init;
                        if (!init)
                            return;
                        const directives = getLiteralDirectives(path);
                        if (!directives.translateArrayElements && !directives.objectKeys) {
                            return;
                        }
                        // Only translate literals inside functions/components (Injector can provide t()).
                        const enclosingFn = getEnclosingFunctionPath(path);
                        if (!enclosingFn)
                            return;
                        const declScopePath = (0, utils_1.getRelativeScopePath)(path.getPathLocation());
                        // Opt-in: translate direct string-array literal elements.
                        if (directives.translateArrayElements &&
                            t.isArrayExpression(init) &&
                            Array.isArray(init.elements)) {
                            for (let i = 0; i < init.elements.length; i++) {
                                const el = init.elements[i];
                                if (!el || !t.isExpression(el))
                                    continue;
                                const content = extractStaticTextFromExpression(el);
                                if (!content || !content.trim())
                                    continue;
                                const key = `${declScopePath}_arr_${i}`;
                                if (fileScopes[key])
                                    continue;
                                const hash = crypto_1.default
                                    .createHash('md5')
                                    .update(content)
                                    .digest('hex');
                                fileScopes[key] = {
                                    type: 'text',
                                    hash,
                                    context: `Opt-in array literal element (#${i})`,
                                    skip: false,
                                    overrides: {},
                                    content,
                                };
                            }
                        }
                        // Opt-in: translate object-like literals by key allowlist (supports nested objects/arrays).
                        if (directives.objectKeys) {
                            const initPath = path.get('init');
                            initPath.traverse({
                                ObjectProperty(propPath) {
                                    const keyNode = propPath.node.key;
                                    const propName = t.isIdentifier(keyNode)
                                        ? keyNode.name
                                        : t.isStringLiteral(keyNode)
                                            ? keyNode.value
                                            : null;
                                    if (!propName)
                                        return;
                                    if (!directives.objectKeys.has(propName))
                                        return;
                                    const valueNode = propPath.node.value;
                                    const baseScope = (0, utils_1.getRelativeScopePath)(propPath.getPathLocation());
                                    // Case 1: string / static template
                                    const text = extractStaticTextFromExpression(valueNode);
                                    if (text && text.trim()) {
                                        const key = `${baseScope}_obj_${propName}`;
                                        if (!fileScopes[key]) {
                                            const hash = crypto_1.default
                                                .createHash('md5')
                                                .update(text)
                                                .digest('hex');
                                            fileScopes[key] = {
                                                type: 'text',
                                                hash,
                                                context: `Opt-in object literal: ${propName}`,
                                                skip: false,
                                                overrides: {},
                                                content: text,
                                            };
                                        }
                                        return;
                                    }
                                    // Case 2: array of strings / static templates
                                    if (t.isArrayExpression(valueNode)) {
                                        const elements = valueNode.elements || [];
                                        for (let i = 0; i < elements.length; i++) {
                                            const el = elements[i];
                                            if (!el || !t.isExpression(el))
                                                continue;
                                            const content = extractStaticTextFromExpression(el);
                                            if (!content || !content.trim())
                                                continue;
                                            const key = `${baseScope}_obj_${propName}_arr_${i}`;
                                            if (fileScopes[key])
                                                continue;
                                            const hash = crypto_1.default
                                                .createHash('md5')
                                                .update(content)
                                                .digest('hex');
                                            fileScopes[key] = {
                                                type: 'text',
                                                hash,
                                                context: `Opt-in object literal array: ${propName}[${i}]`,
                                                skip: false,
                                                overrides: {},
                                                content,
                                            };
                                        }
                                    }
                                },
                            });
                        }
                    },
                });
                // Pass 1.6: Usage-driven extraction for object/array literals shown in UI.
                //
                // Goal: if a string is ultimately rendered to the user (JSX children, or a visible attribute),
                // we trace it back to its static declaration (object/array literals inside the same function)
                // and extract ONLY those literals.
                //
                // We intentionally do NOT try to resolve cross-file imports in this pass.
                //
                // Supported origins:
                // - const obj = { title: "..." }; render: {obj.title}
                // - const arr = ["A","B"]; render: {arr[0]} or {arr.map(...)}
                // - const cities = [{ name:"NY", country:"USA", mapLocation:"..." }]; render: {cities.map(c=> <a href={c.mapLocation}>{c.name}</a>)}
                //
                // Rules:
                // - Only declarations INSIDE a function/component are eligible (Injector can provide `t()`).
                // - We translate JSX children content by default.
                // - For attributes, we only translate a conservative allowlist (e.g. title/placeholder/alt/aria-label).
                const VISIBLE_ATTRIBUTE_ALLOWLIST = new Set([
                    'title',
                    'placeholder',
                    'alt',
                    'aria-label',
                    'aria-describedby',
                    'aria-placeholder',
                ]);
                const NON_TRANSLATABLE_ATTRIBUTES = new Set([
                    'href',
                    'src',
                    'id',
                    'className',
                    'htmlFor',
                    'key',
                    'ref',
                ]);
                // Index of object literal properties by varName.propName in a given function scope.
                const objectLiteralPropIndex = new Map();
                // Index of array literal string elements by varName[index] in a given function scope.
                const arrayLiteralElementIndex = new Map();
                // Index of array-of-objects string properties by varName.propName -> list per element.
                const arrayOfObjectsPropIndex = new Map();
                const upsertNestedMap = (outer, k1, k2, factory) => {
                    let inner = outer.get(k1);
                    if (!inner) {
                        inner = new Map();
                        outer.set(k1, inner);
                    }
                    let v = inner.get(k2);
                    if (!v) {
                        v = factory();
                        inner.set(k2, v);
                    }
                    return v;
                };
                const ensureScopeFileEntry = (key, content, context) => {
                    if (fileScopes[key])
                        return;
                    if (!content.trim())
                        return;
                    // Do not translate obvious URLs/paths by default.
                    // If the user truly wants these localized, they should opt-in explicitly.
                    const looksLikeUrlOrPath = (() => {
                        const v = content.trim();
                        if (!v)
                            return true;
                        if (/^[a-zA-Z]+:\/\//.test(v))
                            return true; // http://, https://, etc
                        if (v.startsWith('mailto:') || v.startsWith('tel:'))
                            return true;
                        if (v.startsWith('/') ||
                            v.startsWith('./') ||
                            v.startsWith('../')) {
                            return true;
                        }
                        if (v.includes('://'))
                            return true;
                        // asset-ish filenames
                        if (/\.(svg|png|jpe?g|webp|gif|ico)(\?.*)?$/i.test(v))
                            return true;
                        return false;
                    })();
                    if (looksLikeUrlOrPath)
                        return;
                    const hash = crypto_1.default.createHash('md5').update(content).digest('hex');
                    fileScopes[key] = {
                        type: 'text',
                        hash,
                        context,
                        skip: false,
                        overrides: {},
                        content,
                    };
                };
                const getEnclosingFunctionLocation = (path) => {
                    const fn = path.findParent((p) => {
                        return (p.isFunctionDeclaration() ||
                            p.isArrowFunctionExpression() ||
                            p.isFunctionExpression() ||
                            (p.isVariableDeclarator() &&
                                p.node.init &&
                                (t.isArrowFunctionExpression(p.node.init) ||
                                    t.isFunctionExpression(p.node.init))));
                    });
                    return fn ? fn.getPathLocation() : null;
                };
                const staticTextOf = (expr) => {
                    if (t.isStringLiteral(expr))
                        return expr.value;
                    if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) {
                        return expr.quasis
                            .map((q) => q.value.cooked ?? q.value.raw ?? '')
                            .join('');
                    }
                    return null;
                };
                // Build indices for static literals inside each function scope.
                traverse(ast, {
                    VariableDeclarator(path) {
                        if (!t.isIdentifier(path.node.id))
                            return;
                        const varName = path.node.id.name;
                        const init = path.node.init;
                        if (!init)
                            return;
                        const functionLocation = getEnclosingFunctionLocation(path);
                        if (!functionLocation)
                            return; // only within functions/components
                        // Index: object literal properties
                        if (t.isObjectExpression(init)) {
                            const byVar = upsertNestedMap(objectLiteralPropIndex, functionLocation, varName, () => new Map());
                            const initPath = path.get('init');
                            initPath.traverse({
                                ObjectProperty(propPath) {
                                    const keyNode = propPath.node.key;
                                    const propName = t.isIdentifier(keyNode)
                                        ? keyNode.name
                                        : t.isStringLiteral(keyNode)
                                            ? keyNode.value
                                            : null;
                                    if (!propName)
                                        return;
                                    const valueNode = propPath.node.value;
                                    const text = staticTextOf(valueNode);
                                    if (!text)
                                        return;
                                    const baseScope = (0, utils_1.getRelativeScopePath)(propPath.getPathLocation());
                                    const scopeKey = `${baseScope}_obj_${propName}`;
                                    byVar.set(propName, { scopeKey, content: text });
                                },
                            });
                        }
                        // Index: array literal of strings and array-of-objects (string properties)
                        if (t.isArrayExpression(init)) {
                            const arrIndex = upsertNestedMap(arrayLiteralElementIndex, functionLocation, varName, () => new Map());
                            const arrObjIndex = upsertNestedMap(arrayOfObjectsPropIndex, functionLocation, varName, () => new Map());
                            const declScopePath = (0, utils_1.getRelativeScopePath)(path.getPathLocation());
                            const initPath = path.get('init');
                            const elementPaths = initPath.get('elements') || [];
                            elementPaths.forEach((elPath, index) => {
                                if (!elPath?.node)
                                    return;
                                // Element: string literal / static template
                                if (t.isExpression(elPath.node)) {
                                    const text = staticTextOf(elPath.node);
                                    if (text) {
                                        arrIndex.set(index, {
                                            scopeKey: `${declScopePath}_arr_${index}`,
                                            content: text,
                                        });
                                        return;
                                    }
                                }
                                // Element: object expression with string props
                                if (t.isObjectExpression(elPath.node)) {
                                    elPath.traverse({
                                        ObjectProperty(propPath) {
                                            const keyNode = propPath.node.key;
                                            const propName = t.isIdentifier(keyNode)
                                                ? keyNode.name
                                                : t.isStringLiteral(keyNode)
                                                    ? keyNode.value
                                                    : null;
                                            if (!propName)
                                                return;
                                            const valueNode = propPath.node.value;
                                            const text = staticTextOf(valueNode);
                                            if (!text)
                                                return;
                                            const baseScope = (0, utils_1.getRelativeScopePath)(propPath.getPathLocation());
                                            const scopeKey = `${baseScope}_obj_${propName}`;
                                            const list = arrObjIndex.get(propName) || [];
                                            list.push({ scopeKey, content: text });
                                            arrObjIndex.set(propName, list);
                                        },
                                    });
                                }
                            });
                        }
                    },
                });
                const findJsxAttributeNameForExpression = (exprPath) => {
                    // Robustly detect attribute context by walking up to JSXAttribute.
                    // (The direct parent chain can vary in traversal contexts.)
                    const attrPath = exprPath.findParent((p) => p?.isJSXAttribute ? p.isJSXAttribute() : false);
                    if (!attrPath || !attrPath.node)
                        return null;
                    const nameNode = attrPath.node.name;
                    return t.isJSXIdentifier(nameNode) ? nameNode.name : null;
                };
                const shouldTranslateInAttribute = (attrName) => {
                    if (!attrName)
                        return false;
                    if (NON_TRANSLATABLE_ATTRIBUTES.has(attrName))
                        return false;
                    // data-* and event handlers should never be translated
                    if (attrName.startsWith('data-') || attrName.startsWith('on')) {
                        return false;
                    }
                    return VISIBLE_ATTRIBUTE_ALLOWLIST.has(attrName);
                };
                // During JSX processing, when we see something rendered, we extract its origin literals.
                traverse(ast, {
                    JSXElement(path) {
                        const functionPath = path.findParent((p) => {
                            return (p.isFunctionDeclaration() ||
                                p.isArrowFunctionExpression() ||
                                p.isFunctionExpression() ||
                                (p.isVariableDeclarator() &&
                                    p.node.init &&
                                    (t.isArrowFunctionExpression(p.node.init) ||
                                        t.isFunctionExpression(p.node.init))));
                        });
                        const functionLocation = functionPath
                            ? functionPath.getPathLocation()
                            : null;
                        if (!functionLocation)
                            return;
                        // 1) Direct member expressions rendered in JSX: {obj.title}, {arr[0]}, etc.
                        path.traverse({
                            JSXExpressionContainer(exprContainerPath) {
                                const exprPath = exprContainerPath.get('expression');
                                if (!exprPath)
                                    return;
                                const exprNode = exprPath.node;
                                // Determine if this expression is in an attribute value.
                                const attrName = findJsxAttributeNameForExpression(exprPath);
                                const isAttrContext = typeof attrName === 'string';
                                if (isAttrContext && attrName) {
                                    if (!shouldTranslateInAttribute(attrName))
                                        return;
                                }
                                // MemberExpression: obj.prop or arr[0]
                                if (t.isMemberExpression(exprNode)) {
                                    // Case: arr[0]
                                    if (exprNode.computed &&
                                        t.isIdentifier(exprNode.object) &&
                                        t.isNumericLiteral(exprNode.property)) {
                                        const arrName = exprNode.object.name;
                                        const idx = exprNode.property.value;
                                        const arrMap = arrayLiteralElementIndex
                                            .get(functionLocation)
                                            ?.get(arrName);
                                        const origin = arrMap?.get(idx);
                                        if (origin) {
                                            ensureScopeFileEntry(origin.scopeKey, origin.content, `Array literal element used in UI: ${arrName}[${idx}]`);
                                        }
                                        return;
                                    }
                                    // Case: obj.prop
                                    if (!exprNode.computed &&
                                        t.isIdentifier(exprNode.object) &&
                                        t.isIdentifier(exprNode.property)) {
                                        const objName = exprNode.object.name;
                                        const propName = exprNode.property.name;
                                        const objMap = objectLiteralPropIndex
                                            .get(functionLocation)
                                            ?.get(objName);
                                        const origin = objMap?.get(propName);
                                        if (origin) {
                                            ensureScopeFileEntry(origin.scopeKey, origin.content, `Object literal prop used in UI: ${objName}.${propName}`);
                                        }
                                    }
                                }
                            },
                        });
                        // 2) map() over array-of-objects rendered in JSX:
                        //    cities.map((city) => <a href={city.mapLocation}>{city.name}</a>)
                        path.traverse({
                            CallExpression(callPath) {
                                const callee = callPath.node.callee;
                                if (!t.isMemberExpression(callee))
                                    return;
                                if (!t.isIdentifier(callee.property))
                                    return;
                                if (callee.property.name !== 'map')
                                    return;
                                // Only when this call is rendered via JSXExpressionContainer
                                const parent = callPath.parentPath;
                                if (!parent || !parent.isJSXExpressionContainer())
                                    return;
                                const rootName = (() => {
                                    const obj = callee.object;
                                    if (t.isIdentifier(obj))
                                        return obj.name;
                                    if (t.isMemberExpression(obj)) {
                                        // cities.filtered.map(...) => resolve base identifier
                                        let cur = obj;
                                        while (cur && t.isMemberExpression(cur))
                                            cur = cur.object;
                                        return t.isIdentifier(cur) ? cur.name : null;
                                    }
                                    return null;
                                })();
                                if (!rootName)
                                    return;
                                const cb = callPath.get('arguments.0');
                                if (!cb)
                                    return;
                                if (!cb.isArrowFunctionExpression() &&
                                    !cb.isFunctionExpression()) {
                                    return;
                                }
                                const params = cb.node.params || [];
                                if (params.length === 0)
                                    return;
                                if (!t.isIdentifier(params[0]))
                                    return;
                                const itemName = params[0].name;
                                const propsUsedInText = new Set();
                                const propsUsedInVisibleAttrs = new Set();
                                const bodyPath = cb.get('body');
                                if (!bodyPath)
                                    return;
                                // Collect member expressions on the item param.
                                bodyPath.traverse({
                                    JSXExpressionContainer(innerExprContainer) {
                                        const innerExprPath = innerExprContainer.get('expression');
                                        if (!innerExprPath)
                                            return;
                                        const innerAttrName = findJsxAttributeNameForExpression(innerExprPath);
                                        const isAttr = typeof innerAttrName === 'string';
                                        const allowAttr = isAttr && innerAttrName
                                            ? shouldTranslateInAttribute(innerAttrName)
                                            : false;
                                        const node = innerExprPath.node;
                                        if (t.isMemberExpression(node) &&
                                            !node.computed &&
                                            t.isIdentifier(node.object) &&
                                            node.object.name === itemName &&
                                            t.isIdentifier(node.property)) {
                                            const prop = node.property.name;
                                            if (isAttr && innerAttrName) {
                                                // Attribute context: translate only allowlisted visible attrs.
                                                if (allowAttr)
                                                    propsUsedInVisibleAttrs.add(prop);
                                                return;
                                            }
                                            // Text/children context: translate by default.
                                            propsUsedInText.add(prop);
                                        }
                                    },
                                });
                                if (propsUsedInText.size === 0 &&
                                    propsUsedInVisibleAttrs.size === 0) {
                                    return;
                                }
                                const arrPropIndex = arrayOfObjectsPropIndex
                                    .get(functionLocation)
                                    ?.get(rootName);
                                if (!arrPropIndex)
                                    return;
                                for (const propName of propsUsedInText) {
                                    const origins = arrPropIndex.get(propName) || [];
                                    for (const origin of origins) {
                                        ensureScopeFileEntry(origin.scopeKey, origin.content, `Array-of-objects prop used in UI: ${rootName}[*].${propName}`);
                                    }
                                }
                                for (const propName of propsUsedInVisibleAttrs) {
                                    const origins = arrPropIndex.get(propName) || [];
                                    for (const origin of origins) {
                                        ensureScopeFileEntry(origin.scopeKey, origin.content, `Array-of-objects prop used in visible attr: ${rootName}[*].${propName}`);
                                    }
                                }
                            },
                        });
                    },
                });
                // Second pass: Process JSXElements with variable scope context
                traverse(ast, {
                    JSXElement(path) {
                        // Get the element name
                        const elementName = path.node.openingElement.name;
                        let tagName = 'Unknown';
                        if (t.isJSXIdentifier(elementName)) {
                            tagName = elementName.name;
                        }
                        else if (t.isJSXMemberExpression(elementName)) {
                            tagName = elementName.property.name;
                        }
                        // Find the parent function/component to get its variable scope
                        const functionPath = path.findParent((p) => {
                            return (p.isFunctionDeclaration() ||
                                p.isArrowFunctionExpression() ||
                                p.isFunctionExpression() ||
                                (p.isVariableDeclarator() &&
                                    p.node.init &&
                                    (t.isArrowFunctionExpression(p.node.init) ||
                                        t.isFunctionExpression(p.node.init))));
                        });
                        // Get variable scope for this function, or use file-level scope
                        // Merge both function-level and file-level scopes
                        const fileScopeKey = `file:${relativeFilePath}`;
                        const fileLevelScope = functionScopes.get(fileScopeKey) || new Map();
                        const fileLevelStringArrayScope = functionStringArrayScopes.get(fileScopeKey) || new Map();
                        const fileLevelFunctionScope = functionReturnScopes.get(fileScopeKey) || new Map();
                        const fileLevelConditionalReturnScope = functionConditionalReturnScopes.get(fileScopeKey) || new Map();
                        let variableScope = new Map(fileLevelScope);
                        let stringArrayScope = new Map(fileLevelStringArrayScope);
                        let functionReturnScope = new Map(fileLevelFunctionScope);
                        let functionConditionalReturnScope = new Map(fileLevelConditionalReturnScope);
                        if (functionPath) {
                            const functionLocation = functionPath.getPathLocation();
                            const functionLevelScope = functionScopes.get(functionLocation) || new Map();
                            const functionLevelStringArrayScope = functionStringArrayScopes.get(functionLocation) || new Map();
                            const functionLevelFunctionScope = functionReturnScopes.get(functionLocation) || new Map();
                            const functionLevelConditionalReturnScope = functionConditionalReturnScopes.get(functionLocation) ||
                                new Map();
                            // Merge function-level scope into file-level scope
                            for (const [key, value] of functionLevelScope) {
                                variableScope.set(key, value);
                            }
                            for (const [key, value] of functionLevelStringArrayScope) {
                                stringArrayScope.set(key, value);
                            }
                            for (const [key, value] of functionLevelFunctionScope) {
                                functionReturnScope.set(key, value);
                            }
                            for (const [key, value] of functionLevelConditionalReturnScope) {
                                functionConditionalReturnScope.set(key, value);
                            }
                        }
                        // Extract static string arrays used in rendered loop/array calls.
                        // This enables translating cases like:
                        //   const items = ['First','Second'];
                        //   {items.map((item) => <div>{item}</div>)}
                        //
                        // We create per-element entries (keyed off the VariableDeclarator scope path),
                        // and the Injector rewrites the array literals to t(file::key) calls.
                        const loopMethods = new Set([
                            'map',
                            'filter',
                            'forEach',
                            'reduce',
                            'join',
                        ]);
                        const getRootIdentifierName = (node) => {
                            if (!node)
                                return null;
                            if (t.isIdentifier(node))
                                return node.name;
                            if (t.isMemberExpression(node)) {
                                return getRootIdentifierName(node.object);
                            }
                            if (t.isCallExpression(node) &&
                                t.isMemberExpression(node.callee)) {
                                return getRootIdentifierName(node.callee.object);
                            }
                            return null;
                        };
                        for (const child of path.node.children) {
                            if (!t.isJSXExpressionContainer(child))
                                continue;
                            const expr = child.expression;
                            if (!t.isCallExpression(expr))
                                continue;
                            if (!t.isMemberExpression(expr.callee))
                                continue;
                            const memberExpr = expr.callee;
                            if (!t.isIdentifier(memberExpr.property))
                                continue;
                            const methodName = memberExpr.property.name;
                            if (!loopMethods.has(methodName))
                                continue;
                            const rootName = getRootIdentifierName(memberExpr.object);
                            if (!rootName)
                                continue;
                            const info = stringArrayScope.get(rootName);
                            if (!info)
                                continue;
                            info.values.forEach((value, index) => {
                                const key = `${info.declScopePath}_arr_${index}`;
                                if (fileScopes[key])
                                    return;
                                const hash = crypto_1.default
                                    .createHash('md5')
                                    .update(value)
                                    .digest('hex');
                                fileScopes[key] = {
                                    type: 'text',
                                    hash,
                                    context: `Static string-array element (${rootName}[${index}]) used by ${methodName}()`,
                                    skip: false,
                                    overrides: {},
                                    content: value,
                                };
                            });
                        }
                        // Extract static quasis from template literals used inside map() callbacks rendered in JSX.
                        // Scenario 7.2:
                        //   {numbers.map((n) => <div>{`Number: ${n}`}</div>)}
                        //
                        // We do NOT attempt to translate runtime interpolations like `n`.
                        // Instead, we create per-quasi entries:
                        //   {templateLiteralPath}_quasi_{i}
                        // and the Injector rewrites the template literal to:
                        //   t(file::..._quasi_0) + n (+ ...)
                        path.traverse({
                            CallExpression(callPath) {
                                const callee = callPath.node.callee;
                                if (!t.isMemberExpression(callee))
                                    return;
                                if (!t.isIdentifier(callee.property))
                                    return;
                                if (callee.property.name !== 'map')
                                    return;
                                // Only when this call is rendered via JSXExpressionContainer
                                const parent = callPath.parentPath;
                                if (!parent || !parent.isJSXExpressionContainer())
                                    return;
                                // Ensure we only process map() calls whose nearest JSXElement is this `path`
                                const nearestJsx = callPath.findParent((p) => p.isJSXElement ? p.isJSXElement() : false);
                                if (nearestJsx && nearestJsx !== path)
                                    return;
                                // Visit template literals under the callback body
                                const cb = callPath.get('arguments.0');
                                if (!cb)
                                    return;
                                if (!cb.isArrowFunctionExpression() &&
                                    !cb.isFunctionExpression()) {
                                    return;
                                }
                                const body = cb.get('body');
                                if (!body)
                                    return;
                                body.traverse({
                                    TemplateLiteral(tplPath) {
                                        const baseKey = (0, utils_1.getRelativeScopePath)(tplPath.getPathLocation());
                                        const quasis = tplPath.node.quasis || [];
                                        for (let i = 0; i < quasis.length; i++) {
                                            const quasi = quasis[i];
                                            const quasiText = quasi.value?.cooked ?? quasi.value?.raw ?? '';
                                            if (!quasiText)
                                                continue;
                                            const key = `${baseKey}_quasi_${i}`;
                                            if (fileScopes[key])
                                                continue;
                                            const hash = crypto_1.default
                                                .createHash('md5')
                                                .update(quasiText)
                                                .digest('hex');
                                            fileScopes[key] = {
                                                type: 'text',
                                                hash,
                                                context: `map() callback template quasi ${i}`,
                                                skip: false,
                                                overrides: {},
                                                content: quasiText,
                                            };
                                        }
                                    },
                                });
                            },
                        });
                        // Debug: Log variable scope for template literals
                        // This helps verify that variables are in scope when processing template literals
                        // Check if this element is nested inside another element that has text
                        // If so, skip extracting it to avoid duplication (content is already in parent's extraction)
                        let parentPath = path.parentPath;
                        while (parentPath) {
                            if (parentPath.isJSXElement && parentPath.isJSXElement()) {
                                const parentElementName = parentPath.node.openingElement.name;
                                let parentTagName = 'Unknown';
                                if (t.isJSXIdentifier(parentElementName)) {
                                    parentTagName = parentElementName.name;
                                }
                                else if (t.isJSXMemberExpression(parentElementName)) {
                                    parentTagName = parentElementName.property.name;
                                }
                                // Check if parent has JSXText or translatable expressions
                                const hasContentInParent = parentPath.node.children.some((child) => {
                                    if (t.isJSXText(child) && child.value.trim()) {
                                        return true;
                                    }
                                    if (t.isJSXExpressionContainer(child)) {
                                        const expr = child.expression;
                                        // Check if it's a translatable expression
                                        if (t.isStringLiteral(expr) ||
                                            t.isTemplateLiteral(expr) ||
                                            t.isConditionalExpression(expr) ||
                                            t.isLogicalExpression(expr) ||
                                            (t.isBinaryExpression(expr) && expr.operator === '+')) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                // If parent has content, this nested element's content is already included
                                if (hasContentInParent) {
                                    return;
                                }
                            }
                            parentPath = parentPath.parentPath;
                        }
                        // Check if element has translatable content
                        // IMPORTANT:
                        // MemberExpression children like {city.name} are usage-driven (we translate at the origin),
                        // and extractExpressionContent() intentionally returns '' for them.
                        // If we extracted the whole JSXElement anyway, we'd erase runtime output (e.g. render "()" only).
                        // So: if an element contains any MemberExpression in its children, skip element-level extraction.
                        let hasMemberExpressionChild = false;
                        const hasTranslatableContent = path.node.children.some((child) => {
                            if (t.isJSXText(child) && child.value.trim()) {
                                return true;
                            }
                            if (t.isJSXExpressionContainer(child)) {
                                const expr = child.expression;
                                if (t.isMemberExpression(expr)) {
                                    hasMemberExpressionChild = true;
                                    return false;
                                }
                                // Check for translatable expressions
                                if (t.isStringLiteral(expr) ||
                                    t.isTemplateLiteral(expr) ||
                                    t.isConditionalExpression(expr) ||
                                    t.isLogicalExpression(expr) ||
                                    (t.isBinaryExpression(expr) && expr.operator === '+') ||
                                    t.isCallExpression(expr) ||
                                    t.isIdentifier(expr)) {
                                    return true;
                                }
                            }
                            return false;
                        });
                        if (hasTranslatableContent && !hasMemberExpressionChild) {
                            const fullScopePath = path.getPathLocation();
                            const relativeScopePath = (0, utils_1.getRelativeScopePath)(fullScopePath);
                            const buildResult = (0, utils_1.buildContent)(path.node, variableScope, functionReturnScope);
                            const content = buildResult.content;
                            if (content.trim()) {
                                const hash = crypto_1.default
                                    .createHash('md5')
                                    .update(content)
                                    .digest('hex');
                                const scopeEntry = {
                                    type: 'element',
                                    hash,
                                    context: '',
                                    skip: false,
                                    overrides: {},
                                    content,
                                };
                                if (buildResult.elementProps &&
                                    buildResult.elementProps.length > 0) {
                                    scopeEntry.elementProps = buildResult.elementProps;
                                }
                                fileScopes[relativeScopePath] = scopeEntry;
                                // Static variables are now resolved directly in extractExpressionContent
                                // Only runtime variables (not in variableScope) will remain as placeholders
                                // Extract conditional expression branches (ternary) as separate entries
                                // This enables preserving runtime conditional logic while translating each branch.
                                // Pattern: {scopePath}_cond_{index}_{consequent|alternate}
                                let conditionalIndex = 0;
                                path.node.children.forEach((child) => {
                                    if (!t.isJSXExpressionContainer(child))
                                        return;
                                    const expr = child.expression;
                                    if (!t.isConditionalExpression(expr))
                                        return;
                                    const consequentContent = (0, utils_1.extractExpressionContent)(expr.consequent, variableScope, functionReturnScope);
                                    const alternateContent = (0, utils_1.extractExpressionContent)(expr.alternate, variableScope, functionReturnScope);
                                    if (!consequentContent || !alternateContent)
                                        return;
                                    const consequentKey = `${relativeScopePath}_cond_${conditionalIndex}_consequent`;
                                    const alternateKey = `${relativeScopePath}_cond_${conditionalIndex}_alternate`;
                                    if (!fileScopes[consequentKey]) {
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(consequentContent)
                                            .digest('hex');
                                        fileScopes[consequentKey] = {
                                            type: 'element',
                                            hash,
                                            context: 'Conditional expression consequent branch',
                                            skip: false,
                                            overrides: {},
                                            content: consequentContent,
                                        };
                                    }
                                    if (!fileScopes[alternateKey]) {
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(alternateContent)
                                            .digest('hex');
                                        fileScopes[alternateKey] = {
                                            type: 'element',
                                            hash,
                                            context: 'Conditional expression alternate branch',
                                            skip: false,
                                            overrides: {},
                                            content: alternateContent,
                                        };
                                    }
                                    conditionalIndex++;
                                });
                                // Extract logical expression right operands as separate entries
                                // This enables preserving runtime logic like: condition && "Text" or value || "Fallback"
                                // Pattern: {scopePath}_logic_{index}_{and|or}_right
                                //
                                // Also supports TemplateLiteral on the right side:
                                // Pattern: {scopePath}_logic_{index}_{and|or}_right_quasi_{i}
                                let logicalIndex = 0;
                                path.node.children.forEach((child) => {
                                    if (!t.isJSXExpressionContainer(child))
                                        return;
                                    const expr = child.expression;
                                    if (!t.isLogicalExpression(expr))
                                        return;
                                    const op = expr.operator;
                                    const opName = op === '&&' ? 'and' : op === '||' ? 'or' : null;
                                    if (!opName)
                                        return;
                                    // Case 1: right side is a plain string literal.
                                    if (t.isStringLiteral(expr.right)) {
                                        const rightContent = expr.right.value;
                                        if (!rightContent) {
                                            logicalIndex++;
                                            return;
                                        }
                                        const key = `${relativeScopePath}_logic_${logicalIndex}_${opName}_right`;
                                        if (!fileScopes[key]) {
                                            const hash = crypto_1.default
                                                .createHash('md5')
                                                .update(rightContent)
                                                .digest('hex');
                                            fileScopes[key] = {
                                                type: 'element',
                                                hash,
                                                context: `Logical expression (${op}) right operand`,
                                                skip: false,
                                                overrides: {},
                                                content: rightContent,
                                            };
                                        }
                                        logicalIndex++;
                                        return;
                                    }
                                    // Case 2: right side is a template literal.
                                    // We extract ONLY the static quasis as their own entries so runtime interpolations stay untouched.
                                    if (t.isTemplateLiteral(expr.right)) {
                                        const template = expr.right;
                                        for (let i = 0; i < template.quasis.length; i++) {
                                            const quasi = template.quasis[i];
                                            const quasiText = quasi.value.cooked ?? quasi.value.raw ?? '';
                                            if (!quasiText)
                                                continue;
                                            const key = `${relativeScopePath}_logic_${logicalIndex}_${opName}_right_quasi_${i}`;
                                            if (!fileScopes[key]) {
                                                const hash = crypto_1.default
                                                    .createHash('md5')
                                                    .update(quasiText)
                                                    .digest('hex');
                                                fileScopes[key] = {
                                                    type: 'element',
                                                    hash,
                                                    context: `Logical expression (${op}) right template quasi ${i}`,
                                                    skip: false,
                                                    overrides: {},
                                                    content: quasiText,
                                                };
                                            }
                                        }
                                        logicalIndex++;
                                        return;
                                    }
                                    // Other right-hand expressions (identifiers, calls, etc) are intentionally skipped.
                                    logicalIndex++;
                                });
                            }
                            // Extract conditional-return function call branches as separate entries.
                            // This enables translating runtime call-expressions like: {getMessage(status)}
                            // by mapping status -> translated string at runtime.
                            //
                            // Pattern:
                            // - {scopePath}_call_{index}_{funcName}_case_{encodeURIComponent(caseValue)}
                            // - {scopePath}_call_{index}_{funcName}_default
                            let callIndex = 0;
                            path.node.children.forEach((child) => {
                                if (!t.isJSXExpressionContainer(child))
                                    return;
                                const expr = child.expression;
                                if (!t.isCallExpression(expr))
                                    return;
                                if (!t.isIdentifier(expr.callee))
                                    return;
                                const funcName = expr.callee.name;
                                const info = functionConditionalReturnScope.get(funcName);
                                if (!info) {
                                    callIndex++;
                                    return;
                                }
                                for (const [caseValue, returnText] of info.cases) {
                                    if (!returnText)
                                        continue;
                                    const encoded = encodeURIComponent(caseValue);
                                    const key = `${relativeScopePath}_call_${callIndex}_${funcName}_case_${encoded}`;
                                    if (!fileScopes[key]) {
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(returnText)
                                            .digest('hex');
                                        fileScopes[key] = {
                                            type: 'element',
                                            hash,
                                            context: `CallExpression ${funcName} case "${caseValue}"`,
                                            skip: false,
                                            overrides: {},
                                            content: returnText,
                                        };
                                    }
                                }
                                if (info.defaultReturn) {
                                    const key = `${relativeScopePath}_call_${callIndex}_${funcName}_default`;
                                    if (!fileScopes[key]) {
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(info.defaultReturn)
                                            .digest('hex');
                                        fileScopes[key] = {
                                            type: 'element',
                                            hash,
                                            context: `CallExpression ${funcName} default`,
                                            skip: false,
                                            overrides: {},
                                            content: info.defaultReturn,
                                        };
                                    }
                                }
                                callIndex++;
                            });
                        }
                    },
                });
                // Third pass: Process JSXAttribute nodes when translation instructions are present
                traverse(ast, {
                    JSXElement(path) {
                        // Find translation instructions for this element
                        // Pass source code to extract comment text directly if comments aren't attached
                        const instructions = (0, utils_1.findTranslationInstructions)(path, code);
                        if (!instructions)
                            return;
                        // Process attributes if there are attribute instructions
                        if (instructions.translateAttributes.size > 0) {
                            const openingElement = path.node.openingElement;
                            if (openingElement && openingElement.attributes) {
                                for (const attr of openingElement.attributes) {
                                    if (!t.isJSXAttribute(attr))
                                        continue;
                                    const attrName = attr.name;
                                    if (!t.isJSXIdentifier(attrName))
                                        continue;
                                    const attrNameStr = attrName.name;
                                    if (!instructions.translateAttributes.has(attrNameStr)) {
                                        continue;
                                    }
                                    // Get the attribute value
                                    const attrValue = attr.value;
                                    // Handle string literal attributes: placeholder="Text"
                                    if (t.isStringLiteral(attrValue)) {
                                        const content = attrValue.value;
                                        if (!content.trim())
                                            continue;
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(content)
                                            .digest('hex');
                                        const fullScopePath = path.getPathLocation();
                                        const relativeScopePath = (0, utils_1.getRelativeScopePath)(fullScopePath);
                                        // Use a unique key for attributes to avoid conflicts with element scopes
                                        const attributeKey = `${relativeScopePath}_attr_${attrNameStr}`;
                                        fileScopes[attributeKey] = {
                                            type: 'attribute',
                                            hash,
                                            context: `Attribute: ${attrNameStr} (translation instruction)`,
                                            skip: false,
                                            overrides: {},
                                            content,
                                        };
                                        continue;
                                    }
                                    // Handle expression attributes: placeholder={variable} or placeholder={`Hello ${name}`}
                                    if (t.isJSXExpressionContainer(attrValue)) {
                                        const expr = attrValue.expression;
                                        // Find the parent function/component to get its variable scope
                                        const functionPath = path.findParent((p) => {
                                            return (p.isFunctionDeclaration() ||
                                                p.isArrowFunctionExpression() ||
                                                p.isFunctionExpression() ||
                                                (p.isVariableDeclarator() &&
                                                    p.node.init &&
                                                    (t.isArrowFunctionExpression(p.node.init) ||
                                                        t.isFunctionExpression(p.node.init))));
                                        });
                                        // Get variable scope for this function, or use file-level scope
                                        const fileScopeKey = `file:${relativeFilePath}`;
                                        const fileLevelScope = functionScopes.get(fileScopeKey) || new Map();
                                        const fileLevelFunctionScope = functionReturnScopes.get(fileScopeKey) || new Map();
                                        let variableScope = new Map(fileLevelScope);
                                        let functionReturnScope = new Map(fileLevelFunctionScope);
                                        if (functionPath) {
                                            const functionLocation = functionPath.getPathLocation();
                                            const functionLevelScope = functionScopes.get(functionLocation) || new Map();
                                            const functionLevelFunctionScope = functionReturnScopes.get(functionLocation) || new Map();
                                            for (const [key, value] of functionLevelScope) {
                                                variableScope.set(key, value);
                                            }
                                            for (const [key, value] of functionLevelFunctionScope) {
                                                functionReturnScope.set(key, value);
                                            }
                                        }
                                        // Extract content from expression
                                        const content = (0, utils_1.extractExpressionContent)(expr, variableScope, functionReturnScope);
                                        if (!content.trim())
                                            continue;
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(content)
                                            .digest('hex');
                                        const fullScopePath = path.getPathLocation();
                                        const relativeScopePath = (0, utils_1.getRelativeScopePath)(fullScopePath);
                                        const attributeKey = `${relativeScopePath}_attr_${attrNameStr}`;
                                        fileScopes[attributeKey] = {
                                            type: 'attribute',
                                            hash,
                                            context: `Attribute: ${attrNameStr} (translation instruction)`,
                                            skip: false,
                                            overrides: {},
                                            content,
                                        };
                                    }
                                }
                            }
                        }
                        // Process props if there are prop instructions
                        if (instructions.translateProps.size > 0) {
                            const openingElement = path.node.openingElement;
                            if (openingElement && openingElement.attributes) {
                                for (const attr of openingElement.attributes) {
                                    if (!t.isJSXAttribute(attr))
                                        continue;
                                    const attrName = attr.name;
                                    if (!t.isJSXIdentifier(attrName))
                                        continue;
                                    const attrNameStr = attrName.name;
                                    if (!instructions.translateProps.has(attrNameStr)) {
                                        continue;
                                    }
                                    // Get the attribute value
                                    const attrValue = attr.value;
                                    // Handle string literal props: title="Text"
                                    if (t.isStringLiteral(attrValue)) {
                                        const content = attrValue.value;
                                        if (!content.trim())
                                            continue;
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(content)
                                            .digest('hex');
                                        const fullScopePath = path.getPathLocation();
                                        const relativeScopePath = (0, utils_1.getRelativeScopePath)(fullScopePath);
                                        // Use a unique key for props to avoid conflicts with element scopes
                                        const propKey = `${relativeScopePath}_prop_${attrNameStr}`;
                                        fileScopes[propKey] = {
                                            type: 'attribute',
                                            hash,
                                            context: `Prop: ${attrNameStr} (translation instruction)`,
                                            skip: false,
                                            overrides: {},
                                            content,
                                        };
                                        continue;
                                    }
                                    // Handle expression props: title={variable} or title={`Hello ${name}`}
                                    if (t.isJSXExpressionContainer(attrValue)) {
                                        const expr = attrValue.expression;
                                        // Find the parent function/component to get its variable scope
                                        const functionPath = path.findParent((p) => {
                                            return (p.isFunctionDeclaration() ||
                                                p.isArrowFunctionExpression() ||
                                                p.isFunctionExpression() ||
                                                (p.isVariableDeclarator() &&
                                                    p.node.init &&
                                                    (t.isArrowFunctionExpression(p.node.init) ||
                                                        t.isFunctionExpression(p.node.init))));
                                        });
                                        // Get variable scope for this function, or use file-level scope
                                        const fileScopeKey = `file:${relativeFilePath}`;
                                        const fileLevelScope = functionScopes.get(fileScopeKey) || new Map();
                                        const fileLevelFunctionScope = functionReturnScopes.get(fileScopeKey) || new Map();
                                        let variableScope = new Map(fileLevelScope);
                                        let functionReturnScope = new Map(fileLevelFunctionScope);
                                        if (functionPath) {
                                            const functionLocation = functionPath.getPathLocation();
                                            const functionLevelScope = functionScopes.get(functionLocation) || new Map();
                                            const functionLevelFunctionScope = functionReturnScopes.get(functionLocation) || new Map();
                                            for (const [key, value] of functionLevelScope) {
                                                variableScope.set(key, value);
                                            }
                                            for (const [key, value] of functionLevelFunctionScope) {
                                                functionReturnScope.set(key, value);
                                            }
                                        }
                                        // Extract content from expression
                                        const content = (0, utils_1.extractExpressionContent)(expr, variableScope, functionReturnScope);
                                        if (!content.trim())
                                            continue;
                                        const hash = crypto_1.default
                                            .createHash('md5')
                                            .update(content)
                                            .digest('hex');
                                        const fullScopePath = path.getPathLocation();
                                        const relativeScopePath = (0, utils_1.getRelativeScopePath)(fullScopePath);
                                        const propKey = `${relativeScopePath}_prop_${attrNameStr}`;
                                        fileScopes[propKey] = {
                                            type: 'attribute',
                                            hash,
                                            context: `Prop: ${attrNameStr} (translation instruction)`,
                                            skip: false,
                                            overrides: {},
                                            content,
                                        };
                                    }
                                }
                            }
                        }
                    },
                });
                // Only add files that have scopes
                if (Object.keys(fileScopes).length > 0) {
                    scopeMap.files[relativeFilePath] = {
                        scopes: fileScopes,
                    };
                }
            }
            // Compare with previous
            const prev = this.sourceStore.load();
            const prevFiles = prev.files || {};
            const newFiles = scopeMap.files;
            const changed = this.hasChanges(prevFiles, newFiles);
            if (!changed) {
                console.log('🟢 Skipping parse: no changes detected.');
                return prev;
            }
            const totalEntries = Object.values(newFiles).reduce((count, file) => count + Object.keys(file.scopes).length, 0);
            console.log(`[Parser] Extraction complete. Found ${totalEntries} entries across ${Object.keys(newFiles).length} files.`);
            // Save new sources
            this.sourceStore.save(scopeMap);
            return scopeMap;
        }
        finally {
            // Remove lock file
            fs_1.default.unlinkSync(this.lockPath);
        }
    }
    hasChanges(prevFiles, newFiles) {
        const prevFilePaths = Object.keys(prevFiles);
        const newFilePaths = Object.keys(newFiles);
        // Check if file count changed
        if (prevFilePaths.length !== newFilePaths.length) {
            return true;
        }
        // Check each file
        for (const filePath of newFilePaths) {
            const prevFile = prevFiles[filePath];
            const newFile = newFiles[filePath];
            if (!prevFile) {
                return true; // New file added
            }
            const prevScopes = Object.keys(prevFile.scopes);
            const newScopes = Object.keys(newFile.scopes);
            // Check if scope count changed
            if (prevScopes.length !== newScopes.length) {
                return true;
            }
            // Check each scope
            for (const scope of newScopes) {
                const prevScope = prevFile.scopes[scope];
                const newScope = newFile.scopes[scope];
                if (!prevScope || prevScope.hash !== newScope.hash) {
                    return true;
                }
            }
        }
        return false;
    }
}
exports.Parser = Parser;
