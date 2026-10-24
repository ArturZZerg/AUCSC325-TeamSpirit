// Self-hosted over-the-air updates (ADR 021). Only builds that target the
// production API download updates; local and emulator previews never do.
const productionApiUrl = 'https://workout.vakula-dev.com/campusflow-api';
const updatesOrigin = 'https://workout.vakula-dev.com/campusflow-updates';
const { runtimeVersion } = require('../native-runtime.json');

function updatesConfig(env) {
  const enabled = env.EXPO_PUBLIC_API_URL === productionApiUrl;
  return {
    runtimeVersion,
    updates: enabled
      ? { enabled: true, url: `${updatesOrigin}/manifest`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 }
      : { enabled: false },
  };
}
module.exports = { productionApiUrl, updatesOrigin, updatesConfig };
