export async function installOwnedProduction<T>(
  ctx: { effect: (factory: () => unknown, label?: string) => unknown },
  production: { close: () => Promise<unknown> | unknown },
  installRpc: () => T | Promise<T>,
  effectLabel: string,
): Promise<T> {
  try {
    const dispose = await installRpc();
    ctx.effect(() => async () => production.close(), effectLabel);
    return dispose;
  } catch (error) {
    await Promise.resolve(production.close()).catch(() => undefined);
    throw error;
  }
}
