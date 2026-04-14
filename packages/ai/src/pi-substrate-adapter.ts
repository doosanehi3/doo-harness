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
