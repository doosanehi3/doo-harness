import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import harnessPiExtension from "../packages/extensions/src/pi-extension.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function captureCommand(handler, cwd, args, appendedEntries) {
  const notifications = [];
  const widgets = [];

  await handler(args, {
    cwd,
    hasUI: true,
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      setWidget(key, content = [], options = {}) {
        widgets.push({ key, content, options });
      }
    }
  });

  return {
    args,
    notifications,
    widgets,
    entries: appendedEntries.splice(0, appendedEntries.length)
  };
}

const cwd = await mkdtemp(join(tmpdir(), "doo-harness-pi-ui-"));
let handler = null;
const appendedEntries = [];

try {
  await writeFile(join(cwd, "catalog-plan-target.md"), "# catalog plan\n", "utf8");
  await writeFile(join(cwd, "catalog-notes.md"), "release readiness\n", "utf8");

  harnessPiExtension({
    registerCommand(name, options) {
      if (name === "harness") {
        handler = options.handler;
      }
    },
    appendEntry(type, data) {
      appendedEntries.push({ type, data });
    }
  });

  assert(handler, "Harness pi extension did not register the harness command.");

  const captures = [];
  captures.push(await captureCommand(handler, cwd, "help --json", appendedEntries));
  captures.push(await captureCommand(handler, cwd, "status --json", appendedEntries));
  captures.push(await captureCommand(handler, cwd, "find --json catalog-plan-target", appendedEntries));

  for (const capture of captures) {
    assert(capture.notifications.length > 0, `Missing notification for ${capture.args}`);
    assert(capture.widgets.length > 0, `Missing widget render for ${capture.args}`);
    assert(capture.entries.length > 0, `Missing appended entry for ${capture.args}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        result: "PASS",
        cwd,
        captures
      },
      null,
      2
    )
  );
  process.stdout.write("\nui-capture: PASS\n");
} finally {
  await rm(cwd, { recursive: true, force: true });
}
