# Getting started

Cradle runs on your own computer first. Open a terminal (on a Mac, Terminal in Applications → Utilities; on Windows, your WSL2 distribution), copy this line into it and press Enter:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-cradle
```

Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-cradle` does the same.

The line installs `rer`, the Run Edit Run command, clones Cradle into a `run-cradle` folder, installs everything, creates a local owner, applies migrations and starts the app. Open the `RER_OPEN` address it prints, on the same computer: the browser lands signed in as you, so treat that address as a password. Finish your workspace details at `/setup`. This free copy runs only on your computer: it sends no email, and nobody else can open it.

If the installer prints a line that puts `rer` on your PATH, run that line too. To start Cradle again later, run the same line from the same folder, or `cd run-cradle && rer dev`. `rer dev --stop` stops it.

Next: [Install](install.md) covers moving or resetting your data and hosting Cradle online.
