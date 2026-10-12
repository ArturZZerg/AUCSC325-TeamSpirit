const { expo } = require('./app.json');
const { validatePublishedLinks } = require('./config/published-links.cjs');

module.exports = () => {
  validatePublishedLinks(process.env);
  return {
    ...expo,
    plugins: [
      ...expo.plugins,
      ['./plugins/with-preview-network.cjs', {
        enabled: process.env.CAMPUSFLOW_ANDROID_PREVIEW === '1',
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
      }],
    ],
  };
};
