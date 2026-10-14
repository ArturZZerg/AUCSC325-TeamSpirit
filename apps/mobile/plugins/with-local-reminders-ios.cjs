const { withEntitlementsPlist } = require('expo/config-plugins');

// CampusFlow schedules reminders on the device; it does not register APNs tokens.
// expo-notifications adds remote-push entitlement by default, even for local use.
module.exports = function withLocalRemindersIos(config) {
  return withEntitlementsPlist(config, result => {
    delete result.modResults['aps-environment'];
    return result;
  });
};
