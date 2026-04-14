export interface PiSubstrateSessionHost {
  cwd: string;
  sessionId?: string | null;
}

export interface PiSubstrateToolHost {
  getAllowedTools(): string[];
}

export interface PiSubstrateAdapter {
  session: PiSubstrateSessionHost;
  tools: PiSubstrateToolHost;
}

export function createPiSubstrateAdapter(adapter: PiSubstrateAdapter): PiSubstrateAdapter {
  return adapter;
}

export function createProcessPiSubstrateAdapter(input: {
  cwd: string;
  sessionId?: string | null;
  allowedTools: string[];
}): PiSubstrateAdapter {
  const allowed = [...new Set(input.allowedTools)];
  return createPiSubstrateAdapter({
    session: {
      cwd: input.cwd,
      sessionId: input.sessionId ?? null
    },
    tools: {
      getAllowedTools: () => allowed
    }
  });
}
