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

    // --- List archived manifests ---
    if (url.pathname === "/manifests") {
      return listArchivedManifests(request, env, url);
    }

    // --- Fetch specific archived manifest ---
    const manifestMatch = url.pathname.match(/^\/manifests\/([a-f0-9]{7,40})$/);
    if (manifestMatch) {
      const gitSha = manifestMatch[1];
      return serveArchivedManifest(request, env, gitSha);
    }

    // --- List archived reports ---
    if (url.pathname === "/reports") {
      return listArchivedReports(request, env, url);
    }

    // --- Fetch specific archived report ---
    const reportMatch = url.pathname.match(/^\/reports\/([a-f0-9]{7,40})$/);
    if (reportMatch) {
      const gitSha = reportMatch[1];
      return serveArchivedReport(request, env, gitSha);
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
    let key = url.pathname.replace(/^\/+/, "");
    if (!key) {
      return new Response("Not Found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    // Handle /v1/workspaces/{ws}/drills endpoint (serve index.json)
    // This matches the BE shaping spec: GET /v1/workspaces/{ws}/drills
    const drillsMatch = url.pathname.match(/^\/v1\/workspaces\/([^\/]+)\/drills\/?$/);
    if (drillsMatch) {
      const workspace = drillsMatch[1];
      key = `v1/workspaces/${workspace}/drills/index.json`;
    }

    return serveKey(request, env, key);
  },
};

// =======================
// Helpers
// =======================

/**
 * Normalize ETag for comparison
 * Strips W/ prefix (weak ETag) and surrounding quotes
 */
function normalizeEtag(etag) {
  if (!etag) return null;
  // Remove W/ prefix if present (weak ETag format)
  let normalized = etag.replace(/^W\//i, "");
  // Remove surrounding quotes
  normalized = normalized.replace(/^"|"$/g, "");
  return normalized.trim() || null;
}

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
        ? "public, max-age=300, stale-while-revalidate=300"
        : isV1
        ? "public, max-age=300, stale-while-revalidate=86400"
        : "public, max-age=60");

    // Get server ETag once (try both etag and httpEtag properties)
    const serverEtag = object.etag || object.httpEtag;

    // --- Proper 304 support with normalized ETag comparison ---
    const clientETag = request.headers.get("If-None-Match");
    
    if (clientETag && serverEtag) {
      // Normalize both for comparison (handles W/ prefix and quotes)
      const normalizedClient = normalizeEtag(clientETag);
      const normalizedServer = normalizeEtag(serverEtag);
      
      // If they match, return 304
      if (normalizedClient && normalizedServer && normalizedClient === normalizedServer) {
        const headers = new Headers();
        // Use consistent ETag format (strong ETag with quotes)
        headers.set("ETag", `"${normalizedServer}"`);
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        for (const [k, v] of Object.entries(corsHeaders())) {
          headers.set(k, v);
        }
        
        return new Response(null, {
          status: 304,
          headers,
        });
      }
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", cacheControl);
    // Set ETag with consistent format (strong ETag with quotes)
    if (serverEtag) {
      const normalizedEtag = normalizeEtag(serverEtag);
      headers.set("ETag", `"${normalizedEtag}"`);
    }

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

/**
 * List archived manifests from R2
 * GET /manifests?limit=50&cursor=...
 */
async function listArchivedManifests(request, env, url) {
  try {
    const bucket = env.CONTENT_BUCKET;
    
    // Parse query params
    const limitParam = url.searchParams.get("limit");
    let limit = parseInt(limitParam, 10) || 50;
    limit = Math.min(Math.max(limit, 1), 200); // Clamp between 1-200
    
    const cursor = url.searchParams.get("cursor") || undefined;
    
    // List objects with prefix
    const listResult = await bucket.list({
      prefix: "meta/manifests/",
      limit,
      cursor,
    });
    
    // Map to response format
    const items = listResult.objects
      .filter(obj => obj.key.endsWith(".json"))
      .map(obj => {
        // Extract gitSha from key: meta/manifests/<gitSha>.json
        const match = obj.key.match(/meta\/manifests\/([a-f0-9]+)\.json$/);
        const gitSha = match ? match[1] : obj.key;
        
        return {
          gitSha,
          key: obj.key,
          lastModified: obj.uploaded?.toISOString() || null,
        };
      });
    
    // Sort by lastModified descending (newest first)
    items.sort((a, b) => {
      if (!a.lastModified) return 1;
      if (!b.lastModified) return -1;
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });
    
    const response = {
      items,
      ...(listResult.truncated && listResult.cursor ? { cursor: listResult.cursor } : {}),
    };
    
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }
    
    return new Response(JSON.stringify(response), { headers });
  } catch (err) {
    console.error("listArchivedManifests error:", err);
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

/**
 * Serve a specific archived manifest
 * GET /manifests/:gitSha
 */
async function serveArchivedManifest(request, env, gitSha) {
  // Validate gitSha format (already validated by regex, but double-check)
  if (!/^[a-f0-9]{7,40}$/.test(gitSha)) {
    return new Response(JSON.stringify({ error: "Invalid git SHA format" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
  
  const key = `meta/manifests/${gitSha}.json`;
  
  // Use serveKey but override cache headers for archived manifests (immutable)
  try {
    const bucket = env.CONTENT_BUCKET;
    const object = await bucket.get(key);
    
    if (!object) {
      return new Response(JSON.stringify({ error: "Archived manifest not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    }
    
    const serverEtag = object.etag || object.httpEtag;
    
    // Check If-None-Match for 304
    const clientETag = request.headers.get("If-None-Match");
    if (clientETag && serverEtag) {
      const normalizedClient = normalizeEtag(clientETag);
      const normalizedServer = normalizeEtag(serverEtag);
      
      if (normalizedClient && normalizedServer && normalizedClient === normalizedServer) {
        const headers = new Headers();
        headers.set("ETag", `"${normalizedServer}"`);
        headers.set("Content-Type", "application/json");
        // Archived manifests are immutable
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        for (const [k, v] of Object.entries(corsHeaders())) {
          headers.set(k, v);
        }
        return new Response(null, { status: 304, headers });
      }
    }
    
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    // Archived manifests are immutable - cache for 1 year
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (serverEtag) {
      headers.set("ETag", `"${normalizeEtag(serverEtag)}"`);
    }
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }
    
    return new Response(object.body, { headers });
  } catch (err) {
    console.error("serveArchivedManifest error:", err);
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

/**
 * List archived reports from R2
 * GET /reports?limit=50&cursor=...
 */
async function listArchivedReports(request, env, url) {
  try {
    const bucket = env.CONTENT_BUCKET;
    
    // Parse query params
    const limitParam = url.searchParams.get("limit");
    let limit = parseInt(limitParam, 10) || 50;
    limit = Math.min(Math.max(limit, 1), 200); // Clamp between 1-200
    
    const cursor = url.searchParams.get("cursor") || undefined;
    
    // List objects with prefix
    const listResult = await bucket.list({
      prefix: "meta/reports/",
      limit,
      cursor,
    });
    
    // Map to response format
    const items = listResult.objects
      .filter(obj => obj.key.endsWith(".coherence.json") || obj.key.endsWith(".coherence.md"))
      .map(obj => {
        // Extract gitSha from key: meta/reports/<gitSha>.coherence.{json,md}
        const match = obj.key.match(/meta\/reports\/([a-f0-9]+)\.coherence\.(json|md)$/);
        if (!match) return null;
        
        const gitSha = match[1];
        const format = match[2];
        
        return {
          gitSha,
          format,
          key: obj.key,
          lastModified: obj.uploaded?.toISOString() || null,
        };
      })
      .filter(item => item !== null);
    
    // Group by gitSha
    const reportsBySha = {};
    for (const item of items) {
      if (!reportsBySha[item.gitSha]) {
        reportsBySha[item.gitSha] = {
          gitSha: item.gitSha,
          lastModified: item.lastModified,
          formats: {},
        };
      }
      reportsBySha[item.gitSha].formats[item.format] = {
        key: item.key,
        lastModified: item.lastModified,
      };
    }
    
    // Convert to array and sort by lastModified descending
    const reports = Object.values(reportsBySha);
    reports.sort((a, b) => {
      if (!a.lastModified) return 1;
      if (!b.lastModified) return -1;
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });
    
    const response = {
      reports,
      ...(listResult.truncated && listResult.cursor ? { cursor: listResult.cursor } : {}),
    };
    
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }
    
    return new Response(JSON.stringify(response), { headers });
  } catch (err) {
    console.error("listArchivedReports error:", err);
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

/**
 * Serve a specific archived report
 * GET /reports/:gitSha
 * Returns JSON with URLs to both JSON and Markdown versions
 */
async function serveArchivedReport(request, env, gitSha) {
  // Validate gitSha format
  if (!/^[a-f0-9]{7,40}$/.test(gitSha)) {
    return new Response(JSON.stringify({ error: "Invalid git SHA format" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
  
  const baseUrl = new URL(request.url).origin;
  
  // Check if JSON and MD exist
  const jsonKey = `meta/reports/${gitSha}.coherence.json`;
  const mdKey = `meta/reports/${gitSha}.coherence.md`;
  
  const bucket = env.CONTENT_BUCKET;
  const jsonObject = await bucket.get(jsonKey);
  const mdObject = await bucket.get(mdKey);
  
  if (!jsonObject && !mdObject) {
    return new Response(JSON.stringify({ error: "Report not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
  
  // Return URLs to both formats
  const response = {
    gitSha,
    json: jsonObject ? `${baseUrl}/v1/${jsonKey}` : null,
    markdown: mdObject ? `${baseUrl}/v1/${mdKey}` : null,
  };
  
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  
  return new Response(JSON.stringify(response), { headers });
}

function guessContentType(key) {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".md")) return "text/markdown; charset=utf-8";
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