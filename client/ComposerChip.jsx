import { useCallback, useEffect, useState } from 'react';
import { Badge, Row, Switch, useDismiss } from './components.jsx';
import { RunsTab } from './SettingsPage.jsx';

/** Composer-row chip: this conversation's switch plus a popover with its runs. */
export function ComposerChip({ api, t, sessionId, session }) {
  const [state, setState] = useState();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState();
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try { setState(await api.session(sessionId)); setError(undefined); } catch (failure) { setError(failure.message); }
  }, [api, sessionId]);
  useEffect(() => { refresh(); }, [refresh, open]);

  if (!sessionId || session?.subagent) return null;
  if (!state) return null;

  const on = state.enabled;
  const set = async (value) => {
    try { setState(await api.setSession(sessionId, value)); } catch (failure) { setError(failure.message); }
  };

  return (
    <span className="dma-chipWrap" ref={ref}>
      <button
        type="button"
        className={`dma-composerChip${on ? ' dma-composerChipOn' : ''}`}
        aria-expanded={open}
        aria-label={t(on ? 'chip.on' : 'chip.off')}
        title={state.globalEnabled ? t(on ? 'chip.on' : 'chip.off') : t('chip.globalOff')}
        onClick={() => setOpen(!open)}
      >
        <span className="dma-dot" aria-hidden />
        {t('chip.label')}
      </button>
      {open ? (
        <div className="dma-popover" role="dialog" aria-label={t('chip.label')}>
          <Row label={t('chip.thisSession')} hint={state.globalEnabled ? (state.override === null ? t('chip.default') : undefined) : t('chip.globalOff')}>
            <Switch checked={on} disabled={!state.globalEnabled} onChange={set} label={t('chip.thisSession')} />
          </Row>
          {state.override !== null && state.globalEnabled ? (
            <button type="button" className="dma-link" onClick={() => set(null)}>{t('chip.default')}</button>
          ) : null}
          {error ? <p className="dma-footerError">{error}</p> : null}
          <div className="dma-popoverRuns">
            <span className="dma-fieldLabel">{t('chip.runs')}</span>
            <RunsTab api={api} t={t} sessionId={sessionId} compact />
          </div>
        </div>
      ) : null}
    </span>
  );
}

const STATUS_TONE = { completed: 'ok', reviewing: 'ok', failed: 'err', blocked: 'err', cancelled: 'warn' };

/** Tool-call card for the orchestration tools: a compact summary instead of raw JSON. */
export function OrchestrationToolCard({ toolName, block, t }) {
  const running = block?.kind !== 'tool-result';
  const args = safeJson(block?.argsRaw ?? block?.call?.argsRaw);
  const value = running ? undefined : safeJson((block.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join(''));
  const label = toolName.replace('dynamic_multiagent_', '');
  const nodes = value?.nodes ?? args?.plan?.nodes ?? [];
  return (
    <div className="dma-toolCard">
      <div className="dma-toolHead">
        <span className={running ? 'dma-dot dma-spin' : 'dma-dot'} aria-hidden style={{ color: running ? 'var(--dsw-alias-brand-primary)' : block?.isError ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' }} />
        <span className="dma-toolName">{t('chip.label')} · {label}</span>
        {value?.status ? <Badge tone={STATUS_TONE[value.status]}>{value.status}</Badge> : null}
        {value?.runId ?? args?.runId ? <span className="dma-mono dma-muted">{value?.runId ?? args?.runId}</span> : null}
      </div>
      {args?.task ? <div className="dma-muted">{args.task}</div> : null}
      {args?.plan?.summary ? <div className="dma-muted">{args.plan.summary}</div> : null}
      {nodes.length ? (
        <div className="dma-chips">
          {nodes.map((node) => {
            const id = node.nodeId ?? node.id;
            return (
              <Badge key={id} tone={STATUS_TONE[node.status]}>
                {id}{node.roleId ? ` · ${node.roleId}` : ''}{node.model ? ` · ${node.model}` : ''}{node.effort ? ` · ${node.effort}` : ''}{node.status ? ` · ${t(`node.${node.status}`)}` : ''}
              </Badge>
            );
          })}
        </div>
      ) : null}
      {block?.isError ? <div className="dma-footerError">{(block.content ?? []).map((item) => item.text).join('').slice(0, 400)}</div> : null}
    </div>
  );
}

function safeJson(text) {
  if (typeof text !== 'string' || !text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}
