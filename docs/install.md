# Install Cradle

Cradle runs on your own computer first. Rer installs the pinned Node and pnpm
for you; neither needs a separate install or a particular version beforehand.

## Run it on your computer

```sh
npm install -g @runeditrun/rer
git clone https://github.com/just-every/run-cradle.git cradle
cd cradle && rer dev
```

The first `rer dev` installs the dependencies, creates a local owner, applies
migrations and starts the app. Open the `RER_OPEN` address it prints. The browser
lands signed in as you. Treat that address as a password: it carries this copy's
development key. Finish your workspace details at `/setup`; you can change them
later in Settings.

Local `rer setup` is optional after zero-setup `rer dev`. To choose your own owner
details before the first launch, use the private answers file described in the
[README](../README.md#run-it-on-your-computer).

No email is sent on your computer. `rer dev --login` signs in through the local
development outbox instead: open the address it prints, choose the newest message
and confirm.

Stop the app with `rer dev --stop`.

## Move or reset your data

Export before you reset anything you want to keep:

```sh
rer export --output exports/workspace.rer
rer reset --yes
rer import --input exports/workspace.rer --yes
```

Import needs an empty installation and your confirmation. [Installation archives](installation-archives.md) explains what moves and what you approve again.

## Host it online

```sh
rer build
rer deploy --dry-run
```

The dry run checks everything without contacting any provider. Publishing uses your own Cloudflare account and a hosted email provider; the setup questions name each setting it needs. Use `rer deploy --environment production` when authorized. Set `OWNER_EMAIL` to the hosted owner’s email in your private deployment configuration. Rer automatically claims that owner after health verification; open `/signin` and sign in using the emailed link. There is no manual setup-token step. Repeat deployment keeps the owner. A public-main push redeploys the marketing site, not your installation.

To update, merge source updates while preserving customisations, then run `rer install`, `rer verify` and the authorized deploy command. To delete the hosted installation and its data, run `rer deploy --environment production --remove --yes`; only the resources in the deployment record are removed and read back as gone.
