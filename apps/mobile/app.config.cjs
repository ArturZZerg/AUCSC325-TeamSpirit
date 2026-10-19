const { expo } = require('./app.json');
const { validatePublishedLinks } = require('./config/published-links.cjs');

module.exports = () => {
  validatePublishedLinks(process.env);
  // Xcode places iOS simulator capabilities in the executable's simulated
  // entitlement section. Device builds must use their real Apple team/profile.
  const simulator = process.env.CAMPUSFLOW_IOS_SIMULATOR === '1';
  const entitlements = simulator ? require('@expo/plist').default.parse(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../scripts/ios-simulator.entitlements'), 'utf8')) : undefined;
  return {
    ...expo,
    ios: { ...expo.ios, ...(simulator ? { entitlements: { ...entitlements } } : {}) },
    // Hosted web is served below a path on a shared host (ADR 018); native and local builds keep the root.
    experiments: { ...expo.experiments, ...(process.env.CAMPUSFLOW_WEB_BASE_URL ? { baseUrl: process.env.CAMPUSFLOW_WEB_BASE_URL } : {}) },
    plugins: [
      // Entitlement mods execute in reverse registration order. Remove APNs last.
      './plugins/with-local-reminders-ios.cjs',
      ...expo.plugins,
      ['./plugins/with-preview-network.cjs', {
        enabled: process.env.CAMPUSFLOW_ANDROID_PREVIEW === '1',
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
      }],
    ],
  };
};
