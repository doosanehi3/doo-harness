import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

    assert.ok(notifications.some(message => /Harness command executed/i.test(message)));
    assert.ok(widgetUpdates.some(lines => lines.some(line => line.includes("pi-ready runtime-core product"))));
    assert.equal(appended.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
