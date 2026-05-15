import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "lib"].map((sourceRoot) =>
  path.join(PROJECT_ROOT, sourceRoot),
);
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".mts", ".jsx", ".js", ".mjs"];
const FORBIDDEN_CLIENT_ENV_NAMES = [
  "APP_BASE_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_EXPERT_EMAILS",
  "AUTH_ADMIN_EMAILS",
  "OPENAI_API_KEY",
  "OPENAI_ACTIVE_VECTOR_STORE_ID",
  "OPENAI_MODEL",
  "OPENAI_TIMEOUT_MS",
  "OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY",
  "OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS",
  "OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CHAT_ENABLE_PROMPT_CACHING",
  "CHAT_MAX_MESSAGE_CHARS",
  "CHAT_MAX_HISTORY_TURNS",
  "CHAT_MAX_OUTPUT_TOKENS",
  "CHAT_RATE_LIMIT_PER_MIN",
];
const SERVER_ENV_MODULES = [
  "lib/auth/env.ts",
  "lib/chat/env.ts",
  "lib/openai/env.ts",
  "lib/supabase/env.ts",
  "lib/observability/logger.ts",
];

type SourceImport = {
  column: number;
  line: number;
  specifier: string;
};

type EnvAccess = {
  column: number;
  line: number;
  name: string | null;
};

type SourceModule = {
  directives: Set<string>;
  envAccesses: EnvAccess[];
  filePath: string;
  imports: SourceImport[];
  sourceFile: ts.SourceFile;
  text: string;
};

function toRelativePath(filePath: string) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join("/");
}

function isSourceFile(filePath: string) {
  if (!SOURCE_EXTENSIONS.includes(path.extname(filePath))) {
    return false;
  }

  const basename = path.basename(filePath);

  return !basename.endsWith(".d.ts") && !basename.includes(".test.");
}

function listSourceFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });
  const sourceFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if ([".next", "coverage", "node_modules"].includes(entry.name)) {
        continue;
      }

      sourceFiles.push(...listSourceFiles(entryPath));
      continue;
    }

    if (entry.isFile() && isSourceFile(entryPath)) {
      sourceFiles.push(entryPath);
    }
  }

  return sourceFiles;
}

function readTopLevelDirectives(sourceFile: ts.SourceFile) {
  const directives = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      break;
    }

    directives.add(statement.expression.text);
  }

  return directives;
}

