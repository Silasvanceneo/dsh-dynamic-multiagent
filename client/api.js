// Browser side of the plugin's loopback RPC channel (`/dynamic-multiagent/<endpoint>`).
export const CHANNEL = '/dynamic-multiagent';

export function createApi(connection) {
  const call = async (endpoint, payload = {}) => {
    const result = await connection.rpc.call(CHANNEL, endpoint, payload);
    if (!result || result.ok !== true) throw new Error(result?.error?.message ?? `request ${endpoint} failed`);
    return result.value;
  };
  return {
    overview: () => call('overview'),
    saveConfig: (config, expectedRevision) => call('config/save', { config, expectedRevision }),
    setEnabled: (enabled) => call('config/enabled', { enabled }),
    session: (sessionId) => call('session/get', { sessionId }),
    setSession: (sessionId, enabled) => call('session/set', { sessionId, enabled }),
    runs: (sessionId, limit = 50) => call('runs/list', { sessionId, limit }),
    cancelRun: (runId) => call('runs/cancel', { runId }),
    previewPrompts: (roleId, categoryId) => call('prompts/preview', { roleId, categoryId }),
    suggestThinking: (protocol, model) => call('thinking/suggest', { protocol, model }),
  };
}
