# Install Cradle

Start with [the quick install guide](install.md). Use macOS, Linux or Windows
with WSL2, with Git installed. You need no Node first: the installer brings its own.
Cradle uses **rer 0.2.23**. The quick guide gives the two Run page lines; rer
installs this project's pinned
Node 22.20.0 and pnpm 10.12.4 for project commands. You need not install pnpm
separately.

The first `rer dev` installs dependencies, prepares a local owner and starts the
app. Open its `RER_OPEN` URL and finish `/setup`. Treat the URL as a password.
Local `rer setup` is optional; see the [README](../README.md#run-it-on-your-computer)
to choose owner details before the first launch. `rer dev --login` aliases the
same automatic owner sign-in. No email is sent locally.

## Host it online

You need your Cloudflare account ID and an API token permitted to provision and
manage this app's Worker, D1 database, R2 bucket and queue. You also need a Resend
or SendGrid API key and a sender address verified with that provider.

Create a file outside the repository, owned by your user with permissions 0600.
The example below keeps it in your home directory. Create the file privately
before opening it in your text editor:

```sh
umask 077
touch "$HOME/cradle-production.env"
chmod 600 "$HOME/cradle-production.env"
```

Put these settings in the file, replacing every example value with your own:

```text
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=synthetic-your-cloudflare-api-token
OWNER_EMAIL=owner@example.com
MAIL_PROVIDER=resend
MAIL_FROM=cradle@example.com
MAIL_PROVIDER_API_KEY=synthetic-your-email-provider-api-key
```

Managed hosting configures the RER mail relay automatically, including its sender
and private installation credential. You do not need a mail provider account or
enter a key. The settings above apply to Free or Assisted hosting on your own
account. Use `MAIL_PROVIDER=sendgrid` if that is your provider. The file contains one
`KEY=VALUE` per line, without `export` or spaces around `=`. Blank lines and `#`
comments are allowed. It must be a regular file, not a symlink; keep it out of git.
Values in this file take precedence over values in your shell environment.

**Always set `OWNER_EMAIL` to an address you can receive mail at.** Deploy does
not ask setup questions. Without this setting, a new deployment can copy the local
trial owner, `owner@run-cradle.test`, which cannot receive sign-in email. Local
`.dev.vars` is for local use; do not copy it into the hosting file.

The app also requires `SESSION_SECRET` and `CONNECTION_ENCRYPTION_KEY`. Rer
creates fresh values for missing generated secrets on a new deployment, so you
can leave them out of the file. It also creates a one-time `SETUP_TOKEN`, claims
the hosted owner after health verification, and removes that token. There is no
manual setup-token step. Existing hosted secrets and owner are preserved on
repeat deploys; editing the file alone does not rotate them or change that owner.

Run from your Cradle checkout:

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --dry-run
rer deploy --environment production --env-file "$HOME/cradle-production.env"
```

Dry-run builds and validates locally without provider calls. Deployment provisions
the resources, applies migrations, uploads the Worker and assets, checks health
and claims the owner. It saves the deployment records under `.rer/deploy`; keep
these with the checkout. The application uses D1 for records, R2 for files, a queue
for background jobs and an Installation Durable Object for coordination.

`production` is the default environment. You can choose another environment name;
use that same name and its credentials for subsequent deploys, sign-in and removal.
A public-main push deploys the marketing site, not your hosted workspace.

## Sign in to your hosted workspace

Open `/signin` on the hosted URL, enter your owner email, and confirm the emailed
link. Hosted use requires a real mail provider.

Wait for deployment to finish owner claim before signing in. If deployment
reports an incomplete claim, resolve its reported cause and complete deployment.
A healthy URL alone does not prove that the owner was claimed. Check the configured
mail provider and verified sender if a completed installation cannot deliver mail.

## Optional connections

Webhook and Slack actions need a trusted HTTPS relay with `EGRESS_RELAY_URL` and
a matching `EGRESS_RELAY_SECRET`. Other service credentials are optional; see
`rer-setup.json` for their names. Connect and approve each service in the workspace
before use. Ordinary records work needs no AI provider.

The setup flow can save hosted mail answers in private `data/hosting-mail.json`
without sending local email externally. The direct deploy commands above read
your shell environment or `--env-file`; you do not need to create or edit that
JSON file for this path.

## Update or remove

Preserve customisations and merge source updates, run `rer install` and
`rer verify`, then deploy with the same environment and private file.
Use `rer describe`, `rer doctor` and `rer check --profile first-party` for command
help, local diagnostics and structural checks. [Installation archives](installation-archives.md)
explains data movement and what needs approval after restore.

To delete your hosted installation **and its data**, save any exports you need
first, then run:

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --remove --yes
```

`rer deploy --remove --yes` defaults to production. Removal deletes the Worker
and recorded storage and queue resources, including their data, and checks that
they are gone. Keep `.rer/deploy` so rer can identify the resources it created.
