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

## Q3. Privacy policy, terms and support contact

I can draft accurate pages. You need to approve the wording, the data-retention
period for backups (I propose 14 days) and a support email address.

## Q4. App store distribution

Google Play ($25 one-time) and the Apple Developer Program ($99/year) are paid.
Until you decide, Android ships as a sideloaded APK and the web app covers iPhone.
