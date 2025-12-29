/**
 * Example Cloudflare Worker for serving GetVerba content from R2
 * 
 * This is a reference implementation. Copy this to your Worker codebase
 * and adapt as needed.
 * 
 * Prerequisites:
 * - R2 bucket binding named "BUCKET" in wrangler.toml
 * - Bucket name: getverba-content-prod
 */

export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // Extract key from path (remove leading /)
    // Example: /v1/workspaces/de/catalog.json -> v1/workspaces/de/catalog.json
    const key = url.pathname.slice(1);

    if (!key || !key.startsWith('v1/')) {
      return new Response('Not Found', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    try {
      // Get object from R2
      const object = await env.BUCKET.get(key);

      if (!object) {
        return new Response('Not Found', { 
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // Build response headers
      const headers = new Headers();

      // Set Content-Type from object metadata or infer from extension
      const contentType = object.httpMetadata?.contentType || 
                         (key.endsWith('.json') ? 'application/json' : 'application/octet-stream');
      headers.set('Content-Type', contentType);

      // Preserve cache headers from object metadata
      // Our publish script sets: public, max-age=300, stale-while-revalidate=86400
      if (object.httpMetadata?.cacheControl) {
        headers.set('Cache-Control', object.httpMetadata.cacheControl);
      }

      // Preserve ETag for conditional requests
      if (object.etag) {
        headers.set('ETag', `"${object.etag}"`);
      }

      // Handle If-None-Match for 304 Not Modified responses
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch && object.etag) {
        // Remove quotes if present for comparison
        const requestEtag = ifNoneMatch.replace(/^"|"$/g, '');
        if (requestEtag === object.etag) {
          return new Response(null, { 
            status: 304, 
            headers 
          });
        }
      }

      // Return object body with headers
      // object.body is a ReadableStream, which Response accepts directly
      return new Response(object.body, { headers });

    } catch (error) {
      console.error('Error fetching from R2:', error);
      return new Response('Internal Server Error', { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};

/**
 * wrangler.toml example:
 * 
 * name = "getverba-content-api"
 * main = "src/index.ts"
 * compatibility_date = "2024-01-01"
 * 
 * [[r2_buckets]]
 * binding = "BUCKET"
 * bucket_name = "getverba-content-prod"
 */

