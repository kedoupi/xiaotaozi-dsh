import { useEffect, useMemo, useRef, useState } from "react";
import { explainHostError } from "../auth/explain.ts";
import {
  listedProducts,
  liveProviderIds,
  type SubscriptionProduct,
} from "../catalog.ts";
import type { ApiVendor } from "./host-api.ts";
import {
  discoverEndpointModels,
  listHostModels,
  loadApiVendors,
  normalizeBaseUrl,
  removeApiKey,
  saveApiKey,
  saveHostModels,
} from "./host-api.ts";
import {
  FEATURED_SUB_IDS,
  isRecommendedVendor,
  pairedApiVendorId,
  pairedSubscriptionId,
  slugFromName,
} from "../display.ts";
import { ProviderLogo } from "./ProviderLogo.tsx";
import {
  AdvancedDetails,
  KeyPanel,
  ModelsList,
  PickerGroup,
  VendorGroup,
} from "./workspace-panels.tsx";
import type {
  CatalogModel,
  ModelsWorkspaceInjected,
  RpcResult,
  Status,
} from "./workspace-shared.ts";
import { openExternalUrl } from "./open-url.ts";
import { CloseIcon } from "./icons.tsx";
import { PORTRAIT } from "./portrait.ts";
import { parseRoutingContract } from "../router/contract.ts";
import {
  createRoutingPublisher,
  getRoutingSnapshot,
  subscribeRouting,
} from "./routing-live.ts";
import {
  apiMethodBadge,
  copyText,
  emptyVendor,
  format,
  loginBadge,
  pairConfigured,
  sortFeatured,
  trapTab,
  unifyModels,
} from "./workspace-shared.ts";

export type { ModelsWorkspaceInjected } from "./workspace-shared.ts";

const CHANNEL = "/providers-auth";

type Kind = "sub" | "api";
type Selection = { kind: Kind; id: string };

interface ConfirmAsk {
  body: string;
  action: string;
  run: () => Promise<void>;
}

