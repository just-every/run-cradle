# Cradle owner agent guide

## Run it locally

Use Node 22.20.0 and pnpm 10.12.4. Start a checkout through these commands:

```sh
node scripts/rer.mjs install
node scripts/rer.mjs setup --answers answers.json --non-interactive
node scripts/rer.mjs dev
node scripts/rer.mjs verify
node scripts/rer.mjs reset --yes
node scripts/rer.mjs export --output exports/workspace.rer
node scripts/rer.mjs import --input exports/workspace.rer --yes
node scripts/rer.mjs deploy --dry-run
node scripts/rer.mjs describe
```

`answers.json` is an owner-only (0600) JSON file with `OWNER_EMAIL` and optional
manifest answers; see README.md. `dev` opens signed in: open the `RER_OPEN` URL it
prints on this computer (it carries this checkout's dev key, so treat it as a
credential). A dev badge switches between the owner, signed out and the personas
`admin@dev.localhost` and `member@dev.localhost`; `dev --as PERSONA` starts as one of
them or `signed-out`. `dev --login` turns that off and uses the ordinary outbox: open
the `RER_SIGN_IN` URL, choose the newest sign-in message and confirm it. Finish
first-run details at `/setup`. Stop serving
with `node scripts/rer.mjs dev --stop` before verify, reset or data movement. Export
before resetting data you want to keep. Deploy without `--dry-run` only when the
owner explicitly requests it and supplies the declared account configuration.

Owners may edit every tracked product input. Preserve business data, applied migration bytes, current authority and private configuration. Read CONTRACT.md and BASELINE.md before changing behavior. Verify the actual resulting flows. The public source is https://github.com/just-every/cradle.
