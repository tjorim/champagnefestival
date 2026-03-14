/**
 * Cloudflare Pages Function: /api/check-in/[id]
 *
 * GET  - Look up reservation by ID + checkInToken (public, used when QR is scanned)
 * POST - Mark reservation as checked in + issue strap (public, requires checkInToken)
 *
 * The checkInToken is embedded in the QR code URL and prevents casual guessing
 * of reservation IDs without having the physical QR code.
 *
 * Requires KV namespace binding: RESERVATIONS_KV
 */

import { createErrorResponse, createJsonResponse } from "../../_helpers.js";

/** Fields that are safe to return to the check-in scanner (no token, no internal IDs). */
function publicReservationView(reservation) {
  const { checkInToken: _tok, ...rest } = reservation;
  return rest;
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const { id } = params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!env.RESERVATIONS_KV) {
    return createErrorResponse("Storage unavailable", 503);
  }

  const raw = await env.RESERVATIONS_KV.get(`reservation:${id}`);
  if (!raw) {
    return createErrorResponse("Reservation not found", 404);
  }

  const reservation = JSON.parse(raw);

  // Validate token (must match stored checkInToken)
  if (!token || token !== reservation.checkInToken) {
    return createErrorResponse("Invalid check-in token", 403);
  }

  return createJsonResponse({ reservation: publicReservationView(reservation) }, 200);
}

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const { id } = params;
  if (!env.RESERVATIONS_KV) {
    return createErrorResponse("Storage unavailable", 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON body", 400);
  }

  const { token, issueStrap = true } = body;

  const raw = await env.RESERVATIONS_KV.get(`reservation:${id}`);
  if (!raw) {
    return createErrorResponse("Reservation not found", 404);
  }

  const reservation = JSON.parse(raw);

  // Validate token
  if (!token || token !== reservation.checkInToken) {
    return createErrorResponse("Invalid check-in token", 403);
  }

  // Mark as checked in
  const now = new Date().toISOString();
  reservation.checkedIn = true;
  if (!reservation.checkedInAt) {
    reservation.checkedInAt = now;
  }

  if (issueStrap) {
    reservation.strapIssued = true;
  }

  reservation.updatedAt = now;

  await env.RESERVATIONS_KV.put(`reservation:${id}`, JSON.stringify(reservation));

  return createJsonResponse(
    {
      success: true,
      alreadyCheckedIn: reservation.checkedInAt !== now,
      reservation: publicReservationView(reservation),
    },
    200,
  );
}
