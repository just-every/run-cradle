# Local Worker

Start through the commands in [Run it on your computer](../README.md#run-it-on-your-computer):
`rer install`, `setup`, then `dev`. Sign in through the development
outbox printed by dev. Finish first-run details at `/setup`.

Dev serves current source with HMR. `rer preview` builds and serves
fixed production output. Both use the canonical `.wrangler/state/v3` database and
FILES storage. Stop the current mode with `dev --stop` or `preview --stop` before
changing modes, verifying, resetting or moving data. Saved private settings select
the loopback origin; an explicit occupied port is refused.

`rer verify` runs native HTTP and browser suites against disposable,
migrated D1/FILES directories. Their compiled-Worker harness uses actual emitted
modules and bindings in Miniflare/workerd, with private test bindings in memory.
The shared harness lives under `tests/helpers`; it serves no invented responses.
Each suite stops its Worker and browser before removing its temporary data.
