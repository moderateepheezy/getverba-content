export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // --- Allow only GET / HEAD / OPTIONS ---
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    // --- Health check ---
    if (url.pathname === "/health") {
      return json({ ok: true, service: "getverba-content-api" });
    }

    // --- Meta endpoints ---
    if (url.pathname === "/manifest") {
      return serveKey(request, env, "meta/manifest.json");
    }

    if (url.pathname === "/release") {
      return serveKey(request, env, "meta/release.json");
    }

    // --- Active catalog redirect ---
    if (url.pathname === "/active") {
      const manifest = await getJsonObject(env, "meta/manifest.json");
      if (!manifest) {
        return new Response("Manifest not found", {
          status: 404,
          headers: corsHeaders(),
        });
      }

      const activeWorkspace = manifest.activeWorkspace || "de";
      const catalogPath = manifest.workspaces?.[activeWorkspace];

      if (!catalogPath) {
        return new Response("Active workspace missing in manifest", {
          status: 500,
          headers: corsHeaders(),
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          Location: catalogPath,
          ...corsHeaders(),
        },
      });
    }

    // --- Passthrough for /v1/** content ---
    const key = url.pathname.replace(/^\/+/, "");
    if (!key) {
      return new Response("Not Found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    return serveKey(request, env, key);
  },
};

// =======================
// Helpers
// =======================

async function serveKey(request, env, key) {
  try {
    // ✅ CORRECT binding name
    const bucket = env.CONTENT_BUCKET;

    const object = await bucket.get(key);
    if (!object) {
      return new Response("Not Found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    const contentType =
      object.httpMetadata?.contentType || guessContentType(key);

    const isMeta = key.startsWith("meta/");
    const isV1 = key.startsWith("v1/");

    const cacheControl =
      object.httpMetadata?.cacheControl ||
      (isMeta
        ? "public, max-age=30, stale-while-revalidate=300"
        : isV1
        ? "public, max-age=300, stale-while-revalidate=86400"
        : "public, max-age=60");

    // --- Proper 304 support ---
    const clientETag = request.headers.get("If-None-Match");
    if (clientETag && object.etag) {
      const cleanClient = clientETag.replace(/"/g, "");
      const cleanObject = object.etag.replace(/"/g, "");

      if (cleanClient === cleanObject) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: `"${cleanObject}"`,
            "Cache-Control": cacheControl,
            ...corsHeaders(),
          },
        });
      }
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", cacheControl);
    if (object.etag) headers.set("ETag", `"${object.etag}"`);

    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }

    return new Response(object.body, { headers });
  } catch (err) {
    console.error("serveKey error:", err);
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

async function getJsonObject(env, key) {
  try {
    const bucket = env.CONTENT_BUCKET;
    const object = await bucket.get(key);
    if (!object) return null;
    return JSON.parse(await object.text());
  } catch (e) {
    console.error("JSON parse error:", e);
    return null;
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function guessContentType(key) {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
  };
}