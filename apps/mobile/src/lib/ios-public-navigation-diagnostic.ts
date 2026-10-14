import { Platform } from 'react-native';

const events = ['help-back-in', 'help-back-out', 'help-back-press', 'replace-auth',
  'route-help', 'route-auth', 'route-other', 'auth-mounted'] as const;
type PublicNavigationEvent = typeof events[number];
let count = 0;

// Enabled only for the CI simulator build. No URLs, parameters, form values,
// account identifiers or navigation objects may cross this diagnostic boundary.
export function publicNavigationDiagnostic(event: PublicNavigationEvent) {
  if (Platform.OS !== 'ios' || process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS !== '1'
    || !events.includes(event) || count >= 64) return;
  try { console.info(`CampusFlowPublicNavigation:${++count}:${event}`); }
  catch { /* Diagnostic output must never interrupt a student action. */ }
}
