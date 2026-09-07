import { afterEach, describe, expect, it, vi } from "vitest";
import { coalesce, hideOfficialSettings, isObsoleteSettingsLabel } from "../src/client/hide-official.ts";

it.each([' 模型 ', 'Models', '插件', 'Plugins'])('matches exact obsolete label %s', text => {
  expect(isObsoleteSettingsLabel(text)).toBe(true);
});
it.each(['设置模型', '模型缓存', '高级', 'Advanced', 'General', '通用设置', 'My Plugins'])('preserves other label %s', text => {
  expect(isObsoleteSettingsLabel(text)).toBe(false);
});

// Only the pinned selector vocabulary is supported, so a selector widening fails.
class Element {
  attributes = new Map<string, string>();
  style = { display: '' };
  hidden = false;
  tabIndex = 0;
  isConnected = true;
  label: Element | null = null;
  children: Element[] = [];
  click = vi.fn();
  constructor(readonly textContent = '') {}
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  querySelector(selector: string): Element | null {
    if (selector === '[class*="navLabel"]') return this.label;
    if (selector === '[class*="navList"]') return this.children[0] ?? null;
    if (selector === '[class*="options"]') return this.children[1] ?? null;
    throw new Error(`Unexpected selector ${selector}`);
  }
  querySelectorAll(selector: string): Element[] {
    if (selector === ':scope > button') return this.children;
    if (selector === '[class*="navList"] > button') return this.children[0]?.children ?? [];
    throw new Error(`Unexpected selector ${selector}`);
  }
}
function fixture(labels = ['Models', 'Plugins', 'Advanced', 'General']) {
  const rows = labels.map(label => { const row = new Element(`icon ${label}`); row.label = new Element(label); return row; });
  const nav = new Element(); nav.children = rows;
  const options = new Element('technical inventory');
  const dialog = new Element(); dialog.children = [nav, options];
  const outside = new Element('Models'); outside.label = new Element('Models');
  let scans = 0;
  const doc = {
    body: new Element(),
    querySelectorAll(selector: string) {
      scans++;
      if (selector === '[role="dialog"][aria-modal="true"]') return [dialog];
      if (selector === '[class*="navList"] > button') return [outside, ...rows]; // old adapter
      throw new Error(`Unexpected selector ${selector}`);
    },
    querySelector: () => null,
  };
  const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal('MutationObserver', class {
    disconnect = vi.fn(); observe = vi.fn();
    constructor(readonly callback: () => void) { observers.push(this); }
  });
  vi.stubGlobal('HTMLElement', Element);
  return { doc, rows, nav, options, outside, observers, scans: () => scans,
    mount: () => hideOfficialSettings(doc as unknown as Document) };
}
afterEach(() => vi.unstubAllGlobals());

it.each([['Models', 'Plugins', 'Advanced', 'General'], ['模型', '模型', '插件', '高级', '通用设置'], ['Models', 'General']])('hides all obsolete rows only inside the modal: %j', (...labels) => {
  const f = fixture(labels);
  const dispose = f.mount();
  for (const row of f.rows) {
    const obsolete = ['Models', 'Plugins', '模型', '插件'].includes(row.label!.textContent);
    expect(row.hidden).toBe(obsolete);
    expect(row.style.display).toBe(obsolete ? 'none' : '');
    expect(row.getAttribute('aria-hidden')).toBe(obsolete ? 'true' : null);
    expect(row.tabIndex).toBe(obsolete ? -1 : 0);
  }
  expect(f.outside.hidden).toBe(false);
  expect(f.outside.style.display).toBe('');
  dispose();
});

it('suppresses stale Plugins content until a later safe render and transfers once to Advanced', async () => {
  const f = fixture(); f.rows[1].setAttribute('aria-current', 'true');
  const dispose = f.mount();
  expect(f.options.hidden).toBe(true);
  expect(f.rows[2].click).toHaveBeenCalledTimes(1);
  f.observers[0].callback(); f.observers[0].callback(); await Promise.resolve();
  expect(f.rows[2].click).toHaveBeenCalledTimes(1);
  expect(f.options.hidden).toBe(true);
  f.rows[1].removeAttribute('aria-current'); f.rows[2].setAttribute('aria-current', 'true');
  f.observers[0].callback(); await Promise.resolve();
  expect(f.options.hidden).toBe(false); expect(f.options.style.display).toBe('');
  dispose();
});

