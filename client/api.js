// Browser side of the plugin's host channel.
// dsh 0.2.x serves it as authenticated `/api/dynamic-multiagent/<endpoint>` routes;
// dsh 0.1.x serves the loopback-only `/dynamic-multiagent/<endpoint>` channel.
export const CHANNEL = '/dynamic-multiagent';
const API_PREFIX = 'dynamic-multiagent';

export function createApi(connection) {
  let viaApi;
  const callRpc = async (channel, endpoint, payload) => {
    const result = await connection.rpc.call(channel, endpoint, payload);
    if (!result || result.ok !== true) throw new Error(result?.error?.message ?? `request ${endpoint} failed`);
    return result.value;
  };
  const call = async (endpoint, payload = {}) => {
    if (viaApi !== false) {
      try {
        const value = await callRpc('/api', `${API_PREFIX}/${endpoint}`, payload);
        viaApi = true;
        return value;
      } catch (error) {
        // A 404/405 transport failure means this host has no /api route for us: use the 0.1 channel.
        if (viaApi === true || !/HTTP 40[45]/.test(String(error?.message))) throw error;
        viaApi = false;
      }
    }
    return callRpc(CHANNEL, endpoint, payload);
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
