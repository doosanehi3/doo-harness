import type { RunState, Phase } from "./types.js";

const ALLOWED_TRANSITIONS: Record<Phase, Phase[]> = {
  idle: ["clarifying", "planning", "implementing", "cancelled"],
  clarifying: ["planning", "paused", "cancelled"],
  planning: ["implementing", "paused", "cancelled"],
  implementing: ["verifying", "paused", "cancelled"],
  verifying: ["implementing", "reviewing", "paused", "cancelled"],
  reviewing: ["implementing", "planning", "paused", "completed", "cancelled"],
  paused: ["clarifying", "planning", "implementing", "verifying", "reviewing", "cancelled"],
  completed: [],
  cancelled: []
};

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionPhase(state: RunState, nextPhase: Phase): RunState {
  if (state.phase === nextPhase) {
    return { ...state, updatedAt: new Date().toISOString() };
  }
  if (!canTransition(state.phase, nextPhase)) {
    throw new Error(`Invalid phase transition: ${state.phase} -> ${nextPhase}`);
  }
  return {
    ...state,
    phase: nextPhase,
    updatedAt: new Date().toISOString()
  };
}
