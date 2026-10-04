const { expo } = require('./app.json');

module.exports = () => ({
  ...expo,
  plugins: [
    ...expo.plugins,
    ['./plugins/with-preview-network.cjs', {
      enabled: process.env.CAMPUSFLOW_ANDROID_PREVIEW === '1',
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    }],
  ],
});
