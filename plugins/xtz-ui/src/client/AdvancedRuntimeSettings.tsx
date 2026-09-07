import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client';
import { RUNTIME_FIELDS, type RuntimeForm, type RuntimeNamespace } from './advanced-runtime.ts';
import type { AdvancedT } from './advanced-runtime-locales.ts';

type RuntimeField = keyof typeof RUNTIME_FIELDS.shell | keyof typeof RUNTIME_FIELDS['agent-loop'] | keyof typeof RUNTIME_FIELDS['web-search-deepseek'];

export function AdvancedRuntimeSettings({ forms, mirror, t }: {
  forms: Record<RuntimeNamespace, RuntimeForm>; mirror: SettingsDescribeFace; t: AdvancedT;
}) {
  // The shared Host mirror is a class face: do not detach its method receivers.
  const subscribeMirror = useCallback((listener: () => void) => mirror.subscribe(listener), [mirror]);
  const readMirror = useCallback(() => mirror.getSnapshot(), [mirror]);
  const host = useSyncExternalStore(subscribeMirror, readMirror, readMirror);
  const states = {
    shell: useSyncExternalStore(forms.shell.subscribe, forms.shell.getSnapshot, forms.shell.getSnapshot),
    'agent-loop': useSyncExternalStore(forms['agent-loop'].subscribe, forms['agent-loop'].getSnapshot, forms['agent-loop'].getSnapshot),
    'web-search-deepseek': useSyncExternalStore(forms['web-search-deepseek'].subscribe, forms['web-search-deepseek'].getSnapshot, forms['web-search-deepseek'].getSnapshot),
  };
  useEffect(() => { void mirror.ensure(); }, [mirror]);
  // Forms belong to the activation. View unmount only releases React subscriptions.
  const namespaces = Object.keys(RUNTIME_FIELDS) as RuntimeNamespace[];
  const loading = host.status === 'loading' || (host.status === 'idle' && !host.error);
  const busy = Object.values(states).some(state => state.busy);
  const messages = namespaces.flatMap(namespace => {
    const state = states[namespace];
    const message = state.busy ? t('saving') : state.error ? t(state.error) : state.status === 'saved' ? t('saved') : '';
    return message ? [`${t(namespace)}: ${message}`] : [];
  });
  if (loading) messages.unshift(t('loading'));
  if (host.error) messages.push(host.error);
  const credential = states['web-search-deepseek'].credential;
  if (credential.error) messages.push(t('credentialError'));
  const failed = !!host.error || credential.error || Object.values(states).some(state => !!state.error);

  return <div className="dshH-advanced" aria-busy={loading || busy}>
    <h1>{t('nav')}</h1>
    <p className="dshH-advancedHint">{t('lede')}</p>
    <p className="dshH-advancedStatus" role="status" aria-live="polite" aria-atomic="true" data-error={failed}>
      {messages.join(' ')}
    </p>
    {host.error && <button type="button" disabled={host.status !== 'idle'} onClick={() => { void mirror.ensure(); }}>{t('retry')}</button>}
    {namespaces.map(namespace => {
      const form = forms[namespace];
      const state = states[namespace];
      const disabled = !state.writable || state.busy;
      const replacing = namespace === 'web-search-deepseek' && !!state.fields.apiKey.text.trim();
      return <section key={namespace} aria-labelledby={`${namespace}-heading`} aria-busy={state.busy}>
        <h2 id={`${namespace}-heading`}>{t(namespace)}</h2>
        {!state.available && !loading && <p className="dshH-advancedHint">{t('unavailable')}</p>}
        {state.available && !state.writable && <p className="dshH-advancedHint">{t('readOnly')}</p>}
        {(Object.entries(RUNTIME_FIELDS[namespace]) as [RuntimeField, 'number' | 'text'][]).map(([field, kind]) => {
          const id = `${namespace}-${field}`;
          const value = state.fields[field];
          return <div className="dshH-advancedRow" key={field}>
            <label htmlFor={id}>{t(field)}</label>
            <span className="dshH-advancedOverride">{t(value.overridden ? 'overridden' : 'inherited')}</span>
            <div className="dshH-advancedControls">
              <input id={id} type="text" inputMode={kind === 'number' ? 'decimal' : undefined}
                aria-invalid={value.invalid} aria-describedby={`${id}-hint`} disabled={disabled}
                value={value.text} onChange={event => form.edit(field, event.currentTarget.value)} />
              <button type="button" disabled={disabled} onClick={() => form.reset(field)}>{t('reset')}</button>
            </div>
            <p id={`${id}-hint`} className="dshH-advancedHint" data-error={value.invalid}>
              {value.invalid ? t('invalidNumber') : t(`${field}Hint`)}
            </p>
          </div>;
        })}
        {namespace === 'web-search-deepseek' && <div className="dshH-advancedRow">
          <label htmlFor="web-search-deepseek-apiKey">{t('apiKey')}</label>
          {!credential.error && <span className="dshH-advancedOverride">
            {t(credential.loading ? 'credentialLoading' : credential.configured ? 'credentialConfigured' : 'credentialMissing')}
          </span>}
          <input id="web-search-deepseek-apiKey" type="password" autoComplete="new-password"
            aria-describedby="web-search-deepseek-apiKey-hint web-search-deepseek-apiKey-state"
            disabled={disabled || !credential.writable || credential.loading || credential.error}
            value={state.fields.apiKey.text} onChange={event => form.edit('apiKey', event.currentTarget.value)} />
          <p id="web-search-deepseek-apiKey-hint" className="dshH-advancedHint">{t('apiKeyHint')}</p>
          <p id="web-search-deepseek-apiKey-state" className="dshH-advancedHint" data-error={credential.error}>
            {credential.error ? t('credentialError') : !credential.loading && !credential.writable ? t('credentialReadOnly') : ''}
          </p>
          {credential.error && <button type="button" disabled={state.busy} onClick={() => { void form.refreshCredential(); }}>{t('retry')}</button>}
        </div>}
        <div className="dshH-advancedActions">
          <button type="button" className="dshH-advancedSave"
            disabled={disabled || !state.dirty || state.invalid || (replacing && (!credential.writable || credential.loading || credential.error))}
            onClick={() => { void form.save(); }}>{t('save')}</button>
          <button type="button" disabled={state.busy || !state.dirty} onClick={() => form.discard()}>{t('discard')}</button>
        </div>
      </section>;
    })}
  </div>;
}
