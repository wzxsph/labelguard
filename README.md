# LabelGuard

Evidence-first annotation QA and release gate for autonomous-driving datasets.

![LabelGuard target-level evidence review at 1440×900](docs/assets/labelguard-1440x900.png)

## What it does

LabelGuard runs one complete, auditable workflow:

1. load a versioned public demo annotation batch;
2. run deterministic schema, geometry, projection, sensor-support and temporal checks;
3. attach every risk to a concrete frame, target, track and evidence ID;
4. review the actual target association with label, 3D projection and model-candidate overlays;
5. route a human decision to release candidate, expert review or annotation rework;
6. produce a deterministic QA decision manifest and label-version release status.

The model candidate is a second opinion, not ground truth. The AI assistant only organizes structured evidence and review steps; it cannot decide label truth or change release state.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:4175.

Production-style local server:

```bash
npm run build
npm run serve
```

Open http://127.0.0.1:4176.

## Verification

```bash
npm run check
```

The checks cover syntax, deterministic evidence generation, target-level rule separation, closed evidence citations, fixture licensing, decision routing, release blocking, reproducible manifest hashing and a production build.

## AI modes

Default mode is deterministic Mock. It is public, reproducible and requires no credential.

The optional remote mode is OpenAI-compatible and server-only:

```bash
cp .env.example .env.local
# Edit .env.local locally, then set LABELGUARD_AI_MODE=remote.
npm run serve
```

The local environment file may define `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL`. None of these variables use the `VITE_` prefix, and the status endpoint never returns their values. If remote mode is requested without a complete server configuration, the assistant endpoint fails explicitly. The browser then displays a notice and uses a clearly labelled deterministic client Mock; that fallback is not counted as a successful remote-model run.

Run the credential-safe live smoke:

```bash
npm run test:llm
```

The smoke reports only model name, target ID, citation counts and schema result; it does not save raw model output or credentials.

## Demo data disclosure

[`public/demo/labelguard-batch-v1.json`](public/demo/labelguard-batch-v1.json) and its three SVG frames are a self-contained synthetic fixture released under [CC0-1.0](public/demo/LICENSE). They are designed to exercise QA behavior and do not represent road-collected GT, a production perception model, or vehicle safety performance.

## Project map

- `src/domain.mjs` — deterministic checks, decisions and release manifest
- `src/assistant.mjs` — closed-evidence Mock and response validator
- `src/app.mjs` — browser workflow
- `server/` — static server and optional remote AI endpoint
- `public/demo/` — public synthetic batch and frame assets
- `tests/` — deterministic domain and public-asset tests
- `docs/product-solution.md` — public product definition

## License

Source code is available under the [MIT License](LICENSE). The public demo fixture and SVG frames are separately dedicated under [CC0-1.0](public/demo/LICENSE).
