import { useEffect, useId, useMemo, useState, type ReactElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { FeatureKey } from "../config.ts";
import { ArchivePanel } from "./ArchivePanel.tsx";
import { XTZ_UI_SETTINGS_NAMESPACE } from "../names.ts";
import type { XtzUiSettingsKey } from "./locales.ts";
import {
  getSettingsSnapshot,
  loadSettingsLive,
  patchSettingsLive,
  subscribeSettings,
} from "./settings-live.ts";

const TOP_LEVEL: readonly FeatureKey[] = [
  "archive",
  "board",
  "gitGraph",
  "announceToAgent",
];

function Toggle(props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  stateText: string;
  disabledReason?: string;
  action?: { label: string; disabled: boolean; onClick: () => void };
  onChange: (next: boolean) => void;
}): ReactElement {
  const labelId = useId();
  const hintId = useId();
  const stateId = useId();
  const reasonId = useId();
  const description = `${hintId} ${stateId}${props.disabledReason === undefined ? "" : ` ${reasonId}`}`;
  return (
    <div className="dshH-row">
      <span className="dshH-rowCopy">
        <span id={labelId} className="dshH-rowLabel">
          {props.label}
        </span>
        <span id={hintId} className="dshH-rowHint">
          {props.hint}
        </span>
        <span
          id={stateId}
          className="dshH-rowState"
          data-state={props.checked ? "enabled" : "disabled"}
        >
          {props.stateText}
        </span>
        {props.disabledReason === undefined ? null : (
          <span id={reasonId} className="dshH-rowReason">
            {props.disabledReason}
          </span>
        )}
      </span>
      <span className="dshH-rowControls">
        <button
          type="button"
          role="switch"
          aria-checked={props.checked}
          aria-labelledby={labelId}
          aria-describedby={description}
          disabled={props.disabled}
          className={`dshH-switch${props.checked ? " is-on" : ""}`}
          onClick={() => {
            if (!props.disabled) props.onChange(!props.checked);
          }}
        />
        {props.action === undefined ? null : (
          <button
            type="button"
            className="dshH-rowAction"
            disabled={props.action.disabled}
            onClick={props.action.onClick}
          >
            {props.action.label}
          </button>
        )}
      </span>
    </div>
  );
}

export function XiaotaoziSettings(props: { ctx: ClientContext }): ReactElement {
  const t = useMemo(
    () =>
      props.ctx.locale.bind(XTZ_UI_SETTINGS_NAMESPACE) as (
        key: XtzUiSettingsKey,
      ) => string,
    [props.ctx],
  );
  const [snap, setSnap] = useState(getSettingsSnapshot);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState(t("loading"));
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<"settings" | "archive">("settings");

  useEffect(() => {
    const off = subscribeSettings(() => setSnap(getSettingsSnapshot()));
    setReady(false);
    setStatus(t("loading"));
    void loadSettingsLive()
      .then(() => {
        setError(undefined);
        setStatus("");
      })
      .catch(() => {
        setError(t("loadFailed"));
        setStatus("");
      })
      .finally(() => setReady(true));
    return off;
  }, [t]);

  const setFlag = async (key: FeatureKey, value: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setStatus(t("saving"));
    try {
      await patchSettingsLive({ [key]: value });
      setStatus(t("saved"));
    } catch {
      setError(t("saveFailed"));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const config = snap.config;
  const shipped = snap.shipped;

  if (page === "archive")
    return <ArchivePanel ctx={props.ctx} onBack={() => setPage("settings")} />;

  return (
    <div
      className="dshH-settings"
      data-dsh-plugin="xtz-ui"
      aria-busy={!ready || busy}
    >
      <h2 className="dshH-settingsTitle">{t("title")}</h2>
      <p className="dshH-settingsLede">{t("lede")}</p>
      <p className="dshH-settingsStatus" role="status" aria-live="polite">
        {status}
      </p>
      {error !== undefined ? (
        <p className="dshH-settingsError" role="alert">
          {error}
        </p>
      ) : null}
      {TOP_LEVEL.map((key) => {
        const featureReady = ready && shipped[key] === true;
        const disabledReason = !ready
          ? t("loading")
          : shipped[key]
            ? undefined
            : t("unavailable");
        return (
          <Toggle
            key={key}
            checked={config[key]}
            disabled={busy || !featureReady}
            label={t(key)}
            hint={t(`${key}Hint`)}
            stateText={t(config[key] ? "enabled" : "disabled")}
            disabledReason={disabledReason}
            action={
              key === "archive" && config.archive
                ? {
                    label: t("manageArchive"),
                    disabled: busy || !featureReady,
                    onClick: () => setPage("archive"),
                  }
                : undefined
            }
            onChange={(next) => void setFlag(key, next)}
          />
        );
      })}
    </div>
  );
}
