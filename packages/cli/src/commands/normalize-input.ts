export function normalizeCommandTokens(tokens: string[]): string {
  const trimmedArgs = tokens.map(arg => arg.trim()).filter(Boolean);
  if (trimmedArgs.length === 0) {
    return "";
  }

  const [command, ...rest] = trimmedArgs;
  if (command.startsWith("/")) {
    return trimmedArgs.join(" ").trim();
  }

  const json = rest.includes("--json");
  const payload = rest.filter(token => token !== "--json");
  const join = (base: string, parts: string[] = []): string => [base, ...parts].join(" ").trim();

  switch (command) {
    case "help":
      return json ? "/help-json" : "/help";
    case "status":
      if (payload[0] === "compact") {
        return json ? "/status-compact-json" : "/status-compact";
      }
      return json ? "/status-json" : "/status";
    case "artifacts":
      return json ? join("/artifacts-json", payload) : join("/artifacts", payload);
    case "plan":
      return json ? join("/plan-json", payload) : join("/plan", payload);
    case "longrun":
      return json ? join("/longrun-json", payload) : join("/longrun", payload);
    case "continue":
      return json ? "/continue-json" : "/continue";
    case "find":
      return json ? join("/find-json", payload) : join("/find", payload);
    case "grep":
      return json ? join("/grep-json", payload) : join("/grep", payload);
    case "recent":
      return json ? join("/recent-json", payload) : join("/recent", payload);
    case "loop":
      return json ? join("/loop-json", payload) : join("/loop", payload);
    case "execute":
      return json ? "/execute-json" : "/execute";
    case "verify":
      return json ? "/verify-json" : "/verify";
    case "review":
      return json ? join("/review-json", payload) : join("/review", payload);
    case "handoff":
      return json ? "/handoff-json" : "/handoff";
    case "advance":
      return json ? "/advance-json" : "/advance";
    case "resume":
      return json ? "/resume-json" : "/resume";
    case "reset":
      return json ? "/reset-json" : "/reset";
    case "unblock":
      return json ? "/unblock-json" : "/unblock";
    case "block":
      return json ? join("/block-json", payload) : join("/block", payload);
    case "blocked":
      return json ? "/blocked-json" : "/blocked";
    case "pickup":
      return json ? "/pickup-json" : "/pickup";
    case "queue":
      if (payload[0] === "review") {
        return json ? "/queue-review-json" : "/queue-review";
      }
      return trimmedArgs.join(" ").trim();
    case "config": {
      const [action, ...configArgs] = payload;
      if (action === "show") {
        return "/config-show";
      }
      if (action === "init") {
        if (configArgs[0] === "openai-codex") {
          return "/config-init-openai-codex";
        }
        return join("/config-init", configArgs);
      }
      return trimmedArgs.join(" ").trim();
    }
    case "provider": {
      const [action, ...providerArgs] = payload;
      if (action === "check") {
        return json ? "/provider-check-json" : "/provider-check";
      }
      if (action === "doctor") {
        return json ? "/provider-doctor-json" : "/provider-doctor";
      }
      if (action === "smoke") {
        return json ? join("/provider-smoke-json", providerArgs) : join("/provider-smoke", providerArgs);
      }
      return trimmedArgs.join(" ").trim();
    }
    case "web": {
      const [action] = payload;
      if (action === "smoke") {
        return json ? "/web-smoke-json" : "/web-smoke";
      }
      if (action === "verify") {
        return json ? "/web-verify-json" : "/web-verify";
      }
      return trimmedArgs.join(" ").trim();
    }
    default:
      return trimmedArgs.join(" ").trim();
  }
}

export function normalizeCommandString(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/status";
  }
  return normalizeCommandTokens(trimmed.split(/\s+/).filter(Boolean));
}
