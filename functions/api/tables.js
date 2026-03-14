/**
 * Cloudflare Pages Function: /api/tables
 *
 * POST - Create a new table (admin only)
 * GET  - List all tables (admin only)
 *
 * Requires KV namespace binding: RESERVATIONS_KV
 * Requires env var: ADMIN_TOKEN
 */

import { validateAdminToken, createErrorResponse, createJsonResponse } from "../_helpers.js";

/** Generates a simple unique ID. */
function generateId() {
  return `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON body", 400);
  }

  const { name, capacity, x, y } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return createErrorResponse("Table name is required", 400);
  }

  const cap = Number(capacity);
  if (!cap || cap < 1 || cap > 50) {
    return createErrorResponse("Capacity must be between 1 and 50", 400);
  }

  const now = new Date().toISOString();
  const id = generateId();

  const table = {
    id,
    name: name.trim().slice(0, 50),
    capacity: cap,
    x: typeof x === "number" ? Math.min(Math.max(0, x), 100) : 10,
    y: typeof y === "number" ? Math.min(Math.max(0, y), 100) : 10,
    reservationIds: [],
    createdAt: now,
    updatedAt: now,
  };

  if (env.RESERVATIONS_KV) {
    await env.RESERVATIONS_KV.put(`table:${id}`, JSON.stringify(table));

    const indexRaw = await env.RESERVATIONS_KV.get("tables:index");
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(id);
    await env.RESERVATIONS_KV.put("tables:index", JSON.stringify(index));
  }

  return createJsonResponse({ success: true, id, table }, 201);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  if (!env.RESERVATIONS_KV) {
    return createJsonResponse({ tables: [] }, 200);
  }

  const indexRaw = await env.RESERVATIONS_KV.get("tables:index");
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  const tables = await Promise.all(
    index.map(async (id) => {
      const raw = await env.RESERVATIONS_KV.get(`table:${id}`);
      return raw ? JSON.parse(raw) : null;
    }),
  );

  return createJsonResponse({ tables: tables.filter(Boolean) }, 200);
}
