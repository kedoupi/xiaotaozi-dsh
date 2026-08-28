import { execFile } from "node:child_process";

export async function openUrl(url: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const [command, args] = platform === "darwin"
    ? ["open", [url]]
    : platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
