window.__ModuleLoader__.load({
	id: "dsh-dynamic-multiagent",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// client/styles.css
var css = `/* Visual language follows dsh's settings pages: --dsw-alias-* tokens only, 12px cards, 13px body. */
.dma-page { width: 100%; max-width: 820px; color: var(--dsw-alias-label-primary); display: flex; flex-direction: column; gap: 16px; font-size: 13px; line-height: 1.5; }
.dma-header { display: flex; flex-direction: column; gap: 4px; }
.dma-title { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
.dma-subtitle { margin: 0; color: var(--dsw-alias-label-tertiary); }
.dma-card { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 12px; padding: 4px 16px; }
.dma-card + .dma-card { margin-top: 0; }
.dma-cardTitle { margin: 12px 0 4px; font-size: 14px; font-weight: 600; }
.dma-cardHint { margin: 0 0 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dma-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.dma-row + .dma-row { border-top: 1px solid var(--dsw-alias-border-l2); }
.dma-rowText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dma-rowLabel { font-weight: 500; }
.dma-rowHint { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dma-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2); overflow-x: auto; }
.dma-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dsw-alias-label-secondary); font: inherit; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
.dma-tab:hover { color: var(--dsw-alias-label-primary); }
.dma-tabActive { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-label-primary); font-weight: 500; }
.dma-switch { position: relative; flex: none; width: 36px; height: 20px; border-radius: 999px; border: 0; padding: 0; cursor: pointer; background: var(--dsw-alias-border-l3); transition: background .16s; }
.dma-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-layer-3); box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .16s; }
.dma-switchOn { background: var(--dsw-alias-brand-primary); }
.dma-switchOn::after { transform: translateX(16px); }
.dma-switch:disabled { opacity: .45; cursor: default; }
.dma-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dma-input, .dma-select { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); height: 32px; font: inherit; color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 0 10px; min-width: 0; }
.dma-select { padding-right: 6px; }
.dma-input:focus-visible, .dma-select:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dma-inputInvalid { border-color: var(--dsw-alias-label-error); }
.dma-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dma-fieldLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 500; }
.dma-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 12px; padding: 8px 0 12px; }
.dma-badge { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 500; line-height: 17px; }
.dma-badgeOk { color: var(--dsw-alias-state-success-primary); }
.dma-badgeWarn { color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-error-primary)); }
.dma-badgeErr { color: var(--dsw-alias-state-error-primary); }
.dma-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dma-chip { appearance: none; font: inherit; font-size: 12px; line-height: 18px; border-radius: 999px; padding: 2px 10px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: none; color: var(--dsw-alias-label-secondary); }
.dma-chip:hover { border-color: var(--dsw-alias-label-dimmed); color: var(--dsw-alias-label-primary); }
.dma-chipOn { border-color: var(--dsw-alias-label-primary); color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-module-platform); }
.dma-button { appearance: none; font: inherit; font-size: 13px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 14px; background: none; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dma-button:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.dma-buttonPrimary { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); border-color: transparent; }
.dma-buttonPrimary:hover:not(:disabled) { color: var(--dsw-alias-bg-layer-3); opacity: .9; }
.dma-buttonDanger:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dma-button:disabled { opacity: .4; cursor: default; }
.dma-link { appearance: none; background: none; border: 0; padding: 0; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dma-link:hover { color: var(--dsw-alias-label-primary); }
.dma-footer { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-layer-3)); border-top: 1px solid var(--dsw-alias-border-l2); }
.dma-footerNote { flex: 1; min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dma-footerError { flex: 1; min-width: 0; color: var(--dsw-alias-label-error); font-size: 12px; }
.dma-table { width: 100%; border-collapse: collapse; }
.dma-table th { text-align: left; color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 500; padding: 8px 8px 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.dma-table td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); vertical-align: middle; }
.dma-table tr:last-child td { border-bottom: 0; }
.dma-mono { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: 12px; }
.dma-muted { color: var(--dsw-alias-label-tertiary); }
.dma-empty { color: var(--dsw-alias-label-tertiary); padding: 16px 0; text-align: center; }
.dma-pre { margin: 8px 0 12px; padding: 12px; max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 8px; background: var(--dsw-alias-bg-module-platform); font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: 12px; line-height: 1.55; }
.dma-connection { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 4px 12px 8px; margin: 8px 0; }
.dma-connectionHead { display: flex; align-items: center; gap: 8px; padding: 8px 0 0; }
.dma-modelRow { display: grid; grid-template-columns: minmax(140px, 1.4fr) minmax(120px, 1fr) minmax(90px, .6fr) auto; gap: 8px; align-items: end; padding: 6px 0; }
.dma-effortRow { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0 6px; }
.dma-graph { display: flex; gap: 12px; overflow-x: auto; padding: 8px 0 12px; }
.dma-layer { display: flex; flex-direction: column; gap: 8px; min-width: 190px; }
.dma-node { border: 1px solid var(--dsw-alias-border-l2); border-left-width: 3px; border-radius: 8px; padding: 8px 10px; background: var(--dsw-alias-bg-layer-3); cursor: pointer; text-align: left; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 2px; }
.dma-node:hover { border-color: var(--dsw-alias-label-dimmed); }
.dma-nodeSelected { background: var(--dsw-alias-bg-module-platform); }
.dma-node-completed { border-left-color: var(--dsw-alias-state-success-primary); }
.dma-node-running, .dma-node-reviewing { border-left-color: var(--dsw-alias-brand-primary); }
.dma-node-failed, .dma-node-blocked { border-left-color: var(--dsw-alias-state-error-primary); }
.dma-node-cancelled { border-left-color: var(--dsw-alias-label-dimmed); }
.dma-nodeTitle { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dma-nodeMeta { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dma-run { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; margin: 8px 0; }
.dma-runHead { appearance: none; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; padding: 12px 14px; display: flex; align-items: center; gap: 10px; cursor: pointer; border-radius: 12px; }
.dma-runTask { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.dma-runBody { border-top: 1px solid var(--dsw-alias-border-l2); padding: 4px 14px 12px; }
.dma-events { max-height: 220px; overflow: auto; margin: 4px 0 0; padding: 0; list-style: none; }
.dma-events li { display: flex; gap: 8px; padding: 3px 0; font-size: 12px; }
.dma-chipWrap { position: relative; display: inline-flex; }
.dma-composerChip { appearance: none; display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 999px; padding: 2px 10px; font: inherit; font-size: 13px; font-weight: 500; line-height: 20px; cursor: pointer; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
.dma-composerChip:hover { color: var(--dsw-alias-label-primary); }
.dma-composerChipOn { color: var(--dsw-alias-brand-primary); }
.dma-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.dma-popover { position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 50; width: 320px; max-height: 420px; overflow: auto; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); box-shadow: 0 8px 24px rgba(0,0,0,.16); padding: 4px 14px 10px; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.dma-popoverRuns { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
.dma-miniRun { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l2); }
.dma-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--dsw-alias-border-l2); }
.dma-barSeg-completed { background: var(--dsw-alias-state-success-primary); }
.dma-barSeg-running, .dma-barSeg-reviewing { background: var(--dsw-alias-brand-primary); }
.dma-barSeg-failed, .dma-barSeg-blocked { background: var(--dsw-alias-state-error-primary); }
.dma-toolCard { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--dsw-alias-bg-layer-3); }
.dma-toolHead { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dma-toolName { font-weight: 500; }
.dma-spin { animation: dma-pulse 1.2s ease-in-out infinite; }
@keyframes dma-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .dma-spin { animation: none; } }
.dma-routeRow { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.dma-routeRow + .dma-routeRow { border-top: 1px solid var(--dsw-alias-border-l2); }
.dma-routeHead { display: flex; align-items: center; gap: 10px; }
.dma-routeText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dma-routeId { font-size: 13px; color: var(--dsw-alias-label-primary); }
.dma-routeDesc { font-size: 12px; }
.dma-routeModel { flex: none; width: 220px; }
.dma-routeEffort { flex: none; width: 120px; }
.dma-grow { flex: 1; }
`, tagId = "dsh-dynamic-multiagent/styles.css";
if (typeof document < "u" && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
  let tag = document.createElement("style");
  tag.dataset.plugin = "dsh-dynamic-multiagent", tag.dataset.pluginCss = tagId, tag.textContent = css, document.head.appendChild(tag);
}

// client/api.js
var CHANNEL = "/dynamic-multiagent", API_PREFIX = "dynamic-multiagent";
function createApi(connection) {
  let viaApi, callRpc = async (channel, endpoint, payload) => {
    let result = await connection.rpc.call(channel, endpoint, payload);
    if (!result || result.ok !== !0) throw new Error(result?.error?.message ?? `request ${endpoint} failed`);
    return result.value;
  }, call = async (endpoint, payload = {}) => {
    if (viaApi !== !1)
      try {
        let value = await callRpc("/api", `${API_PREFIX}/${endpoint}`, payload);
        return viaApi = !0, value;
      } catch (error) {
        if (viaApi === !0 || !/HTTP 40[45]/.test(String(error?.message))) throw error;
        viaApi = !1;
      }
    return callRpc(CHANNEL, endpoint, payload);
  };
  return {
    overview: () => call("overview"),
    saveConfig: (config, expectedRevision) => call("config/save", { config, expectedRevision }),
    setEnabled: (enabled) => call("config/enabled", { enabled }),
    session: (sessionId) => call("session/get", { sessionId }),
    setSession: (sessionId, enabled) => call("session/set", { sessionId, enabled }),
    runs: (sessionId, limit = 50) => call("runs/list", { sessionId, limit }),
    cancelRun: (runId) => call("runs/cancel", { runId }),
    previewPrompts: (roleId, categoryId) => call("prompts/preview", { roleId, categoryId }),
    suggestThinking: (protocol, model) => call("thinking/suggest", { protocol, model })
  };
}

// client/locales.js
var NS = "dynamicMultiagent", zh = {
  nav: "\u591A\u667A\u80FD\u4F53",
  title: "\u591A\u667A\u80FD\u4F53\u7F16\u6392",
  subtitle: "Leader \u6309\u9700\u628A\u4EFB\u52A1\u62C6\u7ED9\u5B50 Agent\uFF0C\u5E76\u4E3A\u6BCF\u4E2A\u8282\u70B9\u5339\u914D\u6A21\u578B\u3001\u601D\u8003\u5F3A\u5EA6\u3001\u89D2\u8272\u548C\u5DE5\u5177\u3002",
  "switch.global": "\u542F\u7528\u7F16\u6392",
  "switch.global.hint": "\u5173\u95ED\u540E\u6240\u6709\u5BF9\u8BDD\u90FD\u4E0D\u518D\u6CE8\u5165\u7F16\u6392\u63D0\u793A\u8BCD\uFF0C\u4E5F\u770B\u4E0D\u5230\u7F16\u6392\u5DE5\u5177\u3002",
  "switch.sessionDefault": "\u65B0\u5BF9\u8BDD\u9ED8\u8BA4\u5F00\u542F",
  "switch.sessionDefault.hint": "\u6BCF\u4E2A\u5BF9\u8BDD\u53EF\u5728\u8F93\u5165\u6846\u65C1\u5355\u72EC\u5F00\u5173\uFF1B\u8FD9\u91CC\u51B3\u5B9A\u6CA1\u6709\u5355\u72EC\u8BBE\u7F6E\u7684\u5BF9\u8BDD\u662F\u5426\u5F00\u542F\u3002",
  "tabs.overview": "\u6982\u89C8",
  "tabs.models": "\u6A21\u578B",
  "tabs.routing": "\u89D2\u8272\u8DEF\u7531",
  "tabs.skills": "Skill",
  "tabs.runs": "\u8FD0\u884C\u8BB0\u5F55",
  "tabs.prompts": "\u63D0\u793A\u8BCD",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  error: "\u52A0\u8F7D\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58",
  unsaved: "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
  remove: "\u5220\u9664",
  add: "\u6DFB\u52A0",
  none: "\u65E0",
  inherit: "\u7EE7\u627F Leader \u6A21\u578B",
  modelDefault: "\u6A21\u578B\u9ED8\u8BA4",
  "status.ready": "\u53EF\u7528",
  "status.missing": "\u7F3A\u5931",
  "status.off": "\u5DF2\u5173\u95ED",
  "overview.health": "\u8FD0\u884C\u73AF\u5883",
  "overview.subagent": "\u5B50 Agent \u63D0\u4F9B\u65B9",
  "overview.toolFilter": "\u5DE5\u5177\u6743\u9650\u8FC7\u6EE4",
  "overview.depthLimit": "\u59D4\u6D3E\u6DF1\u5EA6\u9650\u5236",
  "overview.llm": "\u6A21\u578B\u76EE\u5F55",
  "overview.models": "\u53EF\u5206\u914D\u6A21\u578B",
  "overview.leader": "\u9ED8\u8BA4 Leader",
  "overview.leader.session": "\u4F7F\u7528\u5BF9\u8BDD\u5F53\u524D\u6A21\u578B",
  "overview.dataDir": "\u6570\u636E\u76EE\u5F55",
  "overview.deployment": "\u90E8\u7F72\u9009\u9879\uFF08\u5728 cordis.patch.yml \u4FEE\u6539\uFF09",
  "overview.effortNote": "\u601D\u8003\u5F3A\u5EA6\uFF1Adsh 0.2.1 \u8D77\u539F\u751F\u652F\u6301\u5B50 Agent \u601D\u8003\u5F3A\u5EA6\uFF1B0.1.x \u7531\u672C\u63D2\u4EF6\u5728\u5B50 Agent \u8BF7\u6C42\u4E0A\u8865\u9F50\u3002",
  "models.host": "dsh \u5DF2\u914D\u7F6E\u7684\u6A21\u578B",
  "models.host.hint": "\u52FE\u9009\u540E Leader \u624D\u80FD\u628A\u5B83\u5206\u914D\u7ED9\u5B50 Agent\u3002\u601D\u8003\u5F3A\u5EA6\u6765\u81EA dsh \u7684\u6A21\u578B\u76EE\u5F55\u3002",
  "models.host.empty": "dsh \u8FD8\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u63D0\u4F9B\u65B9\u3002",
  "models.capabilities": "\u80FD\u529B\u6807\u7B7E",
  "models.efforts": "\u601D\u8003\u5F3A\u5EA6",
  "models.noEfforts": "\u4E0D\u652F\u6301",
  "models.context": "\u4E0A\u4E0B\u6587",
  "models.advanced": "\u9AD8\u7EA7\uFF1A\u81EA\u5B9A\u4E49\u8FDE\u63A5",
  "models.advanced.hint": "\u76F4\u63A5\u8FDE\u63A5 OpenAI \u517C\u5BB9\u6216 Anthropic \u63A5\u53E3\u7684\u4E2D\u8F6C\u7AD9\u3002\u8FDE\u63A5\u4F1A\u6CE8\u518C\u4E3A dsh \u6A21\u578B\u8DEF\u7531 dma-<id>\uFF0C\u5BC6\u94A5\u901A\u8FC7 dsh \u51ED\u636E\u5F15\u7528\u8BFB\u53D6\u3002",
  "models.addConnection": "\u6DFB\u52A0\u8FDE\u63A5",
  "models.connection.id": "\u8FDE\u63A5 ID",
  "models.connection.protocol": "\u534F\u8BAE",
  "models.connection.baseUrl": "Base URL",
  "models.connection.credentialRef": "\u51ED\u636E\u5F15\u7528",
  "models.connection.credentialRef.hint": "\u4F8B\u5982 env:MY_API_KEY \u6216 dsh \u51ED\u636E\u540D\uFF1B\u4E0D\u5728\u8FD9\u91CC\u4FDD\u5B58\u5BC6\u94A5\u3002",
  "models.connection.models": "\u6A21\u578B",
  "models.connection.addModel": "\u6DFB\u52A0\u6A21\u578B",
  "models.model.id": "\u6A21\u578B ID",
  "models.model.thinking": "\u601D\u8003\u65B9\u5F0F",
  "models.model.maxTokens": "\u8F93\u51FA\u4E0A\u9650",
  "models.model.contextWindow": "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  "models.model.suggest": "\u6309\u6A21\u578B\u63A8\u8350",
  "thinking.none": "\u4E0D\u652F\u6301",
  "thinking.openai": "reasoning_effort",
  "thinking.adaptive": "\u81EA\u9002\u5E94 effort",
  "thinking.budget": "\u601D\u8003\u9884\u7B97",
  "routing.leader": "Leader",
  "routing.leader.hint": "\u7559\u7A7A\u65F6\u4F7F\u7528\u5BF9\u8BDD\u5F53\u524D\u9009\u4E2D\u7684\u6A21\u578B\u3002",
  "routing.roles": "\u89D2\u8272\u9ED8\u8BA4",
  "routing.categories": "\u4EFB\u52A1\u7C7B\u522B\u9ED8\u8BA4",
  "routing.model": "\u6A21\u578B",
  "routing.effort": "\u601D\u8003\u5F3A\u5EA6",
  "routing.tools": "\u53EF\u7528\u5DE5\u5177",
  "routing.writes": "\u53EF\u5199",
  "routing.readonly": "\u53EA\u8BFB",
  "routing.effortUnsupported": "\u6240\u9009\u6A21\u578B\u4E0D\u652F\u6301\u8BE5\u5F3A\u5EA6\uFF0C\u8FD0\u884C\u65F6\u5C06\u4F7F\u7528\u6A21\u578B\u9ED8\u8BA4",
  "skills.local": "\u672C\u5730\u76EE\u5F55",
  "skills.git": "Git \u4ED3\u5E93",
  "skills.autoInstall": "\u5141\u8BB8 Leader \u81EA\u52A8\u5B89\u88C5 Skill",
  "skills.discovered": "\u5DF2\u53D1\u73B0\u7684 Skill",
  "skills.empty": "\u8FD8\u6CA1\u6709\u53D1\u73B0 Skill\u3002",
  "skills.path": "\u76EE\u5F55\u8DEF\u5F84",
  "skills.url": "\u4ED3\u5E93\u5730\u5740",
  "runs.empty": "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002",
  "runs.refresh": "\u5237\u65B0",
  "runs.cancel": "\u53D6\u6D88\u8FD0\u884C",
  "runs.nodes": "\u4EFB\u52A1\u56FE",
  "runs.events": "\u4E8B\u4EF6",
  "runs.result": "\u7ED3\u679C",
  "runs.review": "\u5BA1\u67E5",
  "runs.failure": "\u5931\u8D25",
  "runs.attempts": "\u6B21\u5C1D\u8BD5",
  "prompts.leader": "Leader \u63D0\u793A\u8BCD\uFF08\u7F16\u6392\u5F00\u542F\u7684\u5BF9\u8BDD\u6BCF\u8F6E\u6CE8\u5165\uFF09",
  "prompts.child": "\u5B50 Agent \u63D0\u793A\u8BCD\uFF08\u793A\u4F8B\u8282\u70B9\uFF09",
  "prompts.role": "\u89D2\u8272",
  "prompts.category": "\u7C7B\u522B",
  "prompts.chars": "\u5B57\u7B26",
  "chip.label": "\u591A\u667A\u80FD\u4F53",
  "chip.on": "\u591A\u667A\u80FD\u4F53\uFF1A\u5F00",
  "chip.off": "\u591A\u667A\u80FD\u4F53\uFF1A\u5173",
  "chip.globalOff": "\u7F16\u6392\u5DF2\u5728\u8BBE\u7F6E\u4E2D\u5168\u5C40\u5173\u95ED",
  "chip.default": "\u8DDF\u968F\u9ED8\u8BA4",
  "chip.thisSession": "\u672C\u5BF9\u8BDD",
  "chip.runs": "\u672C\u5BF9\u8BDD\u7684\u8FD0\u884C",
  "chip.noRuns": "\u672C\u5BF9\u8BDD\u8FD8\u6CA1\u6709\u8FD0\u884C",
  "chip.open": "\u6253\u5F00\u8BBE\u7F6E",
  "node.pending": "\u7B49\u5F85",
  "node.ready": "\u5C31\u7EEA",
  "node.running": "\u8FD0\u884C\u4E2D",
  "node.reviewing": "\u5BA1\u67E5\u4E2D",
  "node.completed": "\u5B8C\u6210",
  "node.failed": "\u5931\u8D25",
  "node.blocked": "\u963B\u585E",
  "node.cancelled": "\u5DF2\u53D6\u6D88",
  conflict: "\u914D\u7F6E\u5DF2\u5728\u522B\u5904\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5"
}, en = {
  nav: "Multi-agent",
  title: "Multi-agent orchestration",
  subtitle: "The Leader delegates parts of a task to child agents and routes each node to a model, reasoning effort, role, and tool set.",
  "switch.global": "Enable orchestration",
  "switch.global.hint": "When off, no conversation receives the orchestration prompt or tools.",
  "switch.sessionDefault": "On for new conversations",
  "switch.sessionDefault.hint": "Each conversation has its own switch next to the composer; this decides conversations without one.",
  "tabs.overview": "Overview",
  "tabs.models": "Models",
  "tabs.routing": "Routing",
  "tabs.skills": "Skills",
  "tabs.runs": "Runs",
  "tabs.prompts": "Prompts",
  loading: "Loading\u2026",
  error: "Failed to load",
  retry: "Retry",
  save: "Save",
  discard: "Discard",
  saving: "Saving\u2026",
  saved: "Saved",
  unsaved: "Unsaved changes",
  remove: "Remove",
  add: "Add",
  none: "None",
  inherit: "Inherit Leader model",
  modelDefault: "Model default",
  "status.ready": "Ready",
  "status.missing": "Missing",
  "status.off": "Off",
  "overview.health": "Environment",
  "overview.subagent": "Subagent provider",
  "overview.toolFilter": "Tool filtering",
  "overview.depthLimit": "Delegation depth limit",
  "overview.llm": "Model directory",
  "overview.models": "Assignable models",
  "overview.leader": "Default Leader",
  "overview.leader.session": "Conversation model",
  "overview.dataDir": "Data directory",
  "overview.deployment": "Deployment options (edit in cordis.patch.yml)",
  "overview.effortNote": "Reasoning effort: dsh 0.2.1+ applies child efforts natively; on 0.1.x this plugin applies them to child requests.",
  "models.host": "Models configured in dsh",
  "models.host.hint": "Check a model to let the Leader assign it to children. Reasoning efforts come from the dsh model catalog.",
  "models.host.empty": "dsh has no model providers yet.",
  "models.capabilities": "Capabilities",
  "models.efforts": "Reasoning effort",
  "models.noEfforts": "Not supported",
  "models.context": "Context",
  "models.advanced": "Advanced: custom connections",
  "models.advanced.hint": "Connect an OpenAI-compatible or Anthropic endpoint directly. Each connection becomes the dsh route dma-<id>; keys are read through dsh credential references.",
  "models.addConnection": "Add connection",
  "models.connection.id": "Connection id",
  "models.connection.protocol": "Protocol",
  "models.connection.baseUrl": "Base URL",
  "models.connection.credentialRef": "Credential reference",
  "models.connection.credentialRef.hint": "For example env:MY_API_KEY or a dsh credential name; secrets are never stored here.",
  "models.connection.models": "Models",
  "models.connection.addModel": "Add model",
  "models.model.id": "Model id",
  "models.model.thinking": "Thinking",
  "models.model.maxTokens": "Output cap",
  "models.model.contextWindow": "Context window",
  "models.model.suggest": "Suggest from id",
  "thinking.none": "Not supported",
  "thinking.openai": "reasoning_effort",
  "thinking.adaptive": "Adaptive effort",
  "thinking.budget": "Thinking budget",
  "routing.leader": "Leader",
  "routing.leader.hint": "Empty uses the model selected in the conversation.",
  "routing.roles": "Role defaults",
  "routing.categories": "Category defaults",
  "routing.model": "Model",
  "routing.effort": "Effort",
  "routing.tools": "Tools",
  "routing.writes": "Writes",
  "routing.readonly": "Read-only",
  "routing.effortUnsupported": "The selected model does not offer this effort; its default will apply",
  "skills.local": "Local directories",
  "skills.git": "Git repositories",
  "skills.autoInstall": "Let the Leader install skills automatically",
  "skills.discovered": "Discovered skills",
  "skills.empty": "No skills discovered yet.",
  "skills.path": "Directory path",
  "skills.url": "Repository URL",
  "runs.empty": "No runs yet.",
  "runs.refresh": "Refresh",
  "runs.cancel": "Cancel run",
  "runs.nodes": "Task graph",
  "runs.events": "Events",
  "runs.result": "Result",
  "runs.review": "Review",
  "runs.failure": "Failure",
  "runs.attempts": "attempts",
  "prompts.leader": "Leader prompt (added to every turn of conversations with orchestration on)",
  "prompts.child": "Child prompt (example node)",
  "prompts.role": "Role",
  "prompts.category": "Category",
  "prompts.chars": "characters",
  "chip.label": "Multi-agent",
  "chip.on": "Multi-agent: on",
  "chip.off": "Multi-agent: off",
  "chip.globalOff": "Orchestration is switched off globally in settings",
  "chip.default": "Follow default",
  "chip.thisSession": "This conversation",
  "chip.runs": "Runs in this conversation",
  "chip.noRuns": "No runs in this conversation yet",
  "chip.open": "Open settings",
  "node.pending": "Pending",
  "node.ready": "Ready",
  "node.running": "Running",
  "node.reviewing": "Reviewing",
  "node.completed": "Done",
  "node.failed": "Failed",
  "node.blocked": "Blocked",
  "node.cancelled": "Cancelled",
  conflict: "The configuration changed elsewhere; refresh and try again"
};

// client/SettingsPage.jsx
var import_react2 = require("react");

// client/components.jsx
var import_react = require("react"), import_jsx_runtime = require("react/jsx-runtime");
function Switch({ checked, onChange, disabled, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "aria-label": label,
      disabled,
      className: `dma-switch${checked ? " dma-switchOn" : ""}`,
      onClick: () => onChange(!checked)
    }
  );
}
function Badge({ tone, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dma-badge${tone === "ok" ? " dma-badgeOk" : tone === "warn" ? " dma-badgeWarn" : tone === "err" ? " dma-badgeErr" : ""}`, children });
}
function Field({ label, hint, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dma-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dma-fieldLabel", children: label }),
    children,
    hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dma-rowHint", children: hint }) : null
  ] });
}
function Row({ label, hint, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dma-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dma-rowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dma-rowLabel", children: label }),
      hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dma-rowHint", children: hint }) : null
    ] }),
    children
  ] });
}
function Select({ value, onChange, options, className, ariaLabel }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: `dma-select ${className ?? ""}`, value: value ?? "", "aria-label": ariaLabel, onChange: (event) => onChange(event.target.value === "" ? void 0 : event.target.value), children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: option.value ?? "", children: option.label }, option.value ?? "")) });
}
function TextInput({ value, onChange, placeholder, invalid, className, mono }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      className: `dma-input${invalid ? " dma-inputInvalid" : ""}${mono ? " dma-mono" : ""} ${className ?? ""}`,
      value: value ?? "",
      placeholder,
      spellCheck: !1,
      onChange: (event) => onChange(event.target.value)
    }
  );
}
function NumberInput({ value, onChange, placeholder }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      className: "dma-input",
      inputMode: "numeric",
      value: value ?? "",
      placeholder,
      onChange: (event) => {
        let digits = event.target.value.replace(/[^0-9]/g, "");
        onChange(digits === "" ? void 0 : Number(digits));
      }
    }
  );
}
function Chips({ options, selected, onToggle }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dma-chips", children: options.map((option) => {
    let on = selected.includes(option.value);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `dma-chip${on ? " dma-chipOn" : ""}`, "aria-pressed": on, onClick: () => onToggle(option.value, !on), children: option.label }, option.value);
  }) });
}
function useDismiss(open, onClose) {
  let ref = (0, import_react.useRef)(null);
  return (0, import_react.useEffect)(() => {
    if (!open) return;
    let onPointer = (event) => {
      ref.current && !ref.current.contains(event.target) && onClose();
    }, onKey = (event) => {
      event.key === "Escape" && onClose();
    };
    return document.addEventListener("pointerdown", onPointer), document.addEventListener("keydown", onKey), () => {
      document.removeEventListener("pointerdown", onPointer), document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]), ref;
}
function layerNodes(nodes) {
  let byId = new Map(nodes.map((node) => [node.id, node])), depth = /* @__PURE__ */ new Map(), visit = (node, seen = /* @__PURE__ */ new Set()) => {
    if (depth.has(node.id)) return depth.get(node.id);
    if (seen.has(node.id)) return 0;
    seen.add(node.id);
    let value = (node.dependencies ?? []).reduce((max, id) => byId.has(id) ? Math.max(max, visit(byId.get(id), seen) + 1) : max, 0);
    return depth.set(node.id, value), value;
  };
  for (let node of nodes) visit(node);
  let layers = [];
  for (let node of nodes) (layers[depth.get(node.id)] ??= []).push(node);
  return layers.filter(Boolean);
}
function TaskGraphView({ nodes, t, selected, onSelect }) {
  let layers = (0, import_react.useMemo)(() => layerNodes(nodes), [nodes]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dma-graph", children: layers.map((layer, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dma-layer", children: layer.map((node) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: `dma-node dma-node-${node.status}${selected === node.id ? " dma-nodeSelected" : ""}`,
      onClick: () => onSelect?.(selected === node.id ? void 0 : node.id),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dma-nodeTitle", children: node.title ?? node.id }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dma-nodeMeta", children: [
          node.roleId,
          " \xB7 ",
          t(`node.${node.status}`),
          node.attempts > 1 ? ` \xB7 ${node.attempts} ${t("runs.attempts")}` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dma-nodeMeta dma-mono", children: [
          node.model ?? t("inherit"),
          node.effort ? ` \xB7 ${node.effort}` : ""
        ] })
      ]
    },
    node.id
  )) }, index)) });
}
function ProgressBar({ nodes }) {
  let total = nodes.length || 1, counts = {};
  for (let node of nodes) counts[node.status] = (counts[node.status] ?? 0) + 1;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dma-bar", children: ["completed", "running", "reviewing", "failed", "blocked"].map((status) => counts[status] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dma-barSeg-${status}`, style: { width: `${counts[status] / total * 100}%` } }, status) : null) });
}
function statusTone(status) {
  if (status === "reviewing" || status === "completed") return "ok";
  if (!(status === "running" || status === "planning" || status === "analyzing"))
    return status === "blocked" || status === "failed" ? "err" : "warn";
}

