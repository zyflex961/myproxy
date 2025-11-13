import http from "http";
import https from "https";
import url from "url";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 4355;

// ✅ Read catalog.json manually
const catalogPath = `${__dirname}/catalog.json`;
let catalog = {};

try {
  const data = fs.readFileSync(catalogPath, "utf-8");
  catalog = JSON.parse(data);
  console.log("📦 catalog.json loaded successfully");
} catch (err) {
  console.error("⚠️ Failed to load catalog.json:", err.message);
  catalog = { error: "Catalog file missing or invalid JSON" };
}
// 🔄 Watch for file changes and auto reload
fs.watchFile(catalogPath, () => {
  try {
    const data = fs.readFileSync(catalogPath, "utf-8");
    catalog = JSON.parse(data);
    console.log("🔄 catalog.json reloaded");
  } catch (err) {
    console.error("⚠️ catalog reload failed:", err.message);
  }
});

// Unique Error Logging
const logFilePath = `${__dirname}/error.log`;
function logUniqueError(method, path, statusCode, errorMsg) {
  try {
    const entry = `[${new Date().toISOString()}] ${method}: ${path} ❌ ${
      statusCode || "NO_CODE"
    } - ${errorMsg}\n`;
    let existingLogs = "";
    if (fs.existsSync(logFilePath)) {
      existingLogs = fs.readFileSync(logFilePath, "utf-8");
    }
    if (!existingLogs.includes(`${method}: ${path} ❌ ${statusCode}`)) {
      fs.appendFileSync(logFilePath, entry);
    }
  } catch (err) {
    console.error("⚠️ Failed to write log:", err.message);
  }
}
// Allowed Origins
const allowedOrigins = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4323",
  "http://127.0.0.1:4323",
  "http://localhost:4355",
  "http://127.0.0.1:4355",
  "https://dpsmult.netlify.app",
  "https://walletdpstg.netlify.app",
  "https://multisend-livid.vercel.app",
  "https://walletdps.vercel.app",
  "https://walletdps.netlify.app",
  "https://walletdps.netlify.com",
];
// Catalog Handler
function handleCatalogRequest(req, res) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "x-app-env, X-App-Env, X-App-Version, X-Requested-With, Content-Type, Authorization, Origin, Accept, X-App-Clientid, x-auth-token, X-Auth-Token, Referer, User-Agent, Cache-Control, Pragma",
    "Access-Control-Max-Age": "86400",
  };

  try {
    res.writeHead(200, {
      ...corsHeaders,
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(catalog, null, 2));
    console.log(`🟢 Catalog served: ${req.method} ${req.url}`);
  } catch (err) {

  }
}
//  creat server for node.js 
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const incomingPath = parsedUrl.pathname.toLowerCase();
  const origin = req.headers.origin || "";
  const allowOrigin = allowedOrigins.find((o) => origin.startsWith(o)) || "*";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "x-app-env, X-App-Env, X-App-Version, X-Requested-With, Content-Type, Authorization, Origin, Accept, X-App-Clientid, x-auth-token, X-Auth-Token, Referer, User-Agent, Cache-Control, Pragma",
    "Access-Control-Max-Age": "86400",
  };

  // Handle OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    return res.end("");
  }

  // ✅ Serve local catalog for /v2/dapp/catalog (supports /proxy too)
  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
  if (
    normalizedPath === "/v2/dapp/catalog" ||
    normalizedPath === "/proxy/v2/dapp/catalog"
  ) {
    return handleCatalogRequest(req, res);
  }

  // Handle  Request  for PATCH
  if (req.method === "PATCH") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        console.log("PATCH received:", parsedBody);

        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            ok: true,
            message: "PATCH handled successfully",
            received: parsedBody,
          })
        );
      } catch (err) {
        console.error("🔴 Invalid PATCH body:", err.message);
        logUniqueError(req.method, req.url, 400, err.message);
        res.writeHead(400, corsHeaders);
        res.end(
          JSON.stringify({ error: "Invalid PATCH body", details: err.message })
        );
      }
    });
    return;
  }

  // Ignore robots.txt requests (prevent 404 logging)
  if (incomingPath === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("");
  }

  //  👇 Proxy logic for other requests
  const proxyPath = parsedUrl.pathname.replace("/proxy", "");
  const query = parsedUrl.search || "";
  const targetUrl = `https://api.mytonwallet.org${proxyPath}${query}`;

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          "X-App-Env": req.headers["x-app-env"] || "Production",
        },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });

      const data = await response.text();
      res.writeHead(response.status, {
        ...corsHeaders,
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      });
      res.end(data);

      if (response.status >= 400) {
        console.error(`🔴 ${req.method}: ${targetUrl} ❌ ${response.status}`);
        logUniqueError(
          req.method,
          targetUrl,
          response.status,
          "Proxy Response Error"
        );
      } else {
        console.log(`🟢 ${req.method}: ${targetUrl} ✅ ${response.status}`);
      }
    } catch (error) {
      console.error(`🔴 ${req.method}: ${targetUrl} ❌ ${error.message}`);
      logUniqueError(req.method, targetUrl, 500, error.message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/proxy`);
});
