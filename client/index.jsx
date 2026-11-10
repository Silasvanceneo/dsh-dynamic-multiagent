import './styles.css';
import { createApi } from './api.js';
import { NS, zh, en } from './locales.js';
import { SettingsPage } from './SettingsPage.jsx';
import { ComposerChip, OrchestrationToolCard } from './ComposerChip.jsx';

const PACKAGE = 'dsh-dynamic-multiagent';
const TOOL_NAMES = [
  'dynamic_multiagent_start',
  'dynamic_multiagent_plan',
  'dynamic_multiagent_execute',
  'dynamic_multiagent_status',
  'dynamic_multiagent_derive_role',
  'dynamic_multiagent_cancel',
];

export const inject = ['slots', 'locale', 'connection'];

/**
 * Browser half. Every registration goes through `ctx.slots.inject`, which waits for the slot to be
 * declared and does nothing when a host version never declares it — so one bundle serves both:
 * dsh 0.1.x shows the page as a Settings section, dsh 0.2.x on the Plugins page of this bundle.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dynamic-multiagent: dictionaries');
  const translate = ctx.locale.bind(NS);
  const api = createApi(ctx.connection);
  // `tr` rather than `t`: the slot runtime injects its own `t` for registrations declaring `locale`.
  const injected = () => ({ api, tr: translate });

  // dsh 0.1.x: Settings → Multi-agent.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dynamic-multiagent',
    order: 60,
    label: () => translate('nav'),
    locale: NS,
    inject: injected,
  }, SettingsSection));

  // dsh 0.2.x: Plugins → this bundle's page.
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: PACKAGE,
    locale: NS,
    inject: injected,
  }, BundleConfig));

  // Composer row: per-conversation switch and live runs.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'dynamic-multiagent',
    order: 50,
    locale: NS,
    inject: injected,
  }, ChipSeat));

  // Tool-call cards for the orchestration tools.
  for (const key of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview',
      key,
      locale: NS,
      inject: injected,
    }, ToolSeat));
  }
}

const pick = (props) => (typeof props.t === 'function' ? props.t : props.tr);

function SettingsSection(props) {
  return <SettingsPage api={props.api} t={pick(props)} />;
}

function BundleConfig(props) {
  const t = pick(props);
  if (props.view === 'summary') return <span>{t('subtitle')}</span>;
  return <SettingsPage api={props.api} t={t} />;
}

function ChipSeat(props) {
  return <ComposerChip api={props.api} t={pick(props)} sessionId={props.sessionId ?? props.session?.sessionId} session={props.session} />;
}

function ToolSeat(props) {
  return <OrchestrationToolCard toolName={props.toolName} block={props.block} t={pick(props)} />;
}
