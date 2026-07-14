import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const dataPath = path.join(projectRoot, "public", "demo", "labelguard-batch-v1.json");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

test("demo batch is explicitly public, synthetic and self-contained", () => {
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.equal(payload.batch.publicRelease, true);
  assert.equal(payload.batch.dataNature, "synthetic");
  assert.equal(payload.batch.license, "CC0-1.0");
  assert.match(payload.batch.notice, /合成/);

  for (const frame of payload.frames) {
    const imagePath = path.join(projectRoot, "public", frame.image);
    assert.equal(fs.existsSync(imagePath), true, frame.image + " should exist");
  }
});

test("demo fixture has a verifiable digest and explicit license files", () => {
  const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const expected = payload.batch.contentDigest;
  delete payload.batch.contentDigest;
  const actual = "sha256:" + crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");

  assert.equal(payload.batch.digestMethod, "sha256-canonical-json-without-batch.contentDigest");
  assert.equal(actual, expected);
  assert.match(fs.readFileSync(path.join(projectRoot, "LICENSE"), "utf8"), /^MIT License/);
  assert.match(
    fs.readFileSync(path.join(projectRoot, "public", "demo", "LICENSE"), "utf8"),
    /SPDX-License-Identifier: CC0-1.0/,
  );
});
