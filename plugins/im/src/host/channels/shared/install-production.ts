async function runIfFunction(value: unknown): Promise<void> {
  if (typeof value === "function") {
    await Promise.resolve((value as () => unknown)()).catch(() => undefined);
  }
}

export async function installOwnedProduction<T>(
  ctx: { effect: (factory: () => unknown, label?: string) => unknown },
  production: { close: () => Promise<unknown> | unknown },
  installRpc: () => T | Promise<T>,
  effectLabel: string,
): Promise<T> {
  let dispose: T | undefined;
  try {
    dispose = await installRpc();
    ctx.effect(() => async () => {
      await runIfFunction(dispose);
      await production.close();
    }, effectLabel);
    return dispose;
  } catch (error) {
    await runIfFunction(dispose);
    await Promise.resolve(production.close()).catch(() => undefined);
    throw error;
  }
}
