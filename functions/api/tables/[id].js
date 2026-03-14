/**
 * Cloudflare Pages Function: /api/tables/[id]
 *
 * GET    - Get a single table (admin only)
 * PUT    - Update a table (admin only; name, capacity, x, y, reservationIds)
 * DELETE - Delete a table (admin only)
 *
 * Requires KV namespace binding: RESERVATIONS_KV
 * Requires env var: ADMIN_TOKEN
 */

import { validateAdminToken, createErrorResponse, createJsonResponse } from "../../_helpers.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  const { id } = params;
  if (!env.RESERVATIONS_KV) {
    return createErrorResponse("Storage unavailable", 503);
  }

  const raw = await env.RESERVATIONS_KV.get(`table:${id}`);
  if (!raw) {
    return createErrorResponse("Table not found", 404);
  }

  return createJsonResponse({ table: JSON.parse(raw) }, 200);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  const { id } = params;
  if (!env.RESERVATIONS_KV) {
    return createErrorResponse("Storage unavailable", 503);
  }

  const raw = await env.RESERVATIONS_KV.get(`table:${id}`);
  if (!raw) {
    return createErrorResponse("Table not found", 404);
  }

  let updates;
  try {
    updates = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON body", 400);
  }

  const table = JSON.parse(raw);

  if (typeof updates.name === "string" && updates.name.trim().length > 0) {
    table.name = updates.name.trim().slice(0, 50);
  }

  if (updates.capacity !== undefined) {
    const cap = Number(updates.capacity);
    if (cap >= 1 && cap <= 50) {
      table.capacity = cap;
    }
  }

  if (typeof updates.x === "number") {
    table.x = Math.min(Math.max(0, updates.x), 100);
  }

  if (typeof updates.y === "number") {
    table.y = Math.min(Math.max(0, updates.y), 100);
  }

  if (Array.isArray(updates.reservationIds)) {
    table.reservationIds = updates.reservationIds;
  }

  table.updatedAt = new Date().toISOString();

  await env.RESERVATIONS_KV.put(`table:${id}`, JSON.stringify(table));

  return createJsonResponse({ success: true, table }, 200);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  const { id } = params;
  if (!env.RESERVATIONS_KV) {
    return createErrorResponse("Storage unavailable", 503);
  }

  await env.RESERVATIONS_KV.delete(`table:${id}`);

  // Remove from index
  const indexRaw = await env.RESERVATIONS_KV.get("tables:index");
  if (indexRaw) {
    const index = JSON.parse(indexRaw).filter((tid) => tid !== id);
    await env.RESERVATIONS_KV.put("tables:index", JSON.stringify(index));
  }

  return createJsonResponse({ success: true }, 200);
}
