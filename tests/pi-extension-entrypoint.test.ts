import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    assert.equal(appended.length, 1);
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
