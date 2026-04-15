import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const root = process.cwd();

async function resolvePiCli() {
  const storeRoot = join(root, "node_modules", ".pnpm");
  const entries = await readdir(storeRoot);
  const pkgDir = entries.find(entry => entry.startsWith("@mariozechner+pi-coding-agent@"));
  if (!pkgDir) {
    throw new Error("Could not find @mariozechner/pi-coding-agent in node_modules/.pnpm");
  }
  return join(storeRoot, pkgDir, "node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js");
}

async function runShell(command, cwd) {
  const cli = await resolvePiCli();
  const fullCommand = command.replaceAll("$PI_CLI", JSON.stringify(cli));
  const { stdout, stderr } = await execFile("/bin/zsh", ["-lc", fullCommand], {
    cwd,
    env: { ...process.env },
    timeout: 60000
  });
  return `${stdout}${stderr}`.trim();
}

function extractJsonPayload(output) {
  const trimmed = output.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  throw new Error(`Could not extract JSON payload from output:\n${output}`);
}

async function smokePrintMode() {
  const extensionPath = resolve(root, "packages/extensions/src/pi-extension.ts");
  const helpOutput = await runShell(
    `node $PI_CLI -p --no-session --no-extensions -e ${JSON.stringify(extensionPath)} "/harness help --json" < /dev/null`,
    root
  );
  const statusOutput = await runShell(
    `node $PI_CLI -p --no-session --no-extensions -e ${JSON.stringify(extensionPath)} "/harness status --json" < /dev/null`,
    root
  );
  JSON.parse(extractJsonPayload(helpOutput));
  JSON.parse(extractJsonPayload(statusOutput));
  process.stdout.write("print-mode smoke: PASS\n");
}

async function smokeInstallMode() {
  const tmp = await mkdtemp(join(tmpdir(), "doo-harness-pi-install-"));
  try {
    await mkdir(join(tmp, ".pi"), { recursive: true });
    const pkgPath = resolve(root, "packages/extensions");
    await runShell(`node $PI_CLI install ${JSON.stringify(pkgPath)} --local >/dev/null`, tmp);
    const settingsRaw = await readFile(join(tmp, ".pi", "settings.json"), "utf8");
    if (!settingsRaw.includes(pkgPath)) {
      throw new Error("Installed package path missing from .pi/settings.json");
    }
    const statusOutput = await runShell(`node $PI_CLI -p --no-session "/harness status --json" < /dev/null`, tmp);
    JSON.parse(extractJsonPayload(statusOutput));
    process.stdout.write("install-mode smoke: PASS\n");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const mode = process.argv[2];

if (mode === "print") {
  await smokePrintMode();
} else if (mode === "install") {
  await smokeInstallMode();
} else {
  process.stderr.write("Usage: node scripts/pi-smoke.mjs <print|install>\n");
  process.exit(1);
}