function getNodePosition(sourceFile: ts.SourceFile, node: ts.Node) {
  const { character, line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return {
    column: character + 1,
    line: line + 1,
  };
}

function importDeclarationHasRuntimeValue(
  importDeclaration: ts.ImportDeclaration,
) {
  const importClause = importDeclaration.importClause;

  if (!importClause) {
    return true;
  }

  if (importClause.isTypeOnly) {
    return false;
  }

  if (importClause.name) {
    return true;
  }

  const namedBindings = importClause.namedBindings;

  if (!namedBindings) {
    return false;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    return true;
  }

  return namedBindings.elements.some((element) => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeValue(
  exportDeclaration: ts.ExportDeclaration,
) {
  if (exportDeclaration.isTypeOnly) {
    return false;
  }

  const exportClause = exportDeclaration.exportClause;

  if (!exportClause) {
    return true;
  }

  if (ts.isNamespaceExport(exportClause)) {
    return true;
  }

  return exportClause.elements.some((element) => !element.isTypeOnly);
}

function collectImports(sourceFile: ts.SourceFile) {
  const imports: SourceImport[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      importDeclarationHasRuntimeValue(node)
    ) {
      imports.push({
        ...getNodePosition(sourceFile, node.moduleSpecifier),
        specifier: node.moduleSpecifier.text,
      });
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      exportDeclarationHasRuntimeValue(node)
    ) {
      imports.push({
        ...getNodePosition(sourceFile, node.moduleSpecifier),
        specifier: node.moduleSpecifier.text,
      });
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [moduleSpecifier] = node.arguments;

      if (ts.isStringLiteral(moduleSpecifier)) {
        imports.push({
          ...getNodePosition(sourceFile, moduleSpecifier),
          specifier: moduleSpecifier.text,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return imports;
}

function isProcessEnvExpression(node: ts.Node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

function collectEnvAccesses(sourceFile: ts.SourceFile) {
  const envAccesses: EnvAccess[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      isProcessEnvExpression(node.expression)
    ) {
      envAccesses.push({
        ...getNodePosition(sourceFile, node),
        name: node.name.text,
      });
    }

    if (
      ts.isElementAccessExpression(node) &&
      isProcessEnvExpression(node.expression)
    ) {
      const argumentExpression = node.argumentExpression;

      envAccesses.push({
        ...getNodePosition(sourceFile, node),
        name: ts.isStringLiteral(argumentExpression)
          ? argumentExpression.text
          : null,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return envAccesses;
}

function readSourceModule(filePath: string): SourceModule {
  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );

  return {
    directives: readTopLevelDirectives(sourceFile),
    envAccesses: collectEnvAccesses(sourceFile),
    filePath,
    imports: collectImports(sourceFile),
    sourceFile,
    text,
  };
}

function resolveSourceImport(fromFilePath: string, specifier: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const basePath = specifier.startsWith("@/")
    ? path.join(PROJECT_ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFilePath), specifier);

  const candidates = [
    basePath,
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) =>
      path.join(basePath, `index${extension}`),
    ),
  ];

  return candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

function collectClientReachableModules() {
  const moduleCache = new Map<string, SourceModule>();
  const browserModules = new Map<string, SourceModule>();
  const diagnostics: string[] = [];

  const readCachedModule = (filePath: string) => {
    const normalizedPath = path.normalize(filePath);
    const cachedModule = moduleCache.get(normalizedPath);

    if (cachedModule) {
      return cachedModule;
    }

    const sourceModule = readSourceModule(normalizedPath);

    moduleCache.set(normalizedPath, sourceModule);

    return sourceModule;
  };

  const sourceFiles = SOURCE_ROOTS.flatMap((sourceRoot) =>
    listSourceFiles(sourceRoot),
  );
  const queue = sourceFiles.filter((filePath) =>
    readCachedModule(filePath).directives.has("use client"),
  );
  const queued = new Set(queue.map((filePath) => path.normalize(filePath)));

  for (let index = 0; index < queue.length; index += 1) {
    const filePath = path.normalize(queue[index]);
    const sourceModule = readCachedModule(filePath);

    if (sourceModule.directives.has("use server")) {
      continue;
    }

    browserModules.set(filePath, sourceModule);

    for (const sourceImport of sourceModule.imports) {
      if (sourceImport.specifier === "server-only") {
        diagnostics.push(
          `${toRelativePath(filePath)}:${sourceImport.line}:${sourceImport.column} imports server-only from browser-reachable source.`,
        );
        continue;
      }

      const resolvedPath = resolveSourceImport(
        filePath,
        sourceImport.specifier,
      );

      if (!resolvedPath) {
        continue;
      }

      const resolvedModule = readCachedModule(resolvedPath);

      if (resolvedModule.directives.has("use server")) {
        continue;
      }

      const normalizedResolvedPath = path.normalize(resolvedPath);

      if (!queued.has(normalizedResolvedPath)) {
        queued.add(normalizedResolvedPath);
        queue.push(normalizedResolvedPath);
      }
    }
  }

  return {
    browserModules,
    diagnostics,
  };
}

describe("client secret exposure boundary", () => {
  it("keeps server-only modules, private env reads, and sensitive env names out of browser-reachable source", () => {
    const { browserModules, diagnostics } = collectClientReachableModules();
    const violations = [...diagnostics];

    for (const sourceModule of browserModules.values()) {
      const relativePath = toRelativePath(sourceModule.filePath);

      for (const envAccess of sourceModule.envAccesses) {
        if (!envAccess.name?.startsWith("NEXT_PUBLIC_")) {
          violations.push(
            `${relativePath}:${envAccess.line}:${envAccess.column} reads ${envAccess.name ? `process.env.${envAccess.name}` : "process.env dynamically"} from browser-reachable source.`,
          );
        }
      }

      for (const forbiddenEnvName of FORBIDDEN_CLIENT_ENV_NAMES) {
        if (sourceModule.text.includes(forbiddenEnvName)) {
          violations.push(
            `${relativePath} contains forbidden client-reachable env name ${forbiddenEnvName}.`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("marks server env modules with server-only", () => {
    const violations = SERVER_ENV_MODULES.filter((relativePath) => {
      const absolutePath = path.join(PROJECT_ROOT, relativePath);
      const sourceModule = readSourceModule(absolutePath);

      return !sourceModule.imports.some(
        (sourceImport) => sourceImport.specifier === "server-only",
      );
    });

    expect(violations).toEqual([]);
  });
});
