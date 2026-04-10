export function runAuto(input: string): string {
  return input.trim() === "" ? "/status" : input.trim();
}