it('falls back to General when Advanced is late, keeping content hidden until safe selection', async () => {
  const f = fixture(['插件', '通用设置']); f.rows[0].setAttribute('aria-current', 'true');
  const dispose = f.mount();
  expect(f.rows[1].click).toHaveBeenCalledTimes(1); expect(f.options.hidden).toBe(true);
  f.rows[0].removeAttribute('aria-current'); f.rows[1].setAttribute('aria-current', 'true');
  f.observers[0].callback(); await Promise.resolve();
  expect(f.options.hidden).toBe(false);
  dispose();
});

it('keeps stale content suppressed with no safe row, then transfers when Advanced arrives', async () => {
  const f = fixture(['Plugins']); f.rows[0].setAttribute('aria-current', 'true');
  const dispose = f.mount(); expect(f.options.hidden).toBe(true);
  const advanced = new Element('Advanced'); advanced.label = new Element('Advanced'); f.nav.children.push(advanced);
  f.observers[0].callback(); await Promise.resolve();
  expect(advanced.click).toHaveBeenCalledTimes(1); expect(f.options.hidden).toBe(true);
  dispose();
});

it('restores exact original attributes/styles for connected nodes on HMR and cancels queued work', async () => {
  const f = fixture(); const row = f.rows[0];
  row.hidden = true; row.style.display = 'inline-flex'; row.tabIndex = 3; row.setAttribute('tabindex', '3'); row.setAttribute('aria-hidden', 'false');
  f.rows[1].setAttribute('aria-current', 'true');
  f.options.style.display = 'grid'; f.options.setAttribute('aria-hidden', 'false');
  const dispose = f.mount(); f.rows[1].isConnected = false;
  f.observers[0].callback(); const scans = f.scans(); dispose(); await Promise.resolve();
  expect(f.scans()).toBe(scans); expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
  expect(row.hidden).toBe(true); expect(row.style.display).toBe('inline-flex'); expect(row.tabIndex).toBe(3);
  expect(row.getAttribute('aria-hidden')).toBe('false'); expect(row.getAttribute('tabindex')).toBe('3');
  expect(f.rows[1].hidden).toBe(true); // disconnected nodes are not mutated on teardown
  expect(f.options.style.display).toBe('grid'); expect(f.options.getAttribute('aria-hidden')).toBe('false');
});

it('coalesces observed renders, observes aria-current only, and leaves already-hidden nodes unchanged', async () => {
  const f = fixture(); const dispose = f.mount();
  expect(f.observers[0].observe.mock.calls[0][0]).toBe(f.doc.body);
  expect(f.observers[0].observe.mock.calls[0][1]).toEqual({
    childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'],
  });
  const writes = vi.spyOn(f.rows[0], 'setAttribute'); const scans = f.scans();
  f.observers[0].callback(); f.observers[0].callback(); f.observers[0].callback();
  await Promise.resolve(); await Promise.resolve();
  expect(f.scans()).toBe(scans + 1); expect(writes).not.toHaveBeenCalled();
  dispose();
});

describe('coalesce', () => {
  it('folds bursts and accepts new triggers after a completed run', () => {
    const pending: Array<() => void> = []; let runs = 0;
    const trigger = coalesce(() => { runs++; }, callback => pending.push(callback));
    trigger(); trigger(); expect(runs).toBe(0); expect(pending).toHaveLength(1);
    pending.shift()?.(); expect(runs).toBe(1); trigger(); trigger(); pending.shift()?.();
    expect(runs).toBe(2); expect(pending).toHaveLength(0);
  });
  it('uses queueMicrotask by default', async () => {
    let runs = 0; const trigger = coalesce(() => { runs++; }); trigger(); trigger();
    expect(runs).toBe(0); await Promise.resolve(); expect(runs).toBe(1);
  });
});