// client/SettingsPage.jsx
var import_jsx_runtime2 = require("react/jsx-runtime"), TABS = ["overview", "models", "routing", "skills", "runs", "prompts"], CAPABILITIES = ["reasoning", "coding", "writing", "long-context", "tool-calling", "multimodal", "low-latency"], PROTOCOLS = [{ value: "openai-chat", label: "OpenAI Chat Completions" }, { value: "anthropic-messages", label: "Anthropic Messages" }], THINKING = ["none", "openai", "adaptive", "budget"], clone = (value) => JSON.parse(JSON.stringify(value));
function SettingsPage({ api, t }) {
  let [state, setState] = (0, import_react2.useState)({ status: "loading" }), [draft, setDraft] = (0, import_react2.useState)(), [tab, setTab] = (0, import_react2.useState)("overview"), [saving, setSaving] = (0, import_react2.useState)(!1), [notice, setNotice] = (0, import_react2.useState)(), load = (0, import_react2.useCallback)(async () => {
    setState((current) => current.status === "ready" ? current : { status: "loading" });
    try {
      let overview2 = await api.overview();
      setState({ status: "ready", overview: overview2 }), setDraft(clone(overview2.config));
    } catch (error) {
      setState({ status: "error", message: error.message });
    }
  }, [api]);
  (0, import_react2.useEffect)(() => {
    load();
  }, [load]);
  let overview = state.overview, dirty = (0, import_react2.useMemo)(() => overview && draft && JSON.stringify(stripMeta(draft)) !== JSON.stringify(stripMeta(overview.config)), [overview, draft]);
  if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-page", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-muted", children: t("loading") }) });
  if (state.status === "error")
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-page", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dma-footerError", children: [
        t("error"),
        ": ",
        state.message
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button", onClick: load, children: t("retry") }) })
    ] });
  let update = (mutate) => setDraft((current) => {
    let next = clone(current);
    return mutate(next), next;
  }), save = async () => {
    setSaving(!0), setNotice(void 0);
    try {
      let saved = await api.saveConfig(draft, overview.config.revision);
      setState({ status: "ready", overview: { ...overview, config: saved } }), setDraft(clone(saved)), setNotice({ kind: "ok", text: t("saved") }), load();
    } catch (error) {
      setNotice({ kind: "error", text: /config-conflict/.test(error.message) ? t("conflict") : error.message });
    } finally {
      setSaving(!1);
    }
  }, toggleGlobal = async (enabled) => {
    try {
      let saved = await api.setEnabled(enabled);
      setState({ status: "ready", overview: { ...overview, config: saved } }), setDraft((current) => ({ ...current, enabled: saved.enabled, revision: saved.revision }));
    } catch (error) {
      setNotice({ kind: "error", text: error.message });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "dma-title", children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-subtitle", children: t("subtitle") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("switch.global"), hint: t("switch.global.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Switch, { checked: overview.config.enabled !== !1, onChange: toggleGlobal, label: t("switch.global") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("switch.sessionDefault"), hint: t("switch.sessionDefault.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Switch, { checked: draft.sessionDefault !== !1, onChange: (value) => update((next) => {
        next.sessionDefault = value;
      }), label: t("switch.sessionDefault") }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-tabs", role: "tablist", children: TABS.map((id) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", role: "tab", "aria-selected": tab === id, className: `dma-tab${tab === id ? " dma-tabActive" : ""}`, onClick: () => setTab(id), children: t(`tabs.${id}`) }, id)) }),
    tab === "overview" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OverviewTab, { overview, draft, t }),
    tab === "models" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelsTab, { overview, draft, update, api, t }),
    tab === "routing" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RoutingTab, { overview, draft, update, t }),
    tab === "skills" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SkillsTab, { overview, draft, update, t }),
    tab === "runs" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RunsTab, { api, t }),
    tab === "prompts" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PromptsTab, { api, overview, t }),
    (dirty || notice) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-footer", children: [
      notice?.kind === "error" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-footerError", children: notice.text }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-footerNote", children: dirty ? t("unsaved") : notice?.text }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button", disabled: !dirty || saving, onClick: () => {
        setDraft(clone(overview.config)), setNotice(void 0);
      }, children: t("discard") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonPrimary", disabled: !dirty || saving, onClick: save, children: t(saving ? "saving" : "save") })
    ] })
  ] });
}
function stripMeta(config) {
  let { revision, updatedAt, enabled, ...rest } = config;
  return rest;
}
function assignableModels(overview, draft) {
  let models = [];
  for (let profile of draft.modelProfiles ?? []) {
    let [provider, ...rest] = profile.ref.split(":"), id = rest.join(":");
    if (draft.connections.find((candidate) => candidate.id === provider)) continue;
    let host = overview.hostModels.find((entry) => entry.id === provider)?.models.find((model) => model.id === id);
    models.push({ ref: profile.ref, label: host?.name ? `${host.name} (${provider})` : profile.ref, efforts: host?.efforts ?? [] });
  }
  for (let connection of draft.connections ?? [])
    for (let model of connection.models ?? []) models.push({ ref: `${connection.id}:${model.id}`, label: `${model.label ?? model.id} (${connection.id})`, efforts: model.efforts ?? [] });
  return models;
}
function OverviewTab({ overview, draft, t }) {
  let { host, deployment } = overview, models = assignableModels(overview, draft);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("overview.health") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.subagent"), hint: host.subagentProvider, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: host.subagentAvailable ? "ok" : "err", children: t(host.subagentAvailable ? "status.ready" : "status.missing") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.toolFilter"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: host.toolFilter ? "ok" : "warn", children: t(host.toolFilter ? "status.ready" : "status.missing") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.depthLimit"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: host.depthLimit ? "ok" : "warn", children: t(host.depthLimit ? "status.ready" : "status.missing") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.llm"), hint: overview.hostModels.map((provider) => provider.id).join(", ") || t("none"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: host.llm ? "ok" : "warn", children: t(host.llm ? "status.ready" : "status.missing") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.models"), hint: models.map((model) => model.ref).join(", ") || t("inherit"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { children: models.length }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.leader"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-mono", children: draft.defaults.leader ?? t("overview.leader.session") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("overview.dataDir"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-mono dma-muted", children: deployment.dataDir }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-cardHint", children: t("overview.effortNote") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dma-cardHint", children: [
      t("overview.deployment"),
      ": ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dma-mono", children: [
        "subagentProvider=",
        deployment.subagentProvider,
        " exposeTools=",
        String(deployment.exposeTools)
      ] })
    ] })
  ] });
}
function ModelsTab({ overview, draft, update, api, t }) {
  let profiles = new Map((draft.modelProfiles ?? []).map((profile) => [profile.ref, profile])), toggleHost = (ref, on) => update((next) => {
    next.modelProfiles = (next.modelProfiles ?? []).filter((profile) => profile.ref !== ref), on && next.modelProfiles.push({ ref, capabilities: [], evidence: [] });
  }), setCapability = (ref, capability, on) => update((next) => {
    let profile = next.modelProfiles.find((candidate) => candidate.ref === ref);
    profile && (profile.capabilities = on ? [.../* @__PURE__ */ new Set([...profile.capabilities, capability])] : profile.capabilities.filter((value) => value !== capability));
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("models.host") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-cardHint", children: t("models.host.hint") }),
      overview.hostModels.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-empty", children: t("models.host.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { className: "dma-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: { width: 40 } }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: t("routing.model") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: t("models.efforts") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: t("models.context") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: overview.hostModels.flatMap((provider) => provider.models.map((model) => {
          let ref = `${provider.id}:${model.id}`, profile = profiles.get(ref);
          return [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Switch, { checked: !!profile, onChange: (on) => toggleHost(ref, on), label: ref }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("td", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: model.name }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-mono dma-muted", children: ref })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { children: model.efforts.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-chips", children: model.efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { children: effort }, effort)) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-muted", children: t("models.noEfforts") }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dma-muted", children: model.contextWindow ? `${Math.round(model.contextWindow / 1e3)}K` : "\u2014" })
            ] }, ref),
            profile ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", {}),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { colSpan: 3, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chips, { options: CAPABILITIES.map((value) => ({ value, label: value })), selected: profile.capabilities, onToggle: (value, on) => setCapability(ref, value, on) }) })
            ] }, `${ref}:caps`) : null
          ];
        })) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AdvancedConnections, { draft, update, api, efforts: overview.efforts, t })
  ] });
}
function AdvancedConnections({ draft, update, api, efforts, t }) {
  let connections = draft.connections ?? [], addConnection = () => update((next) => {
    let index = next.connections.length + 1;
    for (; next.connections.some((connection) => connection.id === `relay-${index}`); ) index += 1;
    next.connections.push({ id: `relay-${index}`, protocol: "openai-chat", baseUrl: "https://", credentialRef: "", models: [{ id: "model-id", efforts: [], thinking: "none" }], headers: {}, headerRefs: {}, requestTimeoutMs: 12e4 });
  }), patchConnection = (index, patch) => update((next) => {
    Object.assign(next.connections[index], patch);
  }), patchModel = (index, modelIndex, patch) => update((next) => {
    Object.assign(next.connections[index].models[modelIndex], patch);
  }), suggest = async (index, modelIndex) => {
    let connection = connections[index], model = connection.models[modelIndex], suggestion = await api.suggestThinking(connection.protocol, model.id);
    patchModel(index, modelIndex, { thinking: suggestion.thinking, efforts: suggestion.efforts });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("models.advanced") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-cardHint", children: t("models.advanced.hint") }),
    connections.map((connection, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-connection", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-connectionHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dma-mono", children: [
          "dma-",
          connection.id
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1 } }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonDanger", onClick: () => update((next) => {
          next.connections.splice(index, 1);
        }), children: t("remove") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.connection.id"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: connection.id, invalid: !/^[A-Za-z0-9._-]+$/.test(connection.id), onChange: (value) => patchConnection(index, { id: value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.connection.protocol"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: connection.protocol, options: PROTOCOLS, onChange: (value) => patchConnection(index, { protocol: value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.connection.baseUrl"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: connection.baseUrl, invalid: !/^https?:\/\/.+/.test(connection.baseUrl), onChange: (value) => patchConnection(index, { baseUrl: value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.connection.credentialRef"), hint: t("models.connection.credentialRef.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: connection.credentialRef, onChange: (value) => patchConnection(index, { credentialRef: value || void 0 }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", children: t("models.connection.models") }),
      connection.models.map((model, modelIndex) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-modelRow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.model.id"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: model.id, onChange: (value) => patchModel(index, modelIndex, { id: value }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.model.thinking"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: model.thinking ?? "none", options: THINKING.map((value) => ({ value, label: t(`thinking.${value}`) })), onChange: (value) => patchModel(index, modelIndex, { thinking: value, efforts: value === "none" ? [] : model.efforts }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("models.model.maxTokens"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NumberInput, { value: model.maxTokens, onChange: (value) => patchModel(index, modelIndex, { maxTokens: value }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, paddingBottom: 2 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button", onClick: () => suggest(index, modelIndex), children: t("models.model.suggest") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonDanger", disabled: connection.models.length === 1, onClick: () => update((next) => {
              next.connections[index].models.splice(modelIndex, 1);
            }), children: t("remove") })
          ] })
        ] }),
        model.thinking && model.thinking !== "none" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-effortRow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", style: { marginRight: 6 }, children: t("models.efforts") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chips, { options: efforts.map((value) => ({ value, label: value })), selected: model.efforts ?? [], onToggle: (value, on) => patchModel(index, modelIndex, { efforts: on ? efforts.filter((level) => [...model.efforts ?? [], value].includes(level)) : (model.efforts ?? []).filter((level) => level !== value) }) })
        ] }) : null
      ] }, modelIndex)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dma-link", onClick: () => update((next) => {
        next.connections[index].models.push({ id: "", efforts: [], thinking: "none" });
      }), children: [
        "+ ",
        t("models.connection.addModel")
      ] })
    ] }, index)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dma-button", onClick: addConnection, children: [
      "+ ",
      t("models.addConnection")
    ] }) })
  ] });
}
function RoutingTab({ overview, draft, update, t }) {
  let models = assignableModels(overview, draft), modelOptions = [{ value: void 0, label: t("inherit") }, ...models.map((model) => ({ value: model.ref, label: model.label }))], effortsOf = (ref) => ref ? models.find((model) => model.ref === ref)?.efforts ?? [] : overview.efforts, effortOptions = (ref) => [{ value: void 0, label: t("modelDefault") }, ...effortsOf(ref).map((value) => ({ value, label: value }))], setDefault = (kind, id, value) => update((next) => {
    next.defaults[kind] ??= {}, value === void 0 ? delete next.defaults[kind][id] : next.defaults[kind][id] = value;
  }), warn = (ref, effort) => effort && ref && !effortsOf(ref).includes(effort), renderRows = (items, modelKind, effortKind) => items.map((item) => {
    let ref = draft.defaults[modelKind]?.[item.id], effort = draft.defaults[effortKind]?.[item.id];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-routeRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-routeHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-routeText", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-mono dma-routeId", children: item.id }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-muted dma-routeDesc", children: item.description })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { className: "dma-routeModel", value: ref, options: modelOptions, onChange: (value) => setDefault(modelKind, item.id, value), ariaLabel: `${item.id} ${t("routing.model")}` }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { className: "dma-routeEffort", value: effort, options: effortOptions(ref), onChange: (value) => setDefault(effortKind, item.id, value), ariaLabel: `${item.id} ${t("routing.effort")}` })
      ] }),
      item.tools ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-chips", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: item.writes ? "warn" : void 0, children: t(item.writes ? "routing.writes" : "routing.readonly") }),
        item.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { children: tool }, tool))
      ] }) : null,
      warn(ref, effort) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-badgeWarn", style: { fontSize: 12 }, children: t("routing.effortUnsupported") }) : null
    ] }, item.id);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-card", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("routing.leader"), hint: t("routing.leader.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: draft.defaults.leader, options: [{ value: void 0, label: t("overview.leader.session") }, ...models.map((model) => ({ value: model.ref, label: model.label }))], onChange: (value) => update((next) => {
      next.defaults.leader = value;
    }) }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("routing.roles") }),
      renderRows(overview.roles.filter((role) => role.id !== "leader"), "roles", "roleEfforts")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("routing.categories") }),
      renderRows(overview.categories, "categories", "categoryEfforts")
    ] })
  ] });
}
function SkillsTab({ overview, draft, update, t }) {
  let sources = draft.skillSources;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-card", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row, { label: t("skills.autoInstall"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Switch, { checked: !!sources.autoInstall, onChange: (value) => update((next) => {
      next.skillSources.autoInstall = value;
    }), label: t("skills.autoInstall") }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("skills.local") }),
      sources.localRoots.map((root, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, className: "dma-grow", value: root, placeholder: t("skills.path"), onChange: (value) => update((next) => {
          next.skillSources.localRoots[index] = value;
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonDanger", onClick: () => update((next) => {
          next.skillSources.localRoots.splice(index, 1);
        }), children: t("remove") })
      ] }, index)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dma-button", onClick: () => update((next) => {
        next.skillSources.localRoots.push("");
      }), children: [
        "+ ",
        t("add")
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("skills.git") }),
      sources.gitRepos.map((repo, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: repo.url, placeholder: t("skills.url"), onChange: (value) => update((next) => {
          next.skillSources.gitRepos[index].url = value;
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TextInput, { mono: !0, value: repo.revision, placeholder: "main", onChange: (value) => update((next) => {
          next.skillSources.gitRepos[index].revision = value || void 0;
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonDanger", onClick: () => update((next) => {
          next.skillSources.gitRepos.splice(index, 1);
        }), children: t("remove") })
      ] }, index)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dma-button", onClick: () => update((next) => {
        next.skillSources.gitRepos.push({ url: "" });
      }), children: [
        "+ ",
        t("add")
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("skills.discovered") }),
      overview.skills.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-empty", children: t("skills.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("table", { className: "dma-table", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: overview.skills.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("td", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-mono", children: skill.id }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-muted", style: { fontSize: 12 }, children: skill.summary })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dma-muted", children: skill.version ?? "" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dma-mono dma-muted", children: skill.contentHash?.slice(0, 10) ?? "" })
      ] }, skill.id)) }) })
    ] })
  ] });
}
function RunsTab({ api, t, sessionId, compact }) {
  let [runs, setRuns] = (0, import_react2.useState)(), [error, setError] = (0, import_react2.useState)(), [open, setOpen] = (0, import_react2.useState)(), [selectedNode, setSelectedNode] = (0, import_react2.useState)(), load = (0, import_react2.useCallback)(async () => {
    try {
      setRuns(await api.runs(sessionId)), setError(void 0);
    } catch (failure) {
      setError(failure.message);
    }
  }, [api, sessionId]);
  return (0, import_react2.useEffect)(() => {
    load();
    let timer = setInterval(load, 4e3);
    return () => clearInterval(timer);
  }, [load]), error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-footerError", children: error }) : runs ? runs.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    runs.map((run) => {
      let expanded = open === run.id, node = expanded ? run.nodes.find((candidate) => candidate.id === selectedNode) : void 0;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-run", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dma-runHead", onClick: () => {
          setOpen(expanded ? void 0 : run.id), setSelectedNode(void 0);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-runTask", children: run.summary ?? run.task }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: statusTone(run.status), children: run.status }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-muted", style: { fontSize: 12 }, children: new Date(run.updatedAt).toLocaleString() })
        ] }),
        run.nodes.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { padding: "0 14px 10px" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ProgressBar, { nodes: run.nodes }) }) : null,
        expanded ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-runBody", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-cardHint", style: { marginTop: 8 }, children: run.task }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dma-cardHint", children: [
            "Leader: ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-mono", children: run.leader }),
            run.mode ? ` \xB7 ${run.mode}` : ""
          ] }),
          run.nodes.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TaskGraphView, { nodes: run.nodes, t, selected: selectedNode, onSelect: setSelectedNode }) : null,
          node ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            node.resultText ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", children: t("runs.result") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dma-pre", children: node.resultText })
            ] }) : null,
            node.review ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", children: t("runs.review") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dma-pre", children: JSON.stringify(node.review, null, 2) })
            ] }) : null,
            node.failure ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", children: t("runs.failure") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dma-pre", children: JSON.stringify(node.failure, null, 2) })
            ] }) : null
          ] }) : null,
          compact ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-fieldLabel", children: t("runs.events") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dma-events", children: [...run.events].reverse().map((event) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-muted dma-mono", children: new Date(event.recordedAt).toLocaleTimeString() }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dma-mono", children: event.type }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dma-muted", children: [
                event.nodeId ?? "",
                event.error ? ` ${event.error.message}` : ""
              ] })
            ] }, event.eventId)) })
          ] }),
          ["analyzing", "planning", "running"].includes(run.status) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dma-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-button dma-buttonDanger", onClick: async () => {
            await api.cancelRun(run.id), load();
          }, children: t("runs.cancel") }) }) : null
        ] }) : null
      ] }, run.id);
    }),
    compact ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dma-link", onClick: load, children: t("runs.refresh") })
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-empty", children: t(compact ? "chip.noRuns" : "runs.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-muted", children: t("loading") });
}
function PromptsTab({ api, overview, t }) {
  let [roleId, setRoleId] = (0, import_react2.useState)("worker"), [categoryId, setCategoryId] = (0, import_react2.useState)("quick"), [preview, setPreview] = (0, import_react2.useState)();
  return (0, import_react2.useEffect)(() => {
    let alive = !0;
    return api.previewPrompts(roleId, categoryId).then((value) => {
      alive && setPreview(value);
    }, () => {
    }), () => {
      alive = !1;
    };
  }, [api, roleId, categoryId]), /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("prompts.leader") }),
      preview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dma-pre", children: preview.leader }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dma-cardHint", children: [
          "v",
          preview.version,
          " \xB7 ",
          preview.leaderChars,
          " ",
          t("prompts.chars")
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dma-muted", children: t("loading") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dma-cardTitle", children: t("prompts.child") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dma-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("prompts.role"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: roleId, options: overview.roles.filter((role) => role.id !== "leader").map((role) => ({ value: role.id, label: role.id })), onChange: (value) => setRoleId(value ?? "worker") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: t("prompts.category"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: categoryId, options: overview.categories.map((category) => ({ value: category.id, label: category.id })), onChange: (value) => setCategoryId(value ?? "quick") }) })
      ] }),
      preview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dma-pre", children: preview.child }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dma-cardHint", children: [
          preview.childChars,
          " ",
          t("prompts.chars")
        ] })
      ] }) : null
    ] })
  ] });
}

