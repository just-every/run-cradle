# Install Cradle

The maintained public source is [just-every/run-cradle](https://github.com/just-every/run-cradle).
Follow README.md's computer journey with Node 22.20.0 and rer 0.2.5 through
`rer install`, `setup`, and `dev`. `rer-setup.json` is the one
manifest for owner, workspace and provider inputs. Open the printed `RER_OPEN`
URL (`dev --login` uses the Base outbox instead) and finish `/setup`. Setup retains existing private bytes and owners. Rer provisions pnpm 10.12.4 automatically; no pnpm prerequisite is required.

The installer and Base's sign-in confirmation page wear Cradle's own look through one
file, `public/rer-theme.css` (tokens from the landing page and the fonts and mark the
app already serves). It is declared as `theme` in `scripts/installer/seed.mjs` and as
`branding.theme` in `src/core/platform/base-auth.server.ts`, and the Worker lists
`/rer-theme.css` among its static paths. Cradle's own fonts stay declared in
`src/core/app/styles.css`; no Base default replaces them. Beyond those tokens, the
installer's browser module (`scripts/installer/ui/seed.mjs`) adds Cradle's layout: the
forest Manual setup card, the ribbon behind the lower third (`scripts/installer/ui/background.svg`)
and the footer. It adds a stylesheet and decorative nodes only; Base's copies stay unchanged.

The application uses DB (D1), FILES (R2), WORK_QUEUE and the INSTALLATION Durable
Object. Canonical local persistence is `.wrangler/state`; private local settings
are `.dev.vars` (0600). Private hosting email inputs are `data/hosting-mail.json`.
Builds exclude private settings and restore them exactly. Ambiguous legacy data
placement is refused for explicit recovery; never delete it to make setup pass.

Hosted deployment requires the owner's Cloudflare account/token, OWNER_EMAIL,
SESSION_SECRET, CONNECTION_ENCRYPTION_KEY, hosted MAIL_FROM,
MAIL_PROVIDER (SendGrid or Resend) and MAIL_PROVIDER_API_KEY. Other provider secrets
are optional and are named in rer-setup.json and packaging.json. A trusted HTTPS
egress relay with matching EGRESS_RELAY_SECRET is required for webhook and Slack
actions. Connections and automation approvals are explicit. No local outbox is
served remotely. Rer generates the first SETUP_TOKEN, claims the designated owner
after upload and health verification, and retires the token. A recorded existing
owner is kept; later deployments do not require SETUP_TOKEN.

`rer deploy --dry-run` builds and validates without provider
calls. `rer deploy --environment production` provisions deterministic
resources, validates the immutable migration ledger, packages Worker/assets,
applies migrations, publishes and checks health. It records `.rer/deploy` receipts.
Only run this when hosting is authorized. The signed managed owner-claim and
editor paths use the declared installation issuer/origin/key ring and native
current owner authority. Local proof does not establish hosted management or
real provider acceptance.

Use `rer describe`, `doctor`, and `check --profile first-party`
for command capabilities, local diagnostics and structural checks. See
installation-archives.md for atomic data movement and restore approval policy.

For an update, preserve customisations and merge source changes, run `rer install`
and `rer verify`, then deploy when authorized. Removal is
`rer deploy --environment production --remove --yes`: this deletes the Worker and
recorded D1, R2 and queue resources, including their data, and reads them back as
gone. Keep `.rer/deploy` receipts for update and removal.
