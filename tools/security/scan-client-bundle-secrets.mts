import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CLIENT_BUNDLE_DIR = path.join(PROJECT_ROOT, ".next", "static");
const SCANNED_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map"]);
const FORBIDDEN_ENV_NAMES = [
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
] as const;
const SECRET_VALUE_ENV_NAMES = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_ACTIVE_VECTOR_STORE_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Finding = {
  filePath: string;
  kind: "env-name" | "env-value";
  name: string;
};

function toRelativePath(filePath: string) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join("/");
}

function listBundleFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });
  const bundleFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      bundleFiles.push(...listBundleFiles(entryPath));
      continue;
    }

    if (entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      bundleFiles.push(entryPath);
    }
  }

  return bundleFiles;
}

function readNonEmptySecretValues() {
  return SECRET_VALUE_ENV_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();

    return value ? [{ name, value }] : [];
  });
}

if (!fs.existsSync(CLIENT_BUNDLE_DIR)) {
  console.error(
    "Client bundle directory not found. Run `npm run build` before this scan.",
  );
  process.exit(1);
}

const findings: Finding[] = [];
const secretValues = readNonEmptySecretValues();

for (const filePath of listBundleFiles(CLIENT_BUNDLE_DIR)) {
  const content = fs.readFileSync(filePath, "utf8");

  for (const envName of FORBIDDEN_ENV_NAMES) {
    if (content.includes(envName)) {
      findings.push({
        filePath,
        kind: "env-name",
        name: envName,
      });
    }
  }

  for (const { name, value } of secretValues) {
    if (content.includes(value)) {
      findings.push({
        filePath,
        kind: "env-value",
        name,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Client bundle secret exposure scan failed:");

  for (const finding of findings) {
    console.error(
      `- ${toRelativePath(finding.filePath)} contains forbidden ${finding.kind} for ${finding.name}.`,
    );
  }

  process.exit(1);
}

console.log(
  `Client bundle secret exposure scan passed (${listBundleFiles(CLIENT_BUNDLE_DIR).length} files scanned).`,
);