// client/ComposerChip.jsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function ComposerChip({ api, t, sessionId, session }) {
  let [state, setState] = (0, import_react3.useState)(), [open, setOpen] = (0, import_react3.useState)(!1), [error, setError] = (0, import_react3.useState)(), close = (0, import_react3.useCallback)(() => setOpen(!1), []), ref = useDismiss(open, close), refresh = (0, import_react3.useCallback)(async () => {
    if (sessionId)
      try {
        setState(await api.session(sessionId)), setError(void 0);
      } catch (failure) {
        setError(failure.message);
      }
  }, [api, sessionId]);
  if ((0, import_react3.useEffect)(() => {
    refresh();
  }, [refresh, open]), !sessionId || session?.subagent || !state) return null;
  let on = state.enabled, set = async (value) => {
    try {
      setState(await api.setSession(sessionId, value));
    } catch (failure) {
      setError(failure.message);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dma-chipWrap", ref, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        className: `dma-composerChip${on ? " dma-composerChipOn" : ""}`,
        "aria-expanded": open,
        "aria-label": t(on ? "chip.on" : "chip.off"),
        title: state.globalEnabled ? t(on ? "chip.on" : "chip.off") : t("chip.globalOff"),
        onClick: () => setOpen(!open),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dma-dot", "aria-hidden": !0 }),
          t("chip.label")
        ]
      }
    ),
    open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dma-popover", role: "dialog", "aria-label": t("chip.label"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("chip.thisSession"), hint: state.globalEnabled ? state.override === null ? t("chip.default") : void 0 : t("chip.globalOff"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Switch, { checked: on, disabled: !state.globalEnabled, onChange: set, label: t("chip.thisSession") }) }),
      state.override !== null && state.globalEnabled ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dma-link", onClick: () => set(null), children: t("chip.default") }) : null,
      error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dma-footerError", children: error }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dma-popoverRuns", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dma-fieldLabel", children: t("chip.runs") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RunsTab, { api, t, sessionId, compact: !0 })
      ] })
    ] }) : null
  ] });
}
var STATUS_TONE = { completed: "ok", reviewing: "ok", failed: "err", blocked: "err", cancelled: "warn" };
function OrchestrationToolCard({ toolName, block, t }) {
  let running = block?.kind !== "tool-result", args = safeJson(block?.argsRaw ?? block?.call?.argsRaw), value = running ? void 0 : safeJson((block.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("")), label = toolName.replace("dynamic_multiagent_", ""), nodes = value?.nodes ?? args?.plan?.nodes ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dma-toolCard", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dma-toolHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: running ? "dma-dot dma-spin" : "dma-dot", "aria-hidden": !0, style: { color: running ? "var(--dsw-alias-brand-primary)" : block?.isError ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-state-success-primary)" } }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dma-toolName", children: [
        t("chip.label"),
        " \xB7 ",
        label
      ] }),
      value?.status ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: STATUS_TONE[value.status], children: value.status }) : null,
      value?.runId ?? args?.runId ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dma-mono dma-muted", children: value?.runId ?? args?.runId }) : null
    ] }),
    args?.task ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dma-muted", children: args.task }) : null,
    args?.plan?.summary ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dma-muted", children: args.plan.summary }) : null,
    nodes.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dma-chips", children: nodes.map((node) => {
      let id = node.nodeId ?? node.id;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Badge, { tone: STATUS_TONE[node.status], children: [
        id,
        node.roleId ? ` \xB7 ${node.roleId}` : "",
        node.model ? ` \xB7 ${node.model}` : "",
        node.effort ? ` \xB7 ${node.effort}` : "",
        node.status ? ` \xB7 ${t(`node.${node.status}`)}` : ""
      ] }, id);
    }) }) : null,
    block?.isError ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dma-footerError", children: (block.content ?? []).map((item) => item.text).join("").slice(0, 400) }) : null
  ] });
}
function safeJson(text) {
  if (!(typeof text != "string" || !text))
    try {
      return JSON.parse(text);
    } catch {
      return;
    }
}

