# Cradle owner agent guide

## Run it locally

Use Node 22.20.0 and rer 0.2.7. Rer provisions pnpm 10.12.4 automatically. Start a checkout through these commands:

```sh
rer install
rer setup --answers answers.json --non-interactive
rer dev
rer verify
rer reset --yes
rer export --output exports/workspace.rer
rer import --input exports/workspace.rer --yes
rer deploy --dry-run
rer describe
```

`answers.json` is an owner-only (0600) JSON file with `OWNER_EMAIL` and optional
manifest answers; see README.md. `dev` opens signed in: open the `RER_OPEN` URL it
prints on this computer (it carries this checkout's dev key, so treat it as a
credential). A dev badge switches between the owner, signed out and the personas
`admin@dev.localhost` and `member@dev.localhost`; `dev --as PERSONA` starts as one of
them or `signed-out`. `dev --login` turns that off and uses the ordinary outbox: open
the `RER_SIGN_IN` URL, choose the newest sign-in message and confirm it. Finish
first-run details at `/setup`. Stop serving
with `rer dev --stop` before verify, reset or data movement. Export
before resetting data you want to keep. Deploy without `--dry-run` only when the
owner explicitly requests it and supplies the declared account configuration.

Owners may edit every tracked product input. Preserve business data, applied migration bytes, current authority and private configuration. Read CONTRACT.md and BASELINE.md before changing behavior. Verify the actual resulting flows. The public source is https://github.com/just-every/run-cradle.
