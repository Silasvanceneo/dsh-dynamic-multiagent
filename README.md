# dsh-dynamic-multiagent

`dsh-dynamic-multiagent` is a Cordis bundle for DeepSeek Harness. It adds a fixed-Leader orchestration runtime with:

- OpenAI Chat Completions and Anthropic Messages connections.
- Model capability profiles and explicit/default routing without silent replacement.
- OmO-style roles, task categories, validated derived roles, and stage-specific prompt assembly.
- Acyclic task graphs with parallel-ready scheduling, review/返工 state, cancellation, and durable checkpoints.
- Local/Git Skill discovery and version/content-hash tracking.
- Private Git repository/worktree isolation and three-way writeback with conflict detection.
- JSON atomic persistence for configuration and resumable runs.
- Host `ctx.subagents` execution for validated DAG nodes, including model/role/tool contracts, child disposal, cancellation propagation, and durable child lifecycle events.

## Local verification

```powershell
npm test
npm run check
```

The package is intentionally dependency-free at runtime. dsh loads it as a normal out-of-tree bundle through `cordis.patch.yml`.

## Install into a profile

From the profile directory managed by dsh:

```powershell
dsh plugin --profile web add /path/to/dsh-dynamic-multiagent
```

Then inspect the composed tree before booting:

```powershell
dsh --profile web --dump-config
```

The plugin stores its default state below `${DSH_HOME}/dynamic-multiagent`; configure providers and model profiles in `config.json` or pass a profile row override. Credentials are referenced by `credentialRef` and are never written into the ordinary config or run records.

When the host profile composes a subagent provider (the installed in-process provider is normally named `spawn`), the model-facing tool flow is:

1. `dynamic_multiagent_start` fixes the Leader model and creates a resumable run.
2. `dynamic_multiagent_plan` validates the DAG and persists assignments.
3. `dynamic_multiagent_execute` binds each ready node to `ctx.subagents.start(provider, request)`; the calling Agent is the parent authority.
4. `dynamic_multiagent_status` returns graph state, child results, and append-only lifecycle events.

The bundle option `subagentProvider` changes the default provider name for step 3. A node's `model` is a directory ref: `provider:model` for a dsh model enabled on the Models tab, or `<connection>:<model>` for an advanced connection (served by the plugin as the dsh route `dma-<connection>`). A node without a model, role default, or category default inherits the Leader's model.

## UI and switches

The bundle ships a browser half (`lib/client.js`, built from `client/` with `npm run build`):

- **Settings page** — dsh 0.1.x: *Settings → 多智能体 / Multi-agent*; dsh 0.2.x (Desktop): *Plugins → dsh-dynamic-multiagent*. Tabs: overview (host health), models (enable dsh models, tag capabilities, see reasoning efforts; advanced custom connections), routing (model + reasoning effort per role and category), skills, runs (task graph, node results, events, cancel), prompts (the exact Leader and child prompts).
- **Global switch** — turns orchestration off for every conversation (no prompt section, no tools).
- **Per-conversation switch** — the 多智能体 chip next to the composer; *新对话默认开启* decides conversations without their own setting. Overrides live in `<dataDir>/sessions.json`, not in the dsh session log, so logs stay readable without the plugin.
- **Tool cards** — orchestration tool calls render as compact cards instead of raw JSON.

The browser talks to the host over `/api/dynamic-multiagent/<endpoint>` (dsh 0.2.x, authenticated) or the loopback-only `/dynamic-multiagent/<endpoint>` channel (dsh 0.1.x).

## Reasoning effort

Each plan node may set `effort`; otherwise the role default, then the category default, then the model's own default applies. Efforts are validated against the model: dsh models report theirs through `ctx.llm.resolveModelInfo` (for example DeepSeek `off/high/max`, Claude 4.6+ `off/low/medium/high/max`); advanced connections declare them per model. An explicit effort the model does not offer is rejected at plan time; an unsupported default is dropped with a note.

dsh 0.2.x applies a child's `agentOptions.reasoningEffort` natively. On 0.1.x children inherit only provider/model/maxTokens, so the plugin restores the effort on every request of that child through an agent-scoped `agent/request` listener.

Advanced connections map efforts to the wire: OpenAI-compatible `reasoning_effort`; Anthropic adaptive thinking (`thinking.type: "adaptive"` + `output_config.effort`, Claude 4.6+/Fable) or a thinking budget (Claude 4.5 and older). *Suggest from id* on the Models tab fills these from the model id.

## Connection example

```json
{
  "version": 1,
  "connections": [
    {
      "id": "lab-openai",
      "protocol": "openai-chat",
      "baseUrl": "http://127.0.0.1:8080/v1",
      "credentialRef": "lab/openai",
      "models": [{ "id": "coder" }]
    },
    {
      "id": "lab-anthropic",
      "protocol": "anthropic-messages",
      "baseUrl": "http://127.0.0.1:8081/v1",
      "credentialRef": "lab/anthropic",
      "models": [{ "id": "researcher" }]
    }
  ],
  "modelProfiles": [
    {
      "ref": "lab-openai:coder",
      "capabilities": ["coding", "tool-calling", "long-context"],
      "evidence": [{ "kind": "lab", "source": "smoke-test-2026-11-09", "date": "2026-11-09", "strength": "verified" }]
    },
    {
      "ref": "lab-anthropic:researcher",
      "capabilities": ["reasoning", "writing", "long-context", "tool-calling"],
      "evidence": [{ "kind": "lab", "source": "smoke-test-2026-11-09", "date": "2026-11-09", "strength": "verified" }]
    }
  ],
  "defaults": {
    "leader": "lab-openai:coder",
    "roles": { "librarian": "lab-anthropic:researcher" }
  }
}
```

## Current phase

P0/P1 core, P2 host-subagent bridge, and the UI layer (settings page, per-conversation switch, reasoning-effort routing). The UI was exercised in the real Web UI of dsh 0.1.0-rc.6 (CLI) and of the dsh 0.2.1-rc.3 runtime bundled with Desktop (run in web mode). A live end-to-end delegation against a model provider has not been run in this checkout.

## Model Experience

### Leader prompt and dynamic stage modules

#### What the model sees

The plugin adds a fixed Leader section and injects only the active planning, specialization, matching, execution, review, or recovery module. Task contracts, role definitions, and Skill summaries are included by reference to the current run rather than copying every child transcript.

#### Token effect

A stable base prefix is retained on every Leader request; stage and task sections are conditional and grow with the active run.

#### KV Cache effect

The base Leader prefix is append-only and prefix-stable. Changing the run's stage or role definition replaces the dynamic suffix but does not invalidate the stable prefix.

## Known Limitations and Deferred Work

- **Desktop activation** — the installed Desktop bundle and its profile-specific plugin manager still need a live compatibility check; this checkout does not claim Web/App parity until that check is run.
- **Web conversation business node** — `@deepseek-ai/dsh-client-ui-conversation@0.1.0-rc.6` currently contributes durable busy-Enter settings; it does not expose a public conversation-node registration API. The bundle therefore exposes a host tool and runtime method instead of pretending to mount a browser node.
- **Provider composition** — the bridge requires a calling Agent and a registered `ctx.subagents` provider. In-process child composition, provider/model adapter registration, and browser rendering remain host-profile responsibilities.
- **External writeback** — writeback is implemented for ordinary files; nested repositories, LFS, symlinks, and submodules are surfaced as unsupported project shapes rather than silently copied.
