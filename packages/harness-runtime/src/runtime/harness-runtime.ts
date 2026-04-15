import { join, relative } from "node:path";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { Agent, createBashTool, createDefaultCodingTools } from "@doo/harness-agent-core";
import {
  complete,
  createModel,
  getModelAuthReadiness,
  type Message,
  type Model,
  type PiSubstrateAdapter
} from "@doo/harness-ai";
import type { ArtifactMeta } from "../artifacts/types.js";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { InProcessFreshExecutor } from "../execution/fresh-context-executor.js";
import { SubprocessFreshExecutor } from "../execution/subprocess-executor.js";
import type { ExecutionRole } from "../execution/types.js";
import { loadRuntimeConfig, type ResolvedRuntimeConfig } from "../config/runtime-config.js";
import { transitionPhase } from "../phases/phase-machine.js";
import type { Phase, RunState } from "../phases/types.js";
import { routeFlow } from "../router/route-flow.js";
import { parseCommand } from "../router/parse-command.js";
import { createInitialTaskState, loadTaskState, saveTaskState, type TaskState } from "../state/task-state.js";
import { loadRunState, saveRunState } from "../state/run-state.js";
import { createHandoff } from "../handoff/handoff-builder.js";
import { buildExecutionPrompt, buildNoChangeRecoveryPrompt, buildVerificationPrompt } from "../context/task-context.js";
import { parseMilestones } from "../context/milestone-tasks.js";
import { parsePlanTasks } from "../context/plan-tasks.js";
import { validateBashCommandForPhase } from "../policy/bash-policy.js";
import { canComplete } from "../verification/verification-gates.js";
import { writeVerificationResult } from "../verification/verifier.js";
import type { RecoveryHint, VerificationResult } from "../verification/types.js";
import { getAllowedToolNamesForPhase } from "../policy/tool-policy.js";
import type { HarnessSession } from "./harness-session.js";

export function createInitialRunState(): RunState {
  return {
    phase: "idle",
    currentFlow: "auto",
    goalSummary: null,
    activeSpecPath: null,
    activePlanPath: null,
    activeMilestoneId: null,
    activeTaskId: null,
    lastVerificationStatus: null,
    lastVerificationPath: null,
    lastReviewPath: null,
    lastHandoffPath: null,
    pendingQuestions: [],
    blocker: null,
    updatedAt: new Date().toISOString()
  };
}

export function createHarnessSession(sessionId: string, cwd: string): HarnessSession {
  return {
    sessionId,
    branchId: "main",
    cwd,
    state: createInitialRunState(),
    taskState: createInitialTaskState()
  };
}

export interface RuntimeStatus {
  phase: string;
  flow: string;
  goalSummary: string | null;
  activeSpecPath: string | null;
  activePlanPath: string | null;
  activeMilestoneId: string | null;
  activeMilestoneText: string | null;
  activeMilestoneStatus: string | null;
  nextMilestoneId: string | null;
  nextMilestoneText: string | null;
  milestoneProgress: string;
  milestoneStatusCounts: string;
  taskProgress: string;
  taskStatusCounts: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  activeTaskStatus: string | null;
  activeTaskKind: string | null;
  activeTaskOwner: string | null;
  activeTaskExpectedOutput: string | null;
  activeTaskOutputPath: string | null;
  activeProvider: string;
  activeModelId: string;
  activeModelTemperature: number | null;
  activeModelMaxTokens: number | null;
  activeExecutionMode: string;
  activeTaskVerifyCommand: string[] | null;
  activeTaskRecoveryHint: RecoveryHint | null;
  lastVerificationStatus: string | null;
  lastVerificationPath: string | null;
  lastReviewPath: string | null;
  lastHandoffPath: string | null;
  handoffEligible: boolean;
  handoffReason: string | null;
  blocker: string | null;
  resumePhase: string | null;
  readyTasks: string[];
  pendingDependencies: string[];
  allowedTools: string[];
  nextAction: string;
}

export interface BlockedEntry {
  taskId: string;
  taskText: string | null;
  blocker: string;
  recoveryHint: string | null;
  recoveryRecommendation: string;
  milestoneId: string | null;
}

export interface BlockedPayload {
  mode: "blocked";
  phase: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  items: BlockedEntry[];
  summary: string;
}

export interface QueueEntry {
  kind: "task" | "artifact";
  priority: "high" | "medium" | "low";
  label: string;
  rationale: string;
  detail: string;
}

export interface QueuePayload {
  mode: "queue";
  queue: "review";
  phase: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  items: QueueEntry[];
  summary: string;
}

export interface PickupPayload {
  mode: "pickup";
  phase: string;
  pickupKind: "active-task" | "blocked" | "ready-task" | "waiting" | "idle";
  activeTaskId: string | null;
  activeTaskText: string | null;
  target: string | null;
  rationale: string;
  nextAction: string | null;
  readyTasks: string[];
  pendingDependencies: string[];
  blocker: string | null;
}

export interface RelatedArtifactEntry {
  kind: "artifact" | "task-output";
  type: string;
  path: string;
  relevance: "exact" | "supporting";
  reason: string;
}

export interface RelatedArtifactsPayload {
  mode: "related";
  targetTaskId: string | null;
  targetTaskText: string | null;
  phase: string;
  items: RelatedArtifactEntry[];
  groups: Array<{ label: string; items: RelatedArtifactEntry[] }>;
  summary: string;
}

export interface TimelineEntry {
  kind: "runtime" | "artifact" | "blocker";
  timestamp: string;
  label: string;
  detail: string;
  path: string | null;
}

export interface TimelinePayload {
  mode: "timeline";
  phase: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  items: TimelineEntry[];
  summary: string;
}

export interface CompletionLoopResult {
  steps: string[];
  stopReason: "completed" | "blocked" | "no_progress" | "max_steps";
  finalPhase: string;
  finalMilestoneId: string | null;
  finalTaskId: string | null;
  blocker: string | null;
  completed: boolean;
}

export interface ProviderRoleReadiness {
  role: "default" | "planner" | "worker" | "validator";
  provider: string;
  modelId: string;
  authSource: "env" | "pi-auth";
  envVar: string;
  credentialLocation: string;
  hasApiKey: boolean;
  status: "ready" | "missing_credentials";
  suggestedAction: string;
  authHeaderName: string;
  authPrefix: string | null;
  baseUrl: string | null;
  apiPath: string | null;
  executionMode: "agent" | "fresh" | "subprocess";
}

export interface ProviderSmokeResult {
  role: "default" | "planner" | "worker" | "validator";
  provider: string;
  modelId: string;
  durationMs: number;
  stopReason: string;
  text: string;
  errorMessage?: string;
}

export interface ProviderDoctorResult {
  role: "default" | "planner" | "worker" | "validator";
  readiness: ProviderRoleReadiness;
  smoke?: ProviderSmokeResult;
}

export interface WebSmokeResult {
  success: boolean;
  url: string;
  statusCode: number | null;
  title: string | null;
  bodySnippet: string;
  durationMs: number;
  errorMessage?: string;
}

export interface WebVerifyResult extends WebSmokeResult {
  snapshotPath?: string;
  consoleLogPath?: string;
}

interface ManagedWebAppProcess {
  child: ReturnType<typeof spawn>;
  url: { value: string };
  output: { value: string };
  startedAt: number;
  terminate: () => Promise<void>;
}

export class HarnessRuntime {
  private readonly artifactStore: FileArtifactStore;
  private readonly freshExecutor = new InProcessFreshExecutor();
  private readonly subprocessExecutor = new SubprocessFreshExecutor();
  private readonly statePath: string;
  private readonly taskStatePath: string;
  private readonly config: ResolvedRuntimeConfig;
  private readonly substrateAdapter: PiSubstrateAdapter | null;
  private session: HarnessSession;

  private constructor(
    cwd: string,
    session: HarnessSession,
    config: ResolvedRuntimeConfig,
    substrateAdapter: PiSubstrateAdapter | null = null
  ) {
    this.session = session;
    this.config = config;
    this.substrateAdapter = substrateAdapter;
    this.statePath = join(cwd, ".harness", "state", "run-state.json");
    this.taskStatePath = join(cwd, ".harness", "artifacts", "task-state.json");
    this.artifactStore = new FileArtifactStore(join(cwd, ".harness", "artifacts"));
  }

  private static reconcileSession(session: HarnessSession): HarnessSession {
    const activeTaskId = session.taskState.activeTaskId ?? session.state.activeTaskId;
    const taskBoundMilestoneId = activeTaskId ? session.taskState.taskMilestones[activeTaskId] ?? null : null;
    const activeMilestoneId =
      taskBoundMilestoneId ??
      session.taskState.activeMilestoneId ??
      session.state.activeMilestoneId;
    const activeTaskStatus = activeTaskId ? session.taskState.tasks[activeTaskId] ?? null : null;
    session.state.activeTaskId = activeTaskId;
    session.taskState.activeTaskId = activeTaskId;
    session.state.activeMilestoneId = activeMilestoneId;
    session.taskState.activeMilestoneId = activeMilestoneId;

    const lastVerificationPath = session.state.lastVerificationPath ?? session.taskState.lastVerificationPath;
    session.state.lastVerificationPath = lastVerificationPath;
    session.taskState.lastVerificationPath = lastVerificationPath;

    const lastVerificationStatus = session.state.lastVerificationStatus ?? session.taskState.lastVerificationStatus;
    const inferredVerificationStatus =
      lastVerificationStatus ??
      (lastVerificationPath
        ? activeTaskStatus === "blocked"
          ? "fail"
          : activeTaskStatus === "validated" || activeTaskStatus === "done"
            ? "pass"
            : null
        : null);
    session.state.lastVerificationStatus = inferredVerificationStatus;
    session.taskState.lastVerificationStatus = inferredVerificationStatus;

    const lastReviewPath = session.state.lastReviewPath ?? session.taskState.lastReviewPath;
    session.state.lastReviewPath = lastReviewPath;
    session.taskState.lastReviewPath = lastReviewPath;

    const lastHandoffPath = session.state.lastHandoffPath ?? session.taskState.lastHandoffPath;
    session.state.lastHandoffPath = lastHandoffPath;
    session.taskState.lastHandoffPath = lastHandoffPath;

    if (activeTaskStatus !== "blocked") {
      session.state.blocker = null;
      if (activeTaskId) {
        delete session.taskState.taskBlockers[activeTaskId];
        delete session.taskState.taskRecoveryHints[activeTaskId];
      }
      session.taskState.blockers = [];
    } else if (session.state.blocker) {
      session.taskState.blockers = Array.from(new Set([...session.taskState.blockers, session.state.blocker]));
      if (activeTaskId && !session.taskState.taskBlockers[activeTaskId]) {
        session.taskState.taskBlockers[activeTaskId] = session.state.blocker;
      }
    } else if (activeTaskId && session.taskState.taskBlockers[activeTaskId]) {
      session.state.blocker = session.taskState.taskBlockers[activeTaskId];
      session.taskState.blockers = Array.from(
        new Set([...session.taskState.blockers, session.taskState.taskBlockers[activeTaskId]])
      );
    }

    return session;
  }

  private static async hydrateSessionMetadata(cwd: string, session: HarnessSession): Promise<HarnessSession> {
    if (session.state.activePlanPath) {
      try {
        const planContent = await readFile(session.state.activePlanPath, "utf8");
        const parsedTasks = parsePlanTasks(planContent);
        const parsedMilestoneIds = Object.keys(session.taskState.milestones).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );
        for (const [index, task] of parsedTasks.entries()) {
          if (!session.taskState.taskTexts[task.id]) {
            session.taskState.taskTexts[task.id] = task.text;
          }
          if (!session.taskState.taskMilestones[task.id]) {
            if (task.milestoneId) {
              session.taskState.taskMilestones[task.id] = task.milestoneId;
            } else if (parsedMilestoneIds[index]) {
              session.taskState.taskMilestones[task.id] = parsedMilestoneIds[index];
            }
          }
          if (task.kind && !session.taskState.taskKinds[task.id]) {
            session.taskState.taskKinds[task.id] = task.kind;
          }
          if (task.owner && !session.taskState.taskOwners[task.id]) {
            session.taskState.taskOwners[task.id] = task.owner;
          }
          if (task.expectedOutput && !session.taskState.taskExpectedOutputs[task.id]) {
            session.taskState.taskExpectedOutputs[task.id] = task.expectedOutput;
          }
          if (task.verifyCommands && !session.taskState.taskVerificationCommands[task.id]) {
            session.taskState.taskVerificationCommands[task.id] = task.verifyCommands;
          }
          if (task.dependsOn && !session.taskState.taskDependencies[task.id]) {
            session.taskState.taskDependencies[task.id] = task.dependsOn;
          }
        }
      } catch {
        // Keep existing persisted state when plan hydration is unavailable.
      }
    }

    try {
      const milestonesPath = join(cwd, ".harness", "artifacts", "milestones.md");
      const milestonesContent = await readFile(milestonesPath, "utf8");
      for (const milestone of parseMilestones(milestonesContent)) {
        if (!session.taskState.milestoneTexts[milestone.id]) {
          session.taskState.milestoneTexts[milestone.id] = milestone.text;
        }
        if (milestone.kind && !session.taskState.milestoneKinds[milestone.id]) {
          session.taskState.milestoneKinds[milestone.id] = milestone.kind;
        }
        if (milestone.dependsOn && !session.taskState.milestoneDependencies[milestone.id]) {
          session.taskState.milestoneDependencies[milestone.id] = milestone.dependsOn;
        }
      }
    } catch {
      // Keep existing persisted state when milestone hydration is unavailable.
    }

