const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

module.exports = function withPreviewNetwork(config, { enabled = false, apiUrl }) {
  const url = new URL(apiUrl);
  const allowLocalHttp = enabled && url.protocol !== 'https:';
  const localHost = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
  if (allowLocalHttp && (url.protocol !== 'http:' || !localHost.test(url.hostname) || url.username || url.password)) {
    throw new Error('Android previews require HTTPS or an HTTP API on a local/private address.');
  }
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application[0];
    if (allowLocalHttp) {
      application.$['android:networkSecurityConfig'] = '@xml/campusflow_preview_network';
      application.$['android:usesCleartextTraffic'] = 'false';
    } else if (application.$['android:networkSecurityConfig'] === '@xml/campusflow_preview_network') {
      delete application.$['android:networkSecurityConfig'];
      delete application.$['android:usesCleartextTraffic'];
    }
    return result;
  });
  return withDangerousMod(config, ['android', async result => {
    const directory = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    if (!allowLocalHttp) {
      fs.rmSync(path.join(directory, 'campusflow_preview_network.xml'), { force: true });
      return result;
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'campusflow_preview_network.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false" />\n  <domain-config cleartextTrafficPermitted="true">\n    <domain includeSubdomains="false">${url.hostname}</domain>\n  </domain-config>\n</network-security-config>\n`);
    return result;
  }]);
};
