# Install Cradle

Cradle runs on your own computer first: macOS, Linux or Windows with WSL2.
Git is required; rer brings Node and pnpm. It provisions this project’s pinned
Node 22.20.0 and pnpm 10.12.4.

## Run it on your computer

One line installs rer, clones Cradle and starts it. The
checkout runs Cradle's pinned rer 0.2.68:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-cradle
```

Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-cradle` does the same. If the installer prints a line that puts `rer` on your PATH, run that line too. To set Cradle up without starting it, use `setup` in place of `dev`.

To start it again later, run the same line from the same folder, or `cd run-cradle && rer dev`. The first `rer dev` installs the dependencies, creates a local owner, applies
migrations and starts the app. Open the `RER_OPEN` address it prints. The browser
lands signed in as you. Treat that address as a password: it carries this copy's
development key. Finish your workspace details at `/setup`; you can change them
later in Settings.

Local `rer setup` is optional after zero-setup `rer dev`. To choose your own owner
details before the first launch, use the private answers file described in the
[README](../README.md#run-it-on-your-computer).

No email is sent on your computer. `rer dev --login` is an alias for automatic
owner sign-in; open its `RER_OPEN` URL too.

Stop the app with `rer dev --stop`.

## Move or reset your data

Stop dev/preview first. Export before you reset anything you want to keep:

```sh
rer export --output exports/workspace.rer
rer reset --yes
rer import --input exports/workspace.rer --yes
rer dev
```

`rer dev` recreates local configuration and the local owner; no answers file is
needed. To choose an owner email, run `rer setup --owner-email you@example.com`
before starting dev. `rer doctor` can report missing local inputs before dev has
created them, including after reset/import.

Import needs an empty installation and your confirmation. [Installation archives](installation-archives.md) explains what moves and what you approve again.

## Host it online

**Or let Run Edit Run host it.** [Run Edit Run](https://app.runeditrun.com/?product=cradle&plan=assisted) can set Cradle up on your own Cloudflare account and keep it updated; sign-ups are by request for now.

To do it yourself, follow the [hosting instructions](installation.md#host-it-online) to create a
private configuration file (mode 0600) with your Cloudflare credentials, receiving
owner email and email provider settings. Deploy does not ask setup questions.
Always set `OWNER_EMAIL` explicitly: the local trial address `owner@run-cradle.test`
cannot receive mail.

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --dry-run
rer deploy --environment production --env-file "$HOME/cradle-production.env"
```

Dry-run builds and validates locally without provider calls. A healthy deployment
claims the owner automatically. After deployment completes, open `/signin` on
its hosted URL and confirm the emailed link. A failed owner claim must be resolved
by completing deployment before sign-in can work.
Repeat deployment keeps the existing owner and secrets. A public-main push
redeploys the marketing site, not your installation.

To update, preserve customisations, merge source updates, run `rer install` and
`rer verify`, then deploy with the same environment and private file. Keep the
`.rer/deploy` records. To delete the hosted installation **and its data**, save
any exports you need first, then run:

```sh
rer deploy --environment production --env-file "$HOME/cradle-production.env" --remove --yes
```

`rer deploy --remove --yes` defaults to production. Rer removes only the resources
listed in that environment's deployment record and checks that they are gone.
