# Cradle source runner

This service executes ordinary app-owned source in an isolated Linux container. It is a separate privileged deployment target; it is never loaded with `eval` in the production Worker. Node VM contexts are not supported isolation.

## Supported target

Node 22.13 or newer on the runner host, a Docker-compatible CLI, and an image containing Node pinned by `@sha256`. Default container runtime is gVisor `runsc`. `runc` requires explicit `CRADLE_DEDICATED_VM=true` and a dedicated Linux VM with no home/repository mounts or production credentials. Kata can be selected explicitly. The tested local target is a temporary dedicated Lima Linux VM; that does not establish hosted deployment.

Set `CRADLE_RUNNER_STATE` to a private host directory, `CRADLE_RUNNER_JOBS` to the only directory shared into the VM, `CRADLE_RUNNER_TOKEN` and the separate `CRADLE_DEPLOY_TOKEN` to distinct service credentials, `CRADLE_RUNNER_SIGNING_KEY` to an Ed25519 PKCS8 PEM file outside shared directories, `CRADLE_RUNNER_IMAGE` to the pinned image, and `CRADLE_ARTIFACT_ORIGINS` to exact HTTPS origins. `DOCKER_HOST` or `DOCKER_CONTEXT` selects the explicit engine. `CRADLE_CONTAINER_RUNTIME` defaults to `runsc`. Start `node authoring/runner/server.mjs`; localhost port defaults to 4216. A production reverse proxy must provide TLS and authenticated ingress; there is no implicit public exposure or provider provisioning.

Jobs have no network interface, capabilities, elevated privileges, production DB/R2/provider credentials, writable source or writable host mount. Output is a 16 MiB tmpfs; serialized artifacts cap decoded contents at 12 MiB. PIDs, memory, CPU bandwidth, process CPU, file sizes, open descriptors, logs and wall time are bounded. With one CPU, wall time is conservatively bounded by the smaller requested wall/CPU seconds to bound aggregate CPU across child processes. A missing engine/image or unsupported nonempty network allowlist fails visibly. Egress must use separately admitted host actions.

## Source format

Source and output artifacts are canonical JSON `{version:1,files:[{path,content}]}`, with base64 bytes, ordinary relative paths, no symlinks, hardlinks, archive traversal or duplicate paths. `cradle-build.json` contains argv arrays under `commands.build`, `commands.evaluate`, `commands.optimize` or `commands.invoke` as applicable. Source is `/workspace`, authorized input is `/input/input.json`, and output is `/output`. Dependencies must be included in the exact snapshot or predeclared pinned image; network installation is denied.

Build writes a self-contained working screen to `public/index.html`; the host serves it in an opaque-origin, no-egress script sandbox. Evaluate writes actual candidate outputs; an independent checker source runs in a separate job and writes `evaluation.json`. Candidate-authored passing assertions alone never authorize adoption. Invoke writes `response.json` with HTTP `status` and string `body`; the application-owned code handles the authorized request/snapshot. Returned effect proposals go through the host's registered action policy/admission. An app may own any source; this protocol is an isolation boundary, not a finite template catalogue.

## API and custody

Every request carries `X-Cradle-Timestamp` (Unix milliseconds), a fresh 24–100 character `X-Cradle-Nonce`, and `X-Cradle-Signature`: HMAC-SHA256 of `method + '\n' + path + '\n' + timestamp + '\n' + nonce + '\n' + SHA256(body)`. Requests expire in 60 seconds; nonces persist through restart. Deploy routes require the separate deployment credential.

- `PUT /artifacts/:sha256`: bounded authenticated immutable upload. Returns a signed `runner:sha256` local reference. Remote references use HTTPS, configured exact origins, pinned public DNS answers, no redirects, byte limits and hash verification.
- `POST /jobs`: source/input references, job identity/kind, denied-by-default network list, CPU/memory/time bounds and output schema hash.
- `GET /jobs/:id`, `POST /jobs/:id/cancel`: durable status and cancellation.
- `GET /artifacts/:sha256`: authenticated exact bytes; caller checks digest against signed result.
- `POST /deployments`: stage a successfully built exact source/artifact pair. `POST /deployments/:id/probe` runs the actual source before activation. `activate`, `invoke`, `stop` and signed `GET /deployments/:id` support private runtime custody/readback. The app only routes to a deployment after atomic authority/schema/source/policy/action admission switches its live pointer.

Results use Ed25519 over canonical sorted-key JSON. Jobs, replay nonces and audit persist in SQLite WAL. At restart, running containers are removed and jobs become explicitly interrupted; completed work is not guessed. Cancellation cannot overwrite a completed result. Execution is serial; concurrent deployment invocations fail capacity checks. Storage rejects new work at 1,000 jobs or 256 MiB artifact capacity, requiring deliberate archival rather than deleting evidence. No automatic semantic/model retry occurs.

## Verification

`node --test tests/construction-source.mjs tests/releases-admission.mjs` checks custody/evaluation gates and actual SQL admission. Set `CRADLE_TEST_DOCKER_HOST` and `CRADLE_TEST_IMAGE`, then run `node --test tests/authoring-runner.mjs` for actual isolation/source/build/deployment and signed HTTP tests. Without those variables, the live cases are explicitly skipped and do not establish runtime acceptance. Test providers/datasets are test-only; no authentic model, customer/history, hosted release or held-out third-app result is claimed.

`POST /artifacts/:sha256/erase` requires the distinct deployment credential. It tombstones known content, cancels dependent jobs, removes retained successful results/logs and stops dependent deployments. Reuploading erased bytes is rejected. Construction erasure admits dataset redaction and remote cleanup intents atomically, then advances the runner cleanup and verifies no pending copies. A database redaction alone is not erasure completion.

The local host admits at most 1,000 jobs/deployments, 10,000 artifact files, 256 MiB artifact bytes and 10,000 live replay nonces. After 10,000 erasure tombstones it rejects new uploads; deliberate archive/lifecycle management is required. These are explicit small-installation bounds, not a high-availability hosting claim.

The full owned test command is `node --test --test-concurrency=1 tests/construction-*.mjs tests/releases-*.mjs tests/authoring-*.mjs tests/improvements-*.mjs` with the two explicit runtime environment variables above. Historical/model providers inside tests are synthetic fixtures; the runner, signed HTTP transport, executed source, independent checker, SQLite migration and recovery mechanics run for real when the runtime variables are supplied.
