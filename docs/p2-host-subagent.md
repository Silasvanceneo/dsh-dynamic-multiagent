# P2 host-subagent bridge

Date: 2026-11-09

## Scope

P2 binds a validated task-graph node to the host's `ctx.subagents` service. The
bundle does not create a second agent loop or bypass the host provider. Each
node is sent as one one-shot child request and is disposed after its result is
settled.

## Binding contract

`src/core/subagent-bridge.js` maps:

- `run.assignments[nodeId].model` to `agentOptions.provider` and `agentOptions.model`.
- the node role and acceptance contract to the child prompt and optional provider persona.
- explicit `node.tools` to a provider-enforced allow filter; a tool outside the role contract is rejected.
- finite role delegation depth to `maxDepth`; providers without the capability are rejected instead of silently widening scope.
- node skills to version/content-hash evidence in the child contract.
- the calling `exec.agent` (or an explicit `parent`) to the required subagent parent authority.

The default provider name is `spawn`. Set the plugin option `subagentProvider`
or pass `provider` to `dynamic_multiagent_execute` for another registered
provider. Connection ids should match host LLM adapter names unless the caller
provides a model-provider map through the runtime API.

## Durable lifecycle

`RunStore` now stores bounded `events[]`. Runtime execution records:

- run start/cancel/block/gate transitions;
- node start/completion/failure/review transitions;
- child start/publication/settlement/cancellation/error;
- execution checkpoints and child result summaries.

Child result text and output blocks remain in `results[]`; event records avoid
copying the full prompt or transcript. `runtime.cancel()` aborts the active
execution controller, which is linked to the child provider request signal.

## Verification

```text
npm test
16 tests passed, 0 failed

npm run check
node --check src/index.js && node --test
```

The host seam was also mounted and exercised in an actual Cordis `Context`/Fiber
with a simulated `subagents` service; the plugin reached Fiber state `2`, the
`dynamic_multiagent_execute` tool completed a one-node run, and one
`child-settled` event was persisted.

## Web/Desktop boundary

The installed `@deepseek-ai/dsh-client-ui-conversation@0.1.0-rc.6` package only
registers the `ui-conversation` settings namespace and `busyEnter` field. No
public `ConversationNode` or browser business-node registration surface was
present in the installed package, so this phase does not claim a Web node. A
future UI adapter should consume the persisted run/event catalog and call the
runtime method through a host-authenticated transport rather than reaching into
the child provider directly.

