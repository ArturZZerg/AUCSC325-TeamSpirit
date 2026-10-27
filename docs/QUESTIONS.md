# Open questions for the owner

Work continues on unblocked tasks while these are open.

## Q1. Email provider — resolved 2026-10-18

Not needed for this school project. Signup is open without verification and
email password reset is off (ADR 018).

### Original question

Production refuses unverified signup, so a brand-new user can't register until
real mail delivery exists. The API already speaks SMTP. Free options that need
you to create the account (I won't sign up for services):

- **Brevo**: 300 emails/day free.
- **Resend**: 3,000/month free (100/day); needs a verified sending domain.
- **Amazon SES**: about $0.10 per 1,000; needs an AWS account and leaving the sandbox.

Which provider, and which sender address/domain? Put SMTP credentials in
`/etc/campusflow/api.env` on the server yourself, or tell me where they are.

## Q2. Where should the web app live? — resolved 2026-10-18

No DNS access for a subdomain, so it is served at
`https://workout.vakula-dev.com/campusflow/` (ADR 018).

### Original question

Options: a path on the existing host (`https://workout.vakula-dev.com/campusflow/`),
which needs the web build to support a base path, or a new subdomain such as
`campusflow.vakula-dev.com`, which needs a DNS record from you and a new
certificate. A subdomain is cleaner and recommended.

## Q3. Privacy policy, terms and support contact — approved 2026-10-20

The owner approved the wording. The operator is named as "the AUCSC 325
TeamSpirit project team", and support is GitHub issues only, with no private
email. The policy says locked-out accounts can't be deleted on request.

### Earlier status (drafted, awaiting approval)

Drafts are in `apps/mobile/public/legal/` (PR #128) and are not published until
you approve them. They state 14-day backup and access-log retention, as
configured, and the Hetzner Helsinki location. Needed from you:

1. Who runs CampusFlow, as it should be named publicly (for example your name
   and course, or "the AUCSC 325 TeamSpirit project team").
2. A private contact email, for privacy requests and for people locked out of an
   account. Without email reset, they can't delete their data any other way.
3. Approval of the wording, or the changes you want.

When Canvas personal-token sync (PR #127) is enabled, the privacy policy must
first say that an encrypted Canvas access token and synced course data are
stored. Drafted 2026-10-27 (effective date 27 October 2026): the policy now
covers the Canvas token, what is imported (courses, assignments, scores,
planner to-dos and course calendar events), disconnecting and backups. It still
needs the same approval as the rest of the policy.

### Original question

I can draft accurate pages. You need to approve the wording, the data-retention
period for backups (I propose 14 days) and a support email address.

## Q4. App store distribution

Google Play ($25 one-time) and the Apple Developer Program ($99/year) are paid.
Until you decide, Android ships as a sideloaded APK and the web app covers iPhone.
