import { useEffect, useState, type ReactElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { FeatureKey } from "../config.ts";
import { HELLO_SETTINGS_NAMESPACE } from "../names.ts";
import type { HelloSettingsKey } from "./locales.ts";
import { getSettingsSnapshot, loadSettingsLive, patchSettingsLive, subscribeSettings } from "./settings-live.ts";

const TOP_LEVEL: readonly FeatureKey[] = [
  "archive",
  "workbench",
  "board",
  "gitGraph",
  "announceToAgent",
];

function Toggle(props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  badge?: string;
  onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <label className="dshH-row">
      <span className="dshH-rowCopy">
        <span className="dshH-rowLabel">
          {props.label}
          {props.badge !== undefined ? <span className="dshH-badge">{props.badge}</span> : null}
        </span>
        <span className="dshH-rowHint">{props.hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        className={`dshH-switch${props.checked ? " is-on" : ""}`}
        onClick={() => {
          if (!props.disabled) props.onChange(!props.checked);
        }}
      />
    </label>
  );
}

export function XiaotaoziSettings(props: { ctx: ClientContext }): ReactElement {
  const t = props.ctx.locale.bind(HELLO_SETTINGS_NAMESPACE) as (key: HelloSettingsKey) => string;
  const [snap, setSnap] = useState(getSettingsSnapshot);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const off = subscribeSettings(() => setSnap(getSettingsSnapshot()));
    void loadSettingsLive().then(() => {
      setReady(true);
      setError(undefined);
    }).catch(() => setError(t("loadFailed")));
    return off;
  }, [t]);

  const setFlag = async (key: FeatureKey, value: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await patchSettingsLive({ [key]: value });
      setError(undefined);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const config = snap.config;
  const shipped = snap.shipped;

  return (
    <div className="dshH-settings" data-dsh-plugin="hello">
      <h2 className="dshH-settingsTitle">{t("title")}</h2>
      <p className="dshH-settingsLede">{t("lede")}</p>
      {error !== undefined ? <p className="dshH-settingsError">{error}</p> : null}
      {TOP_LEVEL.map((key) => {
        const featureReady = ready && shipped[key] === true;
        return (
          <Toggle
            key={key}
            checked={config[key]}
            disabled={busy || !featureReady}
            label={t(key)}
            hint={t(`${key}Hint`)}
            badge={featureReady ? undefined : t("comingSoon")}
            onChange={(next) => void setFlag(key, next)}
          />
        );
      })}
    </div>
  );
}
