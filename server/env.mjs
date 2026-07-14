import fs from "node:fs";
import path from "node:path";

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadEnvironment(options = {}) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const explicitPath = process.env.LABELGUARD_ENV_FILE;
  const candidates = explicitPath
    ? [explicitPath]
    : [path.join(projectRoot, ".env.local"), path.join(projectRoot, ".env")];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const content = fs.readFileSync(candidate, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = unquote(trimmed.slice(separator + 1));
      if (!process.env[key]) process.env[key] = value;
    }
    return { loaded: true, path: candidate };
  }

  return { loaded: false, path: null };
}

export function getAiConfig() {
  const requestedMode = String(process.env.LABELGUARD_AI_MODE ?? "mock").toLowerCase();
  const remoteReady = Boolean(
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_BASE_URL &&
    process.env.OPENAI_MODEL,
  );
  return {
    mode: requestedMode === "remote" && remoteReady ? "remote" : "mock",
    requestedMode,
    remoteReady,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  };
}
