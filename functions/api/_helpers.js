/**
 * Shared helper utilities for Cloudflare Pages API functions.
 */

/**
 * Validates the admin token from the Authorization header.
 * Expects: Authorization: Bearer <token>
 */
export function validateAdminToken(request, env) {
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    // If no token is configured, deny all admin access
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token === adminToken;
}

/**
 * Creates a JSON response with CORS headers.
 */
export function createJsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Creates an error JSON response.
 */
export function createErrorResponse(message, status = 400) {
  return createJsonResponse({ error: message }, status);
}
