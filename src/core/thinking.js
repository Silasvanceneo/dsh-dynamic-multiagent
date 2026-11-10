// Reasoning-effort vocabulary shared by routing, the advanced-connection adapter, and the UI.
// The levels match dsh's pi-ai adapter (`off` … `max`); a model's actual levels come from the
// host's `resolveModelInfo()` or from the advanced connection's model entry.

export const EFFORT_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

// Anthropic budget-based thinking (Claude 4.5 and older): `budget_tokens` per level.
export const THINKING_BUDGETS = Object.freeze({ minimal: 1024, low: 2048, medium: 8192, high: 16384, xhigh: 24576, max: 32000 });

/**
 * Suggest how a model expresses reasoning effort, following the rules pi-ai's catalog encodes:
 * Claude 4.6+/Fable use adaptive thinking with `output_config.effort`, older Claude models use a
 * thinking budget, and OpenAI-style reasoning models take `reasoning_effort`.
 * @returns {{ thinking: 'none'|'openai'|'adaptive'|'budget', efforts: string[] }}
 */
export function suggestThinking(protocol, modelId) {
  const id = String(modelId ?? '').toLowerCase();
  const claude = id.match(/claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:\b|-|$)/);
  if (claude && protocol === 'anthropic-messages') {
    const [, family, major, minor] = claude;
    const version = Number(major) + (minor === undefined ? 0 : Number(minor) / 10);
    if (family === 'fable' || version >= 5.5) return { thinking: 'adaptive', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] };
    if (version >= 5 || (family === 'opus' && version >= 4.7)) return { thinking: 'adaptive', efforts: ['off', 'low', 'medium', 'high', 'xhigh', 'max'] };
    if (version >= 4.6) return { thinking: 'adaptive', efforts: ['off', 'low', 'medium', 'high', 'max'] };
    return { thinking: 'budget', efforts: ['off', 'minimal', 'low', 'medium', 'high'] };
  }
  if (protocol === 'openai-chat') {
    if (/(^|[^a-z0-9])(o[1-9]|gpt-5)/.test(id)) return { thinking: 'openai', efforts: ['minimal', 'low', 'medium', 'high'] };
    if (/deepseek|reasoner|thinking|qwq|r1\b/.test(id)) return { thinking: 'openai', efforts: ['low', 'medium', 'high'] };
  }
  return { thinking: 'none', efforts: [] };
}

/** Wire shape of one effort for Anthropic requests (`minimal` has no adaptive equivalent). */
export function anthropicThinkingParams(mode, effort) {
  if (effort === undefined || mode === 'none' || mode === undefined) return {};
  if (effort === 'off') return { thinking: { type: 'disabled' } };
  if (mode === 'adaptive') return { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: effort === 'minimal' ? 'low' : effort } };
  if (mode === 'budget') return { thinking: { type: 'enabled', budget_tokens: THINKING_BUDGETS[effort] ?? THINKING_BUDGETS.medium } };
  return {};
}
