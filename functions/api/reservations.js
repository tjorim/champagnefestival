/**
 * Cloudflare Pages Function: /api/reservations
 *
 * POST - Create a new reservation (public)
 * GET  - List all reservations (admin only)
 *
 * Requires KV namespace binding: RESERVATIONS_KV
 * Requires env var: ADMIN_TOKEN
 */

import { validateAdminToken, createErrorResponse, createJsonResponse } from "../_helpers.js";

/** Validates a reservation payload from the request body. */
function validateReservationBody(body) {
  const { name, email, phone, eventId, guestCount } = body;
  const errors = [];

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    errors.push("name is required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push("valid email is required");
  }

  if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
    errors.push("phone is required");
  }

  if (!eventId || typeof eventId !== "string") {
    errors.push("eventId is required");
  }

  const guests = Number(guestCount);
  if (!guests || guests < 1 || guests > 20) {
    errors.push("guestCount must be between 1 and 20");
  }

  return errors;
}

/** Sanitizes a string to prevent XSS/injection. */
function sanitize(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .trim()
    .slice(0, 500);
}

/** Generates a simple unique ID. */
function generateId() {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON body", 400);
  }

  // Honeypot anti-spam check
  if (body.honeypot) {
    // Silently succeed to fool bots
    return createJsonResponse({ success: true }, 200);
  }

  // Timing check (form must be open for at least 3 seconds)
  const formStartTime = Number(body.formStartTime);
  if (formStartTime && Date.now() - formStartTime < 3000) {
    return createErrorResponse("Submission too fast", 429);
  }

  // Validate input
  const errors = validateReservationBody(body);
  if (errors.length > 0) {
    return createErrorResponse(`Validation failed: ${errors.join(", ")}`, 400);
  }

  // Sanitize pre-orders
  const preOrders = Array.isArray(body.preOrders)
    ? body.preOrders
        .filter((item) => item && typeof item.productId === "string" && Number(item.quantity) > 0)
        .map((item) => ({
          productId: sanitize(item.productId),
          name: sanitize(item.name || ""),
          quantity: Math.min(Math.max(1, Number(item.quantity)), 100),
          price: Number(item.price) || 0,
          category: ["champagne", "food", "other"].includes(item.category) ? item.category : "other",
        }))
    : [];

  const now = new Date().toISOString();
  const id = generateId();

  const reservation = {
    id,
    name: sanitize(body.name),
    email: body.email.toLowerCase().trim().slice(0, 320),
    phone: sanitize(body.phone),
    eventId: sanitize(body.eventId),
    eventTitle: sanitize(body.eventTitle || ""),
    guestCount: Math.min(Math.max(1, Number(body.guestCount)), 20),
    preOrders,
    notes: sanitize(body.notes || "").slice(0, 1000),
    tableId: undefined,
    status: "pending",
    paymentStatus: "unpaid",
    createdAt: now,
    updatedAt: now,
  };

  // Store in KV
  if (env.RESERVATIONS_KV) {
    await env.RESERVATIONS_KV.put(`reservation:${id}`, JSON.stringify(reservation));

    // Update the index
    const indexRaw = await env.RESERVATIONS_KV.get("reservations:index");
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.unshift(id);
    await env.RESERVATIONS_KV.put("reservations:index", JSON.stringify(index));
  }

  return createJsonResponse({ success: true, id, reservation }, 201);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!validateAdminToken(request, env)) {
    return createErrorResponse("Unauthorized", 401);
  }

  if (!env.RESERVATIONS_KV) {
    return createJsonResponse({ reservations: [] }, 200);
  }

  const indexRaw = await env.RESERVATIONS_KV.get("reservations:index");
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  const reservations = await Promise.all(
    index.map(async (id) => {
      const raw = await env.RESERVATIONS_KV.get(`reservation:${id}`);
      return raw ? JSON.parse(raw) : null;
    }),
  );

  return createJsonResponse(
    { reservations: reservations.filter(Boolean) },
    200,
  );
}
