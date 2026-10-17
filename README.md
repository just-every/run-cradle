<p align="center">
  <a href="https://run-cradle.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.webp">
      <source media="(prefers-color-scheme: light)" srcset=".github/assets/banner-light.webp">
      <img src=".github/assets/banner-light.webp" width="100%" alt="Cradle: Everything comes together in one place. 100% free, open source alternative to Airtable and Smartsheet.">
    </picture>
  </a>
</p>

<p align="center"><a href="https://run-cradle.com">run-cradle.com</a> · <a href="https://justevery.com">Part of Just Every</a> · <a href="LICENSE">MIT licensed</a></p>

<p align="center">
  <a href="https://justevery.com/#vol-cradle"><img src=".github/assets/media/preview.gif" width="800" alt="Cradle importing a base: the Projects CSV read with six rows accepted, the import running to completed, and the imported Projects grid"></a>
</p>
<p align="center"><a href="https://justevery.com/#vol-cradle"><b>Watch the full demo</b></a> · 55 seconds</p>

<p align="center">
  <img src=".github/assets/media/flow.webp" width="800" alt="One project, Harbour Street pop-up, as a table row, a board card and its own record page">
</p>

<p align="center">
  <img src=".github/assets/media/screen-1.webp" width="800" alt="Cradle's Records page: the Projects table with linked clients, status, lead, budget and due date for six projects"><br>
  <sub>Records with linked tables, typed fields, filters and saved views.</sub>
</p>

<p align="center">
  <img src=".github/assets/media/screen-2.webp" width="800" alt="The same projects as a Pipeline board grouped by status: Planned, In progress and Done"><br>
  <sub>The same records as a board.</sub>
</p>

<p align="center">
  <img src=".github/assets/media/screen-3.webp" width="800" alt="Cradle's New task form with a task typed, a choice of linked projects, priority and due date"><br>
  <sub>And as a form people can fill in after signing in with permission.</sub>
</p>

# Cradle

