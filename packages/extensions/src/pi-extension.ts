import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createPiHostedHarnessBridge, type PiHostedHarnessBridge } from "./pi-hosted.js";

const bridgeByCwd = new Map<string, PiHostedHarnessBridge>();

function getBridge(cwd: string): PiHostedHarnessBridge {
  const cached = bridgeByCwd.get(cwd);
  if (cached) {
    return cached;
  }
  const bridge = createPiHostedHarnessBridge({ cwd, sessionId: `pi:${cwd}` });
  bridgeByCwd.set(cwd, bridge);
  return bridge;
}

function summarize(output: string): string {
  const first = output.split("\n").find(line => line.trim().length > 0);
  if (!first) {
    return "Harness command executed.";
  }
  const trimmed = first.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "Harness command executed.";
  }
  return first;
}

function toWidgetLines(output: string, maxLines: number = 16): string[] {
  return output.split("\n").slice(0, maxLines);
}

export default function harnessPiExtension(pi: ExtensionAPI): void {
  pi.registerCommand("harness", {
    description: "Run Harness runtime commands inside pi",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const bridge = getBridge(ctx.cwd);
      const input = args.trim() || "status --json";
      const output = await bridge.execute(input);

      pi.appendEntry?.("harness-command-result", {
        cwd: ctx.cwd,
        input,
        output
      });

      if (ctx.hasUI !== false) {
        ctx.ui.setWidget?.("harness-command-result", toWidgetLines(output), {
          placement: "belowEditor"
        });
      } else {
        process.stdout.write(`${output}\n`);
      }
      ctx.ui.notify(summarize(output), "info");
    }
  });
}
