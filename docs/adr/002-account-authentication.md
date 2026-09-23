# ADR 002 — CampusFlow account sessions

Status: Accepted for initial implementation

Date: 2026-09-21

## Context

Personal tasks must work without Canvas. The first application needs an account
identity separate from university OAuth, with revocable sessions and ownership
checks on every private resource. No identity provider has been provisioned.

## Decision

The NestJS identity module accepts email and password registration and login.
Passwords use salted scrypt hashes. Random, high-entropy opaque session tokens
are returned once to the client; the database stores only their hashes, with
expiration and revocation. The native client stores the bearer credential with
Expo SecureStore. API services derive ownership from the authenticated session.
Logout revokes the session and clears local account data and notifications.
Production transport must use HTTPS; authentication endpoints require bounded
request rates. There is no production authentication bypass or fixed demo token.

Canvas authorization remains backend-mediated OAuth and attaches to an existing
CampusFlow account. Provider tokens are encrypted separately from session hashes.

## Consequences

Local development does not require a third-party identity subscription. Password
recovery and email verification require a later delivery-provider decision before
public onboarding. Supabase remains the eventual PostgreSQL hosting choice, not
an implicit second authentication system. Device biometrics and social sign-in
are outside the initial product requirements.
