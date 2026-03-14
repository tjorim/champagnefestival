/**
 * Cloudflare Pages Function: /api/reservations/[id]
 *
 * GET    - Get a single reservation (admin only)
 * PUT    - Update a reservation (admin only; status, paymentStatus, tableId, preOrders)
 * DELETE - Delete a reservation (admin only)
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

  const raw = await env.RESERVATIONS_KV.get(`reservation:${id}`);
  if (!raw) {
    return createErrorResponse("Reservation not found", 404);
  }

  return createJsonResponse({ reservation: JSON.parse(raw) }, 200);
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

  const raw = await env.RESERVATIONS_KV.get(`reservation:${id}`);
  if (!raw) {
    return createErrorResponse("Reservation not found", 404);
  }

  let updates;
  try {
    updates = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON body", 400);
  }

  const reservation = JSON.parse(raw);

  // Allow updating specific fields only
  const allowedStatusValues = ["pending", "confirmed", "cancelled"];
  const allowedPaymentValues = ["unpaid", "partial", "paid"];

  if (updates.status !== undefined) {
    if (!allowedStatusValues.includes(updates.status)) {
      return createErrorResponse("Invalid status value", 400);
    }
    reservation.status = updates.status;
  }

  if (updates.paymentStatus !== undefined) {
    if (!allowedPaymentValues.includes(updates.paymentStatus)) {
      return createErrorResponse("Invalid paymentStatus value", 400);
    }
    reservation.paymentStatus = updates.paymentStatus;
  }

  if (updates.tableId !== undefined) {
    reservation.tableId = updates.tableId || undefined;
  }

  if (Array.isArray(updates.preOrders)) {
    reservation.preOrders = updates.preOrders;
  }

  if (typeof updates.notes === "string") {
    reservation.notes = updates.notes.slice(0, 1000);
  }

  // Check-in and strap fields
  if (typeof updates.checkedIn === "boolean") {
    reservation.checkedIn = updates.checkedIn;
    if (updates.checkedIn && !reservation.checkedInAt) {
      reservation.checkedInAt = new Date().toISOString();
    }
  }

  if (typeof updates.strapIssued === "boolean") {
    reservation.strapIssued = updates.strapIssued;
  }

  reservation.updatedAt = new Date().toISOString();

  await env.RESERVATIONS_KV.put(`reservation:${id}`, JSON.stringify(reservation));

  return createJsonResponse({ success: true, reservation }, 200);
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

  await env.RESERVATIONS_KV.delete(`reservation:${id}`);

  // Remove from index
  const indexRaw = await env.RESERVATIONS_KV.get("reservations:index");
  if (indexRaw) {
    const index = JSON.parse(indexRaw).filter((rid) => rid !== id);
    await env.RESERVATIONS_KV.put("reservations:index", JSON.stringify(index));
  }

  return createJsonResponse({ success: true }, 200);
}
