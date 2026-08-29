import type { SubscriptionProduct } from "../catalog.ts";
import type { ApiVendor } from "./host-api.ts";
import { ProviderLogo } from "./ProviderLogo.tsx";
import type { CatalogModel, ModelsWorkspaceInjected } from "./workspace-shared.ts";
import { loginBadge } from "./workspace-shared.ts";

export function ModelsList(props: {
  models: CatalogModel[];
  t: ModelsWorkspaceInjected["t"];
  onSave: (ids: string[]) => void;
}) {
  const enabled = props.models.filter((model) => model.selected).length;
  if (props.models.length === 0) return <p className="dshM-hint">{props.t("modelsNone")}</p>;
  return (
    <>
      <div className="dshM-actions">
        <button type="button" className="dshM-btn" disabled={enabled === props.models.length} onClick={() => void props.onSave(props.models.map((model) => model.id))}>
          {props.t("enableAll")}
        </button>
        <button type="button" className="dshM-btn" disabled={enabled === 0} onClick={() => void props.onSave([])}>
          {props.t("disableAll")}
        </button>
      </div>
      <ul className="dshM-models">
        {props.models.map((model) => (
          <li key={model.id}>
            <label className="dshM-check">
              <input
                type="checkbox"
                checked={model.selected}
                onChange={() => {
                  const next = props.models
                    .filter((entry) => (entry.id === model.id ? !entry.selected : entry.selected))
                    .map((entry) => entry.id);
                  void props.onSave(next);
                }}
              />
              <span>
                {model.name}
                {model.name !== model.id ? <span className="dshM-modelId">{model.id}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

export function KeyPanel(props: {
  vendor: ApiVendor;
  pending: boolean;
  savedOk: boolean;
  replacing: boolean;
  keyDraft: string;
  t: ModelsWorkspaceInjected["t"];
  onDraft: (value: string) => void;
  onReplacing: (value: boolean) => void;
  onPersist: () => void;
  onRemove: () => void;
  onDiscard: () => void;
}) {
  const { vendor, t } = props;
  const locked = vendor.writable === false;
  const keyInputId = `providers-api-key-${vendor.id}`;
  return (
    <section aria-busy={props.pending || undefined}>
      <h4 className="dshM-blockTitle">{t("apiTitle")}</h4>
      {vendor.configured && !props.replacing ? (
        <>
          <div className="dshM-secret" aria-label={t("apiMaskedLabel")}>
            <span className="dshM-secretMask">{t("apiMasked")}</span>
          </div>
          {locked ? <p className="dshM-hint" style={{ marginTop: 10 }}>{t("envKeyLocked")}</p> : (
            <div className="dshM-actions" style={{ marginTop: 12 }}>
              <button type="button" className="dshM-btn" onClick={() => { props.onDraft(""); props.onReplacing(true); }}>
                {t("replaceKey")}
              </button>
              <button type="button" className="dshM-btn is-danger" disabled={props.pending} onClick={props.onRemove}>
                {vendor.declared ? t("removeVendor") : t("clearKey")}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="dshM-fieldLabel" htmlFor={keyInputId}>{t("apiTitle")}</label>
          <div className="dshM-row" style={{ marginTop: 10 }}>
            <input
              id={keyInputId}
              className="dshM-input is-mono"
              type="password"
              value={props.keyDraft}
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={vendor.configured ? t("apiPlaceholder") : t("apiPlaceholderEmpty")}
              onChange={(event) => props.onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && props.keyDraft.trim().length > 0) {
                  event.preventDefault();
                  props.onPersist();
                }
              }}
            />
            <button
              type="button"
              className={props.savedOk ? "dshM-btn is-ok" : "dshM-btn is-primary"}
              disabled={props.pending || props.keyDraft.trim().length === 0 || props.savedOk}
              onClick={props.onPersist}
            >
              {props.savedOk ? t("saved") : props.pending ? t("saving") : t("save")}
            </button>
          </div>
          {vendor.configured ? (
            <div className="dshM-actions" style={{ marginTop: 12 }}>
              <button type="button" className="dshM-btn" onClick={() => { props.onDraft(""); props.onReplacing(false); }}>
                {t("cancelReplace")}
              </button>
            </div>
          ) : (
            <div className="dshM-actions" style={{ marginTop: 12 }}>
              <button type="button" className="dshM-btn" onClick={props.onDiscard}>{t("discard")}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PickerGroup(props: {
  label: string;
  products: readonly SubscriptionProduct[];
  t: ModelsWorkspaceInjected["t"];
  onPick: (product: SubscriptionProduct) => void;
}) {
  if (props.products.length === 0) return null;
  return (
    <section className="dshM-pickerBlock">
      <div className="dshM-blockLabel">{props.label}</div>
      <div className="dshM-list">
        {props.products.map((product) => (
          <button key={product.id} type="button" className="dshM-listBtn" onClick={() => props.onPick(product)}>
            <span className="dshM-cardIcon"><ProviderLogo id={product.id} size={18} /></span>
            <span className="dshM-cardCopy">
              <span className="dshM-cardTitle">{product.nameZh}</span>
              <span className="dshM-cardSub">{loginBadge(product, props.t)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function VendorGroup(props: {
  label: string;
  vendors: readonly ApiVendor[];
  t: ModelsWorkspaceInjected["t"];
  onPick: (vendor: ApiVendor) => void;
}) {
  if (props.vendors.length === 0) return null;
  return (
    <section className="dshM-pickerBlock">
      <div className="dshM-blockLabel">{props.label}</div>
      <div className="dshM-list">
        {props.vendors.map((vendor) => (
          <button key={vendor.id} type="button" className="dshM-listBtn" onClick={() => props.onPick(vendor)}>
            <span className="dshM-cardIcon"><ProviderLogo id={vendor.id} size={18} custom={vendor.declared} /></span>
            <span className="dshM-cardCopy">
              <span className="dshM-cardTitle">{vendor.name}</span>
              <span className="dshM-cardSub">{props.t("apiBadge")}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
