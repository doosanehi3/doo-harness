import type { Phase } from "../phases/types.js";
import { classifyWork } from "./classify-work.js";
import { requirePlan, requireVerificationTarget, type GateContext, requireHandoffBeforeReset } from "./hard-gates.js";
import type { FlowMode, RouteDecision } from "./types.js";

export interface RouteRequest extends GateContext {
  rawInput: string;
  explicitMode?: FlowMode;
}

function defaultFlowForClass(workClass: ReturnType<typeof classifyWork>["workClass"]): RouteDecision["selectedFlow"] {
  switch (workClass) {
    case "trivial":
      return "direct";
    case "risky":
      return "worker_validator";
    case "long_running":
      return "milestone";
    default:
      return "disciplined_single";
  }
}

function defaultPhaseForFlow(flow: RouteDecision["selectedFlow"]): Phase {
  switch (flow) {
    case "direct":
      return "implementing";
    case "worker_validator":
      return "planning";
    case "milestone":
      return "planning";
    default:
      return "planning";
  }
}

export function routeFlow(request: RouteRequest): RouteDecision {
  const classification = classifyWork(request.rawInput);
  const gateContext: GateContext = request;

  if (request.explicitMode === "verify") {
    const blocked = requireVerificationTarget(gateContext);
    return {
      selectedFlow: defaultFlowForClass(classification.workClass),
      nextPhase: "verifying",
      modeSource: "explicit",
      classification,
      blocked
    };
  }

  if (request.explicitMode === "execute") {
    const blocked = requirePlan(gateContext, classification);
    return {
      selectedFlow: defaultFlowForClass(classification.workClass),
      nextPhase: "implementing",
      modeSource: "explicit",
      classification,
      blocked
    };
  }

  if (request.explicitMode === "clarify") {
    return {
      selectedFlow: defaultFlowForClass(classification.workClass),
      nextPhase: "clarifying",
      modeSource: "explicit",
      classification
    };
  }

  if (request.explicitMode === "plan") {
    return {
      selectedFlow: defaultFlowForClass(classification.workClass),
      nextPhase: "planning",
      modeSource: "explicit",
      classification
    };
  }

  if (request.explicitMode === "longrun") {
    return {
      selectedFlow: "milestone",
      nextPhase: "planning",
      modeSource: "explicit",
      classification,
      downgradedFrom: classification.workClass === "long_running" ? undefined : "longrun"
    };
  }

  if (request.explicitMode === "direct" && classification.workClass !== "trivial") {
    return {
      selectedFlow: defaultFlowForClass(classification.workClass),
      nextPhase: defaultPhaseForFlow(defaultFlowForClass(classification.workClass)),
      modeSource: "explicit",
      classification,
      downgradedFrom: "direct"
    };
  }

  const selectedFlow =
    request.explicitMode === "direct" ? "direct" : defaultFlowForClass(classification.workClass);
  const nextPhase = classification.ambiguous ? "clarifying" : defaultPhaseForFlow(selectedFlow);

  return {
    selectedFlow,
    nextPhase,
    modeSource: request.explicitMode ? "explicit" : "auto",
    classification
  };
}

export function routeReset(request: GateContext): RouteDecision {
  return {
    selectedFlow: "milestone",
    nextPhase: "paused",
    modeSource: "explicit",
    classification: {
      workClass: "long_running",
      ambiguous: false,
      risky: false,
      longRunning: true,
      reasons: ["reset requested"]
    },
    blocked: requireHandoffBeforeReset(request)
  };
}
