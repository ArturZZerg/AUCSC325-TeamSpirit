# CampusFlow design context

CampusFlow is a native student productivity app using React Native, Expo Router
and TypeScript. The authoritative primitives and palette live in
`apps/mobile/src/components/ui.tsx`: Screen, Card, Button, Field and State.
Ionicons supplies functional icons.

Use the existing warm canvas, ink, muted, moss and sage tokens. Blue and plum
distinguish student-selected classes alongside moss and coral. Keep comfortable
spacing, 46px touch targets, clear type hierarchy and restrained borders/radii.
Color supplements text labels, never replaces them. Prefer weight-600 headings,
quiet borders, and 20px card radii. The light palette uses forest #285743, warm
canvas #F7F8F5, and sage #EAF0E9; both light and dark palettes retain AA contrast.
Destructive buttons use the separate danger token (#A64B36) for 5.70:1 white-text
contrast. Coral remains an accent; it is not the destructive-button background.

Preserve all six existing tabs on phones. Desktop web uses a left sidebar at
1000px; Today gains a supporting right rail at 1180px. New workspaces open from Today/planner. Support
narrow screens with wrapping controls and horizontal day strips. Editors isolate
background accessibility, retain failed drafts and block dismissal while saving.

Always show loading, unavailable, empty, saved/stale and error states honestly.
Reuse account-scoped cached reads and existing mutation services. Avoid decorative
gradients, new UI dependencies and Canvas-specific data in mobile.

The 21st CLI cannot automatically detect this native workspace's tokens; these
facts were checked directly against the source. Catalog search requires 21st
authentication. Native primitives remain the implementation authority.

The futuristic refinement concentrates graphite chrome (#122B24) and lime
signal (#CBF59A) in navigation and primary actions. Keep content surfaces quiet.
Use the shared MotionPressable for spring feedback and FlowProgress for animated
completion. Respect reduced-motion settings; never add looping decoration.
Primary calls to action use explicit verbs and strong contrast; secondary
actions remain quiet. Preserve keyboard focus and accessible labels.