    return session;
  }

  private async captureWorkspaceFileSnapshot(root = this.session.cwd): Promise<Map<string, string>> {
    const snapshot = new Map<string, string>();

    const visit = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".harness" || entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        const absolutePath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const fileStat = await stat(absolutePath);
        snapshot.set(relative(root, absolutePath), `${fileStat.size}:${fileStat.mtimeMs}`);
      }
    };

    await visit(root);
    return snapshot;
  }

  private diffWorkspaceSnapshots(before: Map<string, string>, after: Map<string, string>): string[] {
    const changed = new Set<string>();

    for (const [path, fingerprint] of before.entries()) {
      if (!after.has(path) || after.get(path) !== fingerprint) {
        changed.add(path);
      }
    }

    for (const path of after.keys()) {
      if (!before.has(path)) {
        changed.add(path);
      }
    }

    return [...changed].sort();
  }

  private inferNodeCliName(): string | null {
    const goal = this.session.state.goalSummary ?? "";
    const explicit = goal.match(/CLI called ([a-z0-9-]+)/i);
    if (explicit?.[1]) {
      return explicit[1].toLowerCase();
    }
    if (/node\.?js cli/i.test(goal)) {
      return "app-cli";
    }
    return null;
  }

  private isCatalogWebappGoal(): boolean {
    const goal = (this.session.state.goalSummary ?? "").toLowerCase();
    const mentionsWeb =
      goal.includes("webapp") || goal.includes("web app") || goal.includes("website");
    const mentionsCatalog =
      goal.includes("catalog") || goal.includes("catalogue") || goal.includes("product promotional");
    return mentionsWeb && mentionsCatalog;
  }

  private isReactViteCatalogWebappGoal(): boolean {
    const goal = (this.session.state.goalSummary ?? "").toLowerCase();
    return this.isCatalogWebappGoal() && goal.includes("react") && goal.includes("vite");
  }

  private isNextCatalogWebappGoal(): boolean {
    const goal = (this.session.state.goalSummary ?? "").toLowerCase();
    return this.isCatalogWebappGoal() && (goal.includes("next.js") || goal.includes("nextjs") || goal.includes("next "));
  }

  private getBootstrapScaffoldFiles(): string[] {
    if (this.isNextCatalogWebappGoal()) {
      return [
        "package.json",
        "README.md",
        "app/layout.jsx",
        "app/page.jsx",
        "app/catalog-client.jsx",
        "app/globals.css",
        "src/catalog.js",
        "src/inquiry.js",
        "src/data/products.js",
        "tests/catalog.test.js"
      ];
    }
    if (this.isReactViteCatalogWebappGoal()) {
      return [
        "package.json",
        "README.md",
        "index.html",
        "styles.css",
        "src/main.jsx",
        "src/App.jsx",
        "src/catalog.js",
        "src/inquiry.js",
        "src/data/products.js",
        "tests/catalog.test.js"
      ];
    }
    if (this.isCatalogWebappGoal()) {
      return [
        "package.json",
        "README.md",
        "index.html",
        "styles.css",
        "scripts/serve-static.js",
        "src/app.js",
        "src/catalog.js",
        "src/inquiry.js",
        "src/data/products.js",
        "tests/catalog.test.js"
      ];
    }
    const cliName = this.inferNodeCliName();
    if (!cliName) {
      return [];
    }
    return [
      "package.json",
      "README.md",
      `src/${cliName}.js`,
      `bin/${cliName}.js`,
      `tests/${cliName}.test.js`
    ];
  }

  private inferNodeCliCommands(): string[] {
    const goal = this.session.state.goalSummary ?? "";
    const match = goal.match(/supports? (.+?) commands?/i);
    if (!match?.[1]) {
      return ["add", "list"];
    }
    const commands = match[1]
      .replace(/\band\b/gi, ",")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
    return commands.length > 0 ? commands : ["add", "list"];
  }

  private async bootstrapBlankNodeCliProjectIfNeeded(taskId: string, role: ExecutionRole | null): Promise<void> {
    if (role !== "worker") {
      return;
    }
    if ((this.session.taskState.taskKinds[taskId] ?? null) !== "implementation") {
      return;
    }

    const cliName = this.inferNodeCliName();
    if (!cliName) {
      return;
    }

    try {
      await readFile(join(this.session.cwd, "package.json"), "utf8");
      return;
    } catch {
      // fall through
    }

    await mkdir(join(this.session.cwd, "src"), { recursive: true });
    await mkdir(join(this.session.cwd, "bin"), { recursive: true });
    await mkdir(join(this.session.cwd, "tests"), { recursive: true });

    const packageJson = {
      name: cliName,
      version: "0.1.0",
      private: true,
      type: "module",
      bin: {
        [cliName]: `./bin/${cliName}.js`
      },
      scripts: {
        test: "node --test tests/**/*.test.js"
      }
    };
    const storageFile = `${cliName}.tasks.json`;
    const commands = this.inferNodeCliCommands();
    const commandUsage = commands.map(command => `${cliName} ${command}`).join("\n");
    const supports = new Set(commands);
    const genericCommands = commands.filter(
      command => !["add", "list", "done", "remove", "stats"].includes(command)
    );
    const commandCases = [
      supports.has("add")
        ? `    case "add": {
      const text = args.join(" ").trim();
      if (!text) {
        throw new Error('Missing task text for add');
      }
      const nextTask = { id: String(tasks.length + 1), text, done: false };
      const updated = [...tasks, nextTask];
      await saveTasks(updated, cwd);
      return nextTask;
    }`
        : null,
      supports.has("list")
        ? `    case "list": {
      return tasks;
    }`
        : null,
      supports.has("done")
        ? `    case "done": {
      const id = args[0];
      if (!id) {
        throw new Error('Missing task id for done');
      }
      const updated = tasks.map(task => task.id === id ? { ...task, done: true } : task);
      await saveTasks(updated, cwd);
      return updated.find(task => task.id === id) ?? null;
    }`
        : null,
      supports.has("remove")
        ? `    case "remove": {
      const id = args[0];
      if (!id) {
        throw new Error('Missing task id for remove');
      }
      const updated = tasks.filter(task => task.id !== id);
      await saveTasks(updated, cwd);
      return { removed: tasks.length !== updated.length };
    }`
        : null,
      supports.has("stats")
        ? `    case "stats": {
      return {
        total: tasks.length,
        done: tasks.filter(task => task.done).length,
        pending: tasks.filter(task => !task.done).length
      };
    }`
        : null
    ]
      .concat(
        genericCommands.map(
          command => `    case "${command}": {
      return { ok: true, command: "${command}", args };
    }`
        )
      )
      .filter((value): value is string => value !== null)
      .join("\n");

    const commandTestBlocks = [
      supports.has("add")
        ? `test("${cliName} adds a task and persists it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "${cliName}-"));
  try {
    const added = await run(["add", "buy milk"], cwd);
    assert.equal(added.id, "1");
    assert.equal(added.text, "buy milk");
    const stored = JSON.parse(await readFile(join(cwd, "${storageFile}"), "utf8"));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].text, "buy milk");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});`
        : null,
      supports.has("list")
        ? `test("${cliName} lists persisted tasks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "${cliName}-"));
  try {
    await writeFile(join(cwd, "${storageFile}"), JSON.stringify([{ id: "1", text: "buy milk", done: false }], null, 2) + "\\n", "utf8");
    const listed = await run(["list"], cwd);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].text, "buy milk");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});`
        : null,
      supports.has("done")
        ? `test("${cliName} marks a task as done", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "${cliName}-"));
  try {
    await writeFile(join(cwd, "${storageFile}"), JSON.stringify([{ id: "1", text: "buy milk", done: false }], null, 2) + "\\n", "utf8");
    const updated = await run(["done", "1"], cwd);
    assert.equal(updated.done, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});`
        : null,
      supports.has("remove")
        ? `test("${cliName} removes a task", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "${cliName}-"));
  try {
    await writeFile(join(cwd, "${storageFile}"), JSON.stringify([{ id: "1", text: "buy milk", done: false }], null, 2) + "\\n", "utf8");
    const result = await run(["remove", "1"], cwd);
    assert.equal(result.removed, true);
    const listed = await run(["list"], cwd);
    assert.equal(listed.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});`
        : null,
      supports.has("stats")
        ? `test("${cliName} reports task stats", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "${cliName}-"));
  try {
    await writeFile(join(cwd, "${storageFile}"), JSON.stringify([
      { id: "1", text: "buy milk", done: false },
      { id: "2", text: "ship code", done: true }
    ], null, 2) + "\\n", "utf8");
    const stats = await run(["stats"], cwd);
    assert.deepEqual(stats, { total: 2, done: 1, pending: 1 });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});`
        : null
    ]
      .concat(
        genericCommands.map(
          command => `test("${cliName} ${command} command", async () => {
  const result = await run(["${command}", "example"], process.cwd());
  assert.equal(result.ok, true);
  assert.equal(result.command, "${command}");
});`
        )
      )
      .filter((value): value is string => value !== null)
      .join("\n\n");

    await writeFile(join(this.session.cwd, "package.json"), JSON.stringify(packageJson, null, 2) + "\n", "utf8");
    await writeFile(
      join(this.session.cwd, "README.md"),
      `# ${cliName}\n\nDependency-free Node.js CLI scaffold generated by harness bootstrap.\n\n## Data File\n\n- \`${storageFile}\`\n\n## Planned Commands\n\n${commands.map(command => `- \`${command}\``).join("\n")}\n\n## Usage\n\n\`\`\`bash\n${commandUsage}\n\`\`\`\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "src", `${cliName}.js`),
      `import { readFile, writeFile } from "node:fs/promises";\nimport { join } from "node:path";\n\nconst STORAGE_FILE = "${storageFile}";\n\nexport async function loadTasks(cwd = process.cwd()) {\n  try {\n    const raw = await readFile(join(cwd, STORAGE_FILE), "utf8");\n    return JSON.parse(raw);\n  } catch {\n    return [];\n  }\n}\n\nexport async function saveTasks(tasks, cwd = process.cwd()) {\n  await writeFile(join(cwd, STORAGE_FILE), JSON.stringify(tasks, null, 2) + "\\n", "utf8");\n}\n\nexport async function run(argv, cwd = process.cwd()) {\n  const [command, ...args] = argv;\n  const tasks = await loadTasks(cwd);\n\n  switch (command) {\n${commandCases}\n    default:\n      throw new Error(\`Unknown command: \${command ?? "(none)"}\`);\n  }\n}\n\nexport async function main(argv = process.argv.slice(2), cwd = process.cwd()) {\n  const result = await run(argv, cwd);\n  if (result !== undefined) {\n    console.log(JSON.stringify(result));\n  }\n}\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "bin", `${cliName}.js`),
      `#!/usr/bin/env node\nimport { main } from "../src/${cliName}.js";\n\nawait main();\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "tests", `${cliName}.test.js`),
      `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";\nimport { tmpdir } from "node:os";\nimport { join } from "node:path";\nimport { run } from "../src/${cliName}.js";\n\n${commandTestBlocks}\n`,
      "utf8"
    );
  }

  private async bootstrapCatalogWebappIfNeeded(taskId: string, role: ExecutionRole | null): Promise<void> {
    if (role !== "worker") {
      return;
    }
    if ((this.session.taskState.taskKinds[taskId] ?? null) !== "implementation") {
      return;
    }
    if (!this.isCatalogWebappGoal()) {
      return;
    }

    try {
      await readFile(join(this.session.cwd, "package.json"), "utf8");
      return;
    } catch {
      // fall through
    }

    if (this.isNextCatalogWebappGoal()) {
      await mkdir(join(this.session.cwd, "app"), { recursive: true });
      await mkdir(join(this.session.cwd, "src", "data"), { recursive: true });
      await mkdir(join(this.session.cwd, "tests"), { recursive: true });

      await writeFile(
        join(this.session.cwd, "package.json"),
        JSON.stringify(
          {
            name: "catalog-webapp",
            version: "0.1.0",
            private: true,
            type: "module",
            scripts: {
              start: "next dev",
              build: "next build",
              test: "node --test tests/**/*.test.js"
            },
            dependencies: {
              next: "^15.0.0",
              react: "^19.0.0",
              "react-dom": "^19.0.0"
            }
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "README.md"),
        `# Clothing Catalog Webapp\n\nMinimal Next.js promotional catalog bootstrap generated by harness.\n\n## Demo\n\n- \`pnpm install\`\n- \`pnpm run start\`\n- \`pnpm run test\`\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "app", "globals.css"),
        `:root {\n  color-scheme: light;\n  --bg: #f5efe6;\n  --ink: #1c1712;\n  --accent: #8d3d21;\n  --card: #fff9f1;\n}\nbody {\n  margin: 0;\n  font-family: Georgia, "Times New Roman", serif;\n  background: radial-gradient(circle at top, #fff7ed, var(--bg));\n  color: var(--ink);\n}\n.hero, .catalog-shell, .cta-panel {\n  padding: 24px;\n}\n.catalog-shell {\n  display: grid;\n  grid-template-columns: 240px 1fr;\n  gap: 24px;\n}\n.catalog-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 16px;\n}\n.catalog-card, .product-detail, .cta-panel, .filters {\n  background: var(--card);\n  border-radius: 16px;\n  padding: 16px;\n}\nbutton {\n  background: var(--accent);\n  color: white;\n  border: none;\n  border-radius: 999px;\n  padding: 10px 16px;\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "app", "layout.jsx"),
        `import "./globals.css";\n\nexport const metadata = {\n  title: "Clothing Catalog"\n};\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>\n        <div>Catalog Layout</div>\n        {children}\n      </body>\n    </html>\n  );\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "app", "page.jsx"),
        `import { CatalogClient } from "./catalog-client.jsx";\n\nexport default function Page() {\n  return <CatalogClient />;\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "data", "products.js"),
        `export const products = [\n  {\n    id: "p1",\n    slug: "linen-blazer",\n    name: "Linen Blazer",\n    category: "Outerwear",\n    tags: ["formal", "summer"],\n    season: "Summer",\n    shortDescription: "Lightweight linen tailoring.",\n    longDescription: "A breathable blazer designed for warm-weather tailoring.",\n    materials: ["Linen", "Cotton"],\n    sizes: ["S", "M", "L"],\n    colors: ["Sand"],\n    featured: true\n  },\n  {\n    id: "p2",\n    slug: "utility-shirt",\n    name: "Utility Shirt",\n    category: "Tops",\n    tags: ["casual", "layering"],\n    season: "Spring",\n    shortDescription: "Structured overshirt for layered looks.",\n    longDescription: "A versatile overshirt with utility pockets and relaxed structure.",\n    materials: ["Twill"],\n    sizes: ["M", "L"],\n    colors: ["Olive"],\n    featured: false\n  }\n];\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "catalog.js"),
        `export function filterProducts(products, filters) {\n  return products.filter(product => {\n    if (filters.category && product.category !== filters.category) return false;\n    if (filters.season && product.season !== filters.season) return false;\n    if (filters.tag && !product.tags.includes(filters.tag)) return false;\n    return true;\n  });\n}\n\nexport function getProductBySlug(products, slug) {\n  return products.find(product => product.slug === slug) ?? null;\n}\n\nexport function listOptions(products, key) {\n  const values = new Set();\n  for (const product of products) {\n    const value = product[key];\n    if (Array.isArray(value)) {\n      for (const item of value) values.add(item);\n    } else if (value) {\n      values.add(value);\n    }\n  }\n  return [...values];\n}\n\nexport function filtersToQuery(filters) {\n  const params = new URLSearchParams();\n  for (const [key, value] of Object.entries(filters)) {\n    if (value) params.set(key, value);\n  }\n  return params.toString();\n}\n\nexport function queryToFilters(search) {\n  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);\n  return {\n    category: params.get('category') ?? '',\n    season: params.get('season') ?? '',\n    tag: params.get('tag') ?? ''\n  };\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "inquiry.js"),
        `export function submitInquiryLead(fields) {\n  return {\n    ok: true,\n    lead: {\n      productSlug: fields.productSlug ?? null,\n      name: fields.name ?? '',\n      email: fields.email ?? '',\n      message: fields.message ?? '',\n      createdAt: 'stubbed-timestamp'\n    },\n    notice: 'Inquiry captured. We will follow up soon.'\n  };\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "app", "catalog-client.jsx"),
        `"use client";\n\nimport { useState } from "react";\nimport { products } from "../src/data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, listOptions, queryToFilters } from "../src/catalog.js";\nimport { submitInquiryLead } from "../src/inquiry.js";\n\nexport function CatalogClient() {\n  const [filters, setFilters] = useState(queryToFilters(typeof window === "undefined" ? "" : window.location.search));\n  const [selectedSlug, setSelectedSlug] = useState(products[0]?.slug ?? null);\n  const [notice, setNotice] = useState("");\n  const filtered = filterProducts(products, filters);\n  const product = getProductBySlug(products, selectedSlug);\n  const options = {\n    category: listOptions(products, "category"),\n    season: listOptions(products, "season"),\n    tag: listOptions(products, "tags")\n  };\n\n  const updateFilter = key => event => {\n    const next = { ...filters, [key]: event.target.value };\n    setFilters(next);\n    const query = filtersToQuery(next);\n    window.history.replaceState(null, "", query ? '?' + query : window.location.pathname);\n  };\n\n  const submit = event => {\n    event.preventDefault();\n    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());\n    const result = submitInquiryLead({ ...fields, productSlug: product?.slug ?? null });\n    setNotice(result.notice);\n  };\n\n  return (\n    <>\n      <header className="hero">\n        <div>\n          <p className="eyebrow">Seasonal Collection</p>\n          <h1>Interactive clothing catalog</h1>\n          <p>Browse the latest looks, filter the catalog, and inspect rich product detail views.</p>\n        </div>\n      </header>\n      <main>\n        <section className="catalog-shell">\n          <aside className="filters">\n            <label>Category<select value={filters.category} onChange={updateFilter("category")}><option value="">All</option>{options.category.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n            <label>Season<select value={filters.season} onChange={updateFilter("season")}><option value="">All</option>{options.season.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n            <label>Tag<select value={filters.tag} onChange={updateFilter("tag")}><option value="">All</option>{options.tag.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n          </aside>\n          <section className="catalog-grid">{filtered.map(item => <article key={item.id} className="catalog-card"><h3>{item.name}</h3><p>{item.shortDescription}</p><button onClick={() => setSelectedSlug(item.slug)}>View details</button></article>)}</section>\n        </section>\n        <section className="product-detail">{product ? <><h2>{product.name}</h2><p>{product.longDescription}</p><p><strong>Materials:</strong> {product.materials.join(", ")}</p><p><strong>Sizes:</strong> {product.sizes.join(", ")}</p></> : <p>Select a product to inspect its details.</p>}</section>\n        <section className="cta-panel">\n          <h2>Interest / Inquiry</h2>\n          <form onSubmit={submit}>\n            <input name="name" placeholder="Your name" />\n            <input name="email" placeholder="Email" />\n            <textarea name="message" placeholder="Tell us what you need"></textarea>\n            <button type="submit">Send inquiry</button>\n          </form>\n          <p>{notice}</p>\n        </section>\n      </main>\n    </>\n  );\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "tests", "catalog.test.js"),
        `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { products } from "../src/data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, queryToFilters } from "../src/catalog.js";\nimport { submitInquiryLead } from "../src/inquiry.js";\n\ntest("filterProducts filters by category", () => {\n  const filtered = filterProducts(products, { category: "Outerwear", season: "", tag: "" });\n  assert.equal(filtered.length, 1);\n  assert.equal(filtered[0].slug, "linen-blazer");\n});\n\ntest("getProductBySlug returns a product detail record", () => {\n  const product = getProductBySlug(products, "linen-blazer");\n  assert.equal(product?.name, "Linen Blazer");\n});\n\ntest("filtersToQuery and queryToFilters round-trip filter state", () => {\n  const query = filtersToQuery({ category: "Outerwear", season: "Summer", tag: "formal" });\n  assert.equal(query, "category=Outerwear&season=Summer&tag=formal");\n  assert.deepEqual(queryToFilters(query), { category: "Outerwear", season: "Summer", tag: "formal" });\n});\n\ntest("submitInquiryLead returns a success payload", () => {\n  const result = submitInquiryLead({ productSlug: "linen-blazer", name: "Avery", email: "avery@example.com", message: "Need line sheet" });\n  assert.equal(result.ok, true);\n  assert.equal(result.lead.productSlug, "linen-blazer");\n});\n`,
        "utf8"
      );
      return;
    }

    if (this.isReactViteCatalogWebappGoal()) {
      await mkdir(join(this.session.cwd, "src", "data"), { recursive: true });
      await mkdir(join(this.session.cwd, "tests"), { recursive: true });

      await writeFile(
        join(this.session.cwd, "package.json"),
        JSON.stringify(
          {
            name: "catalog-webapp",
            version: "0.1.0",
            private: true,
            type: "module",
            scripts: {
              start: "vite",
              build: "vite build",
              test: "node --test tests/**/*.test.js"
            },
            dependencies: {
              react: "^19.0.0",
              "react-dom": "^19.0.0"
            },
            devDependencies: {
              vite: "^7.0.0"
            }
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "README.md"),
        `# Clothing Catalog Webapp\n\nMinimal React + Vite promotional catalog bootstrap generated by harness.\n\n## Demo\n\n- \`pnpm install\`\n- \`pnpm run start\`\n- \`pnpm run test\`\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "index.html"),
      `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Clothing Catalog</title>\n    <link rel="icon" href="data:," />\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "styles.css"),
        `:root {\n  color-scheme: light;\n  --bg: #f5efe6;\n  --ink: #1c1712;\n  --accent: #8d3d21;\n  --card: #fff9f1;\n}\nbody {\n  margin: 0;\n  font-family: Georgia, "Times New Roman", serif;\n  background: radial-gradient(circle at top, #fff7ed, var(--bg));\n  color: var(--ink);\n}\n.hero, .catalog-shell, .cta-panel {\n  padding: 24px;\n}\n.catalog-shell {\n  display: grid;\n  grid-template-columns: 240px 1fr;\n  gap: 24px;\n}\n.catalog-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 16px;\n}\n.catalog-card, .product-detail, .cta-panel, .filters {\n  background: var(--card);\n  border-radius: 16px;\n  padding: 16px;\n}\nbutton {\n  background: var(--accent);\n  color: white;\n  border: none;\n  border-radius: 999px;\n  padding: 10px 16px;\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "data", "products.js"),
        `export const products = [\n  {\n    id: "p1",\n    slug: "linen-blazer",\n    name: "Linen Blazer",\n    category: "Outerwear",\n    tags: ["formal", "summer"],\n    season: "Summer",\n    shortDescription: "Lightweight linen tailoring.",\n    longDescription: "A breathable blazer designed for warm-weather tailoring.",\n    materials: ["Linen", "Cotton"],\n    sizes: ["S", "M", "L"],\n    colors: ["Sand"],\n    featured: true\n  },\n  {\n    id: "p2",\n    slug: "utility-shirt",\n    name: "Utility Shirt",\n    category: "Tops",\n    tags: ["casual", "layering"],\n    season: "Spring",\n    shortDescription: "Structured overshirt for layered looks.",\n    longDescription: "A versatile overshirt with utility pockets and relaxed structure.",\n    materials: ["Twill"],\n    sizes: ["M", "L"],\n    colors: ["Olive"],\n    featured: false\n  }\n];\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "catalog.js"),
        `export function filterProducts(products, filters) {\n  return products.filter(product => {\n    if (filters.category && product.category !== filters.category) return false;\n    if (filters.season && product.season !== filters.season) return false;\n    if (filters.tag && !product.tags.includes(filters.tag)) return false;\n    return true;\n  });\n}\n\nexport function getProductBySlug(products, slug) {\n  return products.find(product => product.slug === slug) ?? null;\n}\n\nexport function listOptions(products, key) {\n  const values = new Set();\n  for (const product of products) {\n    const value = product[key];\n    if (Array.isArray(value)) {\n      for (const item of value) values.add(item);\n    } else if (value) {\n      values.add(value);\n    }\n  }\n  return [...values];\n}\n\nexport function filtersToQuery(filters) {\n  const params = new URLSearchParams();\n  for (const [key, value] of Object.entries(filters)) {\n    if (value) params.set(key, value);\n  }\n  return params.toString();\n}\n\nexport function queryToFilters(search) {\n  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);\n  return {\n    category: params.get('category') ?? '',\n    season: params.get('season') ?? '',\n    tag: params.get('tag') ?? ''\n  };\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "inquiry.js"),
        `export function submitInquiryLead(fields) {\n  return {\n    ok: true,\n    lead: {\n      productSlug: fields.productSlug ?? null,\n      name: fields.name ?? '',\n      email: fields.email ?? '',\n      message: fields.message ?? '',\n      createdAt: 'stubbed-timestamp'\n    },\n    notice: 'Inquiry captured. We will follow up soon.'\n  };\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "App.jsx"),
        `import { useState } from "react";\nimport { products } from "./data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, listOptions, queryToFilters } from "./catalog.js";\nimport { submitInquiryLead } from "./inquiry.js";\nimport "../styles.css";\n\nexport function CatalogApp() {\n  const [filters, setFilters] = useState(queryToFilters(window.location.search));\n  const [selectedSlug, setSelectedSlug] = useState(products[0]?.slug ?? null);\n  const [notice, setNotice] = useState(\"\");\n  const filtered = filterProducts(products, filters);\n  const product = getProductBySlug(products, selectedSlug);\n  const options = {\n    category: listOptions(products, "category"),\n    season: listOptions(products, "season"),\n    tag: listOptions(products, "tags")\n  };\n\n  const updateFilter = key => event => {\n    const next = { ...filters, [key]: event.target.value };\n    setFilters(next);\n    const query = filtersToQuery(next);\n    window.history.replaceState(null, "", query ? '?' + query : window.location.pathname);\n  };\n\n  const submit = event => {\n    event.preventDefault();\n    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());\n    const result = submitInquiryLead({ ...fields, productSlug: product?.slug ?? null });\n    setNotice(result.notice);\n  };\n\n  return (\n    <>\n      <header className="hero">\n        <div>\n          <p className="eyebrow">Seasonal Collection</p>\n          <h1>Interactive clothing catalog</h1>\n          <p>Browse the latest looks, filter the catalog, and inspect rich product detail views.</p>\n        </div>\n      </header>\n      <main>\n        <section className="catalog-shell">\n          <aside className="filters">\n            <label>Category<select value={filters.category} onChange={updateFilter("category")}><option value="">All</option>{options.category.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n            <label>Season<select value={filters.season} onChange={updateFilter("season")}><option value="">All</option>{options.season.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n            <label>Tag<select value={filters.tag} onChange={updateFilter("tag")}><option value="">All</option>{options.tag.map(value => <option key={value} value={value}>{value}</option>)}</select></label>\n          </aside>\n          <section className="catalog-grid">{filtered.map(item => <article key={item.id} className="catalog-card"><h3>{item.name}</h3><p>{item.shortDescription}</p><button onClick={() => setSelectedSlug(item.slug)}>View details</button></article>)}</section>\n        </section>\n        <section className="product-detail">{product ? <><h2>{product.name}</h2><p>{product.longDescription}</p><p><strong>Materials:</strong> {product.materials.join(", ")}</p><p><strong>Sizes:</strong> {product.sizes.join(", ")}</p></> : <p>Select a product to inspect its details.</p>}</section>\n        <section className="cta-panel">\n          <h2>Interest / Inquiry</h2>\n          <form onSubmit={submit}>\n            <input name="name" placeholder="Your name" />\n            <input name="email" placeholder="Email" />\n            <textarea name="message" placeholder="Tell us what you need"></textarea>\n            <button type="submit">Send inquiry</button>\n          </form>\n          <p>{notice}</p>\n        </section>\n      </main>\n    </>\n  );\n}\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "src", "main.jsx"),
        `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport { CatalogApp } from "./App.jsx";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <CatalogApp />\n  </React.StrictMode>\n);\n`,
        "utf8"
      );
      await writeFile(
        join(this.session.cwd, "tests", "catalog.test.js"),
        `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { products } from "../src/data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, queryToFilters } from "../src/catalog.js";\nimport { submitInquiryLead } from "../src/inquiry.js";\n\ntest("filterProducts filters by category", () => {\n  const filtered = filterProducts(products, { category: "Outerwear", season: "", tag: "" });\n  assert.equal(filtered.length, 1);\n  assert.equal(filtered[0].slug, "linen-blazer");\n});\n\ntest("getProductBySlug returns a product detail record", () => {\n  const product = getProductBySlug(products, "linen-blazer");\n  assert.equal(product?.name, "Linen Blazer");\n});\n\ntest("filtersToQuery and queryToFilters round-trip filter state", () => {\n  const query = filtersToQuery({ category: "Outerwear", season: "Summer", tag: "formal" });\n  assert.equal(query, "category=Outerwear&season=Summer&tag=formal");\n  assert.deepEqual(queryToFilters(query), { category: "Outerwear", season: "Summer", tag: "formal" });\n});\n\ntest("submitInquiryLead returns a success payload", () => {\n  const result = submitInquiryLead({ productSlug: "linen-blazer", name: "Avery", email: "avery@example.com", message: "Need line sheet" });\n  assert.equal(result.ok, true);\n  assert.equal(result.lead.productSlug, "linen-blazer");\n});\n`,
        "utf8"
      );
      return;
    }

    await mkdir(join(this.session.cwd, "src", "data"), { recursive: true });
    await mkdir(join(this.session.cwd, "tests"), { recursive: true });
    await mkdir(join(this.session.cwd, "scripts"), { recursive: true });

    await writeFile(
      join(this.session.cwd, "package.json"),
      JSON.stringify(
        {
          name: "catalog-webapp",
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            start: "node scripts/serve-static.js",
            test: "node --test tests/**/*.test.js"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "README.md"),
      `# Clothing Catalog Webapp\n\nDependency-free promotional catalog bootstrap generated by harness.\n\n## Features\n\n- branded landing hero\n- catalog grid\n- category, tag, and season filters\n- URL-backed filter state\n- product detail view\n- inquiry CTA success state\n\n## Demo\n\n- \`pnpm run start\`\n- open the printed local URL\n- \`pnpm run test\`\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "scripts", "serve-static.js"),
      `import { createServer } from "node:http";\nimport { readFile } from "node:fs/promises";\nimport { extname, join } from "node:path";\n\nconst port = Number.parseInt(process.env.PORT ?? "4173", 10);\nconst root = process.cwd();\nconst contentTypes = {\n  ".html": "text/html; charset=utf-8",\n  ".js": "text/javascript; charset=utf-8",\n  ".css": "text/css; charset=utf-8",\n  ".json": "application/json; charset=utf-8"\n};\n\ncreateServer(async (req, res) => {\n  const url = new URL(req.url ?? "/", "http://127.0.0.1");\n  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;\n  const filePath = join(root, pathname);\n  try {\n    const body = await readFile(filePath);\n    res.statusCode = 200;\n    res.setHeader("content-type", contentTypes[extname(filePath)] ?? "text/plain; charset=utf-8");\n    res.end(body);\n  } catch {\n    res.statusCode = 404;\n    res.end("Not found");\n  }\n}).listen(port, "127.0.0.1", () => {\n  console.log(\`Catalog app ready at http://127.0.0.1:\${port}\`);\n});\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "index.html"),
      `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Clothing Catalog</title>\n    <link rel="icon" href="data:," />\n    <link rel="stylesheet" href="./styles.css" />\n  </head>\n  <body>\n    <header class="hero">\n      <div>\n        <p class="eyebrow">Seasonal Collection</p>\n        <h1>Interactive clothing catalog</h1>\n        <p>Browse the latest looks, filter the catalog, and open rich product detail views.</p>\n      </div>\n    </header>\n    <main>\n      <section class="catalog-shell">\n        <aside class="filters">\n          <label>Category <select id="category-filter"></select></label>\n          <label>Season <select id="season-filter"></select></label>\n          <label>Tag <select id="tag-filter"></select></label>\n        </aside>\n        <section>\n          <div id="catalog-grid" class="catalog-grid"></div>\n        </section>\n      </section>\n      <section id="product-detail" class="product-detail"></section>\n      <section class="cta-panel">\n        <h2>Interest / Inquiry</h2>\n        <form id="inquiry-form">\n          <input name="name" placeholder="Your name" />\n          <input name="email" placeholder="Email" />\n          <textarea name="message" placeholder="Tell us what you need"></textarea>\n          <button type="submit">Send inquiry</button>\n        </form>\n        <p id="inquiry-status"></p>\n      </section>\n    </main>\n    <script type=\"module\" src=\"./src/app.js\"></script>\n  </body>\n</html>\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "styles.css"),
      `:root {\n  color-scheme: light;\n  --bg: #f5efe6;\n  --ink: #1c1712;\n  --accent: #8d3d21;\n  --card: #fff9f1;\n}\nbody {\n  margin: 0;\n  font-family: Georgia, \"Times New Roman\", serif;\n  background: radial-gradient(circle at top, #fff7ed, var(--bg));\n  color: var(--ink);\n}\n.hero, .catalog-shell, .cta-panel {\n  padding: 24px;\n}\n.catalog-shell {\n  display: grid;\n  grid-template-columns: 240px 1fr;\n  gap: 24px;\n}\n.catalog-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 16px;\n}\n.catalog-card, .product-detail, .cta-panel, .filters {\n  background: var(--card);\n  border-radius: 16px;\n  padding: 16px;\n}\nbutton {\n  background: var(--accent);\n  color: white;\n  border: none;\n  border-radius: 999px;\n  padding: 10px 16px;\n}\n@media (max-width: 800px) {\n  .catalog-shell {\n    grid-template-columns: 1fr;\n  }\n}\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "src", "data", "products.js"),
      `export const products = [\n  {\n    id: "p1",\n    slug: "linen-blazer",\n    name: "Linen Blazer",\n    category: "Outerwear",\n    tags: ["formal", "summer"],\n    season: "Summer",\n    shortDescription: "Lightweight linen tailoring.",\n    longDescription: "A breathable blazer designed for warm-weather tailoring.",\n    materials: ["Linen", "Cotton"],\n    sizes: ["S", "M", "L"],\n    colors: ["Sand"],\n    featured: true\n  },\n  {\n    id: "p2",\n    slug: "utility-shirt",\n    name: "Utility Shirt",\n    category: "Tops",\n    tags: ["casual", "layering"],\n    season: "Spring",\n    shortDescription: "Structured overshirt for layered looks.",\n    longDescription: "A versatile overshirt with utility pockets and relaxed structure.",\n    materials: ["Twill"],\n    sizes: ["M", "L"],\n    colors: ["Olive"],\n    featured: false\n  }\n];\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "src", "catalog.js"),
      `export function filterProducts(products, filters) {\n  return products.filter(product => {\n    if (filters.category && product.category !== filters.category) return false;\n    if (filters.season && product.season !== filters.season) return false;\n    if (filters.tag && !product.tags.includes(filters.tag)) return false;\n    return true;\n  });\n}\n\nexport function getProductBySlug(products, slug) {\n  return products.find(product => product.slug === slug) ?? null;\n}\n\nexport function listOptions(products, key) {\n  const values = new Set();\n  for (const product of products) {\n    const value = product[key];\n    if (Array.isArray(value)) {\n      for (const item of value) values.add(item);\n    } else if (value) {\n      values.add(value);\n    }\n  }\n  return [...values];\n}\n\nexport function filtersToQuery(filters) {\n  const params = new URLSearchParams();\n  for (const [key, value] of Object.entries(filters)) {\n    if (value) params.set(key, value);\n  }\n  return params.toString();\n}\n\nexport function queryToFilters(search) {\n  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);\n  return {\n    category: params.get('category') ?? '',\n    season: params.get('season') ?? '',\n    tag: params.get('tag') ?? ''\n  };\n}\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "src", "inquiry.js"),
      `export function submitInquiryLead(fields) {\n  return {\n    ok: true,\n    lead: {\n      productSlug: fields.productSlug ?? null,\n      name: fields.name ?? '',\n      email: fields.email ?? '',\n      message: fields.message ?? '',\n      createdAt: 'stubbed-timestamp'\n    },\n    notice: 'Inquiry captured. We will follow up soon.'\n  };\n}\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "src", "app.js"),
      `import { products } from "./data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, listOptions, queryToFilters } from "./catalog.js";\nimport { submitInquiryLead } from "./inquiry.js";\n\nfunction renderCatalog(items) {\n  const grid = document.querySelector("#catalog-grid");\n  if (!grid) return;\n  grid.innerHTML = items.map(product => (\n    '<article class=\"catalog-card\" data-slug=\"' + product.slug + '\">' +\n    '<h3>' + product.name + '</h3>' +\n    '<p>' + product.shortDescription + '</p>' +\n    '<button data-slug=\"' + product.slug + '\">View details</button>' +\n    '</article>'\n  )).join(\"\");\n}\n\nfunction renderDetail(product) {\n  const detail = document.querySelector(\"#product-detail\");\n  if (!detail) return;\n  if (!product) {\n    detail.innerHTML = \"<p>Select a product to inspect its details.</p>\";\n    return;\n  }\n  detail.innerHTML = '<h2>' + product.name + '</h2>' +\n    '<p>' + product.longDescription + '</p>' +\n    '<p><strong>Materials:</strong> ' + product.materials.join(', ') + '</p>' +\n    '<p><strong>Sizes:</strong> ' + product.sizes.join(', ') + '</p>';\n}\n\nfunction bindFilters() {\n  const category = document.querySelector(\"#category-filter\");\n  const season = document.querySelector(\"#season-filter\");\n  const tag = document.querySelector(\"#tag-filter\");\n  const selects = [category, season, tag];\n  const options = {\n    category: listOptions(products, \"category\"),\n    season: listOptions(products, \"season\"),\n    tag: listOptions(products, \"tags\")\n  };\n  for (const [key, values] of Object.entries(options)) {\n    const select = document.querySelector('#' + key + '-filter');\n    if (!select) continue;\n    select.innerHTML = ['<option value=\"\">All</option>', ...values.map(value => '<option value=\"' + value + '\">' + value + '</option>')].join(\"\");\n  }\n  const initialFilters = queryToFilters(location.search);\n  if (category) category.value = initialFilters.category;\n  if (season) season.value = initialFilters.season;\n  if (tag) tag.value = initialFilters.tag;\n  const update = () => {\n    const filters = { category: category?.value ?? \"\", season: season?.value ?? \"\", tag: tag?.value ?? \"\" };\n    const next = filterProducts(products, filters);\n    const query = filtersToQuery(filters);\n    history.replaceState(null, \"\", query ? '?' + query : location.pathname);\n    renderCatalog(next);\n  };\n  for (const select of selects) {\n    select?.addEventListener(\"change\", update);\n  }\n  update();\n}\n\nfunction bindCatalogClicks() {\n  document.addEventListener(\"click\", event => {\n    const target = event.target;\n    if (!(target instanceof HTMLElement)) return;\n    const slug = target.getAttribute(\"data-slug\");\n    if (!slug) return;\n    renderDetail(getProductBySlug(products, slug));\n  });\n}\n\nfunction bindInquiryForm() {\n  const form = document.querySelector(\"#inquiry-form\");\n  const status = document.querySelector(\"#inquiry-status\");\n  form?.addEventListener(\"submit\", event => {\n    event.preventDefault();\n    const fields = Object.fromEntries(new FormData(form).entries());\n    const result = submitInquiryLead(fields);\n    if (status) status.textContent = result.notice;\n  });\n}\n\nbindFilters();\nbindCatalogClicks();\nbindInquiryForm();\nrenderDetail(products[0]);\n\nexport { renderCatalog };\n`,
      "utf8"
    );
    await writeFile(
      join(this.session.cwd, "tests", "catalog.test.js"),
      `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { products } from "../src/data/products.js";\nimport { filterProducts, filtersToQuery, getProductBySlug, queryToFilters } from "../src/catalog.js";\nimport { submitInquiryLead } from "../src/inquiry.js";\n\ntest("filterProducts filters by category", () => {\n  const filtered = filterProducts(products, { category: "Outerwear", season: "", tag: "" });\n  assert.equal(filtered.length, 1);\n  assert.equal(filtered[0].slug, "linen-blazer");\n});\n\ntest("filterProducts filters by tag", () => {\n  const filtered = filterProducts(products, { category: "", season: "", tag: "layering" });\n  assert.equal(filtered.length, 1);\n  assert.equal(filtered[0].slug, "utility-shirt");\n});\n\ntest("getProductBySlug returns a product detail record", () => {\n  const product = getProductBySlug(products, "linen-blazer");\n  assert.equal(product?.name, "Linen Blazer");\n});\n\ntest("filtersToQuery and queryToFilters round-trip filter state", () => {\n  const query = filtersToQuery({ category: "Outerwear", season: "Summer", tag: "formal" });\n  assert.equal(query, "category=Outerwear&season=Summer&tag=formal");\n  assert.deepEqual(queryToFilters(query), { category: "Outerwear", season: "Summer", tag: "formal" });\n});\n\ntest("submitInquiryLead returns a success payload", () => {\n  const result = submitInquiryLead({ productSlug: "linen-blazer", name: "Avery", email: "avery@example.com", message: "Need line sheet" });\n  assert.equal(result.ok, true);\n  assert.equal(result.lead.productSlug, "linen-blazer");\n  assert.match(result.notice, /Inquiry captured/);\n});\n`,
      "utf8"
    );
  }

  static async create(
    cwd: string,
    sessionId = "session-1",
    options?: { substrateAdapter?: PiSubstrateAdapter | null }
  ): Promise<HarnessRuntime> {
    const adapter = options?.substrateAdapter ?? null;
    const effectiveCwd = adapter?.session.cwd || cwd;
    const effectiveSessionId = adapter?.session.sessionId || sessionId;
    const base = createHarnessSession(effectiveSessionId, effectiveCwd);
    const config = await loadRuntimeConfig(cwd);
    base.state = await loadRunState(join(cwd, ".harness", "state", "run-state.json"), base.state);
    base.taskState = await loadTaskState(join(cwd, ".harness", "artifacts", "task-state.json"));
    const reconciled = await HarnessRuntime.hydrateSessionMetadata(cwd, HarnessRuntime.reconcileSession(base));
    await saveRunState(join(cwd, ".harness", "state", "run-state.json"), reconciled.state);
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), reconciled.taskState as TaskState);
    return new HarnessRuntime(cwd, reconciled, config, adapter);
  }

  private getAllowedToolsForCurrentContext(taskId: string | null): string[] {
    const runtimeAllowed = getAllowedToolNamesForPhase({
      phase: this.session.state.phase,
      flow: this.session.state.currentFlow,
      activeTaskId: taskId,
      activeTaskKind: taskId ? this.session.taskState.taskKinds[taskId] ?? null : null,
      activeTaskStatus: taskId ? this.session.taskState.tasks[taskId] ?? null : null,
      activeTaskBlocker: taskId ? this.session.taskState.taskBlockers[taskId] ?? null : null,
      blocker: this.session.state.blocker
    });

    if (!this.substrateAdapter) {
      return runtimeAllowed;
    }

    const hostAllowed = new Set(this.substrateAdapter.tools.getAllowedTools());
    return runtimeAllowed.filter(tool => hostAllowed.has(tool));
  }

  getStatus(): RuntimeStatus {
        const taskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
        const milestoneId = this.session.taskState.activeMilestoneId ?? this.session.state.activeMilestoneId;
        const taskStatus = taskId ? this.session.taskState.tasks[taskId] ?? null : null;
        const readyTasks = this.getReadyTaskDescriptors();
        const pendingDependencies = this.getPendingDependencySummaries();
        const handoff = this.getHandoffEligibility();
        return {
        phase: this.session.state.phase,
          flow: this.session.state.currentFlow,
          goalSummary: this.session.state.goalSummary,
          activeSpecPath: this.session.state.activeSpecPath,
          activePlanPath: this.session.state.activePlanPath,
          activeMilestoneId: milestoneId,
          activeMilestoneText: milestoneId ? this.session.taskState.milestoneTexts[milestoneId] ?? null : null,
          activeMilestoneStatus: milestoneId ? this.session.taskState.milestones[milestoneId] ?? null : null,
          nextMilestoneId: this.getNextMilestoneId(),
          nextMilestoneText: this.getNextMilestoneId()
            ? this.session.taskState.milestoneTexts[this.getNextMilestoneId()!] ?? null
            : null,
          milestoneProgress: this.getMilestoneProgress(),
          milestoneStatusCounts: this.getMilestoneStatusCounts(),
          taskProgress: this.getTaskProgress(),
          taskStatusCounts: this.getTaskStatusCounts(),
          activeTaskId: taskId,
          activeTaskText: taskId
            ? this.session.taskState.taskTexts[taskId] ?? null
            : null,
          activeTaskStatus: taskStatus,
          activeTaskKind: taskId
            ? this.session.taskState.taskKinds[taskId] ?? null
            : null,
          activeTaskOwner: taskId
            ? this.session.taskState.taskOwners[taskId] ?? null
            : null,
          activeTaskExpectedOutput: taskId
            ? this.session.taskState.taskExpectedOutputs[taskId] ?? null
            : null,
          activeTaskOutputPath: taskId
            ? this.session.taskState.taskOutputs[taskId] ?? null
            : null,
          activeProvider: this.selectModelForTask(taskId).provider,
          activeModelId: this.selectModelForTask(taskId).id,
          activeModelTemperature: this.selectModelForTask(taskId).temperature ?? null,
          activeModelMaxTokens: this.selectModelForTask(taskId).maxTokens ?? null,
          activeExecutionMode: this.getExecutionModeForTask(taskId),
          activeTaskVerifyCommand: taskId
            ? this.session.taskState.taskVerificationCommands[taskId] ?? null
            : null,
          activeTaskRecoveryHint: taskId
            ? this.session.taskState.taskRecoveryHints[taskId] ?? null
            : null,
          lastVerificationStatus: this.session.state.lastVerificationStatus,
          lastVerificationPath: this.session.state.lastVerificationPath,
            lastReviewPath: this.session.state.lastReviewPath,
            lastHandoffPath: this.session.state.lastHandoffPath,
            handoffEligible: handoff.eligible,
            handoffReason: handoff.reason,
            blocker: this.session.state.blocker,
            resumePhase: this.session.taskState.resumePhase,
            readyTasks,
            pendingDependencies,
            allowedTools: this.getAllowedToolsForCurrentContext(taskId),
            nextAction: this.getSuggestedNextAction(taskStatus)
            };
          }

  getTaskStateSnapshot(): TaskState {
    return structuredClone(this.session.taskState);
  }

  getBlockedPayload(): BlockedPayload {
    const status = this.getStatus();
    const items = Object.entries(this.session.taskState.tasks)
      .filter(([, taskStatus]) => taskStatus === "blocked")
      .map(([taskId]) => ({
        taskId,
        taskText: this.session.taskState.taskTexts[taskId] ?? null,
        blocker: this.session.taskState.taskBlockers[taskId] ?? "unknown blocker",
        recoveryHint: this.session.taskState.taskRecoveryHints[taskId] ?? null,
        recoveryRecommendation:
          this.session.taskState.taskRecoveryHints[taskId] === "manual_output_required"
            ? "Generate the missing task output, then rerun verification."
            : this.session.taskState.taskRecoveryHints[taskId] === "implementation_no_changes"
              ? "Return to implementation and make concrete repo changes before retrying."
              : "Inspect the blocker and use /continue or /unblock when the dependency is resolved.",
        milestoneId: this.session.taskState.taskMilestones[taskId] ?? null
      }));

    return {
      mode: "blocked",
      phase: status.phase,
      activeTaskId: status.activeTaskId,
      activeTaskText: status.activeTaskText,
      items,
      summary: items.length > 0 ? `${items.length} blocked task(s).` : "No blocked tasks."
    };
  }

  async getReviewQueuePayload(): Promise<QueuePayload> {
    const status = this.getStatus();
    const items: QueueEntry[] = [];
    const seenTaskLabels = new Set<string>();

    if (status.activeTaskId && this.session.taskState.tasks[status.activeTaskId] === "validated") {
      const label = `${status.activeTaskId} ${status.activeTaskText ?? ""}`.trim();
      items.push({
        kind: "task",
        priority: "high",
        label,
        rationale: "validated active task is ready for operator review",
        detail: status.nextAction
      });
      seenTaskLabels.add(label);
    }

    if (status.phase === "reviewing" && status.activeTaskId) {
      const label = `${status.activeTaskId} ${status.activeTaskText ?? ""}`.trim();
      if (!seenTaskLabels.has(label)) {
        items.push({
          kind: "task",
          priority: "high",
          label,
          rationale: "runtime is already paused in reviewing phase",
          detail: "Runtime is currently in reviewing phase."
        });
        seenTaskLabels.add(label);
      }
    }

    const recentArtifacts = (await this.listArtifacts())
      .filter(item => item.type === "verification" || item.type === "review")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);

    for (const artifact of recentArtifacts) {
      items.push({
        kind: "artifact",
        priority: artifact.type === "review" ? "medium" : "low",
        label: `${artifact.type}: ${artifact.path}`,
        rationale: artifact.type === "review" ? "latest review artifact" : "latest verification artifact",
        detail:
          artifact.relatedTaskId || artifact.relatedPhase
            ? [
                artifact.relatedTaskId ? `task=${artifact.relatedTaskId}` : null,
                artifact.relatedPhase ? `phase=${artifact.relatedPhase}` : null
              ]
                .filter(Boolean)
                .join(" ")
            : "recent review-related artifact"
      });
    }

    items.sort((left, right) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
      const leftRank = priorityOrder[left.priority];
      const rightRank = priorityOrder[right.priority];
      return leftRank - rightRank;
    });

    return {
      mode: "queue",
      queue: "review",
      phase: status.phase,
      activeTaskId: status.activeTaskId,
      activeTaskText: status.activeTaskText,
      items,
      summary: items.length > 0 ? `${items.length} review queue item(s).` : "Review queue is empty."
    };
  }

  getPickupPayload(): PickupPayload {
    const status = this.getStatus();
    const selected = status.blocker
      ? { kind: "blocked" as const, target: status.activeTaskId, rationale: "active task is blocked and needs recovery before new work starts" }
      : status.activeTaskId
        ? { kind: "active-task" as const, target: status.activeTaskId, rationale: "runtime already has an active task selected" }
        : status.readyTasks.length > 0
          ? { kind: "ready-task" as const, target: status.readyTasks[0] ?? null, rationale: "first ready task from the runtime ledger" }
          : status.pendingDependencies.length > 0
            ? { kind: "waiting" as const, target: status.pendingDependencies[0] ?? null, rationale: "no ready tasks yet; dependencies still gate progress" }
            : { kind: "idle" as const, target: null, rationale: "runtime has no active or ready work yet" };

    return {
      mode: "pickup",
      phase: status.phase,
      pickupKind: selected.kind,
      activeTaskId: status.activeTaskId,
      activeTaskText: status.activeTaskText,
      target: selected.target,
      rationale: selected.rationale,
      nextAction: status.nextAction ?? null,
      readyTasks: status.readyTasks,
      pendingDependencies: status.pendingDependencies,
      blocker: status.blocker
    };
  }

  getRelatedArtifactsPayload(taskId: string | null = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId): RelatedArtifactsPayload {
    const status = this.getStatus();
    const items: RelatedArtifactEntry[] = [];
    const seen = new Set<string>();
    const push = (entry: RelatedArtifactEntry) => {
      if (seen.has(entry.path)) {
        return;
      }
      seen.add(entry.path);
      items.push(entry);
    };
    const exactTarget = taskId !== null && taskId === status.activeTaskId;

    if (status.activeSpecPath) {
      push({ kind: "artifact", type: "spec", path: status.activeSpecPath, relevance: "supporting", reason: "active spec" });
    }
    if (status.activePlanPath) {
      push({ kind: "artifact", type: "plan", path: status.activePlanPath, relevance: "supporting", reason: "active plan" });
    }

    const milestonePath = join(this.session.cwd, ".harness", "artifacts", "milestones.md");
    if (existsSync(milestonePath)) {
      push({ kind: "artifact", type: "milestones", path: milestonePath, relevance: "supporting", reason: "active milestone ledger" });
    }

    if (taskId && this.session.taskState.taskOutputs[taskId]) {
      push({
        kind: "task-output",
        type: "task-output",
        path: this.session.taskState.taskOutputs[taskId]!,
        relevance: "exact",
        reason: "active task output"
      });
    }

    if (this.session.state.lastVerificationPath) {
      push({
        kind: "artifact",
        type: "verification",
        path: this.session.state.lastVerificationPath,
        relevance: exactTarget ? "exact" : "supporting",
        reason: exactTarget ? "verification for current active task" : "latest verification in session"
      });
    }
    if (this.session.state.lastReviewPath) {
      push({
        kind: "artifact",
        type: "review",
        path: this.session.state.lastReviewPath,
        relevance: exactTarget ? "exact" : "supporting",
        reason: exactTarget ? "review for current active task" : "latest review in session"
      });
    }
    if (this.session.state.lastHandoffPath) {
      push({
        kind: "artifact",
        type: "handoff",
        path: this.session.state.lastHandoffPath,
        relevance: exactTarget ? "exact" : "supporting",
        reason: exactTarget ? "handoff for current active task/session" : "latest handoff in session"
      });
    }

    const taskStatePath = join(this.session.cwd, ".harness", "artifacts", "task-state.json");
    if (existsSync(taskStatePath)) {
      push({ kind: "artifact", type: "task_state", path: taskStatePath, relevance: "supporting", reason: "runtime task ledger" });
    }

    const exactItems = items.filter(item => item.relevance === "exact");
    const supportingItems = items.filter(item => item.relevance === "supporting");

    return {
      mode: "related",
      targetTaskId: taskId,
      targetTaskText: taskId ? this.session.taskState.taskTexts[taskId] ?? null : null,
      phase: status.phase,
      items,
      groups: [
        { label: "exact", items: exactItems },
        { label: "supporting", items: supportingItems }
      ].filter(group => group.items.length > 0),
      summary:
        items.length > 0
          ? `${exactItems.length} exact and ${supportingItems.length} supporting related artifact(s).`
          : "No related artifacts found."
    };
  }

  async getTimelinePayload(): Promise<TimelinePayload> {
    const status = this.getStatus();
    const artifacts = await this.listArtifacts();
    const items: TimelineEntry[] = [
      {
        kind: "runtime",
        timestamp: this.session.state.updatedAt,
        label: `runtime phase=${status.phase}`,
        detail: status.nextAction,
        path: null
      }
    ];

    if (status.blocker) {
      items.push({
        kind: "blocker",
        timestamp: this.session.state.updatedAt,
        label: "blocker",
        detail: status.blocker,
        path: null
      });
    }

    for (const artifact of artifacts.slice(0, 8)) {
      items.push({
        kind: "artifact",
        timestamp: artifact.updatedAt,
        label: artifact.type,
        detail:
          artifact.relatedTaskId || artifact.relatedPhase
            ? [artifact.relatedTaskId ? `task=${artifact.relatedTaskId}` : null, artifact.relatedPhase ? `phase=${artifact.relatedPhase}` : null]
                .filter(Boolean)
                .join(" ")
            : "artifact update",
        path: artifact.path
      });
    }

    return {
      mode: "timeline",
      phase: status.phase,
      activeTaskId: status.activeTaskId,
      activeTaskText: status.activeTaskText,
      items: items.sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
      summary: `${items.length} timeline event(s).`
    };
  }

  getProviderReadiness(): ProviderRoleReadiness[] {
    return ([
      ["default", this.config.models.default, "agent"],
      ["planner", this.config.models.planner, this.config.execution.plannerMode],
      ["worker", this.config.models.worker, this.config.execution.workerMode],
      ["validator", this.config.models.validator, this.config.execution.validatorMode]
    ] as const).map(([role, model, executionMode]) => {
      const auth = getModelAuthReadiness(model);
      return {
        role,
        provider: auth.provider,
        modelId: auth.modelId,
        authSource: auth.authSource,
        envVar: auth.envVar ?? "-",
        credentialLocation: auth.credentialLocation,
        hasApiKey: auth.hasApiKey,
        status: auth.status,
        suggestedAction: auth.suggestedAction,
        authHeaderName: auth.authHeaderName,
        authPrefix: auth.authPrefix,
        baseUrl: auth.baseUrl,
        apiPath: auth.apiPath,
        executionMode
      };
    });
  }

  smokeProvider(role: "default" | "planner" | "worker" | "validator" = "default"): Promise<ProviderSmokeResult> {
    const model = createModel(
      role === "planner"
        ? this.config.models.planner
        : role === "worker"
          ? this.config.models.worker
          : role === "validator"
            ? this.config.models.validator
            : this.config.models.default
    );

    const startedAt = Date.now();

    return complete(model, {
      systemPrompt: "Respond with exactly READY and nothing else.",
      messages: [
        {
          role: "user",
          content: "Say READY only.",
          timestamp: Date.now()
        }
      ]
    }).then(message => ({
      role,
      provider: model.provider,
      modelId: model.id,
      durationMs: Date.now() - startedAt,
      stopReason: message.stopReason,
      text: message.content
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join("\n")
        .trim(),
      errorMessage: message.errorMessage
    }));
  }

  async doctorProviders(): Promise<ProviderDoctorResult[]> {
    const readiness = this.getProviderReadiness();
    const results: ProviderDoctorResult[] = [];

    for (const item of readiness) {
      if (item.status !== "ready") {
        results.push({ role: item.role, readiness: item });
        continue;
      }

      const smoke = await this.smokeProvider(item.role);
      results.push({ role: item.role, readiness: item, smoke });
    }

    return results;
  }

  private async startManagedWebApp(): Promise<
    | { error: WebSmokeResult }
    | { packageJson: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }; managed: ManagedWebAppProcess }
  > {
    const startedAt = Date.now();
    const packageJsonPath = join(this.session.cwd, "package.json");
    let packageJson:
      | { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      | null = null;

    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
    } catch {
      return { error: {
        success: false,
        url: "-",
        statusCode: null,
        title: null,
        bodySnippet: "",
        durationMs: Date.now() - startedAt,
        errorMessage: "No package.json found for web smoke."
      } };
    }

    if (!packageJson.scripts?.start) {
      return { error: {
        success: false,
        url: "-",
        statusCode: null,
        title: null,
        bodySnippet: "",
        durationMs: Date.now() - startedAt,
        errorMessage: 'No "start" script found in package.json.'
      } };
    }

    const startScript = packageJson.scripts.start;
    const deps = {
      ...(packageJson as { dependencies?: Record<string, string> }).dependencies,
      ...(packageJson as { devDependencies?: Record<string, string> }).devDependencies
    };
    const needsFrameworkInstall =
      Boolean(startScript.includes("vite") || startScript.includes("next")) ||
      Boolean(deps.next || deps.vite || deps.react || deps["react-dom"]);
    const nodeModulesPath = join(this.session.cwd, "node_modules");
    const hasNodeModules = await stat(nodeModulesPath).then(() => true).catch(() => false);

    if (needsFrameworkInstall && !hasNodeModules) {
      const install = spawn("pnpm", ["install"], {
        cwd: this.session.cwd,
        env: {
          ...process.env
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let installOutput = "";
      install.stdout.on("data", chunk => {
        installOutput += String(chunk);
      });
      install.stderr.on("data", chunk => {
        installOutput += String(chunk);
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        install.once("error", reject);
        install.once("exit", code => resolve(code));
      }).catch(() => null);

      if (exitCode !== 0) {
        return { error: {
          success: false,
          url: "-",
          statusCode: null,
          title: null,
          bodySnippet: installOutput.trim().slice(0, 200),
          durationMs: Date.now() - startedAt,
          errorMessage: `Dependency install failed before web smoke (exit ${exitCode ?? "unknown"}).`
        } };
      }
    }

    const port = 4300 + Math.floor(Math.random() * 400);
    let url = `http://127.0.0.1:${port}`;
    const startCommand =
      deps.vite && startScript.includes("vite")
        ? ["exec", "vite", "--host", "127.0.0.1", "--port", String(port)]
        : deps.next && startScript.includes("next")
          ? ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)]
          : ["run", "start"];
    const child = spawn("pnpm", startCommand, {
      cwd: this.session.cwd,
      env: {
        ...process.env,
        PORT: String(port)
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    const managedUrl = { value: url };
    const managedOutput = { value: output };
    child.stdout.on("data", chunk => {
      const text = String(chunk);
      output += text;
      managedOutput.value = output;
      const announced = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/);
      if (announced?.[0]) {
        url = announced[0].replace("localhost", "127.0.0.1");
        managedUrl.value = url;
      }
    });
    child.stderr.on("data", chunk => {
      const text = String(chunk);
      output += text;
      managedOutput.value = output;
      const announced = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/);
      if (announced?.[0]) {
        url = announced[0].replace("localhost", "127.0.0.1");
        managedUrl.value = url;
      }
    });

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const terminateChild = async () => {
      if (child.exitCode !== null) {
        return;
      }
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };

    return {
      packageJson,
      managed: {
        child,
        url: managedUrl,
        output: managedOutput,
        startedAt,
        terminate: terminateChild
      }
    };
  }

  async smokeWebApp(): Promise<WebSmokeResult> {
    const setup = await this.startManagedWebApp();
    if ("error" in setup) {
      return setup.error;
    }
    const { managed } = setup;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (managed.child.exitCode !== null && managed.child.exitCode !== 0) {
          return {
            success: false,
            url: managed.url.value,
            statusCode: null,
            title: null,
            bodySnippet: managed.output.value.trim(),
            durationMs: Date.now() - managed.startedAt,
            errorMessage: `Web app exited early with code ${managed.child.exitCode}.`
          };
        }

        try {
          const response = await fetch(`${managed.url.value}/`);
          const body = await response.text();
          const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
          const bodySnippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
          return {
            success: response.ok,
            url: managed.url.value,
            statusCode: response.status,
            title: titleMatch?.[1] ?? null,
            bodySnippet,
            durationMs: Date.now() - managed.startedAt
          };
        } catch {
          await sleep(250);
        }
      }

      return {
        success: false,
        url: managed.url.value,
        statusCode: null,
        title: null,
        bodySnippet: managed.output.value.trim(),
        durationMs: Date.now() - managed.startedAt,
        errorMessage: "Timed out waiting for web app to become reachable."
      };
    } finally {
      await managed.terminate();
    }
  }

  async verifyWebApp(): Promise<WebVerifyResult> {
    const setup = await this.startManagedWebApp();
    if ("error" in setup) {
      return setup.error;
    }
    const { managed } = setup;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const pwcli = join(process.env.HOME ?? "", ".codex", "skills", "playwright", "scripts", "playwright_cli.sh");

    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          const response = await fetch(`${managed.url.value}/`);
          const body = await response.text();
          const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
          const bodySnippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
          const playwright = spawn(pwcli, ["open", managed.url.value], {
            cwd: this.session.cwd,
            env: {
              ...process.env,
              CODEX_HOME: process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex")
            },
            stdio: ["ignore", "pipe", "pipe"]
          });
          let output = "";
          playwright.stdout.on("data", chunk => {
            output += String(chunk);
          });
          playwright.stderr.on("data", chunk => {
            output += String(chunk);
          });
          const exitCode = await new Promise<number | null>((resolve, reject) => {
            playwright.once("error", reject);
            playwright.once("exit", code => resolve(code));
          }).catch(() => null);
          const snapshotPath = output.match(/\[Snapshot\]\(([^)]+)\)/)?.[1];
          const consolePath = output.match(/New console entries: ([^\s]+)/)?.[1];
          await new Promise(resolve => {
            const closer = spawn(pwcli, ["close"], {
              cwd: this.session.cwd,
              env: {
                ...process.env,
                CODEX_HOME: process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex")
              },
              stdio: ["ignore", "ignore", "ignore"]
            });
            closer.once("exit", () => resolve(null));
            closer.once("error", () => resolve(null));
          });
          return {
            success: response.ok && exitCode === 0,
            url: managed.url.value,
            statusCode: response.status,
            title: titleMatch?.[1] ?? null,
            bodySnippet,
            durationMs: Date.now() - managed.startedAt,
            snapshotPath,
            consoleLogPath: consolePath,
            errorMessage: exitCode === 0 ? undefined : "Playwright verification failed."
          };
        } catch {
          await sleep(250);
        }
      }

      return {
        success: false,
        url: managed.url.value,
        statusCode: null,
        title: null,
        bodySnippet: managed.output.value.trim(),
        durationMs: Date.now() - managed.startedAt,
        errorMessage: "Timed out waiting for web app to become reachable."
      };
    } finally {
      await managed.terminate();
    }
  }

  async listArtifacts(): Promise<ArtifactMeta[]> {
    return this.artifactStore.list(this.session.sessionId);
  }

  private selectModelForTask(taskId: string | null): Model {
    const owner = taskId ? this.session.taskState.taskOwners[taskId] ?? null : null;
    const role: ExecutionRole | null =
      owner === "planner" || owner === "worker" || owner === "validator" ? owner : this.resolveExecutionRole(taskId);
    return createModel(
      role === "planner"
        ? this.config.models.planner
        : role === "worker"
          ? this.config.models.worker
          : role === "validator"
            ? this.config.models.validator
            : this.config.models.default
    );
  }

  private getExecutionModeForTask(taskId: string | null): "agent" | "fresh" | "subprocess" {
    const role = this.resolveExecutionRole(taskId);
    if (role === "planner") {
      return this.config.execution.plannerMode;
    }
    if (role === "validator") {
      return this.config.execution.validatorMode;
    }
    if (role === "worker" && this.config.execution.workerMode === "subprocess") {
      return "subprocess";
    }
    if (role === "worker" && this.config.execution.workerMode === "fresh") {
      return "fresh";
    }
    return "agent";
  }

  private createCodingAgent(): Agent {
      const activeTaskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
      const allowed = new Set(this.getAllowedToolsForCurrentContext(activeTaskId));
      return new Agent({
        model: this.selectModelForTask(activeTaskId),
        systemPrompt:
          "You are a coding agent working in a real repository. Use tools to inspect files, create files, and modify code when the task requires implementation. Do not stop at a prose summary when concrete file changes are required. After tool results, continue until you have either completed the task or hit a real blocker.",
        tools: createDefaultCodingTools(this.session.cwd)
          .map(tool =>
            tool.name === "bash"
              ? createBashTool(this.session.cwd, {
                  validate: command => validateBashCommandForPhase(this.session.state.phase, command)
                })
              : tool
          )
          .filter(tool => allowed.has(tool.name))
      });
    }

  private getSuggestedNextAction(
    taskStatus: "todo" | "in_progress" | "validated" | "done" | "blocked" | null
  ): string {
      const taskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
      const taskKind = taskId ? this.session.taskState.taskKinds[taskId] ?? null : null;
      const taskOwner = taskId ? this.session.taskState.taskOwners[taskId] ?? null : null;
      const expectedOutput = taskId ? this.session.taskState.taskExpectedOutputs[taskId] ?? null : null;
      const verifyCommands = taskId ? this.session.taskState.taskVerificationCommands[taskId] ?? null : null;
      const pendingDependencies = taskId ? this.getUnsatisfiedTaskDependencies(taskId) : [];
      if (this.session.state.phase === "completed") {
        return "Start a new task or create a new long-running plan.";
      }
      if (this.session.state.blocker) {
      if (this.isAutoRecoverableBlockedTask(taskId)) {
        if (taskId && this.session.taskState.taskRecoveryHints[taskId] === "implementation_fix_required") {
          return "Use /continue to return to implementation and fix the failing verification command.";
        }
        if (taskId && this.isLegacyImplementationVerificationRecovery(taskId)) {
          return "Use /continue to return to implementation and fix the failing verification command.";
        }
        return this.session.state.blocker.includes("no concrete file changes")
          ? "Use /continue to retry implementation against the scaffold files and produce real code changes."
          : "Use /continue to generate the missing task output, then rerun manual review automatically.";
      }
        return verifyCommands && verifyCommands.length > 0
          ? `Resolve the blocker, then use /unblock and rerun ${this.formatVerifyCommands(verifyCommands)}.`
          : "Resolve the blocker, then use /unblock.";
      }
    if (taskStatus === "todo") {
      if (pendingDependencies.length > 0) {
        return `Current task is waiting on dependencies: ${pendingDependencies.join(", ")}. Finish those tasks first, then use /continue.`;
      }
      return `Use /continue to start ${taskId ? this.formatTaskDescriptor(taskId) : "the current task"}.`;
    }
      if (taskStatus === "in_progress") {
        return verifyCommands && verifyCommands.length > 0
          ? `Use /continue to verify the current task with ${this.formatVerifyCommands(verifyCommands)}.`
          : "Use /continue to verify the current task.";
      }
    if (taskStatus === "validated") {
      return "Use /continue to review and finalize the validated task.";
    }
      if (taskStatus === "done") {
        const nextReadyTask = taskId ? this.findNextTodoTaskId(taskId) : null;
        if (nextReadyTask) {
          return `Use /continue to activate the next ready task ${this.formatTaskDescriptor(nextReadyTask)}.`;
        }
        const nextPendingTask = taskId ? this.findNextPendingTodoTaskId(taskId) : null;
        if (nextPendingTask) {
          const dependencies = this.getUnsatisfiedTaskDependencies(nextPendingTask);
          if (dependencies.length > 0) {
            return `Next task ${this.formatTaskDescriptor(nextPendingTask)} is waiting on dependencies: ${dependencies.join(", ")}.`;
          }
        }
        const nextMilestoneId = this.getNextMilestoneId();
        if (nextMilestoneId) {
          return `Use /continue to advance from ${this.session.taskState.activeMilestoneId} to ${nextMilestoneId}.`;
        }
        return "Use /continue to activate the next task or advance the milestone.";
      }
      if (taskStatus === "blocked") {
        if (this.isAutoRecoverableBlockedTask(taskId)) {
          if (taskId && this.session.taskState.taskRecoveryHints[taskId] === "implementation_fix_required") {
            return "Use /continue to return to implementation and fix the failing verification command.";
          }
          if (taskId && this.isLegacyImplementationVerificationRecovery(taskId)) {
            return "Use /continue to return to implementation and fix the failing verification command.";
          }
          return this.session.state.blocker?.includes("no concrete file changes")
            ? "Use /continue to retry implementation with the scaffold files and produce real code changes."
            : "Use /continue to regenerate task output and resume manual verification.";
        }
        return verifyCommands && verifyCommands.length > 0
          ? `Task is blocked. Fix the issue, then use /unblock and rerun ${this.formatVerifyCommands(verifyCommands)}.`
          : "Task is blocked. Resolve the issue, then use /unblock.";
      }
      if (this.session.state.phase === "paused" && this.session.taskState.resumePhase) {
        return `Use /continue or /resume to re-enter ${this.session.taskState.resumePhase}.`;
      }
      return "Use /status, /continue, or /plan to move forward.";
  }

  private getHandoffEligibility(): { eligible: boolean; reason: string | null } {
    const hasRuntimeContext =
      this.session.state.goalSummary !== null ||
      this.session.state.activeSpecPath !== null ||
      this.session.state.activePlanPath !== null ||
      this.session.state.activeMilestoneId !== null ||
      this.session.state.activeTaskId !== null ||
      this.session.taskState.activeMilestoneId !== null ||
      this.session.taskState.activeTaskId !== null ||
      this.session.state.lastVerificationPath !== null ||
      this.session.state.lastReviewPath !== null ||
      this.session.state.lastHandoffPath !== null;

    if (!hasRuntimeContext) {
      return {
        eligible: false,
        reason: "No active runtime state is available to hand off."
      };
    }

    return { eligible: true, reason: null };
  }

  private invalidateVerificationState(): void {
    this.session.state.lastVerificationStatus = null;
    this.session.taskState.lastVerificationStatus = null;
    this.session.state.lastVerificationPath = null;
    this.session.taskState.lastVerificationPath = null;
    this.session.state.lastReviewPath = null;
    this.session.taskState.lastReviewPath = null;
  }

  private async runAgentTurn(input: string): Promise<string> {
    const agent = this.createCodingAgent();
    await agent.prompt({
      role: "user",
      content: input,
      timestamp: Date.now()
    });

    const lastMessage = [...agent.state.messages].reverse().find(
      (message: Message) => message.role === "assistant" || message.role === "tool_result"
    );

    if (!lastMessage) {
      return "Agent turn completed";
    }
    if (lastMessage.role === "assistant") {
      const text = lastMessage.content
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join("\n")
        .trim();
      return text || (lastMessage.stopReason === "tool_use" ? "Agent requested tool execution" : "Agent turn completed");
    }
    return lastMessage.content.map(part => part.text).join("\n").trim() || "Tool result completed";
  }

  private async readArtifactExcerpt(path: string | null, maxLength = 240): Promise<string | null> {
    if (!path) {
      return null;
    }
    try {
      const content = await readFile(path, "utf8");
      return content.slice(0, maxLength).trim();
    } catch {
      return null;
    }
  }

  private async buildTaskContextInput(taskId: string, role: ExecutionRole | null) {
    return {
      goalSummary: this.session.state.goalSummary,
      activePlanPath: this.session.state.activePlanPath,
      activePlanExcerpt: await this.readArtifactExcerpt(this.session.state.activePlanPath),
      activeSpecExcerpt: await this.readArtifactExcerpt(this.session.state.activeSpecPath),
      lastVerificationExcerpt: await this.readArtifactExcerpt(this.session.state.lastVerificationPath, 500),
      lastTaskOutputExcerpt: await this.readArtifactExcerpt(this.session.taskState.taskOutputs[taskId] ?? null, 500),
      activeMilestoneId: this.session.state.activeMilestoneId,
      activeTaskId: taskId,
      taskKind: this.session.taskState.taskKinds[taskId] ?? null,
      taskOwner: this.session.taskState.taskOwners[taskId] ?? null,
      expectedOutput: this.session.taskState.taskExpectedOutputs[taskId] ?? null,
      taskStatus: this.session.taskState.tasks[taskId] ?? null,
      blocker: this.session.taskState.taskBlockers[taskId] ?? this.session.state.blocker,
      scaffoldFiles: role === "worker" ? this.getBootstrapScaffoldFiles() : null
    };
  }

  private async runWorkerRetryAfterNoChanges(
    taskId: string,
    role: ExecutionRole | null,
    beforeSnapshot: Map<string, string> | null
  ): Promise<{ summary: string; changedFiles: string[] }> {
    const retrySummary = await this.runAgentTurn(
      buildNoChangeRecoveryPrompt(await this.buildTaskContextInput(taskId, role))
    );
    const changedFiles =
      beforeSnapshot === null
        ? []
        : this.diffWorkspaceSnapshots(beforeSnapshot, await this.captureWorkspaceFileSnapshot());
    return {
      summary: `${retrySummary}\n\nAutomatic retry: executed after the first implementation turn produced no concrete file changes.`,
      changedFiles
    };
  }

  private getOrderedTaskIds(): string[] {
    return Object.keys(this.session.taskState.tasks).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }

  private getUnsatisfiedTaskDependencies(taskId: string): string[] {
    const dependencies = this.session.taskState.taskDependencies[taskId] ?? [];
    return dependencies.filter(dependency => this.session.taskState.tasks[dependency] !== "done");
  }

  private isAutoRecoverableBlockedTask(taskId: string | null): boolean {
    if (!taskId) {
      return false;
    }

    if (
      this.session.taskState.taskRecoveryHints[taskId] === "manual_output_required" ||
      this.session.taskState.taskRecoveryHints[taskId] === "implementation_no_changes" ||
      this.session.taskState.taskRecoveryHints[taskId] === "implementation_fix_required"
    ) {
      return true;
    }

    const blocker =
      this.session.taskState.taskBlockers[taskId] ??
      (this.session.taskState.activeTaskId === taskId ? this.session.state.blocker : null);
    const verifyCommands = this.session.taskState.taskVerificationCommands[taskId] ?? [];

    return (
      Boolean(blocker && blocker.includes("Manual verification requires task output:")) &&
      verifyCommands.some(command => command.startsWith("manual:")) &&
      !this.session.taskState.taskOutputs[taskId]
    ) ||
      Boolean(blocker && blocker.includes("Implementation produced no concrete file changes outside .harness.")) ||
      this.isLegacyImplementationVerificationRecovery(taskId);
  }

  private isLegacyImplementationVerificationRecovery(taskId: string): boolean {
    return (
      (this.session.taskState.taskKinds[taskId] ?? null) === "implementation" &&
      this.session.state.lastVerificationStatus === "fail" &&
      this.session.taskState.tasks[taskId] === "blocked" &&
      (this.session.taskState.taskVerificationCommands[taskId]?.length ?? 0) > 0
    );
  }

  private async autoRecoverBlockedTask(taskId: string): Promise<string> {
    const hint = this.session.taskState.taskRecoveryHints[taskId] ?? null;
    const legacyImplementationFix = this.isLegacyImplementationVerificationRecovery(taskId);
    const blocker =
      this.session.taskState.taskBlockers[taskId] ??
      (this.session.taskState.activeTaskId === taskId ? this.session.state.blocker : null);
    delete this.session.taskState.taskBlockers[taskId];
    delete this.session.taskState.taskRecoveryHints[taskId];
    if (this.session.state.blocker) {
      this.session.taskState.blockers = this.session.taskState.blockers.filter(
        blocker => blocker !== this.session.state.blocker
      );
    }
    this.session.state.blocker = null;
    this.session.taskState.tasks[taskId] = "todo";
    this.session.state.phase = "planning";
    this.session.state.updatedAt = new Date().toISOString();
    this.session.taskState.resumePhase = "implementing";
    await this.persist();
    const continued = await this.continueTaskLoop();
    if (hint === "implementation_no_changes" || blocker?.includes("no concrete file changes")) {
      return `${taskId} was re-queued because the previous implementation made no concrete file changes. ${continued}`;
    }
    if (hint === "implementation_fix_required") {
      return `${taskId} was re-queued because implementation verification failed and needs fixes. ${continued}`;
    }
    if (legacyImplementationFix) {
      return `${taskId} was re-queued because implementation verification failed and needs fixes. ${continued}`;
    }
    return `${taskId} was re-queued because manual verification needed task output. ${continued}`;
  }

  private formatVerifyCommands(commands: string[] | null | undefined): string {
    if (!commands || commands.length === 0) {
      return "";
    }

    return commands
      .map(command =>
        command.startsWith("manual:")
          ? `manual review (${command.slice("manual:".length).trim() || "manual check"})`
          : command === "runtime:web-smoke"
            ? "runtime web smoke"
          : `\`${command}\``
      )
      .join(", ");
  }

  private formatTaskDescriptor(taskId: string): string {
    const text = this.session.taskState.taskTexts[taskId] ?? null;
    const kind = this.session.taskState.taskKinds[taskId] ?? null;
    const owner = this.session.taskState.taskOwners[taskId] ?? null;
    const expectedOutput = this.session.taskState.taskExpectedOutputs[taskId] ?? null;
    return `${taskId}${kind ? ` (${kind})` : ""}${text ? ` ${text}` : ""}${owner ? ` owned by ${owner}` : ""}${expectedOutput ? ` producing ${expectedOutput}` : ""}`;
  }

  private getReadyTaskDescriptors(): string[] {
    return this.getOrderedTaskIds()
      .filter(taskId => {
        const taskMilestone = this.session.taskState.taskMilestones[taskId] ?? null;
        return taskMilestone === null || taskMilestone === this.session.taskState.activeMilestoneId;
      })
      .filter(taskId => this.session.taskState.tasks[taskId] === "todo")
      .filter(taskId => this.getUnsatisfiedTaskDependencies(taskId).length === 0)
      .map(taskId => this.formatTaskDescriptor(taskId));
  }

  private getFirstReadyTaskId(): string | null {
    return (
      this.getOrderedTaskIds()
        .filter(taskId => {
          const taskMilestone = this.session.taskState.taskMilestones[taskId] ?? null;
          return taskMilestone === null || taskMilestone === this.session.taskState.activeMilestoneId;
        })
        .filter(taskId => this.session.taskState.tasks[taskId] === "todo")
        .find(taskId => this.getUnsatisfiedTaskDependencies(taskId).length === 0) ?? null
    );
  }

  private getFirstReadyTaskIdForMilestone(milestoneId: string): string | null {
    return (
      this.getOrderedTaskIds()
        .filter(taskId => (this.session.taskState.taskMilestones[taskId] ?? null) === milestoneId)
        .filter(taskId => this.session.taskState.tasks[taskId] === "todo")
        .find(taskId => this.getUnsatisfiedTaskDependencies(taskId).length === 0) ?? null
    );
  }

  private getPendingDependencySummaries(): string[] {
    return this.getOrderedTaskIds()
      .filter(taskId => {
        const taskMilestone = this.session.taskState.taskMilestones[taskId] ?? null;
        return taskMilestone === null || taskMilestone === this.session.taskState.activeMilestoneId;
      })
      .filter(taskId => this.session.taskState.tasks[taskId] === "todo")
      .map(taskId => {
        const dependencies = this.getUnsatisfiedTaskDependencies(taskId);
        return dependencies.length > 0
          ? `${this.formatTaskDescriptor(taskId)} waiting on ${dependencies.join(", ")}`
          : null;
      })
      .filter((value): value is string => value !== null);
  }

  private getNextMilestoneId(): string | null {
    const current = this.session.taskState.activeMilestoneId;
    if (!current) {
      return null;
    }

    const ordered = Object.keys(this.session.taskState.milestones).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const currentIndex = ordered.indexOf(current);
    if (currentIndex === -1) {
      return null;
    }

    return ordered[currentIndex + 1] ?? null;
  }

  private getMilestoneProgress(): string {
    const values = Object.values(this.session.taskState.milestones);
    if (values.length === 0) {
      return "0/0 done";
    }
    const done = values.filter(status => status === "done").length;
    return `${done}/${values.length} done`;
  }

  private getTaskProgress(): string {
    const values = Object.values(this.session.taskState.tasks);
    if (values.length === 0) {
      return "0/0 done";
    }
    const done = values.filter(status => status === "done").length;
    return `${done}/${values.length} done`;
  }

  private formatStatusCounts(
    counts: Record<string, string>,
    preferredOrder: string[]
  ): string {
    const parts = preferredOrder
      .filter(key => counts[key] !== undefined)
      .map(key => `${key}=${counts[key]}`);
    return parts.length > 0 ? parts.join(" ") : "(none)";
  }

  private getMilestoneStatusCounts(): string {
    const counts = Object.values(this.session.taskState.milestones).reduce<Record<string, number>>((acc, status) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return this.formatStatusCounts(
      Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, String(value)])),
      ["todo", "in_progress", "done", "blocked"]
    );
  }

  private getTaskStatusCounts(): string {
    const counts = Object.values(this.session.taskState.tasks).reduce<Record<string, number>>((acc, status) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return this.formatStatusCounts(
      Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, String(value)])),
      ["todo", "in_progress", "validated", "done", "blocked"]
    );
  }

  private getUnsatisfiedMilestoneDependencies(milestoneId: string): string[] {
    const dependencies = this.session.taskState.milestoneDependencies[milestoneId] ?? [];
    return dependencies.filter(dependency => this.session.taskState.milestones[dependency] !== "done");
  }

  private findNextPendingTodoTaskId(afterTaskId: string | null): string | null {
    const ordered = this.getOrderedTaskIds();
    if (ordered.length === 0) {
      return null;
    }

    const startIndex = afterTaskId ? ordered.indexOf(afterTaskId) + 1 : 0;
    for (const taskId of ordered.slice(Math.max(0, startIndex))) {
      const taskMilestone = this.session.taskState.taskMilestones[taskId] ?? null;
      if (
        this.session.taskState.tasks[taskId] === "todo" &&
        (taskMilestone === null || taskMilestone === this.session.taskState.activeMilestoneId)
      ) {
        return taskId;
      }
    }
    return null;
  }

  private findNextTodoTaskId(afterTaskId: string | null): string | null {
    const ordered = this.getOrderedTaskIds();
    if (ordered.length === 0) {
      return null;
    }

    const startIndex = afterTaskId ? ordered.indexOf(afterTaskId) + 1 : 0;
    for (const taskId of ordered.slice(Math.max(0, startIndex))) {
      const taskMilestone = this.session.taskState.taskMilestones[taskId] ?? null;
      if (
        this.session.taskState.tasks[taskId] === "todo" &&
        (taskMilestone === null || taskMilestone === this.session.taskState.activeMilestoneId) &&
        this.getUnsatisfiedTaskDependencies(taskId).length === 0
      ) {
        return taskId;
      }
    }
    return null;
  }

  private resolveExecutionRole(taskId: string | null): ExecutionRole | null {
    if (!taskId) {
      return null;
    }

    const owner = this.session.taskState.taskOwners[taskId] ?? null;
    if (owner === "planner" || owner === "worker" || owner === "validator") {
      return owner;
    }

    const kind = this.session.taskState.taskKinds[taskId] ?? null;
    if (kind === "analysis") {
      return "planner";
    }
    if (kind === "verification") {
      return "validator";
    }
    if (kind === "implementation") {
      return "worker";
    }

    return null;
  }

  private buildPlanningArtifacts(input: string, longRunning: boolean): {
    specContent: string;
    planContent: string;
    milestoneContent?: string;
  } {
    const cliName = this.inferNodeCliNameFromGoal(input);
    const supportedCommands = this.inferSupportedCliCommands(input);
    const lowerInput = input.toLowerCase();

    if (longRunning && (lowerInput.includes("next.js") || lowerInput.includes("nextjs") || lowerInput.includes("next "))) {
      return {
        specContent: `# Spec

Goal: ${input}

## Functional Requirements
- Build the v1 catalog as a Next.js application.
- Render a branded landing page plus catalog listing with category, tag, and season filters.
- Support URL-backed filter state.
- Render product detail views, related products, and an inquiry CTA.
- Use mock product data, responsive layout, tests, and README instructions.

## Constraints
- Keep the runtime bootstrap limited to a minimal Next.js baseline.
- Exclude cart, checkout, login, admin, and CMS for v1.

## Success Criteria
- The Next.js app shell is runnable and the catalog interactions are demonstrable.
- \`pnpm run test\` passes.
- The README explains install, start, and demo flow.`,
        planContent: `# Plan

- [ ] Define the Next.js routes, server-client boundaries, and interaction contract | milestone=M1 | kind=analysis | owner=planner | expectedOutput=Next.js catalog interaction contract note | verify=manual:review catalog contract
- [ ] Implement the Next.js app shell, catalog interactions, and CTA flow | milestone=M2 | kind=implementation | owner=worker | expectedOutput=working Next.js catalog app shell and interaction flow | dependsOn=T1 | verify=pnpm run test ;; runtime:web-smoke
- [ ] Verify the Next.js catalog interactions independently | milestone=M3 | kind=verification | owner=validator | expectedOutput=verification evidence | dependsOn=T2 | verify=pnpm run test`,
        milestoneContent: `# Milestones

- M1: Define Next.js catalog interaction contract | kind=planning
- M2: Implement Next.js app shell and interactions | kind=implementation | dependsOn=M1
- M3: Verify Next.js catalog behavior and handoff | kind=verification | dependsOn=M2`
      };
    }

    if (longRunning && lowerInput.includes("react") && lowerInput.includes("vite") && lowerInput.includes("catalog")) {
      return {
        specContent: `# Spec

Goal: ${input}

## Functional Requirements
- Build the v1 catalog as a React application powered by Vite.
- Render a branded landing page plus catalog listing with category, tag, and season filters.
- Support URL-backed filter state.
- Render product detail views, related products, and an inquiry CTA.
- Use mock product data, responsive layout, tests, and README instructions.

## Constraints
- Keep the runtime bootstrap limited to a minimal React + Vite baseline.
- Exclude cart, checkout, login, admin, and CMS for v1.

## Success Criteria
- The React/Vite app shell is runnable and the catalog interactions are demonstrable.
- \`pnpm run test\` passes.
- The README explains install, start, and demo flow.`,
        planContent: `# Plan

- [ ] Define the React routes, component state, and interaction contract | milestone=M1 | kind=analysis | owner=planner | expectedOutput=React catalog interaction contract note | verify=manual:review catalog contract
- [ ] Implement the Vite app shell, catalog interactions, and CTA flow | milestone=M2 | kind=implementation | owner=worker | expectedOutput=working React catalog app shell and interaction flow | dependsOn=T1 | verify=pnpm run test ;; runtime:web-smoke
- [ ] Verify the React catalog interactions independently | milestone=M3 | kind=verification | owner=validator | expectedOutput=verification evidence | dependsOn=T2 | verify=pnpm run test`,
        milestoneContent: `# Milestones

- M1: Define React catalog interaction contract | kind=planning
- M2: Implement Vite app shell and interactions | kind=implementation | dependsOn=M1
- M3: Verify React catalog behavior and handoff | kind=verification | dependsOn=M2`
      };
    }

    if (
      longRunning &&
      (lowerInput.includes("catalog webapp") ||
        lowerInput.includes("catalogue webapp") ||
        (lowerInput.includes("webapp") && lowerInput.includes("catalog")))
    ) {
      return {
        specContent: `# Spec

Goal: ${input}

## Functional Requirements
- Render a branded landing page and promotional hero.
- Render a product catalog listing with category, tag, and season filters.
- Support URL-backed filter state.
- Render product detail pages with related products and inquiry CTA.
- Use mock product data and a responsive layout.
- Include tests and a README.

## Constraints
- Start with a dependency-free runnable baseline.
- Exclude cart, checkout, login, admin, and CMS for v1.

## Success Criteria
- The catalog routes, filter interactions, and CTA flow are demonstrable.
- \`pnpm run test\` passes.
- The README explains setup and demo flow.`,
        planContent: `# Plan

- [ ] Define the catalog IA, routes, and interaction contract | milestone=M1 | kind=analysis | owner=planner | expectedOutput=catalog interaction contract note | verify=manual:review catalog contract
- [ ] Implement the catalog shell, filters, detail view, and CTA flow | milestone=M2 | kind=implementation | owner=worker | expectedOutput=working catalog shell, filters, detail view, and CTA | dependsOn=T1 | verify=pnpm run test ;; runtime:web-smoke
- [ ] Verify the catalog interactions independently | milestone=M3 | kind=verification | owner=validator | expectedOutput=verification evidence | dependsOn=T2 | verify=pnpm run test`,
        milestoneContent: `# Milestones

- M1: Define catalog interaction contract | kind=planning
- M2: Implement catalog shell and interactions | kind=implementation | dependsOn=M1
- M3: Verify catalog behavior and handoff | kind=verification | dependsOn=M2`
      };
    }

    if (longRunning && cliName) {
      const storageFile = `${cliName}.tasks.json`;
      const commandSummary =
        supportedCommands.length > 0 ? supportedCommands.join(", ") : "the required commands";
      return {
        specContent: `# Spec

Goal: ${input}

## Functional Requirements
- Expose a Node.js CLI named \`${cliName}\`.
- Persist task data in a local JSON file named \`${storageFile}\`.
- Support ${commandSummary} commands.
- Ship README usage examples and automated tests.

## Constraints
- No external runtime dependencies.
- Keep implementation understandable enough for follow-up agent passes.

## Success Criteria
- The CLI supports the required commands against the local JSON store.
- \`pnpm run test\` passes.
- The README explains setup and command usage.`,
        planContent: `# Plan

- [ ] Define the CLI contract and persistence behavior | milestone=M1 | kind=analysis | owner=planner | expectedOutput=command contract note | verify=manual:review command contract
- [ ] Implement the CLI commands, JSON persistence, README, and tests | milestone=M2 | kind=implementation | owner=worker | expectedOutput=working CLI, README, and tests | dependsOn=T1 | verify=pnpm run test
- [ ] Verify the CLI behavior independently | milestone=M3 | kind=verification | owner=validator | expectedOutput=verification evidence | dependsOn=T2 | verify=pnpm run test`,
        milestoneContent: `# Milestones

- M1: Define CLI contract | kind=planning
- M2: Implement commands and persistence | kind=implementation | dependsOn=M1
- M3: Verify CLI behavior and handoff | kind=verification | dependsOn=M2`
      };
    }

    return {
      specContent: `# Spec

Goal: ${input}

## Constraints
- Fill in concrete requirements

## Success Criteria
- Deliver a working outcome with verification evidence`,
      planContent: `# Plan

- [ ] Clarify edge cases | milestone=M1 | kind=analysis | owner=planner | expectedOutput=clarified requirements note | verify=manual:review requirements
- [ ] Implement the required change | milestone=M2 | kind=implementation | owner=worker | expectedOutput=code changes | dependsOn=T1 | verify=pnpm run test
- [ ] Verify behavior independently | milestone=M3 | kind=verification | owner=validator | expectedOutput=verification evidence | dependsOn=T2 | verify=pnpm run test`,
      milestoneContent: longRunning
        ? `# Milestones

- M1: Scope and plan | kind=planning
- M2: Implement core slice | kind=implementation | dependsOn=M1
- M3: Verify and handoff | kind=verification | dependsOn=M2`
        : undefined
    };
  }

  private inferNodeCliNameFromGoal(goal: string): string | null {
    const explicit = goal.match(/Node\.?js CLI called ([a-z0-9-]+)/i);
    if (explicit?.[1]) {
      return explicit[1].toLowerCase();
    }
    return null;
  }

  private inferSupportedCliCommands(goal: string): string[] {
    const match = goal.match(/supports? (.+?) commands?/i);
    if (!match?.[1]) {
      return [];
    }
    return match[1]
      .replace(/\band\b/gi, ",")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  private reopenForNewWork(force = false): void {
    if (force || this.session.state.phase === "completed" || this.session.state.phase === "cancelled") {
      this.session.state.phase = "idle";
      this.session.state.currentFlow = "auto";
      this.session.state.goalSummary = null;
      this.session.state.activeSpecPath = null;
      this.session.state.activePlanPath = null;
      this.session.state.activeMilestoneId = null;
      this.session.state.activeTaskId = null;
      this.session.state.lastVerificationStatus = null;
      this.session.state.lastVerificationPath = null;
      this.session.state.lastReviewPath = null;
      this.session.state.blocker = null;
      this.session.state.updatedAt = new Date().toISOString();

      this.session.taskState.activeMilestoneId = null;
      this.session.taskState.activeTaskId = null;
      this.session.taskState.milestones = {};
      this.session.taskState.tasks = {};
      this.session.taskState.taskKinds = {};
      this.session.taskState.taskOwners = {};
      this.session.taskState.taskExpectedOutputs = {};
      this.session.taskState.taskVerificationCommands = {};
      this.session.taskState.taskDependencies = {};
      this.session.taskState.milestoneKinds = {};
      this.session.taskState.milestoneDependencies = {};
      this.session.taskState.taskOutputs = {};
      this.session.taskState.taskBlockers = {};
      this.session.taskState.taskRecoveryHints = {};
        this.session.taskState.lastVerificationStatus = null;
        this.session.taskState.lastVerificationPath = null;
        this.session.taskState.lastReviewPath = null;
        this.session.taskState.lastHandoffPath = this.session.state.lastHandoffPath;
        this.session.taskState.resumePhase = null;
        this.session.taskState.blockers = [];
      }
    }

  async plan(input: string, longRunning = false): Promise<{ specPath: string; planPath: string; milestonePath?: string }> {
    this.reopenForNewWork(true);
    this.session.state = transitionPhase(this.session.state, "planning");
    this.session.state.currentFlow = longRunning ? "milestone" : "disciplined_single";
    this.session.state.goalSummary = input;
    const planning = this.buildPlanningArtifacts(input, longRunning);

    const spec = await this.artifactStore.write(
      "spec",
      planning.specContent,
      this.session.sessionId
    );
      const plan = await this.artifactStore.write(
        "plan",
        planning.planContent,
        this.session.sessionId
      );

    this.session.state.activeSpecPath = spec.path;
    this.session.state.activePlanPath = plan.path;

      const parsedTasks = parsePlanTasks(planning.planContent);
      const initialTaskId = parsedTasks[0]?.id ?? "T1";
      for (const task of parsedTasks) {
        this.session.taskState.tasks[task.id] = task.checked ? "done" : "todo";
        if (task.milestoneId) {
          this.session.taskState.taskMilestones[task.id] = task.milestoneId;
        }
        this.session.taskState.taskTexts[task.id] = task.text;
        if (task.kind) {
          this.session.taskState.taskKinds[task.id] = task.kind;
        }
        if (task.owner) {
          this.session.taskState.taskOwners[task.id] = task.owner;
        }
        if (task.expectedOutput) {
          this.session.taskState.taskExpectedOutputs[task.id] = task.expectedOutput;
        }
        if (task.dependsOn) {
          this.session.taskState.taskDependencies[task.id] = task.dependsOn;
        }
        if (task.verifyCommands) {
          this.session.taskState.taskVerificationCommands[task.id] = task.verifyCommands;
        }
      }
      this.session.state.activeTaskId = initialTaskId;
      this.session.taskState.activeTaskId = initialTaskId;

      let milestonePath: string | undefined;
      if (longRunning && planning.milestoneContent) {
        const milestoneContent = planning.milestoneContent;
        const milestones = await this.artifactStore.write(
          "milestones",
          milestoneContent,
          this.session.sessionId
        );
        milestonePath = milestones.path;
        const parsedMilestones = parseMilestones(milestoneContent);
        const initialMilestoneId = parsedMilestones[0]?.id ?? "M1";
        this.session.state.activeMilestoneId = initialMilestoneId;
        this.session.taskState.activeMilestoneId = initialMilestoneId;
        for (const milestone of parsedMilestones) {
          this.session.taskState.milestones[milestone.id] =
            milestone.id === initialMilestoneId ? "in_progress" : "todo";
          if (milestone.kind) {
            this.session.taskState.milestoneKinds[milestone.id] = milestone.kind;
          }
          this.session.taskState.milestoneTexts[milestone.id] = milestone.text;
          if (milestone.dependsOn) {
            this.session.taskState.milestoneDependencies[milestone.id] = milestone.dependsOn;
          }
        }
      } else {
        this.session.state.activeMilestoneId = null;
      }

    await this.persist();
    return { specPath: spec.path, planPath: plan.path, milestonePath };
  }

  async verify(): Promise<{ path: string; result: VerificationResult }> {
    if (this.session.state.phase === "completed") {
      this.reopenForNewWork();
      if (this.session.state.activeTaskId === null) {
        this.session.state.activeTaskId = "T1";
        this.session.taskState.activeTaskId = "T1";
        this.session.taskState.tasks.T1 = "in_progress";
      }
      this.session.state.phase = "implementing";
    }
    if (this.session.state.phase === "planning") {
      this.session.state = transitionPhase(this.session.state, "implementing");
    }
    this.session.state = transitionPhase(this.session.state, "verifying");
      const taskId = this.session.state.activeTaskId;
      const taskOwner = taskId ? this.session.taskState.taskOwners[taskId] ?? null : null;
      const usesIndependentValidator =
        this.session.state.currentFlow === "worker_validator" || taskOwner === "validator";
      const validatorExecutionMode = this.getExecutionModeForTask(taskId);
      const validatorAgentSummary =
        usesIndependentValidator && validatorExecutionMode === "agent"
          ? await this.runAgentTurn(
              buildVerificationPrompt({
                goalSummary: this.session.state.goalSummary,
                activePlanPath: this.session.state.activePlanPath,
                activePlanExcerpt: await this.readArtifactExcerpt(this.session.state.activePlanPath),
                activeSpecExcerpt: await this.readArtifactExcerpt(this.session.state.activeSpecPath),
                activeMilestoneId: this.session.state.activeMilestoneId,
                activeTaskId: taskId,
                taskKind: taskId ? this.session.taskState.taskKinds[taskId] ?? null : null,
                taskOwner,
                expectedOutput: taskId ? this.session.taskState.taskExpectedOutputs[taskId] ?? null : null,
                taskStatus: taskId ? this.session.taskState.tasks[taskId] ?? null : null,
                verifyCommands: taskId ? this.session.taskState.taskVerificationCommands[taskId] ?? null : null
              })
            )
          : null;
      const validatorResult =
          usesIndependentValidator
            ? validatorExecutionMode === "agent"
              ? {
                  role: "validator" as const,
                  taskId,
                  summary: validatorAgentSummary ?? `Validator reviewed ${taskId}.`,
                  evidence: [
                    `model: ${this.selectModelForTask(taskId).id}`,
                    `goal: ${this.session.state.goalSummary ?? "(no goal)"}`,
                    `task: ${taskId ?? "T1"}`,
                    "context: in-process agent runtime",
                    "validation path: agent"
                  ]
                }
              : await (validatorExecutionMode === "subprocess" ? this.subprocessExecutor : this.freshExecutor).run({
                role: "validator",
                modelId: this.selectModelForTask(taskId).id,
                cwd: this.session.cwd,
                goal: this.session.state.goalSummary ?? "(no goal)",
                activeTaskId: taskId,
                activeMilestoneId: this.session.state.activeMilestoneId,
                artifactPaths: (await this.listArtifacts()).map(item => item.path)
              })
            : null;

      const verifyCommands = taskId
        ? this.session.taskState.taskVerificationCommands[taskId] ?? null
        : null;
      const commandChecks =
        this.session.state.currentFlow !== "worker_validator" && verifyCommands && verifyCommands.length > 0
          ? await Promise.all(
              verifyCommands.map(async command => {
                if (command.startsWith("manual:")) {
                  const detail = command.slice("manual:".length).trim() || "Manual review";
                  const passed = Boolean(taskId && this.session.taskState.taskOutputs[taskId]);
                  return {
                    command,
                    passed,
                    detail: passed
                      ? `Manual verification satisfied: ${detail}`
                      : `Manual verification requires task output: ${detail}`
                  };
                }

                if (command === "runtime:web-smoke") {
                  const smoke = await this.smokeWebApp();
                  return {
                    command,
                    passed: smoke.success,
                    detail: smoke.success
                      ? `Web smoke passed at ${smoke.url} (${smoke.title ?? "no title"})`
                      : smoke.errorMessage ?? "Web smoke failed"
                  };
                }

                const result = await createBashTool(this.session.cwd).execute("verify-command", { command });
                const exitCode =
                  (result.details as { exitCode?: number | null } | undefined)?.exitCode ?? null;
                const passed = exitCode === 0;
                return {
                  command,
                  passed,
                  detail:
                    result.content.map(part => part.text).join("\n").trim() ||
                    (passed ? "Command passed" : "Command failed")
                };
              })
            )
          : [];
      const allCommandsPassed =
        commandChecks.length > 0 ? commandChecks.every(check => check.passed) : null;
      const failedCommandDetails = commandChecks.filter(check => !check.passed).map(check => `${check.command}: ${check.detail}`);
      const commandFailureText = failedCommandDetails.length > 0 ? failedCommandDetails.join("\n") : null;
      const activeTaskId = this.session.state.activeTaskId;
      const activeTaskKind = activeTaskId ? this.session.taskState.taskKinds[activeTaskId] ?? null : null;
      const implementationVerificationFailed =
        activeTaskId !== null && activeTaskKind === "implementation" && allCommandsPassed === false;

      const result: VerificationResult = {
          status: this.session.state.activeTaskId
            ? allCommandsPassed === false
              ? "fail"
              : "pass"
            : "blocked",
        mode: usesIndependentValidator ? "independent_validate" : "self_check",
        provider: this.selectModelForTask(this.session.state.activeTaskId).provider,
        modelId: this.selectModelForTask(this.session.state.activeTaskId).id,
        targetTaskId: this.session.state.activeTaskId,
        expectedOutput: this.session.state.activeTaskId
          ? this.session.taskState.taskExpectedOutputs[this.session.state.activeTaskId] ?? null
          : null,
        taskOutputPath: this.session.state.activeTaskId
          ? this.session.taskState.taskOutputs[this.session.state.activeTaskId] ?? null
          : null,
        summary: this.session.state.activeTaskId
            ? usesIndependentValidator
              ? validatorResult?.summary ?? `Validator independently accepted task ${this.session.state.activeTaskId}.`
                : commandChecks.length > 0
                  ? `Verification commands ${allCommandsPassed ? "passed" : "failed"} for ${this.session.state.activeTaskId}.`
                  : `Task ${this.session.state.activeTaskId} has a placeholder verification pass.`
            : "No active task or plan exists for verification.",
        evidence: this.session.state.activeTaskId
          ? [
                `Active task ${this.session.state.activeTaskId} exists`,
                usesIndependentValidator
                  ? "Independent validator path selected"
                  : "Runtime reached verifying phase",
                ...commandChecks.map(check => `${check.command}: ${check.detail}`),
                ...(validatorResult?.evidence ?? [])
              ]
          : [],
        checks: this.session.state.activeTaskId
          ? [
            {
              kind: "runtime",
              label: "task-present",
              outcome: "pass",
              detail: `Task ${this.session.state.activeTaskId} is active in the runtime ledger`
            },
              {
                kind: usesIndependentValidator ? "manual" : "runtime",
                label: "verification-mode",
                outcome: "info",
                detail:
                  usesIndependentValidator
                    ? "Independent validator path selected"
                    : "Self-check path selected"
              },
                ...(this.session.state.activeTaskId &&
                this.session.taskState.taskVerificationCommands[this.session.state.activeTaskId]
                    ? this.session.taskState.taskVerificationCommands[this.session.state.activeTaskId].map((command, index) => ({
                      kind: (command.startsWith("manual:")
                        ? "manual"
                        : "command") as "command" | "manual",
                      label: `verify-command-${index + 1}`,
                      outcome: (commandChecks[index]?.passed === false
                        ? "fail"
                        : commandChecks[index]?.passed === true
                          ? "pass"
                          : "info") as "pass" | "fail" | "info",
                      detail: command
                    }))
                  : [])
            ]
          : [],
        failedChecks: commandFailureText ? [commandFailureText] : undefined,
        recoveryHint:
          commandChecks.some(
            check => check.command.startsWith("manual:") && check.passed === false
          ) && activeTaskId && !this.session.taskState.taskOutputs[activeTaskId]
            ? "manual_output_required"
            : implementationVerificationFailed
              ? "implementation_fix_required"
              : null,
        suggestedNextStep: this.session.state.activeTaskId
          ? this.session.taskState.taskVerificationCommands[this.session.state.activeTaskId]
            ? allCommandsPassed === false
              ? `Fix the issue, then re-run: ${this.formatVerifyCommands(this.session.taskState.taskVerificationCommands[this.session.state.activeTaskId])}`
              : `Run and validate: ${this.formatVerifyCommands(this.session.taskState.taskVerificationCommands[this.session.state.activeTaskId])}`
            : "Replace placeholder verification with real checks."
          : "Create or resume a task before verifying."
      };

    const path = await writeVerificationResult(this.artifactStore, this.session.sessionId, result);
    this.session.state.lastVerificationStatus = result.status;
    this.session.taskState.lastVerificationStatus = result.status;
    this.session.state.lastVerificationPath = path;
    this.session.taskState.lastVerificationPath = path;
      if (this.session.taskState.activeTaskId) {
        this.session.taskState.tasks[this.session.taskState.activeTaskId] =
          result.status === "pass" ? "validated" : "blocked";
        if (result.status === "pass") {
          delete this.session.taskState.taskRecoveryHints[this.session.taskState.activeTaskId];
        }
        if (commandFailureText) {
          this.session.taskState.taskBlockers[this.session.taskState.activeTaskId] = commandFailureText;
          if (result.recoveryHint) {
            this.session.taskState.taskRecoveryHints[this.session.taskState.activeTaskId] = result.recoveryHint;
          } else {
            delete this.session.taskState.taskRecoveryHints[this.session.taskState.activeTaskId];
          }
        }
      }
      if (commandFailureText) {
        this.session.state.blocker = commandFailureText;
        this.session.taskState.blockers = Array.from(
          new Set([...this.session.taskState.blockers, commandFailureText])
        );
      }
      this.session.state = transitionPhase(this.session.state, canComplete(result) ? "reviewing" : "paused");
      this.session.taskState.resumePhase = this.session.state.phase === "paused" ? "implementing" : "reviewing";
      await this.persist();

    return { path, result };
  }

  async review(): Promise<string> {
    const hasPassedVerification =
      this.session.state.lastVerificationStatus === "pass" &&
      this.session.state.lastVerificationPath !== null;
    if (hasPassedVerification && this.session.state.phase === "reviewing") {
      if (this.session.taskState.activeTaskId) {
        this.session.taskState.tasks[this.session.taskState.activeTaskId] = "done";
      }

      if (this.session.state.currentFlow === "milestone" && this.session.taskState.activeMilestoneId) {
        this.session.taskState.milestones[this.session.taskState.activeMilestoneId] = "done";
        const ordered = Object.keys(this.session.taskState.milestones).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );
        const currentIndex = ordered.indexOf(this.session.taskState.activeMilestoneId);
        const hasNextMilestone = currentIndex !== -1 && ordered.slice(currentIndex + 1).some(id => {
          const status = this.session.taskState.milestones[id];
          return status === "todo" || status === "in_progress";
        });

        if (hasNextMilestone) {
          this.session.state = transitionPhase(this.session.state, "paused");
          this.session.taskState.resumePhase = "planning";
        } else {
          this.session.state = transitionPhase(this.session.state, "completed");
          this.session.taskState.resumePhase = null;
        }
      } else {
        this.session.state = transitionPhase(this.session.state, "completed");
        this.session.taskState.resumePhase = null;
      }
    }

    const taskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
    const taskStatus = taskId ? this.session.taskState.tasks[taskId] ?? null : null;
    const readyTasks = this.getReadyTaskDescriptors();
    const pendingDependencies = this.getPendingDependencySummaries();
    const summary = [
      `Phase: ${this.session.state.phase}`,
      `Goal: ${this.session.state.goalSummary ?? "(none)"}`,
      `Spec: ${this.session.state.activeSpecPath ?? "(none)"}`,
      `Plan: ${this.session.state.activePlanPath ?? "(none)"}`,
      `Milestone: ${this.session.state.activeMilestoneId ?? "(none)"}`,
      `Milestone text: ${
        this.session.state.activeMilestoneId
          ? this.session.taskState.milestoneTexts[this.session.state.activeMilestoneId] ?? "(none)"
          : "(none)"
      }`,
      `Milestone status: ${
        this.session.state.activeMilestoneId
          ? this.session.taskState.milestones[this.session.state.activeMilestoneId] ?? "(none)"
          : "(none)"
      }`,
      `Next milestone: ${this.getNextMilestoneId() ?? "(none)"}`,
      `Next milestone text: ${
        this.getNextMilestoneId()
          ? this.session.taskState.milestoneTexts[this.getNextMilestoneId()!] ?? "(none)"
          : "(none)"
      }`,
      `Milestone progress: ${this.getMilestoneProgress()}`,
      `Milestone status counts: ${this.getMilestoneStatusCounts()}`,
      `Task progress: ${this.getTaskProgress()}`,
      `Task status counts: ${this.getTaskStatusCounts()}`,
      `Task: ${taskId ?? "(none)"}`,
      `Task text: ${taskId ? this.session.taskState.taskTexts[taskId] ?? "(none)" : "(none)"}`,
      `Task status: ${taskStatus ?? "(none)"}`,
      `Task kind: ${taskId ? this.session.taskState.taskKinds[taskId] ?? "(none)" : "(none)"}`,
      `Task owner: ${taskId ? this.session.taskState.taskOwners[taskId] ?? "(none)" : "(none)"}`,
      `Expected output: ${taskId ? this.session.taskState.taskExpectedOutputs[taskId] ?? "(none)" : "(none)"}`,
      `Task output: ${taskId ? this.session.taskState.taskOutputs[taskId] ?? "(none)" : "(none)"}`,
      `Provider: ${this.selectModelForTask(taskId).provider}`,
      `Model: ${this.selectModelForTask(taskId).id}`,
      `Temperature: ${this.selectModelForTask(taskId).temperature ?? "(none)"}`,
      `Max tokens: ${this.selectModelForTask(taskId).maxTokens ?? "(none)"}`,
      `Execution mode: ${this.getExecutionModeForTask(taskId)}`,
      `Verification status: ${this.session.state.lastVerificationStatus ?? "(none)"}`,
      `Recovery hint: ${taskId ? this.session.taskState.taskRecoveryHints[taskId] ?? "(none)" : "(none)"}`,
      `Verification: ${this.session.state.lastVerificationPath ?? "(none)"}`,
      `Handoff: ${this.session.state.lastHandoffPath ?? "(none)"}`,
      `Ready tasks: ${readyTasks.length > 0 ? readyTasks.join(" | ") : "(none)"}`,
      `Pending dependencies: ${pendingDependencies.length > 0 ? pendingDependencies.join(" | ") : "(none)"}`,
      `Allowed tools: ${this.getStatus().allowedTools.join(", ")}`,
      `Next action: ${this.getSuggestedNextAction(taskStatus)}`
      ].join("\n");
    const meta = await this.artifactStore.write("review", `# Review\n\n${summary}`, this.session.sessionId);
    this.session.state.lastReviewPath = meta.path;
    this.session.taskState.lastReviewPath = meta.path;
    await this.persist();
    return meta.path;
  }

  async advanceMilestone(): Promise<string> {
    const current = this.session.taskState.activeMilestoneId;
    if (!current) {
      return "No active milestone";
    }

    const ordered = Object.keys(this.session.taskState.milestones).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const currentIndex = ordered.indexOf(current);
    if (currentIndex === -1) {
      return `Unknown milestone: ${current}`;
    }

    this.session.taskState.milestones[current] = "done";

    const next = ordered[currentIndex + 1];
    if (!next) {
      this.session.state.phase = "completed";
      this.session.state.updatedAt = new Date().toISOString();
      this.session.state.activeMilestoneId = current;
      this.session.state.activeTaskId = null;
      this.session.taskState.activeTaskId = null;
      await this.persist();
      return `${current} completed; no remaining milestones`;
    }

    const milestoneDependencies = this.getUnsatisfiedMilestoneDependencies(next);
    if (milestoneDependencies.length > 0) {
      this.session.state.phase = "paused";
      this.session.state.blocker = `Milestone ${next} is waiting on dependencies: ${milestoneDependencies.join(", ")}`;
      this.session.state.updatedAt = new Date().toISOString();
      this.session.taskState.resumePhase = "planning";
      await this.persist();
      return `Cannot activate ${next}; waiting on milestone dependencies: ${milestoneDependencies.join(", ")}`;
    }

    const nextTaskId = this.getFirstReadyTaskIdForMilestone(next) ?? `T${currentIndex + 2}`;
    this.session.taskState.milestones[next] = "in_progress";
    this.session.taskState.tasks[nextTaskId] = "todo";
    this.session.taskState.activeMilestoneId = next;
    this.session.taskState.activeTaskId = nextTaskId;
    this.session.state.activeMilestoneId = next;
    this.session.state.activeTaskId = nextTaskId;
    this.session.state.phase = "planning";
    this.session.state.currentFlow = "milestone";
    this.invalidateVerificationState();
    this.session.state.updatedAt = new Date().toISOString();
    await this.persist();
    return `${current} completed; ${next} is now active`;
  }

  async continueTaskLoop(): Promise<string> {
    if (this.session.state.phase === "completed") {
      return "Run is completed; start a new task or long-running plan.";
    }

    this.session.state.activeTaskId = this.session.taskState.activeTaskId;
    this.session.state.activeMilestoneId = this.session.taskState.activeMilestoneId;

    if (this.session.state.phase === "paused" && this.session.state.blocker === null) {
      const resumed = await this.resume();
      const continued = await this.continueTaskLoop();
      return `Resumed into ${resumed}. ${continued}`;
    }

    const taskId = this.session.taskState.activeTaskId;
    if (!taskId) {
      const nextReadyTaskId = this.getFirstReadyTaskId();
      if (!nextReadyTaskId) {
        return "No active task";
      }
      this.session.taskState.activeTaskId = nextReadyTaskId;
      this.session.state.activeTaskId = nextReadyTaskId;
      this.session.state.phase = "planning";
      this.session.state.updatedAt = new Date().toISOString();
      await this.persist();
      const continued = await this.continueTaskLoop();
      return `No active task was set; ${nextReadyTaskId} is now active. ${continued}`;
    }

    const taskStatus = this.session.taskState.tasks[taskId];
    if (taskStatus === "todo") {
      const pendingDependencies = this.getUnsatisfiedTaskDependencies(taskId);
      if (pendingDependencies.length > 0) {
        this.session.state.phase = "paused";
        this.session.state.updatedAt = new Date().toISOString();
        this.session.taskState.resumePhase = "planning";
        await this.persist();
        return `${taskId} is waiting on dependencies: ${pendingDependencies.join(", ")}. ${this.getSuggestedNextAction("todo")}`;
      }
      if (this.session.taskState.taskKinds[taskId] === "verification") {
        this.session.taskState.tasks[taskId] = "in_progress";
        await this.persist();
        const verification = await this.verify();
        return `${taskId} verification task -> ${verification.result.status}. Next: ${this.getSuggestedNextAction(
          verification.result.status === "pass" ? "validated" : "blocked"
        )}`;
      }
      await this.executeCurrentTask();
      return `${taskId} moved to in_progress`;
    }

    if (taskStatus === "in_progress") {
      const verification = await this.verify();
      return `${taskId} verification -> ${verification.result.status}. Next: ${this.getSuggestedNextAction("validated")}`;
    }

    if (taskStatus === "validated") {
      const reviewPath = await this.review();
      return `${taskId} review -> ${reviewPath}. Next: ${this.getSuggestedNextAction("done")}`;
    }

    if (taskStatus === "done") {
      const nextTaskId = this.findNextTodoTaskId(taskId);
      if (nextTaskId) {
        this.session.taskState.activeTaskId = nextTaskId;
        this.session.state.activeTaskId = nextTaskId;
        this.session.state.phase = "planning";
        this.session.state.updatedAt = new Date().toISOString();
        await this.persist();
        return `${taskId} complete; ${nextTaskId} is now active`;
      }
      const nextPendingTaskId = this.findNextPendingTodoTaskId(taskId);
      if (nextPendingTaskId) {
        const pendingDependencies = this.getUnsatisfiedTaskDependencies(nextPendingTaskId);
        this.session.state.phase = "paused";
        this.session.state.activeTaskId = nextPendingTaskId;
        this.session.taskState.activeTaskId = nextPendingTaskId;
        this.session.state.updatedAt = new Date().toISOString();
        this.session.taskState.resumePhase = "planning";
        await this.persist();
        return `${taskId} complete; ${nextPendingTaskId} is waiting on dependencies: ${pendingDependencies.join(", ")}.`;
      }
      const advanced = await this.advanceMilestone();
      if (this.session.state.phase === "planning" && this.session.state.blocker === null) {
        const continued = await this.continueTaskLoop();
        return `${advanced}. ${continued}`;
      }
      return advanced;
    }

    if (taskStatus === "blocked") {
      if (this.isAutoRecoverableBlockedTask(taskId)) {
        return this.autoRecoverBlockedTask(taskId);
      }
      const blocker = this.session.taskState.taskBlockers[taskId] ?? "unknown blocker";
      return `${taskId} is blocked: ${blocker}. ${this.getSuggestedNextAction("blocked")}`;
    }

    return `${taskId} has no continuation path`;
  }

  async runCompletionLoop(maxSteps = 10): Promise<string[]> {
    return (await this.runCompletionLoopDetailed(maxSteps)).steps;
  }

  async runCompletionLoopDetailed(maxSteps = 10): Promise<CompletionLoopResult> {
    const steps: string[] = [];
    let stopReason: CompletionLoopResult["stopReason"] = "max_steps";

    for (let index = 0; index < maxSteps; index += 1) {
      if (this.session.state.phase === "completed") {
        stopReason = "completed";
        break;
      }
      const activeTaskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
      if (
        this.session.state.phase === "paused" &&
        this.session.state.blocker &&
        !this.isAutoRecoverableBlockedTask(activeTaskId)
      ) {
        stopReason = "blocked";
        break;
      }

      const before = JSON.stringify({
        phase: this.session.state.phase,
        milestone: this.session.taskState.activeMilestoneId,
        task: this.session.taskState.activeTaskId,
        taskStatus: this.session.taskState.activeTaskId
          ? this.session.taskState.tasks[this.session.taskState.activeTaskId] ?? null
          : null,
        blocker: this.session.state.blocker
      });

      const result = await this.continueTaskLoop();
      steps.push(result);

      const after = JSON.stringify({
        phase: this.session.state.phase,
        milestone: this.session.taskState.activeMilestoneId,
        task: this.session.taskState.activeTaskId,
        taskStatus: this.session.taskState.activeTaskId
          ? this.session.taskState.tasks[this.session.taskState.activeTaskId] ?? null
          : null,
        blocker: this.session.state.blocker
      });

      if (before === after) {
        stopReason = "no_progress";
        break;
      }

      if (
        this.session.state.phase === "paused" &&
        this.session.state.blocker &&
        !this.isAutoRecoverableBlockedTask(this.session.taskState.activeTaskId ?? this.session.state.activeTaskId)
      ) {
        stopReason = "blocked";
        break;
      }
    }

    return {
      steps,
      stopReason,
      finalPhase: this.session.state.phase,
      finalMilestoneId: this.session.taskState.activeMilestoneId ?? this.session.state.activeMilestoneId,
      finalTaskId: this.session.taskState.activeTaskId ?? this.session.state.activeTaskId,
      blocker: this.session.state.blocker,
      completed: this.session.state.phase === "completed"
    };
  }

  async executeCurrentTask(): Promise<string> {
    this.reopenForNewWork();
    if (this.session.state.currentFlow === "auto") {
      this.session.state.currentFlow = this.session.state.activeMilestoneId ? "milestone" : "disciplined_single";
    }
      if (this.session.state.phase === "planning") {
        this.session.state = transitionPhase(this.session.state, "implementing");
      } else if (this.session.state.phase === "paused") {
      this.session.state = transitionPhase(this.session.state, "implementing");
    }

    if (this.session.state.activeTaskId === null) {
      this.session.state.activeTaskId = "T1";
      this.session.taskState.activeTaskId = "T1";
    }

      const taskId = this.session.state.activeTaskId;
      const role = this.resolveExecutionRole(taskId);
      const activeModel = this.selectModelForTask(taskId);
      const executionMode = this.getExecutionModeForTask(taskId);
      const beforeSnapshot =
        role === "worker" && executionMode === "agent"
          ? await this.captureWorkspaceFileSnapshot()
          : null;
      await this.bootstrapCatalogWebappIfNeeded(taskId, role);
      await this.bootstrapBlankNodeCliProjectIfNeeded(taskId, role);
      const useIsolatedExecutor =
        this.session.state.currentFlow === "worker_validator" ||
        (role !== null && executionMode !== "agent");
      const useSubprocessWorker = role !== null && executionMode === "subprocess";
      this.session.taskState.tasks[taskId] = "in_progress";
      this.session.taskState.resumePhase = "implementing";
      const workerResult =
        useIsolatedExecutor
          ? await (useSubprocessWorker ? this.subprocessExecutor : this.freshExecutor).run({
              role: this.session.state.currentFlow === "worker_validator" ? "worker" : role ?? "worker",
              modelId: activeModel.id,
              cwd: this.session.cwd,
              goal: this.session.state.goalSummary ?? "(no goal)",
              activeTaskId: taskId,
              activeMilestoneId: this.session.state.activeMilestoneId,
              artifactPaths: (await this.listArtifacts()).map(item => item.path)
            })
          : null;

      const taskContextInput = await this.buildTaskContextInput(taskId, role);
      let agentSummary =
        this.session.state.currentFlow === "worker_validator"
          ? workerResult?.summary ?? `Worker executing task ${taskId}.`
          : useIsolatedExecutor
            ? workerResult?.summary ??
              `${role === "planner" ? "Planner" : role === "validator" ? "Validator" : "Worker"} executing task ${taskId}.`
          : await this.runAgentTurn(
              buildExecutionPrompt(taskContextInput)
            );
      let changedFiles =
        beforeSnapshot === null
          ? []
          : this.diffWorkspaceSnapshots(beforeSnapshot, await this.captureWorkspaceFileSnapshot());

      if (
        role === "worker" &&
        executionMode === "agent" &&
        activeModel.provider !== "local" &&
        changedFiles.length === 0
      ) {
        const retry = await this.runWorkerRetryAfterNoChanges(taskId, role, beforeSnapshot);
        agentSummary = retry.summary;
        changedFiles = retry.changedFiles;
      }

      const executionNoteBody = [
        "# Task Output",
        "",
        `Task: ${taskId}`,
        `Role: ${role ?? "agent"}`,
        `Model: ${activeModel.id}`,
        `Milestone: ${this.session.state.activeMilestoneId ?? "(none)"}`,
        `Goal: ${this.session.state.goalSummary ?? "(no goal)"}`,
        `Expected output: ${taskId ? this.session.taskState.taskExpectedOutputs[taskId] ?? "(none)" : "(none)"}`,
        "",
        "## Changed Files",
        ...(changedFiles.length > 0 ? changedFiles.map(path => `- ${path}`) : ["- (none)"]),
        "",
        "## Summary",
        agentSummary
      ].join("\n");

      const executionNote = await this.artifactStore.write(
        "note",
        executionNoteBody,
        this.session.sessionId
      );
    this.invalidateVerificationState();
    this.session.taskState.taskOutputs[taskId] = executionNote.path;
    delete this.session.taskState.taskRecoveryHints[taskId];
    if (role === "worker" && executionMode === "agent" && activeModel.provider !== "local" && changedFiles.length === 0) {
      const reason = "Implementation produced no concrete file changes outside .harness.";
      this.session.taskState.tasks[taskId] = "blocked";
      this.session.taskState.taskBlockers[taskId] = reason;
      this.session.taskState.taskRecoveryHints[taskId] = "implementation_no_changes";
      this.session.taskState.blockers = Array.from(new Set([...this.session.taskState.blockers, reason]));
      this.session.state.blocker = reason;
      this.session.state.phase = "paused";
    }
    await this.persist();
    return taskId;
  }

  async completeCurrentTask(): Promise<string> {
    const taskId = this.session.taskState.activeTaskId;
    if (!taskId) {
      return "No active task";
    }
    this.session.taskState.tasks[taskId] = "done";
    this.session.state.phase = "reviewing";
    this.session.state.updatedAt = new Date().toISOString();
    await this.persist();
    return `${taskId} marked done`;
  }

  async blockCurrentTask(reason: string): Promise<string> {
    const taskId = this.session.taskState.activeTaskId;
    if (!taskId) {
      return "No active task";
    }
    this.session.taskState.tasks[taskId] = "blocked";
    this.session.taskState.taskBlockers[taskId] = reason;
    delete this.session.taskState.taskRecoveryHints[taskId];
    this.session.taskState.blockers = Array.from(new Set([...this.session.taskState.blockers, reason]));
    this.session.state.blocker = reason;
    this.session.state.phase = "paused";
    this.session.state.updatedAt = new Date().toISOString();
    this.session.taskState.resumePhase = "implementing";
    await this.persist();
    return `${taskId} blocked: ${reason}`;
  }

  async unblockCurrentTask(): Promise<string> {
    const taskId = this.session.taskState.activeTaskId;
    if (!taskId) {
      return "No active task";
    }
    delete this.session.taskState.taskBlockers[taskId];
    delete this.session.taskState.taskRecoveryHints[taskId];
    this.session.taskState.blockers = this.session.taskState.blockers.filter(
      blocker => blocker !== this.session.state.blocker
    );
    this.session.taskState.tasks[taskId] = "todo";
    this.session.state.blocker = null;
    this.session.state.phase = "paused";
    this.session.state.updatedAt = new Date().toISOString();
    this.session.taskState.resumePhase = "implementing";
    await this.persist();
    return `${taskId} moved back to todo and is ready to continue`;
  }

  async enterWorkerValidator(taskDescription?: string): Promise<string> {
    this.session.state.currentFlow = "worker_validator";
      if (this.session.state.phase === "idle") {
        this.session.state = transitionPhase(this.session.state, "planning");
      }
    if (this.session.state.activeTaskId === null) {
      this.session.state.activeTaskId = "T1";
      this.session.taskState.activeTaskId = "T1";
    }
      this.session.taskState.tasks[this.session.state.activeTaskId] = "in_progress";
      this.session.taskState.resumePhase = "implementing";
      const note = await this.artifactStore.write(
      "note",
      `Worker-validator flow initialized for ${this.session.state.activeTaskId}.${taskDescription ? `\n\nTask: ${taskDescription}` : ""}`,
      this.session.sessionId
    );
    this.invalidateVerificationState();
    this.session.taskState.taskOutputs[this.session.state.activeTaskId] = note.path;
    await this.persist();
    return this.session.state.activeTaskId;
  }

  async resume(): Promise<string> {
        const targetPhase: Phase =
          this.session.state.phase === "paused"
            ? (this.session.taskState.resumePhase ?? (this.session.state.activePlanPath ? "planning" : "implementing"))
            : this.session.state.phase;

      if (this.session.state.phase === "paused") {
        this.session.state.blocker = null;
        this.session.taskState.blockers = [];
        this.session.state = transitionPhase(this.session.state, targetPhase);
        this.session.taskState.resumePhase = targetPhase;
        await this.persist();
      }

    return this.session.state.phase;
  }

  async handleInput(rawInput: string): Promise<string> {
    const isExplicitCommand = rawInput.trim().startsWith("/");
    if (!isExplicitCommand) {
      this.reopenForNewWork(true);
    } else {
      this.reopenForNewWork();
    }
    const { explicitMode, strippedInput } = parseCommand(rawInput);
    const route = routeFlow({
      rawInput: strippedInput,
      explicitMode,
      currentPhase: this.session.state.phase,
      hasActivePlan: this.session.state.activePlanPath !== null,
      hasVerificationTarget: this.session.state.activeTaskId !== null || this.session.state.activePlanPath !== null,
      hasPendingHandoff: this.session.state.lastHandoffPath !== null,
      hasActiveMilestone: this.session.state.activeMilestoneId !== null
    });

      this.session.state.currentFlow = route.selectedFlow;
      if (route.blocked) {
        return `Blocked: ${route.blocked.message}`;
      }

    const goalInput = strippedInput || "(empty request)";
    const goalMeta = await this.artifactStore.write(
      "goal_summary",
      goalInput,
      this.session.sessionId
    );

    if (route.nextPhase === "planning") {
      const planned = await this.plan(goalInput, route.selectedFlow === "milestone");
      if (route.selectedFlow === "worker_validator") {
        this.session.state.currentFlow = "worker_validator";
        await this.persist();
      }
      return [
        `Phase: ${this.session.state.phase}`,
        `Flow: ${this.session.state.currentFlow}`,
        `Reasons: ${route.classification.reasons.join("; ")}`,
        `Goal: ${goalMeta.path}`,
        `Spec: ${planned.specPath}`,
        `Plan: ${planned.planPath}`,
        planned.milestonePath ? `Milestones: ${planned.milestonePath}` : null
      ]
        .filter(Boolean)
        .join("\n");
    }

    this.session.state = transitionPhase(this.session.state, route.nextPhase);
    this.session.state.goalSummary = strippedInput || this.session.state.goalSummary;

    if (route.nextPhase === "implementing" && this.session.state.activeTaskId === null) {
      this.session.state.activeTaskId = "T1";
      this.session.taskState.activeTaskId = "T1";
      this.session.taskState.tasks.T1 = "in_progress";
    }

    await this.persist();

    return [
      `Phase: ${this.session.state.phase}`,
      `Flow: ${route.selectedFlow}`,
      `Reasons: ${route.classification.reasons.join("; ")}`,
      `Goal: ${goalMeta.path}`
    ].join("\n");
  }

  async createHandoff(nextStep?: string): Promise<string> {
    const artifacts = await this.listArtifacts();
    const taskId = this.session.taskState.activeTaskId ?? this.session.state.activeTaskId;
    const taskStatus = taskId ? this.session.taskState.tasks[taskId] ?? null : null;
    const readyTasks = this.getReadyTaskDescriptors();
    const pendingDependencies = this.getPendingDependencySummaries();
    const handoffPath = await createHandoff(this.artifactStore, {
      sessionId: this.session.sessionId,
      goal: this.session.state.goalSummary,
      phase: this.session.state.phase,
      activeSpecPath: this.session.state.activeSpecPath,
      activePlanPath: this.session.state.activePlanPath,
      activeMilestoneId: this.session.state.activeMilestoneId,
      activeMilestoneText: this.session.state.activeMilestoneId
        ? this.session.taskState.milestoneTexts[this.session.state.activeMilestoneId] ?? null
        : null,
      activeMilestoneStatus: this.session.state.activeMilestoneId
        ? this.session.taskState.milestones[this.session.state.activeMilestoneId] ?? null
        : null,
      nextMilestoneId: this.getNextMilestoneId(),
      nextMilestoneText: this.getNextMilestoneId()
        ? this.session.taskState.milestoneTexts[this.getNextMilestoneId()!] ?? null
        : null,
      milestoneProgress: this.getMilestoneProgress(),
      milestoneStatusCounts: this.getMilestoneStatusCounts(),
      taskProgress: this.getTaskProgress(),
      taskStatusCounts: this.getTaskStatusCounts(),
      activeTaskId: taskId,
      activeTaskText: taskId ? this.session.taskState.taskTexts[taskId] ?? null : null,
      activeTaskStatus: taskStatus,
      activeTaskKind: taskId ? this.session.taskState.taskKinds[taskId] ?? null : null,
      activeTaskOwner: taskId ? this.session.taskState.taskOwners[taskId] ?? null : null,
      activeTaskExpectedOutput: taskId ? this.session.taskState.taskExpectedOutputs[taskId] ?? null : null,
      activeTaskOutputPath: taskId ? this.session.taskState.taskOutputs[taskId] ?? null : null,
      activeProvider: this.selectModelForTask(taskId).provider,
      activeModelId: this.selectModelForTask(taskId).id,
      activeModelTemperature: this.selectModelForTask(taskId).temperature ?? null,
      activeModelMaxTokens: this.selectModelForTask(taskId).maxTokens ?? null,
      activeExecutionMode: this.getExecutionModeForTask(taskId),
      lastVerificationStatus: this.session.state.lastVerificationStatus,
      activeTaskRecoveryHint: taskId ? this.session.taskState.taskRecoveryHints[taskId] ?? null : null,
      readyTasks,
      pendingDependencies,
      allowedTools: this.getStatus().allowedTools,
      artifactPaths: artifacts.map(item => item.path),
      nextStep: nextStep ?? this.getSuggestedNextAction(taskStatus),
      verificationPath: this.session.state.lastVerificationPath,
      blocker: this.session.state.blocker
    });
    this.session.state.lastHandoffPath = handoffPath;
    this.session.taskState.lastHandoffPath = handoffPath;
    await this.persist();
    return handoffPath;
  }

  async reset(): Promise<string> {
    const isActivePhase =
      this.session.state.phase !== "idle" &&
      this.session.state.phase !== "completed" &&
      this.session.state.phase !== "cancelled";

    if (isActivePhase && this.session.state.lastHandoffPath === null) {
      return "Blocked: Create a handoff before resetting an active session.";
    }

    const preservedHandoff = this.session.state.lastHandoffPath;
    this.session.state = {
      ...createInitialRunState(),
      lastHandoffPath: preservedHandoff
    };
    this.session.taskState = createInitialTaskState();
    this.session.taskState.lastHandoffPath = preservedHandoff;
    this.session.state.currentFlow = "auto";
    await this.persist();
    return `Session reset${preservedHandoff ? ` (handoff preserved: ${preservedHandoff})` : ""}`;
  }

  private async persist(): Promise<void> {
    await saveRunState(this.statePath, this.session.state);
    await saveTaskState(this.taskStatePath, this.session.taskState as TaskState);
  }
}
