import { useEffect, useMemo, useRef, useState } from 'react';

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`dma-switch${checked ? ' dma-switchOn' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Badge({ tone, children }) {
  const toneClass = tone === 'ok' ? ' dma-badgeOk' : tone === 'warn' ? ' dma-badgeWarn' : tone === 'err' ? ' dma-badgeErr' : '';
  return <span className={`dma-badge${toneClass}`}>{children}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="dma-field">
      <span className="dma-fieldLabel">{label}</span>
      {children}
      {hint ? <span className="dma-rowHint">{hint}</span> : null}
    </label>
  );
}

export function Row({ label, hint, children }) {
  return (
    <div className="dma-row">
      <div className="dma-rowText">
        <span className="dma-rowLabel">{label}</span>
        {hint ? <span className="dma-rowHint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options, className, ariaLabel }) {
  return (
    <select className={`dma-select ${className ?? ''}`} value={value ?? ''} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}>
      {options.map((option) => <option key={option.value ?? ''} value={option.value ?? ''}>{option.label}</option>)}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, invalid, className, mono }) {
  return (
    <input
      className={`dma-input${invalid ? ' dma-inputInvalid' : ''}${mono ? ' dma-mono' : ''} ${className ?? ''}`}
      value={value ?? ''}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function NumberInput({ value, onChange, placeholder }) {
  return (
    <input
      className="dma-input"
      inputMode="numeric"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^0-9]/g, '');
        onChange(digits === '' ? undefined : Number(digits));
      }}
    />
  );
}

export function Chips({ options, selected, onToggle }) {
  return (
    <div className="dma-chips">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button key={option.value} type="button" className={`dma-chip${on ? ' dma-chipOn' : ''}`} aria-pressed={on} onClick={() => onToggle(option.value, !on)}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Close a popover on outside click or Escape. */
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/** Group graph nodes into dependency layers for a left-to-right layout. */
export function layerNodes(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map();
  const visit = (node, seen = new Set()) => {
    if (depth.has(node.id)) return depth.get(node.id);
    if (seen.has(node.id)) return 0;
    seen.add(node.id);
    const value = (node.dependencies ?? []).reduce((max, id) => (byId.has(id) ? Math.max(max, visit(byId.get(id), seen) + 1) : max), 0);
    depth.set(node.id, value);
    return value;
  };
  for (const node of nodes) visit(node);
  const layers = [];
  for (const node of nodes) (layers[depth.get(node.id)] ??= []).push(node);
  return layers.filter(Boolean);
}

export function TaskGraphView({ nodes, t, selected, onSelect }) {
  const layers = useMemo(() => layerNodes(nodes), [nodes]);
  return (
    <div className="dma-graph">
      {layers.map((layer, index) => (
        <div key={index} className="dma-layer">
          {layer.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`dma-node dma-node-${node.status}${selected === node.id ? ' dma-nodeSelected' : ''}`}
              onClick={() => onSelect?.(selected === node.id ? undefined : node.id)}
            >
              <span className="dma-nodeTitle">{node.title ?? node.id}</span>
              <span className="dma-nodeMeta">{node.roleId} · {t(`node.${node.status}`)}{node.attempts > 1 ? ` · ${node.attempts} ${t('runs.attempts')}` : ''}</span>
              <span className="dma-nodeMeta dma-mono">{node.model ?? t('inherit')}{node.effort ? ` · ${node.effort}` : ''}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ nodes }) {
  const total = nodes.length || 1;
  const counts = {};
  for (const node of nodes) counts[node.status] = (counts[node.status] ?? 0) + 1;
  return (
    <div className="dma-bar">
      {['completed', 'running', 'reviewing', 'failed', 'blocked'].map((status) => (counts[status] ? <span key={status} className={`dma-barSeg-${status}`} style={{ width: `${(counts[status] / total) * 100}%` }} /> : null))}
    </div>
  );
}

export function statusTone(status) {
  if (status === 'reviewing' || status === 'completed') return 'ok';
  if (status === 'running' || status === 'planning' || status === 'analyzing') return undefined;
  if (status === 'blocked' || status === 'failed') return 'err';
  return 'warn';
}