export function ModelsWorkspace(props: Partial<ModelsWorkspaceInjected>) {
  const rpc = props.rpc;
  const t = props.t;
  if (rpc === undefined || t === undefined) return null;
  const api = props.api;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [vendors, setVendors] = useState<
    Array<{ id: string; models: CatalogModel[] }>
  >([]);
  const [apiVendors, setApiVendors] = useState<ApiVendor[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [stagedSub, setStagedSub] = useState<string[]>([]);
  const [stagedApi, setStagedApi] = useState<string[]>([]);
  const [selected, setSelected] = useState<Selection>();
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [keyDraft, setKeyDraftState] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [modelsSaved, setModelsSaved] = useState(false);
  const [manual, setManual] = useState("");
  const [copied, setCopied] = useState<"code" | "link">();
  const [ready, setReady] = useState(false);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBase, setCustomBase] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [hostModels, setHostModels] = useState<CatalogModel[]>([]);
  const [pairModels, setPairModels] = useState<CatalogModel[]>([]);
  const [confirm, setConfirm] = useState<ConfirmAsk>();
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [routeMode, setRouteMode] = useState<"manual" | "smart">("manual");
  const [routePoolCount, setRoutePoolCount] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customNameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const confirmBusyRef = useRef(false);
  const routingPublisher = useRef(createRoutingPublisher());
  const refreshGeneration = useRef(0);
  const disposed = useRef(false);
  const pendingWork = useRef(new Set<string>());
  const refreshRequested = useRef(false);
  const pendingWorkFailed = useRef(false);
  const keyDraftRevision = useRef(0);
  const keySavedTimer = useRef<number>();
  const modelsSavedTimer = useRef<number>();
  const modelSaveGeneration = useRef(0);
  const selectionIdentity = useRef("");
  selectionIdentity.current = selected ? `${selected.kind}:${selected.id}` : "";
  const beginModelSave = () => {
    const generation = ++modelSaveGeneration.current;
    const identity = selectionIdentity.current;
    return () =>
      !disposed.current &&
      generation === modelSaveGeneration.current &&
      identity === selectionIdentity.current;
  };
  const setKeyDraft = (value: string) => {
    keyDraftRevision.current += 1;
    setKeyDraftState(value);
    setSavedOk(false);
  };

  const hideIds = useMemo(() => new Set(liveProviderIds()), []);
  const listed = useMemo(() => listedProducts(enabledIds), [enabledIds]);

  const refresh = async () => {
    if (disposed.current) return;
    if (pendingWork.current.size > 0) {
      refreshRequested.current = true;
      return;
    }
    refreshRequested.current = false;
    // A drained read reconciles metadata without hiding that batch's write failure.
    const preserveError = pendingWorkFailed.current;
    const generation = ++refreshGeneration.current;
    const publish = routingPublisher.current.read();
    const results = await Promise.all([
      rpc.call(CHANNEL, "status", {}) as Promise<
        RpcResult<{ providers: Record<string, Status>; enabled?: unknown }>
      >,
      rpc.call(CHANNEL, "catalog", {}) as Promise<
        RpcResult<{ vendors: Array<{ id: string; models: CatalogModel[] }> }>
      >,
      loadApiVendors(api, hideIds),
      rpc.call(CHANNEL, "routing", {}) as Promise<RpcResult<unknown>>,
    ]).catch(() => undefined);
    if (disposed.current || generation !== refreshGeneration.current) return;
    if (results === undefined) {
      if (!preserveError) setError(t("loadFailed"));
      setReady(true);
      return;
    }
    const [statusResult, catalogResult, nextApi, routingResult] = results;
    if (!statusResult.ok || statusResult.value === undefined) {
      if (!preserveError) setError(t("loadFailed"));
      setReady(true);
      return;
    }
    setStatus(statusResult.value.providers);
    const nextEnabled = statusResult.value.enabled;
    setEnabledIds(
      Array.isArray(nextEnabled)
        ? nextEnabled.filter((id): id is string => typeof id === "string")
        : liveProviderIds(),
    );
    if (catalogResult.ok && catalogResult.value !== undefined)
      setVendors(catalogResult.value.vendors);
    const contract = parseRoutingContract(
      routingResult.ok ? routingResult.value : undefined,
    );
    if (routingResult.ok && publish(contract)) {
      setRouteMode(contract.mode);
      setRoutePoolCount(contract.candidateCount);
    }
    setApiVendors(nextApi.vendors);
    if (!preserveError) {
      if (api === undefined) setError(t("hostApiMissing"));
      /* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */ else if (
        nextApi.error !== undefined
      )
        setError(nextApi.error);
      else setError(undefined);
    }
    setReady(true);
  };

  const waiting = Object.values(status).some((entry) => entry.busy);

  useEffect(() => {
    disposed.current = false;
    routingPublisher.current = createRoutingPublisher();
    const unsubscribe = subscribeRouting((next) => {
      if (disposed.current) return;
      setRouteMode(next.mode);
      setRoutePoolCount(next.candidateCount);
    });
    void refresh();
    return () => {
      disposed.current = true;
      refreshRequested.current = false;
      pendingWorkFailed.current = false;
      keyDraftRevision.current += 1;
      modelSaveGeneration.current += 1;
      if (modelsSavedTimer.current !== undefined)
        window.clearTimeout(modelsSavedTimer.current);
      if (keySavedTimer.current !== undefined)
        window.clearTimeout(keySavedTimer.current);
      unsubscribe();
      refreshGeneration.current += 1;
      routingPublisher.current.dispose();
    };
  }, []);

  useEffect(() => {
    if (!picker) return;
    setQuery("");
    const sheet = sheetRef.current;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPicker(false);
        return;
      }
      if (event.key !== "Tab" || sheet === null) return;
      trapTab(sheet, event);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      addRef.current?.focus();
    };
  }, [picker]);

  useEffect(() => {
    if (!customOpen) return;
    const timer = window.setTimeout(() => customNameRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        keyDraftRevision.current += 1;
        setCustomKey("");
        setCustomOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      addRef.current?.focus();
    };
  }, [customOpen]);

  useEffect(() => {
    confirmBusyRef.current = confirmBusy;
  }, [confirmBusy]);

  useEffect(() => {
    if (confirm === undefined) {
      setConfirmBusy(false);
      return;
    }
    const box = confirmRef.current;
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 20);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!confirmBusyRef.current) setConfirm(undefined);
        return;
      }
      if (event.key !== "Tab" || box === null) return;
      trapTab(box, event);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      confirmTriggerRef.current?.focus();
      confirmTriggerRef.current = null;
    };
  }, [confirm]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (error !== undefined) errorRef.current?.focus();
  }, [error]);

  const connectedSubs = useMemo(
    () => listed.filter((product) => status[product.id]?.loggedIn === true),
    [listed, status],
  );
  const sidebarSubs = useMemo(() => {
    const pairedOn = new Set(
      apiVendors
        .filter(
          (vendor) =>
            vendor.configured && pairedSubscriptionId(vendor.id) !== undefined,
        )
        .map((vendor) => pairedSubscriptionId(vendor.id) as string),
    );
    const ids = new Set([
      ...connectedSubs.map((product) => product.id),
      ...stagedSub,
      ...pairedOn,
    ]);
    return listed.filter((product) => ids.has(product.id));
  }, [apiVendors, connectedSubs, listed, stagedSub]);
  const listedIds = useMemo(
    () => new Set(listed.map((product) => product.id)),
    [listed],
  );
  const hidePairedApi = (vendorId: string): boolean => {
    const sub = pairedSubscriptionId(vendorId);
    return sub !== undefined && listedIds.has(sub);
  };
  const sidebarApi = useMemo(() => {
    const staged = stagedApi
      .map(
        (id) =>
          apiVendors.find((vendor) => vendor.id === id) ?? {
            id,
            name: id,
            ref: "",
            configured: false,
            declared: false,
            featured: true,
            settingsNs: "",
            settingsPath: [],
            writable: false,
          },
      )
      .filter((vendor) => !vendor.configured && !hidePairedApi(vendor.id));
    const connected = apiVendors.filter(
      (vendor) =>
        (vendor.configured || vendor.declared) && !hidePairedApi(vendor.id),
    );
    const seen = new Set(connected.map((vendor) => vendor.id));
    return [...connected, ...staged.filter((vendor) => !seen.has(vendor.id))];
  }, [apiVendors, listedIds, stagedApi]);

  useEffect(() => {
    if (
      selected?.kind === "sub" &&
      sidebarSubs.some((product) => product.id === selected.id)
    )
      return;
    if (
      selected?.kind === "api" &&
      sidebarApi.some((vendor) => vendor.id === selected.id)
    )
      return;
    if (sidebarSubs[0]) {
      setSelected({ kind: "sub", id: sidebarSubs[0].id });
      return;
    }
    if (sidebarApi[0]) setSelected({ kind: "api", id: sidebarApi[0].id });
    else setSelected(undefined);
  }, [selected, sidebarApi, sidebarSubs]);

  const run = async (id: string, work: () => Promise<string | void>) => {
    if (disposed.current || pendingWork.current.has(id)) return;
    pendingWork.current.add(id);
    refreshGeneration.current += 1;
    setPendingId(id);
    try {
      const failure = await work();
      if (failure !== undefined) {
        pendingWorkFailed.current = true;
        if (!disposed.current) setError(failure);
        return;
      }
      refreshRequested.current = true;
    } catch (caught) {
      pendingWorkFailed.current = true;
      if (!disposed.current) setError(explainHostError(caught));
      return;
    } finally {
      pendingWork.current.delete(id);
      if (!disposed.current) {
        setPendingId([...pendingWork.current].at(-1));
        if (pendingWork.current.size === 0) {
          if (refreshRequested.current) void refresh();
          pendingWorkFailed.current = false;
        }
      }
    }
  };

  const markHostPicked = (ids: string[]) => {
    const picked = new Set(ids);
    setHostModels((models) =>
      models.map((model) => ({ ...model, selected: picked.has(model.id) })),
    );
    setPairModels((models) =>
      models.map((model) => ({ ...model, selected: picked.has(model.id) })),
    );
  };

  const markModelsSaved = () => {
    setModelsSaved(true);
    if (modelsSavedTimer.current !== undefined)
      window.clearTimeout(modelsSavedTimer.current);
    modelsSavedTimer.current = window.setTimeout(() => {
      if (!disposed.current) setModelsSaved(false);
    }, 1600);
  };

  const login = (id: string) =>
    run(id, async () => {
      const result = (await rpc.call(CHANNEL, "login", {
        provider: id,
      })) as RpcResult<{ authorizeUrl: string; userCode?: string }>;
      if (!result.ok || result.value === undefined)
        throw new Error(result.error?.message ?? t("unavailable"));
      setUrls((current) => ({ ...current, [id]: result.value!.authorizeUrl }));
      if (result.value.userCode !== undefined)
        setCodes((current) => ({
          ...current,
          [id]: result.value!.userCode as string,
        }));
    });

  const currentSub =
    selected?.kind === "sub"
      ? listed.find((product) => product.id === selected.id)
      : undefined;
  const currentApi =
    selected?.kind === "api"
      ? sidebarApi.find((vendor) => vendor.id === selected.id)
      : undefined;
  const pairApi =
    currentSub === undefined
      ? undefined
      : apiVendors.find(
          (vendor) => vendor.id === pairedApiVendorId(currentSub.id),
        );
  const currentModels =
    vendors.find((vendor) => vendor.id === selected?.id)?.models ?? [];
  const subStatus =
    currentSub === undefined ? undefined : status[currentSub.id];
  const loggedIn = subStatus?.loggedIn === true;
  const subWaiting = subStatus?.busy === true;
  const authUrl =
    currentSub === undefined
      ? undefined
      : (urls[currentSub.id] ?? subStatus?.authorizeUrl);
  const authCode =
    currentSub === undefined
      ? undefined
      : (codes[currentSub.id] ?? subStatus?.userCode);
  const pickerModels = unifyModels(
    loggedIn ? currentModels : undefined,
    pairApi?.configured === true ? pairModels : undefined,
  );

  const markCopied = (kind: "code" | "link") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(undefined), 1600);
  };

  useEffect(() => {
    const vendor = currentApi ?? pairApi;
    if (vendor === undefined || api === undefined || !vendor.configured) {
      if (currentApi === undefined) setHostModels([]);
      if (pairApi === undefined || !pairApi.configured) setPairModels([]);
      return;
    }
    let cancelled = false;
    const generation = modelSaveGeneration.current;
    void listHostModels(api, vendor).then((models) => {
      if (
        cancelled ||
        disposed.current ||
        generation !== modelSaveGeneration.current
      )
        return;
      // biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts.
      if (currentApi !== undefined) setHostModels(models);
      else setPairModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, [api, currentApi, pairApi]);

  const q = query.trim().toLowerCase();
  const availableSubs = listed.filter((product) => {
    if (status[product.id]?.loggedIn === true) return false;
    if (pairConfigured(apiVendors, product.id)) return false;
    if (q.length === 0) return true;
    return (
      product.nameZh.toLowerCase().includes(q) ||
      product.name.toLowerCase().includes(q) ||
      product.id.includes(q)
    );
  });
  const availableApi = apiVendors.filter((vendor) => {
    if (hidePairedApi(vendor.id)) return false;
    if (
      !vendor.featured ||
      vendor.declared ||
      vendor.configured ||
      stagedApi.includes(vendor.id)
    )
      return false;
    if (q.length === 0) return true;
    return (
      vendor.name.toLowerCase().includes(q) ||
      vendor.id.toLowerCase().includes(q)
    );
  });
  const featuredSubs = availableSubs.filter((product) =>
    FEATURED_SUB_IDS.includes(product.id),
  );
  const extraSubs = availableSubs.filter(
    (product) => !FEATURED_SUB_IDS.includes(product.id),
  );
  const featuredApi = availableApi.filter((vendor) =>
    isRecommendedVendor(vendor.id),
  );
  const extraApi = availableApi.filter(
    (vendor) => !isRecommendedVendor(vendor.id),
  );
  const pickerEmpty = availableSubs.length === 0 && availableApi.length === 0;

  const persistKey = (vendor: ApiVendor) => {
    if (api === undefined || vendor.writable === false || disposed.current)
      return;
    const revision = keyDraftRevision.current;
    const value = keyDraft.trim();
    if (value.length === 0) return;
    void run(vendor.id, async () => {
      const failure = await saveApiKey(api, vendor.ref, value);
      if (disposed.current || revision !== keyDraftRevision.current) return;
      if (failure !== undefined) throw new Error(failure);
      setKeyDraft("");
      setReplacing(false);
      setSavedOk(true);
      if (keySavedTimer.current !== undefined)
        window.clearTimeout(keySavedTimer.current);
      keySavedTimer.current = window.setTimeout(() => {
        if (!disposed.current) setSavedOk(false);
      }, 1600);
    });
  };

  const persistCustom = () => {
    if (api === undefined || disposed.current) return;
    const revision = keyDraftRevision.current;
    const isCurrent = () =>
      !disposed.current && revision === keyDraftRevision.current;
    const name = customName.trim();
    const baseURL = normalizeBaseUrl(customBase);
    const apiKey = customKey.trim();
    if (name.length === 0 || baseURL.length === 0 || apiKey.length === 0)
      return;
    const id = slugFromName(
      name,
      new Set(apiVendors.map((vendor) => vendor.id)),
    );
    void run(id, async () => {
      const probed = await discoverEndpointModels(api, baseURL, apiKey);
      if (!isCurrent()) return;
      if (probed.error !== undefined) {
        return t("discoverFailed");
      }
      const created = (await rpc.call(CHANNEL, "custom-create", {
        id,
        name,
        baseURL,
        apiKey,
        models: probed.models,
      })) as RpcResult<{ id: string }>;
      if (!isCurrent()) return;
      if (!created.ok)
        throw new Error(created.error?.message ?? t("unavailable"));
      const nextApi = await loadApiVendors(api, hideIds);
      if (!isCurrent()) return;
      setApiVendors(nextApi.vendors);
      const vendor = nextApi.vendors.find((entry) => entry.id === id);
      if (vendor === undefined) throw new Error(t("unavailable"));
      const models = await listHostModels(api, vendor);
      if (!isCurrent()) return;
      setHostModels(models);
      setCustomName("");
      setCustomBase("");
      setCustomKey("");
      setCustomOpen(false);
      setPicker(false);
      setSelected({ kind: "api", id });
    });
  };

  const openCustom = () => {
    setPicker(false);
    setCustomOpen(true);
  };

  const closeCustom = () => {
    keyDraftRevision.current += 1;
    setCustomKey("");
    setCustomOpen(false);
  };

  const ask = (body: string, action: string, work: () => Promise<void>) => {
    confirmTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirm({ body, action, run: work });
  };

  const finishConfirm = async () => {
    if (
      confirm === undefined ||
      confirmBusy ||
      disposed.current ||
      pendingWork.current.size > 0
    )
      return;
    setConfirmBusy(true);
    try {
      await run(selected?.id ?? "ok", confirm.run);
      if (!disposed.current) setConfirm(undefined);
    } finally {
      if (!disposed.current) setConfirmBusy(false);
    }
  };

  const pickSub = (product: SubscriptionProduct) => {
    setStagedSub((ids) =>
      ids.includes(product.id) ? ids : [...ids, product.id],
    );
    const pair = pairedApiVendorId(product.id);
    if (pair !== undefined)
      setStagedApi((ids) => (ids.includes(pair) ? ids : [...ids, pair]));
    setSelected({ kind: "sub", id: product.id });
    setKeyDraft("");
    setReplacing(false);
    setPicker(false);
  };

  const pickApi = (vendor: ApiVendor) => {
    setStagedApi((ids) =>
      ids.includes(vendor.id) ? ids : [...ids, vendor.id],
    );
    setSelected({ kind: "api", id: vendor.id });
    setKeyDraft("");
    setReplacing(false);
    setPicker(false);
  };

  const discardKey = (vendor: ApiVendor, label = vendor.name) => {
    const leave = () => {
      setStagedApi((ids) => ids.filter((id) => id !== vendor.id));
      setReplacing(false);
      setKeyDraft("");
    };
    if (keyDraft.trim().length === 0) {
      leave();
      return;
    }
    ask(
      format(t("confirmDiscard"), { name: label }),
      t("confirmDiscardAction"),
      async () => {
        leave();
      },
    );
  };

  const removeKey = (vendor: ApiVendor, label = vendor.name) => {
    if (
      api === undefined ||
      vendor.writable === false ||
      disposed.current ||
      pendingWork.current.size > 0
    )
      return;
    const revision = keyDraftRevision.current;
    ask(
      format(vendor.declared ? t("confirmRemove") : t("confirmLogout"), {
        name: label,
      }),
      vendor.declared ? t("confirmRemoveAction") : t("confirmDisconnect"),
      async () => {
        let failure: string | undefined;
        if (vendor.declared) {
          const removed = await rpc.call(CHANNEL, "custom-remove", {
            id: vendor.id,
          });
          failure = removed.ok
            ? undefined
            : (removed.error?.message ?? t("unavailable"));
        } else {
          failure = await removeApiKey(api, vendor.ref);
        }
        if (disposed.current || revision !== keyDraftRevision.current) return;
        if (failure !== undefined) throw new Error(failure);
        setStagedApi((ids) => ids.filter((id) => id !== vendor.id));
        setReplacing(false);
        setKeyDraft("");
      },
    );
  };

  const liveNote =
    copied === "code"
      ? t("copied")
      : copied === "link"
        ? t("copiedLink")
        : savedOk || modelsSaved
          ? t("saved")
          : "";

  return (
    <div
      className="dshM-wrap"
      aria-busy={
        !ready || waiting || pendingId !== undefined || confirmBusy || undefined
      }
    >
      <div
        className="dshM-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveNote}
      </div>
      <div className="dshM-brand">
        <img
          className="dshM-brandMark"
          src={PORTRAIT}
          alt=""
          width={28}
          height={28}
        />
        <span className="dshM-brandName">{t("nav")}</span>
      </div>
      <label className="dshM-route">
        <input
          type="checkbox"
          checked={routeMode === "smart"}
          disabled={pendingId === "routing"}
          onChange={(event) => {
            const next = event.target.checked ? "smart" : "manual";
            void run("routing", async () => {
              const intent = routingPublisher.current.intent();
              try {
                const result = await rpc.call(CHANNEL, "setRouting", {
                  mode: next,
                });
                if (!result.ok)
                  throw new Error(result.error?.message ?? t("unavailable"));
                if (intent.publish({ ...getRoutingSnapshot(), mode: next }))
                  setRouteMode(next);
              } finally {
                intent.finish();
              }
            });
          }}
        />
        <span className="dshM-routeCopy">
          <span className="dshM-routeTitle">{t("routeTitle")}</span>
          <span className="dshM-hint">{t("routeHint")}</span>
          {routeMode === "smart" && routePoolCount === 0 ? (
            <span className="dshM-error" role="alert">
              {t("routeEmpty")}
            </span>
          ) : null}
        </span>
      </label>
      <div className="dshM-shell">
        <nav className="dshM-nav" aria-label={t("nav")}>
          <div className="dshM-navScroll">
            {sidebarSubs.length > 0 ? (
              <div className="dshM-section">
                <div className="dshM-label">{t("groupSubscriptions")}</div>
                {sidebarSubs.map((product) => {
                  const entry = status[product.id];
                  const on =
                    !customOpen &&
                    selected?.kind === "sub" &&
                    selected.id === product.id;
                  const pairOn = pairConfigured(apiVendors, product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`dshM-item${on ? " is-on" : ""}${entry?.busy === true ? " is-wait" : ""}`}
                      aria-current={on ? "true" : undefined}
                      onClick={() => {
                        setCustomOpen(false);
                        setKeyDraft("");
                        setReplacing(false);
                        setSelected({ kind: "sub", id: product.id });
                      }}
                    >
                      <span className="dshM-itemMain">
                        <ProviderLogo id={product.id} size={18} />
                        <span className="dshM-copy">
                          <span className="dshM-name">{product.nameZh}</span>
                          <span className="dshM-meta">
                            {loginBadge(product, t)} ·{" "}
                            {entry?.loggedIn === true
                              ? t("connected")
                              : entry?.busy === true
                                ? t("busy")
                                : pairOn
                                  ? t("configured")
                                  : t("loggedOut")}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {sidebarApi.length > 0 ? (
              <div className="dshM-section">
                <div className="dshM-label">{t("groupApi")}</div>
                {sidebarApi.map((vendor) => {
                  const on =
                    !customOpen &&
                    selected?.kind === "api" &&
                    selected.id === vendor.id;
                  return (
                    <button
                      key={vendor.id}
                      type="button"
                      className={on ? "dshM-item is-on" : "dshM-item"}
                      aria-current={on ? "true" : undefined}
                      onClick={() => {
                        setCustomOpen(false);
                        setKeyDraft("");
                        setReplacing(false);
                        setSelected({ kind: "api", id: vendor.id });
                      }}
                    >
                      <span className="dshM-itemMain">
                        <ProviderLogo
                          id={vendor.id}
                          size={18}
                          custom={vendor.declared}
                        />
                        <span className="dshM-copy">
                          <span className="dshM-name">{vendor.name}</span>
                          <span className="dshM-meta">
                            {apiMethodBadge(vendor, t)} ·{" "}
                            {vendor.configured
                              ? t("configured")
                              : t("loggedOut")}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {ready && sidebarSubs.length === 0 && sidebarApi.length === 0 ? (
              <p className="dshM-navNote">{t("emptyNav")}</p>
            ) : null}
          </div>
          <div className="dshM-foot">
            <button
              ref={addRef}
              type="button"
              className="dshM-add"
              onClick={() => setPicker(true)}
            >
              {t("addVendor")}
            </button>
          </div>
        </nav>

        <div className="dshM-main">
          {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
          {error !== undefined ? (
            <div className="dshM-errorRow">
              <p
                ref={errorRef}
                className="dshM-error"
                role="alert"
                tabIndex={-1}
              >
                {error}
              </p>
              <button
                type="button"
                className="dshM-btn"
                onClick={() => void refresh()}
              >
                {t("retry")}
              </button>
            </div>
          ) : null}

          {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
          {!ready ? (
            <div
              className="dshM-empty"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <p className="dshM-emptyTitle">{t("loading")}</p>
            </div>
          ) : customOpen ? (
            <article aria-busy={pendingId !== undefined || undefined}>
              <button type="button" className="dshM-back" onClick={closeCustom}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M10 3.5L5.5 8 10 12.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("back")}
              </button>
              <div className="dshM-head">
                <div>
                  <h3 className="dshM-title">{t("customTitle")}</h3>
                  <p className="dshM-hint">{t("customHint")}</p>
                </div>
              </div>
              <label className="dshM-field">
                <span className="dshM-fieldLabel">{t("customName")}</span>
                <input
                  ref={customNameRef}
                  className="dshM-input"
                  value={customName}
                  onChange={(event) => {
                    keyDraftRevision.current += 1;
                    setCustomName(event.target.value);
                  }}
                />
              </label>
              <label className="dshM-field">
                <span className="dshM-fieldLabel">{t("customBase")}</span>
                <input
                  className="dshM-input is-mono"
                  value={customBase}
                  onChange={(event) => {
                    keyDraftRevision.current += 1;
                    setCustomBase(event.target.value);
                  }}
                  placeholder={t("customBaseHint")}
                />
              </label>
              <label className="dshM-field">
                <span className="dshM-fieldLabel">{t("apiTitle")}</span>
                <input
                  className="dshM-input is-mono"
                  type="password"
                  autoComplete="new-password"
                  value={customKey}
                  onChange={(event) => {
                    keyDraftRevision.current += 1;
                    setCustomKey(event.target.value);
                  }}
                  placeholder={t("apiPlaceholderEmpty")}
                />
              </label>
              <div className="dshM-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="dshM-btn is-primary"
                  disabled={
                    customName.trim().length === 0 ||
                    customBase.trim().length === 0 ||
                    customKey.trim().length === 0 ||
                    pendingId !== undefined
                  }
                  onClick={persistCustom}
                >
                  {t("customCreate")}
                </button>
              </div>
            </article>
          ) : /* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */
          currentSub !== undefined ? (
            <article aria-busy={subWaiting || pendingId === currentSub.id}>
              <div className="dshM-head">
                <div>
                  <h3 className="dshM-title">{currentSub.nameZh}</h3>
                  <p className="dshM-hint">{t("subPurpose")}</p>
                </div>
                <span
                  className={`dshM-status${loggedIn || pairApi?.configured === true ? " is-on" : subWaiting ? " is-wait" : ""}`}
                >
                  <span className="dshM-dot" aria-hidden="true" />
                  {loggedIn
                    ? (subStatus?.account ?? t("connected"))
                    : subWaiting
                      ? t("busy")
                      : pairApi?.configured === true
                        ? t("connected")
                        : t("loggedOut")}
                </span>
              </div>

              {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
              {subStatus?.detail !== undefined ? (
                <p className="dshM-error" role="alert">
                  {subStatus.detail}
                </p>
              ) : null}

              <section>
                <div className="dshM-blockHead">
                  <h4 className="dshM-blockTitle">
                    {loggedIn
                      ? t("deviceTitle")
                      : subWaiting
                        ? t("devicePending")
                        : t("accountTitle")}
                  </h4>
                </div>
                {loggedIn || subWaiting ? (
                  <div className="dshM-device">
                    <span className="dshM-deviceLabel">{t("deviceThis")}</span>
                    <span className="dshM-deviceName">
                      {subStatus?.deviceName ?? t("deviceThis")}
                    </span>
                    {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
                    {subStatus?.deviceDetail !== undefined ? (
                      <span className="dshM-deviceMeta">
                        {subStatus.deviceDetail}
                      </span>
                    ) : null}
                    {loggedIn && subStatus?.account !== undefined ? (
                      <span className="dshM-deviceMeta">
                        {t("accountLabel")} · {subStatus.account}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <p className="dshM-hint">
                  {loggedIn
                    ? t("accountOn")
                    : currentSub.login === "soon"
                      ? t("soon")
                      : subWaiting /* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */
                        ? authCode !== undefined
                          ? t("waitingDevice")
                          : t("waitingHint")
                        : t("accountOff")}
                </p>
                {currentSub.login === "soon" ? null : subWaiting ? (
                  <div className="dshM-auth">
                    {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
                    {authCode !== undefined ? (
                      <div className="dshM-codebox">
                        <p className="dshM-code">{authCode}</p>
                        <button
                          type="button"
                          className="dshM-btn is-primary"
                          onClick={() => {
                            void copyText(authCode).then((ok) => {
                              if (ok) markCopied("code");
                              else setError(t("copyFailed"));
                            });
                          }}
                        >
                          {copied === "code" ? t("copied") : t("copy")}
                        </button>
                      </div>
                    ) : null}
                    {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
                    {authUrl !== undefined ? (
                      authCode === undefined ? (
                        <div className="dshM-actions">
                          <button
                            type="button"
                            className="dshM-btn is-primary"
                            onClick={() => {
                              void copyText(authUrl).then((ok) => {
                                if (ok) markCopied("link");
                                else setError(t("copyFailed"));
                              });
                            }}
                          >
                            {copied === "link"
                              ? t("copiedLink")
                              : t("copyLink")}
                          </button>
                          <button
                            type="button"
                            className="dshM-btn is-ghost"
                            onClick={() => openExternalUrl(authUrl)}
                          >
                            {t("openPage")}
                          </button>
                        </div>
                      ) : (
                        <p className="dshM-hint dshM-linkLine">
                          <button
                            type="button"
                            className="dshM-textLink"
                            onClick={() => {
                              void copyText(authUrl).then((ok) => {
                                if (ok) markCopied("link");
                                else setError(t("copyFailed"));
                              });
                            }}
                          >
                            {copied === "link"
                              ? t("copiedLink")
                              : t("copyLink")}
                          </button>
                          <span>{t("waitingOr")}</span>
                          <button
                            type="button"
                            className="dshM-textLink"
                            onClick={() => openExternalUrl(authUrl)}
                          >
                            {t("openPage")}
                          </button>
                        </p>
                      )
                    ) : null}
                    <div className="dshM-actions">
                      <button
                        type="button"
                        className="dshM-btn"
                        disabled={pendingId === currentSub.id}
                        onClick={() =>
                          void run(currentSub.id, async () => {
                            const result = await rpc.call(CHANNEL, "cancel", {
                              provider: currentSub.id,
                            });
                            if (!result.ok)
                              throw new Error(
                                result.error?.message ?? t("unavailable"),
                              );
                            setUrls((current) => {
                              const next = { ...current };
                              delete next[currentSub.id];
                              return next;
                            });
                            setCodes((current) => {
                              const next = { ...current };
                              delete next[currentSub.id];
                              return next;
                            });
                          })
                        }
                      >
                        {t("cancel")}
                      </button>
                    </div>
                    {currentSub.login === "oauth" ? (
                      <details className="dshM-manual">
                        <summary>{t("manualSummary")}</summary>
                        <form
                          className="dshM-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void run(currentSub.id, async () => {
                              const result = await rpc.call(CHANNEL, "manual", {
                                provider: currentSub.id,
                                input: manual,
                              });
                              if (!result.ok)
                                throw new Error(
                                  result.error?.message ?? t("unavailable"),
                                );
                            });
                          }}
                        >
                          <label
                            className="dshM-blockTitle"
                            htmlFor={`providers-manual-${currentSub.id}`}
                          >
                            {t("manualLabel")}
                          </label>
                          <input
                            id={`providers-manual-${currentSub.id}`}
                            className="dshM-input is-mono"
                            value={manual}
                            onChange={(event) => setManual(event.target.value)}
                            placeholder={t("manualPlaceholder")}
                            autoComplete="off"
                          />
                          <button
                            type="submit"
                            className="dshM-btn"
                            disabled={manual.trim().length === 0}
                          >
                            {t("submit")}
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="dshM-actions" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="dshM-btn is-primary"
                      disabled={pendingId === currentSub.id}
                      onClick={() => void login(currentSub.id)}
                    >
                      {loggedIn ? t("relogin") : t("login")}
                    </button>
                    {loggedIn ? (
                      <button
                        type="button"
                        className="dshM-btn is-danger"
                        disabled={pendingId === currentSub.id}
                        onClick={() =>
                          ask(
                            format(t("confirmLogout"), {
                              name: currentSub.nameZh,
                            }),
                            t("confirmDisconnect"),
                            async () => {
                              const result = await rpc.call(CHANNEL, "logout", {
                                provider: currentSub.id,
                              });
                              if (!result.ok)
                                throw new Error(
                                  result.error?.message ?? t("unavailable"),
                                );
                              setStagedSub((ids) =>
                                ids.filter((id) => id !== currentSub.id),
                              );
                            },
                          )
                        }
                      >
                        {t("logout")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dshM-btn"
                        onClick={() => {
                          setStagedSub((ids) =>
                            ids.filter((id) => id !== currentSub.id),
                          );
                          const pair = pairedApiVendorId(currentSub.id);
                          if (
                            pair !== undefined &&
                            keyDraft.trim().length > 0
                          ) {
                            discardKey(
                              pairApi ?? {
                                ...emptyVendor(pair),
                                name: currentSub.nameZh,
                              },
                            );
                            return;
                          }
                          if (pair !== undefined)
                            setStagedApi((ids) =>
                              ids.filter((id) => id !== pair),
                            );
                        }}
                      >
                        {t("discard")}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
              {pairApi !== undefined ? (
                <section className="dshM-block">
                  <KeyPanel
                    vendor={pairApi}
                    pending={pendingId === pairApi.id}
                    savedOk={savedOk}
                    replacing={replacing}
                    keyDraft={keyDraft}
                    savePrimary={!subWaiting}
                    t={t}
                    onDraft={setKeyDraft}
                    onReplacing={setReplacing}
                    onPersist={() => persistKey(pairApi)}
                    onRemove={() => removeKey(pairApi, currentSub.nameZh)}
                    onDiscard={() => discardKey(pairApi, currentSub.nameZh)}
                  />
                  {pairApi.baseURL === undefined ? null : (
                    <AdvancedDetails t={t} baseURL={pairApi.baseURL} />
                  )}
                </section>
              ) : null}

              {loggedIn || pairApi?.configured === true ? (
                <section className="dshM-block">
                  <div className="dshM-blockHead">
                    <h4 className="dshM-blockTitle">{t("modelsTitle")}</h4>
                    {pickerModels.length > 0 ? (
                      <span
                        className={
                          modelsSaved ? "dshM-meta is-ok" : "dshM-meta"
                        }
                      >
                        {modelsSaved
                          ? t("saved")
                          : format(t("enabledCount"), {
                              enabled: String(
                                pickerModels.filter((model) => model.selected)
                                  .length,
                              ),
                              total: String(pickerModels.length),
                            })}
                      </span>
                    ) : null}
                  </div>
                  <p className="dshM-hint">{t("modelsHint")}</p>
                  <ModelsList
                    models={pickerModels}
                    t={t}
                    onSave={(ids) => {
                      if (disposed.current) return;
                      const isCurrent = beginModelSave();
                      const picked = new Set(ids);
                      setVendors((rows) =>
                        rows.map((row) =>
                          // biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts.
                          row.id !== currentSub.id
                            ? row
                            : {
                                ...row,
                                models: row.models.map((model) => ({
                                  ...model,
                                  selected: picked.has(model.id),
                                })),
                              },
                        ),
                      );
                      markHostPicked(ids);
                      void (async () => {
                        if (loggedIn) {
                          const result = await rpc.call(CHANNEL, "setModels", {
                            provider: currentSub.id,
                            ids: currentModels
                              .filter((model) => picked.has(model.id))
                              .map((model) => model.id),
                          });
                          if (!isCurrent()) return;
                          if (!result.ok) {
                            setError(result.error?.message ?? t("unavailable"));
                            return;
                          }
                        }
                        if (pairApi?.configured === true && api !== undefined) {
                          const failure = await saveHostModels(
                            api,
                            pairApi,
                            pairModels
                              .filter((model) => picked.has(model.id))
                              .map((model) => model.id),
                            pairModels,
                            isCurrent,
                          );
                          if (!isCurrent()) return;
                          if (failure !== undefined) {
                            setError(failure);
                            return;
                          }
                          const next = await listHostModels(api, {
                            ...pairApi,
                            ...(ids.length > 0 && ids.length < pairModels.length
                              ? { picked: ids }
                              : {}),
                          });
                          if (!isCurrent()) return;
                          setPairModels(next);
                        }
                        if (isCurrent()) markModelsSaved();
                      })().catch(() => {
                        if (isCurrent()) setError(t("saveFailed"));
                      });
                    }}
                  />
                </section>
              ) : null}
            </article>
          ) : currentApi !== undefined && api !== undefined ? (
            <article aria-busy={pendingId === currentApi.id || undefined}>
              <div className="dshM-head">
                <div>
                  <h3 className="dshM-title">{currentApi.name}</h3>
                  <p className="dshM-hint">{t("apiPurpose")}</p>
                </div>
                <span
                  className={`dshM-status${currentApi.configured ? " is-on" : ""}`}
                >
                  <span className="dshM-dot" aria-hidden="true" />
                  {currentApi.configured ? t("configured") : t("loggedOut")}
                </span>
              </div>
              <KeyPanel
                vendor={currentApi}
                pending={pendingId === currentApi.id}
                savedOk={savedOk}
                replacing={replacing}
                keyDraft={keyDraft}
                t={t}
                onDraft={setKeyDraft}
                onReplacing={setReplacing}
                onPersist={() => persistKey(currentApi)}
                onRemove={() => removeKey(currentApi)}
                onDiscard={() => discardKey(currentApi)}
              />
              {currentApi.baseURL === undefined ? null : (
                <AdvancedDetails t={t} baseURL={currentApi.baseURL} />
              )}
              {currentApi.configured ? (
                <section className="dshM-block">
                  <div className="dshM-blockHead">
                    <h4 className="dshM-blockTitle">{t("modelsTitle")}</h4>
                    {hostModels.length > 0 ? (
                      <span
                        className={
                          modelsSaved ? "dshM-meta is-ok" : "dshM-meta"
                        }
                      >
                        {modelsSaved
                          ? t("saved")
                          : format(t("enabledCount"), {
                              enabled: String(
                                hostModels.filter((model) => model.selected)
                                  .length,
                              ),
                              total: String(hostModels.length),
                            })}
                      </span>
                    ) : null}
                  </div>
                  <p className="dshM-hint">{t("modelsHint")}</p>
                  <ModelsList
                    models={hostModels}
                    t={t}
                    onSave={(ids) => {
                      if (disposed.current) return;
                      const isCurrent = beginModelSave();
                      markHostPicked(ids);
                      void (async () => {
                        const failure = await saveHostModels(
                          api,
                          currentApi,
                          ids,
                          hostModels,
                          isCurrent,
                        );
                        if (!isCurrent()) return;
                        if (failure !== undefined) {
                          setError(failure);
                          const restored = await listHostModels(
                            api,
                            currentApi,
                          );
                          if (!isCurrent()) return;
                          setHostModels(restored);
                          return;
                        }
                        const next = await listHostModels(api, {
                          ...currentApi,
                          picked:
                            ids.length === 0
                              ? []
                              : ids.length < hostModels.length
                                ? ids
                                : undefined,
                        });
                        if (!isCurrent()) return;
                        setHostModels(next);
                        if (isCurrent()) markModelsSaved();
                      })().catch(() => {
                        if (isCurrent()) setError(t("saveFailed"));
                      });
                    }}
                  />
                </section>
              ) : null}
            </article>
          ) : (
            <div className="dshM-empty" role="status">
              <p className="dshM-emptyTitle">{t("emptyTitle")}</p>
              <p className="dshM-emptyCopy">{t("emptyDetail")}</p>
              <button
                type="button"
                className="dshM-btn is-primary"
                onClick={() => setPicker(true)}
              >
                {t("addVendor")}
              </button>
            </div>
          )}
        </div>
      </div>

      {picker ? (
        <div
          className="dshM-mask"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPicker(false);
          }}
        >
          <div
            ref={sheetRef}
            className="dshM-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dshM-picker-title"
          >
            <div className="dshM-sheetHead">
              <h2 id="dshM-picker-title" className="dshM-title">
                {t("addTitle")}
              </h2>
              <button
                type="button"
                className="dshM-close"
                onClick={() => setPicker(false)}
                aria-label={t("closePicker")}
              >
                <span aria-hidden="true">
                  <CloseIcon />
                </span>
              </button>
            </div>
            <p className="dshM-hint" style={{ margin: "0 18px 8px" }}>
              {t("addHint")}
            </p>
            <label className="dshM-search">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchProviders")}
                aria-label={t("searchProviders")}
              />
            </label>
            <div className="dshM-sheetBody">
              {pickerEmpty ? (
                <div className="dshM-pickerEmpty" role="status">
                  {t("noMatch")}
                </div>
              ) : null}
              {q.length === 0 &&
              sortFeatured(featuredSubs, featuredApi).length > 0 ? (
                <section className="dshM-pickerBlock">
                  <div className="dshM-blockLabel">{t("recommended")}</div>
                  <div className="dshM-grid">
                    {sortFeatured(featuredSubs, featuredApi).map((card) =>
                      card.kind === "sub" ? (
                        <button
                          key={card.product.id}
                          type="button"
                          className="dshM-card"
                          onClick={() => pickSub(card.product)}
                        >
                          <span className="dshM-cardIcon">
                            <ProviderLogo id={card.product.id} size={20} />
                          </span>
                          <span className="dshM-cardCopy">
                            <span className="dshM-cardTitle">
                              {card.product.nameZh}
                            </span>
                            <span className="dshM-cardSub">
                              {loginBadge(card.product, t)}
                            </span>
                          </span>
                        </button>
                      ) : (
                        <button
                          key={card.vendor.id}
                          type="button"
                          className="dshM-card"
                          onClick={() => pickApi(card.vendor)}
                        >
                          <span className="dshM-cardIcon">
                            <ProviderLogo id={card.vendor.id} size={20} />
                          </span>
                          <span className="dshM-cardCopy">
                            <span className="dshM-cardTitle">
                              {card.vendor.name}
                            </span>
                            <span className="dshM-cardSub">
                              {t("apiBadge")}
                            </span>
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <PickerGroup
                    label={t("domestic")}
                    products={availableSubs.filter(
                      (product) => product.region === "cn",
                    )}
                    t={t}
                    onPick={pickSub}
                  />
                  <PickerGroup
                    label={t("international")}
                    products={availableSubs.filter(
                      (product) => product.region === "intl",
                    )}
                    t={t}
                    onPick={pickSub}
                  />
                </>
              )}
              {q.length === 0 ? (
                <>
                  <PickerGroup
                    label={t("domestic")}
                    products={extraSubs.filter(
                      (product) => product.region === "cn",
                    )}
                    t={t}
                    onPick={pickSub}
                  />
                  <PickerGroup
                    label={t("international")}
                    products={extraSubs.filter(
                      (product) => product.region === "intl",
                    )}
                    t={t}
                    onPick={pickSub}
                  />
                  <VendorGroup
                    label={t("groupApi")}
                    vendors={extraApi}
                    t={t}
                    onPick={pickApi}
                  />
                </>
              ) : (
                <VendorGroup
                  label={t("groupApi")}
                  vendors={availableApi}
                  t={t}
                  onPick={pickApi}
                />
              )}
              <button
                type="button"
                className="dshM-customLink"
                onClick={openCustom}
              >
                {t("addCustom")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* biome-ignore lint/style/noNegationElse: Preserve Models UI branch structure and its regression contracts. */}
      {confirm !== undefined ? (
        <div
          className="dshM-mask"
          onClick={(event) => {
            if (event.target === event.currentTarget && !confirmBusy)
              setConfirm(undefined);
          }}
        >
          <div
            ref={confirmRef}
            className="dshM-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dshM-confirm-title"
            aria-busy={confirmBusy || undefined}
          >
            <h2 id="dshM-confirm-title" className="dshM-title">
              {t("confirmTitle")}
            </h2>
            <p>{confirm.body}</p>
            <div className="dshM-actions">
              <button
                ref={cancelRef}
                type="button"
                className="dshM-btn"
                disabled={confirmBusy}
                onClick={() => setConfirm(undefined)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="dshM-btn is-danger"
                disabled={confirmBusy}
                onClick={() => void finishConfirm()}
              >
                {confirm.action}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
