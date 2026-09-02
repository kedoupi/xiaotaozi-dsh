import { describe, expect, it } from "vitest";
import { installPresentation } from "../src/client/install-presentation.ts";

const base = {
  entryId: "alpha",
  installed: false,
  pendingIntent: undefined,
  activeMutationId: undefined,
  lastFailedId: undefined,
  lastFailedAction: undefined,
  retryingId: undefined,
  latestCompletion: undefined,
};

describe("install presentation", () => {
  it("presents queued, installing, completed, then durable installed truth", () => {
    expect(installPresentation({
      ...base,
      pendingIntent: { entryId: "alpha", action: "install" },
    })).toEqual({ status: "queued", label: "queued", tone: "neutral", retryable: false, action: "install" });

    expect(installPresentation({
      ...base,
      activeMutationId: "alpha",
    })).toEqual({ status: "installing", label: "installing", tone: "progress", retryable: false, action: "install" });

    expect(installPresentation({
      ...base,
      installed: true,
      latestCompletion: { entryId: "alpha", action: "install" },
    })).toEqual({ status: "completed", label: "installCompleted", tone: "success", retryable: false, action: "install" });

    expect(installPresentation({
      ...base,
      installed: true,
    })).toEqual({ status: "installed", label: "installed", tone: "success", retryable: false, action: "remove" });
  });

  it("presents an owned failure, active retry, and successful completion", () => {
    expect(installPresentation({
      ...base,
      lastFailedId: "alpha",
    })).toEqual({ status: "failed", label: "installFailed", tone: "danger", retryable: true, action: "install" });

    expect(installPresentation({
      ...base,
      activeMutationId: "alpha",
      lastFailedId: "alpha",
      retryingId: "alpha",
    })).toEqual({ status: "retrying", label: "retryingInstall", tone: "progress", retryable: false, action: "install" });

    expect(installPresentation({
      ...base,
      installed: true,
      lastFailedId: "alpha",
      latestCompletion: { entryId: "alpha", action: "install" },
    })).toEqual({ status: "completed", label: "installCompleted", tone: "success", retryable: false, action: "install" });
  });

  it("keeps the failed action truthful when durable installed truth later changes", () => {
    expect(installPresentation({
      ...base,
      installed: true,
      lastFailedId: "alpha",
      lastFailedAction: "install",
    })).toEqual({ status: "failed", label: "installFailed", tone: "danger", retryable: true, action: "install" });

    expect(installPresentation({
      ...base,
      installed: true,
      activeMutationId: "alpha",
      lastFailedId: "alpha",
      lastFailedAction: "install",
      retryingId: "alpha",
    })).toEqual({ status: "retrying", label: "retryingInstall", tone: "progress", retryable: false, action: "install" });

    expect(installPresentation({
      ...base,
      installed: false,
      lastFailedId: "alpha",
      lastFailedAction: "remove",
    })).toEqual({ status: "failed", label: "removeFailed", tone: "danger", retryable: true, action: "remove" });
  });

  it("does not leak another entry's active, failed, retrying, or completed state", () => {
    expect(installPresentation({
      ...base,
      activeMutationId: "beta",
      lastFailedId: "beta",
      retryingId: "beta",
      latestCompletion: { entryId: "beta", action: "install" },
    })).toEqual({ status: "idle", label: "install", tone: "neutral", retryable: false, action: "install" });
  });

  it("uses observable state precedence without inventing host progress", () => {
    expect(installPresentation({
      ...base,
      installed: true,
      pendingIntent: { entryId: "alpha", action: "remove" },
      lastFailedId: "alpha",
    }).status).toBe("failed");

    expect(installPresentation({
      ...base,
      installed: true,
      pendingIntent: { entryId: "alpha", action: "remove" },
    }).status).toBe("queued");

    expect(installPresentation({
      ...base,
      installed: true,
      pendingIntent: { entryId: "alpha", action: "remove" },
      activeMutationId: "alpha",
      latestCompletion: { entryId: "alpha", action: "install" },
    }).status).toBe("installing");

    expect(installPresentation({
      ...base,
      activeMutationId: "alpha",
      retryingId: "alpha",
    }).status).toBe("installing");
  });
});
