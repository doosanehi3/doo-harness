export function runConfigInit(path: string, profile = "default"): string {
  return `Runtime config ready (${profile}): ${path}`;
}

export function runConfigShow(content: string): string {
  return content;
}