// client/index.jsx
var import_jsx_runtime4 = require("react/jsx-runtime"), PACKAGE = "dsh-dynamic-multiagent", TOOL_NAMES = [
  "dynamic_multiagent_start",
  "dynamic_multiagent_plan",
  "dynamic_multiagent_execute",
  "dynamic_multiagent_status",
  "dynamic_multiagent_derive_role",
  "dynamic_multiagent_cancel"
], inject = ["slots", "locale", "connection"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dynamic-multiagent: dictionaries");
  let translate = ctx.locale.bind(NS), api = createApi(ctx.connection), injected = () => ({ api, tr: translate });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dynamic-multiagent",
    order: 60,
    label: () => translate("nav"),
    locale: NS,
    inject: injected
  }, SettingsSection)), ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: PACKAGE,
    locale: NS,
    inject: injected
  }, BundleConfig)), ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
    name: "conversation.input.left",
    id: "dynamic-multiagent",
    order: 50,
    locale: NS,
    inject: injected
  }, ChipSeat));
  for (let key of TOOL_NAMES)
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
      name: "tool.call.toolview",
      key,
      locale: NS,
      inject: injected
    }, ToolSeat));
}
var pick = (props) => typeof props.t == "function" ? props.t : props.tr;
function SettingsSection(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsPage, { api: props.api, t: pick(props) });
}
function BundleConfig(props) {
  let t = pick(props);
  return props.view === "summary" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("subtitle") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsPage, { api: props.api, t });
}
function ChipSeat(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ComposerChip, { api: props.api, t: pick(props), sessionId: props.sessionId ?? props.session?.sessionId, session: props.session });
}
function ToolSeat(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(OrchestrationToolCard, { toolName: props.toolName, block: props.block, t: pick(props) });
}

		return module.exports;
	}
});
