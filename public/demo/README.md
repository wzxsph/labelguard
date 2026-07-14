# LabelGuard public demo fixture

- Nature: fully synthetic QA fixture; no road-collected or personal data.
- Scope: three SVG frames, eight targets and deterministic rule inputs.
- Ground truth: not asserted. Labels and model candidates exist only to exercise the review contract.
- License: CC0-1.0; see [LICENSE](LICENSE).
- Integrity: `batch.contentDigest` is SHA-256 over canonical JSON after removing the digest field itself; the public-data test verifies it.
- Limitation: the fixture demonstrates workflow behavior, not perception-model, supplier or road-safety performance.

Production integrations must replace this fixture with governed dataset artifacts, calibrated sensor parsers and customer-specific annotation schemas.
