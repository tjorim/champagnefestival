# Champagne Festival — Backend

FastAPI + SQLite backend for the VIP reservation and check-in system.
Designed to run as a single process (no external services) on a shared VPS
alongside the [worktime](https://github.com/tjorim/worktime) backend.

---

## Architecture

```
Cloudflare Pages (static frontend)
        │
        │  HTTPS API calls
        ▼
   VPS (shared with worktime)
   ┌─────────────────────────────────┐
   │  nginx (reverse proxy, TLS)     │
   │    /api/* → champagne:8000      │
   │    /worktime/* → worktime:8001  │
   └─────────────────────────────────┘
        │
   ┌────▼────────────────────────────┐
   │  FastAPI (uvicorn / Docker)     │
   │  SQLite (single .db file)       │
   └─────────────────────────────────┘
```

Single process, single file database — zero extra services required.

---

## Quick start (development)

```bash
cd backend

# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -e ".[dev]"

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set ADMIN_TOKEN

# 4. Run database migrations
alembic upgrade head

# 5. Start the development server
uvicorn app.main:app --reload
```

The interactive API docs are available at <http://localhost:8000/docs>.

---

## Deployment on VPS

### Option A — Docker (recommended)

```bash
# Build image
docker build -t champagne-backend .

# Run with a named volume for the database
docker run -d \
  --name champagne-backend \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -v champagne-data:/var/data/champagne \
  --env-file /etc/champagne/.env \
  champagne-backend

# Run migrations inside the running container
docker exec champagne-backend alembic upgrade head
```

### Option B — systemd service

```bash
# Install dependencies into a virtualenv
python3 -m venv /opt/champagne/venv
/opt/champagne/venv/bin/pip install -e /opt/champagne/backend

# Create /etc/systemd/system/champagne.service:
# [Unit]
# Description=Champagne Festival API
# After=network.target
#
# [Service]
# User=champagne
# WorkingDirectory=/opt/champagne/backend
# EnvironmentFile=/etc/champagne/.env
# ExecStartPre=/opt/champagne/venv/bin/alembic upgrade head
# ExecStart=/opt/champagne/venv/bin/uvicorn app.main:app \
#     --host 127.0.0.1 --port 8000 --workers 1
# Restart=always
#
# [Install]
# WantedBy=multi-user.target

systemctl enable --now champagne
```

### nginx reverse proxy snippet

```nginx
location /api/ {
    proxy_pass         http://127.0.0.1:8000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_TOKEN` | **yes** | — | Bearer token for admin endpoints |
| `DATABASE_URL` | no | `sqlite+aiosqlite:////var/data/champagne/champagne.db` | Async SQLAlchemy URL |
| `CORS_ORIGINS` | no | `["*"]` | JSON array of allowed origins |
| `MIN_FORM_SECONDS` | no | `3` | Anti-spam: min seconds to fill the form |
| `SMTP_HOST` | no | — | SMTP server (planned — see below) |
| `SMTP_PORT` | no | `587` | SMTP port (planned) |
| `SMTP_USER` | no | — | SMTP username (planned) |
| `SMTP_PASSWORD` | no | — | SMTP password (planned) |
| `SMTP_FROM` | no | — | From address (planned) |
| `RECAPTCHA_SECRET` | no | — | Google reCAPTCHA secret (planned) |

See `.env.example` for a template.

---

## API reference

> Interactive docs: `GET /docs` (Swagger UI) or `GET /redoc` (ReDoc).

### Authentication

Admin endpoints require an `Authorization: Bearer <ADMIN_TOKEN>` header.
Public endpoints (reservation creation, check-in) do not require a token.

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reservations` | public | Create a reservation |
| `GET` | `/api/reservations` | admin | List all reservations (token excluded) |
| `GET` | `/api/reservations/{id}` | admin | Get reservation detail (token included) |
| `PUT` | `/api/reservations/{id}` | admin | Update reservation |
| `DELETE` | `/api/reservations/{id}` | admin | Delete reservation |
| `GET` | `/api/check-in/{id}?token=…` | public + token | Verify QR token, return guest info |
| `POST` | `/api/check-in/{id}` | public + token | Mark checked-in, issue strap |
| `POST` | `/api/tables` | admin | Create table |
| `GET` | `/api/tables` | admin | List tables |
| `GET` | `/api/tables/{id}` | admin | Get table |
| `PUT` | `/api/tables/{id}` | admin | Update table |
| `DELETE` | `/api/tables/{id}` | admin | Delete table |
| `GET` | `/health` | public | Health check |

---

## Frontend integration

Update the Cloudflare Pages frontend to point at the VPS backend instead of
the Cloudflare Functions.  The API contract is identical, so only the base URL
needs to change.

In the React frontend, set an environment variable:

```
# .env (Cloudflare Pages environment settings)
VITE_API_BASE_URL=https://api.champagnefestival.be
```

Then replace hardcoded `/api/` fetch calls with `${import.meta.env.VITE_API_BASE_URL}/api/`.

---

## Planned features (not yet implemented)

The items below are designed and partially scaffolded but **not yet active**.
Each section notes where the code hook already exists.

### 📧 Guest confirmation e-mail

**What:** On successful reservation creation, send the guest a confirmation
e-mail containing:
- Booking summary (name, event, guest count, pre-orders)
- Their QR code as an inline image or attachment (for offline scanning)
- A link to the check-in page

**Status:** The `TODO` comment in `app/routers/reservations.py` (`create_reservation`)
marks the call site.  SMTP settings are wired in `app/config.py` and
`.env.example`.

**To implement:**
1. Add a `send_confirmation_email(reservation, qr_png_bytes)` helper in
   `app/email.py` using `aiosmtplib` + `email.mime`.
2. Generate the QR PNG with `qrcode[pil]` using the check-in URL
   `{FRONTEND_URL}/#check-in?id={id}&token={token}`.
3. Call the helper after `db.commit()` in `create_reservation`.

---

### 🔑 reCAPTCHA v3 on the reservation form

**What:** Validate a reCAPTCHA token submitted by the frontend alongside the
reservation form, providing a second bot-protection layer on top of the
existing honeypot + timing check.

**Status:** `RECAPTCHA_SECRET` is wired in `app/config.py` and `.env.example`.

**To implement:**
1. Add a `recaptcha_token: str` field to `ReservationCreate` in `app/schemas.py`.
2. Add an `async def verify_recaptcha(token: str) -> bool` helper in
   `app/spam.py` that calls the Google Siteverify API via `httpx`.
3. Call `verify_recaptcha` in `create_reservation` and raise `HTTP 400` on
   failure when `settings.recaptcha_secret` is non-empty.
4. Update the frontend `ReservationModal` to load the reCAPTCHA script and
   include the token in the POST body.

---

### 💳 Payment gateway integration

**What:** Mark a reservation as paid after the guest completes payment.
The `payment_status` field (`unpaid | partial | paid`) already exists on
every reservation.

**Status:** Manual admin-side updates via `PUT /api/reservations/{id}` work
today.  A webhook receiver for automated updates is not implemented.

**To implement (Mollie, Stripe, or similar):**
1. Add `POST /api/payments/webhook` — verify the provider's HMAC signature,
   then update `payment_status` on the matching reservation.
2. Add `POST /api/payments/create-session/{reservation_id}` (admin) to
   generate a payment link/session for a specific reservation.
3. Store the provider's `payment_id` on the reservation for lookup.

---

### 📅 Event management API

**What:** The `event_id` / `event_title` fields on a reservation currently
reference festival editions defined in the frontend's
`src/config/editions.ts`.  A backend events API would allow admins to
manage editions without a frontend code change.

**Status:** No event model or routes exist yet.

**To implement:**
1. Add an `Event` ORM model (id, title, date, venue, capacity, active).
2. Add `GET /api/events` (public) and `POST/PUT/DELETE /api/events` (admin).
3. The frontend's `ReservationCreate.event_id` would then reference a backend
   event ID rather than a hardcoded config key.

---

### 📊 Export / reporting

**What:** Allow organisers to download reservation data as CSV or Excel for
offline use (e.g., printing guest lists, seating plans).

**Status:** Not implemented.

**To implement:**
1. Add `GET /api/reservations/export?format=csv` (admin) using Python's
   built-in `csv` module or `openpyxl` for Excel.
2. Optionally add filtering query parameters (event, status, payment_status).

---

### ⏱ Rate limiting

**What:** Per-IP rate limiting on the public `POST /api/reservations` endpoint
to prevent bulk submission attacks beyond what the honeypot + timing check
catches.

**Status:** Not implemented.

**To implement:**
1. Add `slowapi` (a FastAPI-native rate limiter built on `limits`) as a
   dependency.
2. Decorate `create_reservation` with `@limiter.limit("5/minute")`.
3. Mount the `SlowAPI` middleware in `app/main.py`.

---

### 🔔 Webhook / push notifications for organisers

**What:** Notify organisers (e.g., via a Telegram bot or web push) when a new
reservation is created or when a guest checks in.

**Status:** Not implemented.

**To implement:**
1. Add a `WEBHOOK_URL` env var.
2. After `db.commit()` in `create_reservation` and `post_check_in`, fire an
   async `httpx.post(settings.webhook_url, json={...})` in the background
   using `asyncio.create_task`.
