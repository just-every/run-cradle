# Cradle owner agent guide

## Run it locally

Install Node 22 or later before installing the package-pinned rer 0.2.38
(`npm install -g @runeditrun/rer@0.2.38`). Rer then provisions this project’s
pinned Node 22.20.0 and pnpm 10.12.4. See the README for platform prerequisites
and the alternative installer. Start a checkout through these commands:

```sh
rer dev
rer dev --stop
rer verify
rer export --output exports/workspace.rer
rer reset --yes
rer import --input exports/workspace.rer --yes
rer deploy --dry-run
rer describe
```

`rer dev` installs dependencies and prepares the local owner automatically; no
answers file is needed, including after reset/import. Optional
`rer setup --owner-email you@example.com` chooses an owner email before launch;
`--answers` accepts an owner-only (0600) JSON file with manifest answers. See
README.md. `dev` opens signed in: open the `RER_OPEN` URL it
prints on this computer (it carries this checkout's dev key, so treat it as a
credential). Use `rer dev --as` to switch between the owner, signed out and the personas
`admin@dev.localhost` and `member@dev.localhost`; `dev --as PERSONA` starts as one of
them or `signed-out`. `dev --login` aliases automatic owner sign-in; open its
`RER_OPEN` URL. Finish
first-run details at `/setup`. Stop serving
with `rer dev --stop` before verify, reset or data movement. Export
before resetting data you want to keep. Deploy without `--dry-run` only when the
owner explicitly requests it and supplies the declared account configuration.

Owners may edit every tracked product input. Preserve business data, applied migration bytes, current authority and private configuration. Read CONTRACT.md and BASELINE.md before changing behavior. Verify the actual resulting flows. The public source is https://github.com/just-every/run-cradle.
