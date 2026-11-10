import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Chips, Field, NumberInput, ProgressBar, Row, Select, statusTone, Switch, TaskGraphView, TextInput } from './components.jsx';

const TABS = ['overview', 'models', 'routing', 'skills', 'runs', 'prompts'];
const CAPABILITIES = ['reasoning', 'coding', 'writing', 'long-context', 'tool-calling', 'multimodal', 'low-latency'];
const PROTOCOLS = [{ value: 'openai-chat', label: 'OpenAI Chat Completions' }, { value: 'anthropic-messages', label: 'Anthropic Messages' }];
const THINKING = ['none', 'openai', 'adaptive', 'budget'];

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Full configuration page; shared by the Settings section (0.1.x) and the Plugins page (0.2.x). */
export function SettingsPage({ api, t }) {
  const [state, setState] = useState({ status: 'loading' });
  const [draft, setDraft] = useState();
  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState();

  const load = useCallback(async () => {
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    try {
      const overview = await api.overview();
      setState({ status: 'ready', overview });
      setDraft(clone(overview.config));
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const overview = state.overview;
  const dirty = useMemo(() => overview && draft && JSON.stringify(stripMeta(draft)) !== JSON.stringify(stripMeta(overview.config)), [overview, draft]);

  if (state.status === 'loading') return <div className="dma-page"><p className="dma-muted">{t('loading')}</p></div>;
  if (state.status === 'error') {
    return (
      <div className="dma-page">
        <p className="dma-footerError">{t('error')}: {state.message}</p>
        <div><button type="button" className="dma-button" onClick={load}>{t('retry')}</button></div>
      </div>
    );
  }

  const update = (mutate) => setDraft((current) => { const next = clone(current); mutate(next); return next; });
  const save = async () => {
    setSaving(true);
    setNotice(undefined);
    try {
      const saved = await api.saveConfig(draft, overview.config.revision);
      setState({ status: 'ready', overview: { ...overview, config: saved } });
      setDraft(clone(saved));
      setNotice({ kind: 'ok', text: t('saved') });
      load();
    } catch (error) {
      setNotice({ kind: 'error', text: /config-conflict/.test(error.message) ? t('conflict') : error.message });
    } finally {
      setSaving(false);
    }
  };
  const toggleGlobal = async (enabled) => {
    try {
      const saved = await api.setEnabled(enabled);
      setState({ status: 'ready', overview: { ...overview, config: saved } });
      setDraft((current) => ({ ...current, enabled: saved.enabled, revision: saved.revision }));
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    }
  };

  return (
    <div className="dma-page">
      <div className="dma-header">
        <h2 className="dma-title">{t('title')}</h2>
        <p className="dma-subtitle">{t('subtitle')}</p>
      </div>
      <div className="dma-card">
        <Row label={t('switch.global')} hint={t('switch.global.hint')}>
          <Switch checked={overview.config.enabled !== false} onChange={toggleGlobal} label={t('switch.global')} />
        </Row>
        <Row label={t('switch.sessionDefault')} hint={t('switch.sessionDefault.hint')}>
          <Switch checked={draft.sessionDefault !== false} onChange={(value) => update((next) => { next.sessionDefault = value; })} label={t('switch.sessionDefault')} />
        </Row>
      </div>
      <div className="dma-tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`dma-tab${tab === id ? ' dma-tabActive' : ''}`} onClick={() => setTab(id)}>
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab overview={overview} draft={draft} t={t} />}
      {tab === 'models' && <ModelsTab overview={overview} draft={draft} update={update} api={api} t={t} />}
      {tab === 'routing' && <RoutingTab overview={overview} draft={draft} update={update} t={t} />}
      {tab === 'skills' && <SkillsTab overview={overview} draft={draft} update={update} t={t} />}
      {tab === 'runs' && <RunsTab api={api} t={t} />}
      {tab === 'prompts' && <PromptsTab api={api} overview={overview} t={t} />}
      {(dirty || notice) && (
        <div className="dma-footer">
          {notice?.kind === 'error' ? <span className="dma-footerError">{notice.text}</span> : <span className="dma-footerNote">{dirty ? t('unsaved') : notice?.text}</span>}
          <button type="button" className="dma-button" disabled={!dirty || saving} onClick={() => { setDraft(clone(overview.config)); setNotice(undefined); }}>{t('discard')}</button>
          <button type="button" className="dma-button dma-buttonPrimary" disabled={!dirty || saving} onClick={save}>{saving ? t('saving') : t('save')}</button>
        </div>
      )}
    </div>
  );
}

function stripMeta(config) {
  const { revision, updatedAt, enabled, ...rest } = config;
  return rest;
}

/** Every model the router can assign: host routes added via profiles plus advanced connections. */
function assignableModels(overview, draft) {
  const models = [];
  for (const profile of draft.modelProfiles ?? []) {
    const [provider, ...rest] = profile.ref.split(':');
    const id = rest.join(':');
    const connection = draft.connections.find((candidate) => candidate.id === provider);
    if (connection) continue;
    const host = overview.hostModels.find((entry) => entry.id === provider)?.models.find((model) => model.id === id);
    models.push({ ref: profile.ref, label: host?.name ? `${host.name} (${provider})` : profile.ref, efforts: host?.efforts ?? [] });
  }
  for (const connection of draft.connections ?? []) {
    for (const model of connection.models ?? []) models.push({ ref: `${connection.id}:${model.id}`, label: `${model.label ?? model.id} (${connection.id})`, efforts: model.efforts ?? [] });
  }
  return models;
}

function OverviewTab({ overview, draft, t }) {
  const { host, deployment } = overview;
  const models = assignableModels(overview, draft);
  return (
    <>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('overview.health')}</h3>
        <Row label={t('overview.subagent')} hint={host.subagentProvider}><Badge tone={host.subagentAvailable ? 'ok' : 'err'}>{t(host.subagentAvailable ? 'status.ready' : 'status.missing')}</Badge></Row>
        <Row label={t('overview.toolFilter')}><Badge tone={host.toolFilter ? 'ok' : 'warn'}>{t(host.toolFilter ? 'status.ready' : 'status.missing')}</Badge></Row>
        <Row label={t('overview.depthLimit')}><Badge tone={host.depthLimit ? 'ok' : 'warn'}>{t(host.depthLimit ? 'status.ready' : 'status.missing')}</Badge></Row>
        <Row label={t('overview.llm')} hint={overview.hostModels.map((provider) => provider.id).join(', ') || t('none')}><Badge tone={host.llm ? 'ok' : 'warn'}>{t(host.llm ? 'status.ready' : 'status.missing')}</Badge></Row>
        <Row label={t('overview.models')} hint={models.map((model) => model.ref).join(', ') || t('inherit')}><Badge>{models.length}</Badge></Row>
        <Row label={t('overview.leader')}><span className="dma-mono">{draft.defaults.leader ?? t('overview.leader.session')}</span></Row>
        <Row label={t('overview.dataDir')}><span className="dma-mono dma-muted">{deployment.dataDir}</span></Row>
      </div>
      <p className="dma-cardHint">{t('overview.effortNote')}</p>
      <p className="dma-cardHint">{t('overview.deployment')}: <span className="dma-mono">subagentProvider={deployment.subagentProvider} exposeTools={String(deployment.exposeTools)}</span></p>
    </>
  );
}

function ModelsTab({ overview, draft, update, api, t }) {
  const profiles = new Map((draft.modelProfiles ?? []).map((profile) => [profile.ref, profile]));
  const toggleHost = (ref, on) => update((next) => {
    next.modelProfiles = (next.modelProfiles ?? []).filter((profile) => profile.ref !== ref);
    if (on) next.modelProfiles.push({ ref, capabilities: [], evidence: [] });
  });
  const setCapability = (ref, capability, on) => update((next) => {
    const profile = next.modelProfiles.find((candidate) => candidate.ref === ref);
    if (!profile) return;
    profile.capabilities = on ? [...new Set([...profile.capabilities, capability])] : profile.capabilities.filter((value) => value !== capability);
  });
  return (
    <>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('models.host')}</h3>
        <p className="dma-cardHint">{t('models.host.hint')}</p>
        {overview.hostModels.length === 0 ? <p className="dma-empty">{t('models.host.empty')}</p> : (
          <table className="dma-table">
            <thead><tr><th style={{ width: 40 }} /><th>{t('routing.model')}</th><th>{t('models.efforts')}</th><th>{t('models.context')}</th></tr></thead>
            <tbody>
              {overview.hostModels.flatMap((provider) => provider.models.map((model) => {
                const ref = `${provider.id}:${model.id}`;
                const profile = profiles.get(ref);
                return [
                  <tr key={ref}>
                    <td><Switch checked={Boolean(profile)} onChange={(on) => toggleHost(ref, on)} label={ref} /></td>
                    <td><div>{model.name}</div><div className="dma-mono dma-muted">{ref}</div></td>
                    <td>{model.efforts.length ? <div className="dma-chips">{model.efforts.map((effort) => <Badge key={effort}>{effort}</Badge>)}</div> : <span className="dma-muted">{t('models.noEfforts')}</span>}</td>
                    <td className="dma-muted">{model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K` : '—'}</td>
                  </tr>,
                  profile ? (
                    <tr key={`${ref}:caps`}><td /><td colSpan={3}><Chips options={CAPABILITIES.map((value) => ({ value, label: value }))} selected={profile.capabilities} onToggle={(value, on) => setCapability(ref, value, on)} /></td></tr>
                  ) : null,
                ];
              }))}
            </tbody>
          </table>
        )}
      </div>
      <AdvancedConnections draft={draft} update={update} api={api} efforts={overview.efforts} t={t} />
    </>
  );
}

function AdvancedConnections({ draft, update, api, efforts, t }) {
  const connections = draft.connections ?? [];
  const addConnection = () => update((next) => {
    let index = next.connections.length + 1;
    while (next.connections.some((connection) => connection.id === `relay-${index}`)) index += 1;
    next.connections.push({ id: `relay-${index}`, protocol: 'openai-chat', baseUrl: 'https://', credentialRef: '', models: [{ id: 'model-id', efforts: [], thinking: 'none' }], headers: {}, headerRefs: {}, requestTimeoutMs: 120000 });
  });
  const patchConnection = (index, patch) => update((next) => { Object.assign(next.connections[index], patch); });
  const patchModel = (index, modelIndex, patch) => update((next) => { Object.assign(next.connections[index].models[modelIndex], patch); });
  const suggest = async (index, modelIndex) => {
    const connection = connections[index];
    const model = connection.models[modelIndex];
    const suggestion = await api.suggestThinking(connection.protocol, model.id);
    patchModel(index, modelIndex, { thinking: suggestion.thinking, efforts: suggestion.efforts });
  };
  return (
    <div className="dma-card">
      <h3 className="dma-cardTitle">{t('models.advanced')}</h3>
      <p className="dma-cardHint">{t('models.advanced.hint')}</p>
      {connections.map((connection, index) => (
        <div key={index} className="dma-connection">
          <div className="dma-connectionHead">
            <span className="dma-mono">dma-{connection.id}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="dma-button dma-buttonDanger" onClick={() => update((next) => { next.connections.splice(index, 1); })}>{t('remove')}</button>
          </div>
          <div className="dma-grid">
            <Field label={t('models.connection.id')}><TextInput mono value={connection.id} invalid={!/^[A-Za-z0-9._-]+$/.test(connection.id)} onChange={(value) => patchConnection(index, { id: value })} /></Field>
            <Field label={t('models.connection.protocol')}><Select value={connection.protocol} options={PROTOCOLS} onChange={(value) => patchConnection(index, { protocol: value })} /></Field>
            <Field label={t('models.connection.baseUrl')}><TextInput mono value={connection.baseUrl} invalid={!/^https?:\/\/.+/.test(connection.baseUrl)} onChange={(value) => patchConnection(index, { baseUrl: value })} /></Field>
            <Field label={t('models.connection.credentialRef')} hint={t('models.connection.credentialRef.hint')}><TextInput mono value={connection.credentialRef} onChange={(value) => patchConnection(index, { credentialRef: value || undefined })} /></Field>
          </div>
          <span className="dma-fieldLabel">{t('models.connection.models')}</span>
          {connection.models.map((model, modelIndex) => (
            <div key={modelIndex}>
              <div className="dma-modelRow">
                <Field label={t('models.model.id')}><TextInput mono value={model.id} onChange={(value) => patchModel(index, modelIndex, { id: value })} /></Field>
                <Field label={t('models.model.thinking')}><Select value={model.thinking ?? 'none'} options={THINKING.map((value) => ({ value, label: t(`thinking.${value}`) }))} onChange={(value) => patchModel(index, modelIndex, { thinking: value, efforts: value === 'none' ? [] : model.efforts })} /></Field>
                <Field label={t('models.model.maxTokens')}><NumberInput value={model.maxTokens} onChange={(value) => patchModel(index, modelIndex, { maxTokens: value })} /></Field>
                <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
                  <button type="button" className="dma-button" onClick={() => suggest(index, modelIndex)}>{t('models.model.suggest')}</button>
                  <button type="button" className="dma-button dma-buttonDanger" disabled={connection.models.length === 1} onClick={() => update((next) => { next.connections[index].models.splice(modelIndex, 1); })}>{t('remove')}</button>
                </div>
              </div>
              {model.thinking && model.thinking !== 'none' ? (
                <div className="dma-effortRow">
                  <span className="dma-fieldLabel" style={{ marginRight: 6 }}>{t('models.efforts')}</span>
                  <Chips options={efforts.map((value) => ({ value, label: value }))} selected={model.efforts ?? []} onToggle={(value, on) => patchModel(index, modelIndex, { efforts: on ? efforts.filter((level) => [...(model.efforts ?? []), value].includes(level)) : (model.efforts ?? []).filter((level) => level !== value) })} />
                </div>
              ) : null}
            </div>
          ))}
          <button type="button" className="dma-link" onClick={() => update((next) => { next.connections[index].models.push({ id: '', efforts: [], thinking: 'none' }); })}>+ {t('models.connection.addModel')}</button>
        </div>
      ))}
      <div className="dma-row"><button type="button" className="dma-button" onClick={addConnection}>+ {t('models.addConnection')}</button></div>
    </div>
  );
}

function RoutingTab({ overview, draft, update, t }) {
  const models = assignableModels(overview, draft);
  const modelOptions = [{ value: undefined, label: t('inherit') }, ...models.map((model) => ({ value: model.ref, label: model.label }))];
  const effortsOf = (ref) => (ref ? models.find((model) => model.ref === ref)?.efforts ?? [] : overview.efforts);
  const effortOptions = (ref) => [{ value: undefined, label: t('modelDefault') }, ...effortsOf(ref).map((value) => ({ value, label: value }))];
  const setDefault = (kind, id, value) => update((next) => {
    next.defaults[kind] ??= {};
    if (value === undefined) delete next.defaults[kind][id];
    else next.defaults[kind][id] = value;
  });
  const warn = (ref, effort) => effort && ref && !effortsOf(ref).includes(effort);
  const renderRows = (items, modelKind, effortKind) => items.map((item) => {
    const ref = draft.defaults[modelKind]?.[item.id];
    const effort = draft.defaults[effortKind]?.[item.id];
    return (
      <div key={item.id} className="dma-routeRow">
        <div className="dma-routeHead">
          <div className="dma-routeText">
            <span className="dma-mono dma-routeId">{item.id}</span>
            <span className="dma-muted dma-routeDesc">{item.description}</span>
          </div>
          <Select className="dma-routeModel" value={ref} options={modelOptions} onChange={(value) => setDefault(modelKind, item.id, value)} ariaLabel={`${item.id} ${t('routing.model')}`} />
          <Select className="dma-routeEffort" value={effort} options={effortOptions(ref)} onChange={(value) => setDefault(effortKind, item.id, value)} ariaLabel={`${item.id} ${t('routing.effort')}`} />
        </div>
        {item.tools ? (
          <div className="dma-chips">
            <Badge tone={item.writes ? 'warn' : undefined}>{t(item.writes ? 'routing.writes' : 'routing.readonly')}</Badge>
            {item.tools.map((tool) => <Badge key={tool}>{tool}</Badge>)}
          </div>
        ) : null}
        {warn(ref, effort) ? <div className="dma-badgeWarn" style={{ fontSize: 12 }}>{t('routing.effortUnsupported')}</div> : null}
      </div>
    );
  });
  return (
    <>
      <div className="dma-card">
        <Row label={t('routing.leader')} hint={t('routing.leader.hint')}>
          <Select value={draft.defaults.leader} options={[{ value: undefined, label: t('overview.leader.session') }, ...models.map((model) => ({ value: model.ref, label: model.label }))]} onChange={(value) => update((next) => { next.defaults.leader = value; })} />
        </Row>
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('routing.roles')}</h3>
        {renderRows(overview.roles.filter((role) => role.id !== 'leader'), 'roles', 'roleEfforts')}
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('routing.categories')}</h3>
        {renderRows(overview.categories, 'categories', 'categoryEfforts')}
      </div>
    </>
  );
}

function SkillsTab({ overview, draft, update, t }) {
  const sources = draft.skillSources;
  return (
    <>
      <div className="dma-card">
        <Row label={t('skills.autoInstall')}>
          <Switch checked={Boolean(sources.autoInstall)} onChange={(value) => update((next) => { next.skillSources.autoInstall = value; })} label={t('skills.autoInstall')} />
        </Row>
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('skills.local')}</h3>
        {sources.localRoots.map((root, index) => (
          <div key={index} className="dma-row">
            <TextInput mono className="dma-grow" value={root} placeholder={t('skills.path')} onChange={(value) => update((next) => { next.skillSources.localRoots[index] = value; })} />
            <button type="button" className="dma-button dma-buttonDanger" onClick={() => update((next) => { next.skillSources.localRoots.splice(index, 1); })}>{t('remove')}</button>
          </div>
        ))}
        <div className="dma-row"><button type="button" className="dma-button" onClick={() => update((next) => { next.skillSources.localRoots.push(''); })}>+ {t('add')}</button></div>
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('skills.git')}</h3>
        {sources.gitRepos.map((repo, index) => (
          <div key={index} className="dma-row">
            <TextInput mono value={repo.url} placeholder={t('skills.url')} onChange={(value) => update((next) => { next.skillSources.gitRepos[index].url = value; })} />
            <TextInput mono value={repo.revision} placeholder="main" onChange={(value) => update((next) => { next.skillSources.gitRepos[index].revision = value || undefined; })} />
            <button type="button" className="dma-button dma-buttonDanger" onClick={() => update((next) => { next.skillSources.gitRepos.splice(index, 1); })}>{t('remove')}</button>
          </div>
        ))}
        <div className="dma-row"><button type="button" className="dma-button" onClick={() => update((next) => { next.skillSources.gitRepos.push({ url: '' }); })}>+ {t('add')}</button></div>
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('skills.discovered')}</h3>
        {overview.skills.length === 0 ? <p className="dma-empty">{t('skills.empty')}</p> : (
          <table className="dma-table">
            <tbody>
              {overview.skills.map((skill) => (
                <tr key={skill.id}>
                  <td><div className="dma-mono">{skill.id}</div><div className="dma-muted" style={{ fontSize: 12 }}>{skill.summary}</div></td>
                  <td className="dma-muted">{skill.version ?? ''}</td>
                  <td className="dma-mono dma-muted">{skill.contentHash?.slice(0, 10) ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function RunsTab({ api, t, sessionId, compact }) {
  const [runs, setRuns] = useState();
  const [error, setError] = useState();
  const [open, setOpen] = useState();
  const [selectedNode, setSelectedNode] = useState();
  const load = useCallback(async () => {
    try { setRuns(await api.runs(sessionId)); setError(undefined); } catch (failure) { setError(failure.message); }
  }, [api, sessionId]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);
  if (error) return <p className="dma-footerError">{error}</p>;
  if (!runs) return <p className="dma-muted">{t('loading')}</p>;
  if (!runs.length) return <p className="dma-empty">{t(compact ? 'chip.noRuns' : 'runs.empty')}</p>;
  return (
    <div>
      {runs.map((run) => {
        const expanded = open === run.id;
        const node = expanded ? run.nodes.find((candidate) => candidate.id === selectedNode) : undefined;
        return (
          <div key={run.id} className="dma-run">
            <button type="button" className="dma-runHead" onClick={() => { setOpen(expanded ? undefined : run.id); setSelectedNode(undefined); }}>
              <span className="dma-runTask">{run.summary ?? run.task}</span>
              <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              <span className="dma-muted" style={{ fontSize: 12 }}>{new Date(run.updatedAt).toLocaleString()}</span>
            </button>
            {run.nodes.length ? <div style={{ padding: '0 14px 10px' }}><ProgressBar nodes={run.nodes} /></div> : null}
            {expanded ? (
              <div className="dma-runBody">
                <p className="dma-cardHint" style={{ marginTop: 8 }}>{run.task}</p>
                <p className="dma-cardHint">Leader: <span className="dma-mono">{run.leader}</span>{run.mode ? ` · ${run.mode}` : ''}</p>
                {run.nodes.length ? <TaskGraphView nodes={run.nodes} t={t} selected={selectedNode} onSelect={setSelectedNode} /> : null}
                {node ? (
                  <div>
                    {node.resultText ? <><span className="dma-fieldLabel">{t('runs.result')}</span><pre className="dma-pre">{node.resultText}</pre></> : null}
                    {node.review ? <><span className="dma-fieldLabel">{t('runs.review')}</span><pre className="dma-pre">{JSON.stringify(node.review, null, 2)}</pre></> : null}
                    {node.failure ? <><span className="dma-fieldLabel">{t('runs.failure')}</span><pre className="dma-pre">{JSON.stringify(node.failure, null, 2)}</pre></> : null}
                  </div>
                ) : null}
                {!compact ? (
                  <>
                    <span className="dma-fieldLabel">{t('runs.events')}</span>
                    <ul className="dma-events">
                      {[...run.events].reverse().map((event) => (
                        <li key={event.eventId}><span className="dma-muted dma-mono">{new Date(event.recordedAt).toLocaleTimeString()}</span><span className="dma-mono">{event.type}</span><span className="dma-muted">{event.nodeId ?? ''}{event.error ? ` ${event.error.message}` : ''}</span></li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {['analyzing', 'planning', 'running'].includes(run.status) ? (
                  <div className="dma-row"><button type="button" className="dma-button dma-buttonDanger" onClick={async () => { await api.cancelRun(run.id); load(); }}>{t('runs.cancel')}</button></div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {!compact ? <button type="button" className="dma-link" onClick={load}>{t('runs.refresh')}</button> : null}
    </div>
  );
}

function PromptsTab({ api, overview, t }) {
  const [roleId, setRoleId] = useState('worker');
  const [categoryId, setCategoryId] = useState('quick');
  const [preview, setPreview] = useState();
  useEffect(() => {
    let alive = true;
    api.previewPrompts(roleId, categoryId).then((value) => { if (alive) setPreview(value); }, () => {});
    return () => { alive = false; };
  }, [api, roleId, categoryId]);
  return (
    <>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('prompts.leader')}</h3>
        {preview ? <><pre className="dma-pre">{preview.leader}</pre><p className="dma-cardHint">v{preview.version} · {preview.leaderChars} {t('prompts.chars')}</p></> : <p className="dma-muted">{t('loading')}</p>}
      </div>
      <div className="dma-card">
        <h3 className="dma-cardTitle">{t('prompts.child')}</h3>
        <div className="dma-grid">
          <Field label={t('prompts.role')}><Select value={roleId} options={overview.roles.filter((role) => role.id !== 'leader').map((role) => ({ value: role.id, label: role.id }))} onChange={(value) => setRoleId(value ?? 'worker')} /></Field>
          <Field label={t('prompts.category')}><Select value={categoryId} options={overview.categories.map((category) => ({ value: category.id, label: category.id }))} onChange={(value) => setCategoryId(value ?? 'quick')} /></Field>
        </div>
        {preview ? <><pre className="dma-pre">{preview.child}</pre><p className="dma-cardHint">{preview.childChars} {t('prompts.chars')}</p></> : null}
      </div>
    </>
  );
}
