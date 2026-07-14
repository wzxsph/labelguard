import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAiConfig, loadEnvironment } from "./env.mjs";
import { runAssistant } from "./ai.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const distRoot = path.join(projectRoot, "dist");
loadEnvironment({ projectRoot });

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(distRoot, "." + requested);
  if (!resolved.startsWith(distRoot + path.sep) && resolved !== path.join(distRoot, "index.html")) {
    return null;
  }
  return resolved;
}

async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const config = getAiConfig();

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, {
      service: "labelguard-assistant",
      mode: config.mode,
      requestedMode: config.requestedMode,
      remoteReady: config.remoteReady,
      transport: config.mode === "remote" ? "openai-compatible-server" : "deterministic-server",
      modelConfigured: config.mode === "remote",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/assistant") {
    try {
      let body;
      try {
        body = await readJson(request);
      } catch {
        sendJson(response, 400, { error: "INVALID_JSON" });
        return;
      }
      const target = body?.target;
      if (!target?.id || !Array.isArray(target.evidence)) {
        sendJson(response, 422, { error: "INVALID_TARGET_EVIDENCE" });
        return;
      }
      if (config.requestedMode === "remote" && !config.remoteReady) {
        sendJson(response, 503, { error: "REMOTE_ASSISTANT_NOT_CONFIGURED" });
        return;
      }
      const result = await runAssistant(target, config);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 502, {
        error: config.mode === "remote" ? "REMOTE_ASSISTANT_FAILED" : "ASSISTANT_FAILED",
        code: error.code ?? "ASSISTANT_RUNTIME_ERROR",
      });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  if (!fs.existsSync(distRoot)) {
    response.writeHead(503, {
      ...SECURITY_HEADERS,
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Build not found. Run npm run build first.");
    return;
  }

  let filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    response.writeHead(403, SECURITY_HEADERS);
    response.end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distRoot, "index.html");
  }
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(response);
}

const port = Number(process.env.PORT ?? 4176);
const server = http.createServer((request, response) => {
  handler(request, response).catch((error) => {
    sendJson(response, 500, { error: "INTERNAL_ERROR", code: error.code ?? "UNHANDLED_ERROR" });
  });
});

server.listen(port, "127.0.0.1", () => {
  const config = getAiConfig();
  process.stdout.write("LabelGuard server: http://127.0.0.1:" + port + " | AI=" + config.mode + "\n");
});
