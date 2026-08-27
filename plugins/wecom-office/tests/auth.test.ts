import { expect, it } from "vitest";
import { authInit } from "../src/auth.ts";

it("fails closed when auth show is not authorized after init", async () => {
  const run = async (options: { args: readonly string[] }) => {
    if (options.args[0] === "auth" && options.args[1] === "init") {
      return { argv: [...options.args], stdout: "", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: "unauthorized\n", stderr: "", exitCode: 0 };
  };
  await expect(authInit({
    cliPath: "wecom-cli",
    configDir: "/tmp",
    timeoutMs: 1000,
    remoteBotId: "bot",
    secret: "secret",
    run,
  })).rejects.toMatchObject({ code: "unauthorized" });
});
