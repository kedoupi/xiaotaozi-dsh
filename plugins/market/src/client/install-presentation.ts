export type InstallPresentationStatus =
  | "idle"
  | "queued"
  | "installing"
  | "completed"
  | "installed"
  | "failed"
  | "retrying";

export interface InstallPresentationInput {
  entryId: string;
  installed: boolean;
  pendingIntent?: { entryId: string; action: "install" | "remove" };
  activeMutationId?: string;
  lastFailedId?: string;
  lastFailedAction?: "install" | "remove";
  retryingId?: string;
  latestCompletion?: { entryId: string; action: "install" | "remove" };
}

export interface InstallPresentation {
  status: InstallPresentationStatus;
  label:
    | "install"
    | "queued"
    | "installing"
    | "removing"
    | "installCompleted"
    | "removeCompleted"
    | "installed"
    | "installFailed"
    | "removeFailed"
    | "retryingInstall"
    | "retryingRemove";
  tone: "neutral" | "progress" | "success" | "danger";
  retryable: boolean;
  action: "install" | "remove";
}

export function installPresentation(input: InstallPresentationInput): InstallPresentation {
  const durableAction = input.installed ? "remove" : "install";
  const failedAction = input.lastFailedId === input.entryId
    ? input.lastFailedAction ?? durableAction
    : durableAction;
  if (input.activeMutationId === input.entryId) {
    return input.retryingId === input.entryId && input.lastFailedId === input.entryId
      ? { status: "retrying", label: failedAction === "install" ? "retryingInstall" : "retryingRemove", tone: "progress", retryable: false, action: failedAction }
      : { status: "installing", label: durableAction === "install" ? "installing" : "removing", tone: "progress", retryable: false, action: durableAction };
  }
  if (input.latestCompletion?.entryId === input.entryId) {
    const action = input.latestCompletion.action;
    return { status: "completed", label: action === "install" ? "installCompleted" : "removeCompleted", tone: "success", retryable: false, action };
  }
  if (input.lastFailedId === input.entryId) {
    return { status: "failed", label: failedAction === "install" ? "installFailed" : "removeFailed", tone: "danger", retryable: true, action: failedAction };
  }
  if (input.pendingIntent?.entryId === input.entryId) {
    return { status: "queued", label: "queued", tone: "neutral", retryable: false, action: input.pendingIntent.action };
  }
  if (input.installed) {
    return { status: "installed", label: "installed", tone: "success", retryable: false, action: "remove" };
  }
  return { status: "idle", label: "install", tone: "neutral", retryable: false, action: "install" };
}
