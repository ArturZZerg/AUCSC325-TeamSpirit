# CampusFlow design context

CampusFlow is a native student productivity app using React Native, Expo Router
and TypeScript. The authoritative primitives and palette live in
`apps/mobile/src/components/ui.tsx`: Screen, Card, Button, Field and State.
Ionicons supplies functional icons.

Use the existing warm canvas, ink, muted, moss and sage tokens. Blue and plum
distinguish student-selected classes alongside moss and coral. Keep comfortable
spacing, 46px touch targets, clear type hierarchy and restrained borders/radii.
Color supplements text labels, never replaces them.

Preserve five-tab navigation. New workspaces open from Today/planner. Support
narrow screens with wrapping controls and horizontal day strips. Editors isolate
background accessibility, retain failed drafts and block dismissal while saving.

Always show loading, unavailable, empty, saved/stale and error states honestly.
Reuse account-scoped cached reads and existing mutation services. Avoid decorative
gradients, new UI dependencies and Canvas-specific data in mobile.

The 21st CLI cannot automatically detect this native workspace's tokens; these
facts were checked directly against the source. Catalog search requires 21st
authentication. Native primitives remain the implementation authority.
