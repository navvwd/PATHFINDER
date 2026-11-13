// Regenerates packages/shared-types/src/openapi.ts from the FastAPI OpenAPI schema,
// so web and mobile share one type contract derived from the backend.
// Usage: npm run gen:types   (requires the Python venv at .venv)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const py = process.platform === "win32" ? join(root, ".venv", "Scripts", "python.exe") : join(root, ".venv", "bin", "python");
const specPath = join(root, "docs", "api", "openapi.json");
const spec = execFileSync(py, ["-c", "import json; from app.main import app; print(json.dumps(app.openapi(), indent=1))"], {
  cwd: join(root, "backend"),
  env: { ...process.env, AI_PROVIDER: "none" },
  maxBuffer: 64 * 1024 * 1024,
}).toString();
mkdirSync(dirname(specPath), { recursive: true });
writeFileSync(specPath, spec);
execFileSync(process.execPath, [join(root, "node_modules", "openapi-typescript", "bin", "cli.js"), specPath, "-o",
  join(root, "packages", "shared-types", "src", "openapi.ts")], { stdio: "inherit" });
console.log("OpenAPI spec -> docs/api/openapi.json, types -> packages/shared-types/src/openapi.ts");
