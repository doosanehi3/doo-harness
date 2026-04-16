import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiHostedHarnessBridge } from "../packages/extensions/src/index.js";
import harnessPiExtension from "../packages/extensions/src/pi-extension.js";

async function createTempHarnessDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doo-harness-pi-extension-"));
}

test("pi extension registers a harness command", async () => {
  let registeredName = "";
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  harnessPiExtension({
    registerCommand(name, options) {
      registeredName = name;
      handler = options.handler;
    }
  });

  assert.equal(registeredName, "harness");
  assert.ok(handler);
});

test("pi extension command executes hosted bridge and reports output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  const appended: unknown[] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      },
      appendEntry(_type, data) {
        appended.push(data);
      }
    });

    assert.ok(handler);
    await handler!("help --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness help ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Focus:"))));
    assert.equal(appended.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats doctor results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("doctor --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness doctor:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Doctor"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Recommended:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Track:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats bootstrap results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("bootstrap --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness bootstrap:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Bootstrap"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Recommended:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats auto results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("auto --json --steps 0 Pi auto demo", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness auto:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Auto"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Stop:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Summary:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats handoff inspect results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Pi handoff inspect demo", true);
    await runtime.createHandoff();

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("handoff inspect --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness handoff inspect ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Handoff"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Cleanup:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats handoff cleanup results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Pi handoff cleanup demo", true);
    await runtime.createHandoff();
    await runtime.reset();

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("handoff cleanup --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness handoff cleanup: cleared/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Handoff Cleanup"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Cleared:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Reason:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats review history into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("review history --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness review history ready|Harness review/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Review History"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats review artifact into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Pi extension artifact review demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("review artifact verification --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness review artifact ready|Harness review/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Review (artifact)"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats review compare into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Pi extension compare review demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("review compare --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness review compare ready|Harness review/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Review (compare)"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Compared:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Synthesis:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats search results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    await writeFile(join(cwd, "catalog-plan-target.md"), "# catalog plan\n", "utf8");

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("find --json catalog-plan-target", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness find:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines.includes("catalog-plan-target.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats compact status into a tighter widget summary", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status compact --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness status:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Status"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Next:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats lane status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status lanes --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness lanes ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Lanes"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Owner:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Execution:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats readiness status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status readiness --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness readiness ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Readiness"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Recommended:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Summary:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats ship status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status ship --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness ship ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Ship"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Recommended:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Summary:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats notes status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status notes --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness notes ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Notes"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Summary:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats today status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status today --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness today ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Today"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Summary:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Readiness:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Ship:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats dashboard status into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("status dashboard --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness dashboard ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Dashboard"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Handoff:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Auto:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats pickup entrypoint results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("pickup --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness pickup:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Pickup"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Why:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Urgency:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Run:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Alternatives:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats timeline entrypoint results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("timeline --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness timeline:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Timeline"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Recovery:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Blocker:"))));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Hint:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats artifact inspect results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Pi artifact inspect demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("artifacts inspect --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness artifact inspect ready/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Artifact"));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.startsWith("Resolved:"))));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension formats related-artifacts results into widget and notification output", async () => {
  const cwd = await createTempHarnessDir();
  const notifications: string[] = [];
  const widgetUpdates: string[][] = [];
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    await handler!("artifacts related --json", {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        setWidget(_key: string, content: string[] | undefined) {
          widgetUpdates.push(content ?? []);
        }
      }
    });

    assert.ok(notifications.some(message => /Harness related:/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines[0] === "Harness Related"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi extension tolerates non-ui contexts without a ui object", async () => {
  const cwd = await createTempHarnessDir();
  let handler: ((args: string, ctx: any) => Promise<void> | void) | null = null;
  let stdout = "";
  const originalWrite = process.stdout.write.bind(process.stdout);

  try {
    harnessPiExtension({
      registerCommand(_name, options) {
        handler = options.handler;
      }
    });

    assert.ok(handler);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    await handler!("status --json", {
      cwd,
      hasUI: false
    });

    assert.match(stdout, /"phase": "idle"/);
  } finally {
    process.stdout.write = originalWrite;
    await rm(cwd, { recursive: true, force: true });
  }
});
