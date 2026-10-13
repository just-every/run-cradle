# Install Cradle

Cradle runs on your own computer first. You need Node 22.20.0 and pnpm 10.12.4, and a copy of the Cradle source.

## Run it on your computer

1. Install the pinned dependencies from the source folder:

   ```sh
   rer install
   ```

2. Create a private `answers.json` file (readable only by you) with your email, name and workspace details:

   ```json
   {"OWNER_EMAIL":"owner@example.com","OWNER_NAME":"Owner","WORKSPACE_NAME":"My records","WORKSPACE_TIMEZONE":"Australia/Brisbane","WORKSPACE_CURRENCY":"AUD"}
   ```

3. Set up the workspace, then start it:

   ```sh
   rer setup --answers answers.json --non-interactive
   rer dev
   ```

4. Open the `RER_OPEN` address it prints. The browser lands signed in as you. Treat that address as a password: it carries this copy's development key.

5. Finish your workspace details at `/setup`. You can change them later in Settings.

No email is sent on your computer. `dev --login` signs in through the local development outbox instead: open the address it prints, choose the newest message and confirm.

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

The dry run checks everything without contacting any provider. Publishing uses your own Cloudflare account and a hosted email provider; the setup questions name each setting it needs. A push never deploys on its own.
