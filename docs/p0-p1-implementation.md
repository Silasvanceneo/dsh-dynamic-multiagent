# P0/P1 implementation checkpoint

Date: 2026-11-09

## Environment verified

- Node: `v24.13.0`
- npm: `11.6.2`
- dsh CLI: `0.1.0-rc.6`
- Plugin surface: Cordis `name`/`inject`/`apply`, `ctx.provide`, `ctx.systemPrompt.section`, `ctx.tools.register`, and `ctx.effect` were verified against the installed runtime.

## Delivered

1. `src/core/protocols.js` — OpenAI Chat Completions and Anthropic Messages streaming, tool-call normalization, cancellation, timeout, retry-after and stable provider diagnostics.
2. `src/core/config-store.js` — versioned connection/model/default configuration, atomic writes, credential references and secret-header redaction.
3. `src/core/model-router.js` — capability evidence directory, fixed Leader selection, explicit/default task assignment and incompatibility suggestions.
4. `src/core/roles.js` + `src/core/prompt.js` — OmO-style roles/categories, derived-role inheritance checks and stage-specific system prompt assembly.
5. `src/core/task-graph.js` — validated DAGs, teams, dependency scheduling, review/retry, cancellation and resumable snapshots.
6. `src/core/skills.js` — installed/local/Git skill discovery/import, version/source/content-hash tracking and optional automatic installation.
7. `src/core/run-store.js` — atomic resumable runs, checkpoints and an effects ledger for uncertain external side effects.
8. `src/core/workspace.js` — private Git repository/worktree execution, three-way writeback, concurrent-edit conflict reporting and explicit unsupported-shape diagnostics.
9. `src/index.js` + `cordis.patch.yml` — dsh bundle integration, automatic Leader prompt module and five model-facing orchestration tools.

## Verification evidence

```text
npm run check
11 tests passed, 0 failed

Cordis fiber mount with injected systemPrompt/tools/credentials
fiber-ok state=2

npm pack --dry-run
19 package files included; no runtime dependency outside Node and dsh host APIs
```

## Next planned phase

P2 should bind validated task nodes to the host's `ctx.subagents` providers and add a Web conversation business node. P4/P5 still require live Desktop profile verification and real selected-provider smoke tests; this checkpoint does not claim those host-specific flows are complete.
