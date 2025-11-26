// netlify/functions/proxy.js

import fs from "fs";
import url from "url";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ---------- SAFE __dirname / __filename ----------
const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

// ---------- Load catalog.json ----------
let catalog = {};
const catalogPath = `${_dirname}/catalog.json`;

try {
  const data = fs.readFileSync(catalogPath, "utf-8");
  catalog = JSON.parse(data);
  console.log("📦 catalog loaded");
} catch (err) {
  console.error("⚠ catalog load error:", err.message);
  catalog = { error: "Catalog missing or invalid JSON" };
}

// Allowed Origins
const allowedOrigins = [
  "*",
  "https://tonapi.netlify.app",
  "http://localhost:4321",
  "http://localhost:8888",
  "http://127.0.0.1:4321",
  "http://127.0.0.1:8888",
];

// ---------- CORS ----------
function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":
      allowedOrigins.includes(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

// ---------- MAIN HANDLER ----------
export async function handler(event) {
  const parsed = url.parse(event.rawUrl, true);
  const pathname = parsed.pathname;
  const search = parsed.search || "";
  const origin = event.headers.origin || "";
  const cors = getCorsHeaders(origin);

  // OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // catalog route
  const clean = pathname
    .replace("/.netlify/functions/proxy", "")
    .replace("/proxy", "")
    .replace(/\/+$/, "");

  if (clean === "/v2/dapp/catalog") {
    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify(catalog, null, 2),
    };
  }

  if (clean === "/robots.txt") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // real proxy target
  const proxyPath = pathname
    .replace("/.netlify/functions/proxy", "")
    .replace("/proxy", "");

  const targetUrl = `https://api.mytonwallet.org${proxyPath}${search}`;
  console.log("➡ forwarding:", targetUrl);

  try {
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-App-Env": "Production",
      },
      body: ["GET", "HEAD"].includes(event.httpMethod)
        ? undefined
        : event.body,
    });

    return {
      statusCode: response.status,
      headers: {
        ...cors,
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      },
      body: await response.text(),
    };
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
}