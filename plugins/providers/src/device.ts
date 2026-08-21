/** Human device line for the settings page. No kernel / uname leftovers. */

export function describeDevice(system: string): string {
  if (system === "Darwin") return "这台 Mac";
  if (system === "Windows_NT") return "这台 Windows";
  return "这台电脑";
}