Cradle is a self-hosted records workspace with manual tables, linked records,
imports and exports, Launch planning, repair workflows, automations and an
owner-controlled editor. Public source: [just-every/run-cradle](https://github.com/just-every/run-cradle).

## Run it on your computer

Use macOS, Linux or Windows with WSL2, with Git and Node 22 or later installed. Rer then
installs the project's pinned Node 22.20.0 and pnpm 10.12.4 for project commands, so you do
not install pnpm separately. One line installs the `rer` command, clones Cradle and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-cradle
```

No Node? `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-cradle` does the same, and the installer brings its own Node. To set Cradle up without starting it, use `setup` in place of `dev`.

The checkout runs Cradle's pinned **rer 0.2.43**. To start it again later, run
`cd run-cradle && rer dev`. The first `rer dev` installs the pinned frozen dependencies, sets up a local owner
(`owner@run-cradle.test`), applies the migrations, starts the app and prints
`RER_READY` with its local URL, `RER_SIGNED_IN` and `RER_OPEN`. Open the `RER_OPEN`
URL on this computer: it carries this checkout's dev key in its fragment (treat it
as a credential), and the browser lands signed in as the owner. `rer dev --stop`
stops the app; the next `rer dev` keeps your data and owner.

Local `rer setup` is optional after zero-setup `rer dev`. To choose your own
owner details from the start, run setup before the first `rer dev` with a private `answers.json` file (mode 0600), for example:

```json
{"OWNER_EMAIL":"owner@example.com","OWNER_NAME":"Owner","WORKSPACE_NAME":"My records","WORKSPACE_TIMEZONE":"Australia/Brisbane","WORKSPACE_CURRENCY":"AUD"}
```

```sh
rer setup --answers answers.json --non-interactive
rer dev
```

Setup prepares the real owner, migrations and private settings and exits with no
app running. A second setup reuses the saved answers, owner and exact private
bytes. Use `rer dev --as` to switch between the owner, signed out and the personas
`admin@dev.localhost` and `member@dev.localhost`; `rer dev --as PERSONA` starts as
one of them or `signed-out`. `rer dev --login` is an alias for the same automatic
owner sign-in; open its `RER_OPEN` URL. No email is sent locally. Keys minted in a
dev session work only with this checkout's dev key and never travel in an export.
Finish your first-run details at `/setup`; other app routes take you there until
completed. Later `/setup` opens the app. Settings remain editable.
Dev serves source with HMR. `rer preview` serves a fixed production build using
the same data. Choose a loopback port with `--port`; an occupied port fails.
`rer install` (or `pnpm install --frozen-lockfile`) installs the pinned
dependencies on their own; there is no install lifecycle hook.

Managed Configure reads `management/integration/deployment-spec.json` and the
digest-bound `rer-setup-managed.json` directly from this repository. The hosted
form offers Resend or SendGrid and requires its verified sender and API key;
local setup sends no external email. After changing build configuration,
migrations or setup fields, run `pnpm build:app && pnpm deployment:spec` and commit
the generated spec, hosted manifest and `rer-project.json`. CI checks for drift
with `pnpm check:deployment-spec` after building.

Stop the app and verify:

```sh
rer dev --stop
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium
rer verify
```

Local verification checks product types, real Worker/D1 flows, browsers, the
command contract, Base copies and DB/FILES movement, within a 200-test seed
budget. Push CI runs these in parallel shards; the slow installer and portable
fresh-clone journeys run on release tags and nightly. See the
[verification guide](docs/verification.md) for the split and timing evidence.
The isolated Docker runner described in
[authoring](authoring/README.md) has a separate operational acceptance path.
No provider credentials are needed for local use.

## Reset and move data

In Settings → **Export your installation**, choose **Prepare archive**, wait
until it is verified, then **Download verified archive**. The `.rer` download uses
the same format as `rer export`; keep your source checkout separately. See
[installation archives](docs/installation-archives.md) for restoring a download.

For the command-line path, stop dev/preview first. Keep the archive outside the
reset inventory:

```sh
rer export --output exports/workspace.rer
rer reset --yes
rer import --input exports/workspace.rer --yes
rer dev
```

`rer dev` recreates local configuration and the local owner after import; no
`answers.json` is needed. To choose an owner email instead, run
`rer setup --owner-email you@example.com` before `rer dev`.

Import requires an empty destination and explicit confirmation. DB business
cells, including recomputed generated columns, and FILES bytes/metadata transfer.
Credentials, sessions, outbox and private settings do not. Imported definitions
and effects are held or disabled until separately approved. See
[installation archives](docs/installation-archives.md) for the exact policy.
Reset removes only inventoried local data, settings, owner, outbox and drafts;
source, dependencies, exports and deployment receipts survive.

## Build and host

Managed hosting sends sign-in and automation email through Run Edit Run; no
mail provider account or API key is needed. Free and Assisted hosting use your
Cloudflare account and Resend or SendGrid for email. Before
deploying, create an owner-only file outside this checkout, following the
[complete hosting instructions](docs/installation.md#host-it-online). Set
`OWNER_EMAIL` to an address you can receive mail at, and supply `MAIL_PROVIDER`,
`MAIL_FROM` and `MAIL_PROVIDER_API_KEY`. Deploy does not ask setup questions.
Always pass this file: otherwise a new deployment may copy the local trial owner,
`owner@run-cradle.test`, which cannot receive sign-in email.

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --dry-run
rer deploy --environment production --env-file "$HOME/cradle-production.env"
```

Dry-run builds and validates locally without provider calls. Deployment creates the
resources, applies migrations, uploads the app and checks health, then claims the
hosted owner. Open `/signin` on the hosted URL and use the emailed link.
A deployment must complete owner claim before sign-in works. If deploy reports an
incomplete owner claim, resolve the reported cause and complete deployment first.
Repeat deployment keeps the existing owner and secrets; changing `OWNER_EMAIL`
in the file alone does not replace that owner.
A push to public main redeploys the marketing site; it does not deploy your app.

To update, preserve customisations, merge source updates, run `rer install` and
`rer verify`, then deploy with the same environment and private file. Keep
`.rer/deploy` records for updates and removal. To delete the hosted
installation **and its data**, first keep any exports you need, then run:

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --remove --yes
```

`rer deploy --remove --yes` uses production by default. Rer removes the resources
listed in that environment's deployment record and checks that they are gone.

For a local source export, run
`rer release --repo . --output ../cradle-export --clean-history`.
Release never pushes or deploys. Use `describe` for commands and flags, `doctor`
for local prerequisites, and `check --profile first-party` for the read-only
contract check before dependencies or configuration exist. Before the first
`rer dev` (including after reset/import), `doctor` can exit 3 for local inputs
that `rer dev` will create; this alone does not mean an imported archive failed.

[CONTRACT.md](CONTRACT.md) records product guarantees; [BASELINE.md](BASELINE.md)
records security and operational requirements. [HANDOVER.md](HANDOVER.md) states
verification boundaries. Hosted management, live provider delivery and owner
account commissioning require their own actual installation proof.
