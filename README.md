# Freight Rate Portal

A mobile-friendly static web app for querying and managing freight rates (air & ocean).

## Live Demo

Once deployed: `https://your-site.netlify.app`

## Features

### Public Query Page (`index.html`)
- No login required — open access
- Air & Ocean freight tabs
- Filter by: Origin, Destination, Carrier, Valid Date
- Mobile-first card view + desktop table view
- Auto-hides expired rates

### Admin Dashboard (`admin.html`)
- Password-protected login (SHA-256, sessionStorage)
- Add / Edit / Delete rates
- Validity period management (expired rates highlighted)
- Bulk Excel/CSV import (drag & drop)
- Export to JSON / CSV
- Real-time sync to Supabase PostgreSQL cloud storage

---

## Setup Instructions

### Step 1 — Create Supabase Project (free)

1. Go to [https://supabase.com](https://supabase.com) and sign up (GitHub login recommended)
2. Click **New Project** → name it (e.g. `aramex-freight`) → choose free tier
3. Wait ~2 minutes for the project to be provisioned

### Step 2 — Create the Rates Table

In Supabase Dashboard:

1. Navigate to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste and run this SQL:

```sql
-- ── Create the rates table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rates (
  id          TEXT        PRIMARY KEY,
  type        TEXT        NOT NULL CHECK (type IN ('air', 'ocean')),
  origin      TEXT        NOT NULL,
  destination TEXT        NOT NULL,
  carrier     TEXT        NOT NULL,
  commodity   TEXT        NOT NULL DEFAULT 'General',
  rate        NUMERIC     NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'CNY',
  unit        TEXT        NOT NULL DEFAULT 'kg',
  minCharge   NUMERIC,
  validFrom   DATE        NOT NULL,
  validTo     DATE        NOT NULL,
  remark      TEXT        DEFAULT '',
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Enable Row Level Security ───────────────────────────────────────
ALTER TABLE public.rates ENABLE ROW LEVEL SECURITY;

-- ── Policy: anyone can read ─────────────────────────────────────────
CREATE POLICY "public_read"
  ON public.rates FOR SELECT
  USING (true);

-- ── Policy: anyone can insert/update/delete ───────────────────────
-- (Service role key bypasses RLS entirely, so we keep it permissive)
CREATE POLICY "public_write"
  ON public.rates FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update"
  ON public.rates FOR UPDATE USING (true);

CREATE POLICY "public_delete"
  ON public.rates FOR DELETE USING (true);
```

4. Click **Run** — you should see "Success: CREATE TABLE" and 4 policy rows

### Step 3 — Copy API Credentials

In Supabase Dashboard → **Settings** → **API**, copy:

| Field | → Config Key |
|---|---|
| Project URL | `SUPABASE_URL` |
| anon/public key | `SUPABASE_ANON_KEY` |
| service_role secret | `SUPABASE_SERVICE_KEY` |

### Step 4 — Generate Admin Password Hash

Open your browser console (F12) and run:

```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-password'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

Copy the 64-character hex output — that's your `ADMIN_PASSWORD_HASH`.

### Step 5 — Local Development

Edit `assets/js/config.js` with your real values:

```javascript
SUPABASE_URL:          'https://xxxx.supabase.co',
SUPABASE_ANON_KEY:     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
SUPABASE_SERVICE_KEY:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
ADMIN_PASSWORD_HASH:   'your-64-char-hex-hash',
```

Then open `index.html` in your browser (or use a local server to avoid CORS):
```bash
cd /Users/dennis/Documents/Online\ Rate/
python3 -m http.server 8080
# Open http://localhost:8080
```

### Step 6 — Deploy to Netlify

1. Push this project to a **public GitHub repository**:
   ```bash
   cd /Users/dennis/Documents/Online\ Rate/
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create aramex-freight-rate-portal --public --push
   ```

2. Go to [https://netlify.com](https://netlify.com) → **Add new site → Import from Git**
3. Connect your repo
4. Under **Site settings → Environment variables**, add:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | Your Supabase Project URL |
   | `SUPABASE_ANON_KEY` | Your anon/public key |
   | `SUPABASE_SERVICE_KEY` | Your service_role secret |
   | `ADMIN_PASSWORD_HASH` | Your SHA-256 password hash |

5. Netlify will auto-build and deploy on every push to `main`

---

## File Structure

```
├── index.html              # Public query page
├── admin.html              # Admin dashboard
├── netlify.toml            # Netlify build config
├── scripts/
│   └── inject-env.sh       # Build script (injects env vars into config.js)
└── assets/
    ├── css/
    │   ├── main.css         # Shared design system
    │   ├── query.css        # Query page styles
    │   └── admin.css        # Admin page styles
    └── js/
        ├── config.js        # API keys & settings (DO NOT commit with real values)
        ├── config.template.js  # Template with placeholder tokens
        ├── api.js           # Supabase REST API wrappers
        ├── auth.js          # SHA-256 auth + sessionStorage
        ├── utils.js          # Shared utilities
        ├── query.js         # Public page logic
        └── admin.js         # Admin CRUD + import logic
```

## Data Schema

Each rate record:

```json
{
  "id": "uuid",
  "type": "air",
  "origin": "SHA",
  "destination": "LAX",
  "carrier": "CX",
  "commodity": "General Cargo",
  "rate": 4.5,
  "currency": "CNY",
  "unit": "kg",
  "minCharge": 50,
  "validFrom": "2026-06-01",
  "validTo": "2026-06-30",
  "remark": "",
  "updatedAt": "2026-05-16T00:00:00Z"
}
```

## Excel Import Template

| type | origin | destination | carrier | commodity | rate | currency | unit | minCharge | validFrom | validTo | remark |
|---|---|---|---|---|---|---|---|---|---|---|---|
| air | SHA | LAX | CX | General Cargo | 4.5 | CNY | kg | 50 | 2026-06-01 | 2026-06-30 | |
| ocean | SHA | USLAX | COSCO | FCL | 1200 | USD | teu | | 2026-06-01 | 2026-06-30 | |

**Valid values:**
- `type`: `air` or `ocean`
- `unit`: `kg`, `cbm`, `teu`, `shipment`
- `currency`: `CNY`, `USD`, `EUR`, `HKD`
- `validFrom` / `validTo`: YYYY-MM-DD format

---

## Security Notes

- The Service Role Key and admin password hash are **never stored in the public repo** — they are injected at build time via Netlify environment variables
- The Anon Key is public (exposed in frontend JS) — this is safe because the RLS policy above allows read-only access without authentication
- Admin sessions expire after 8 hours (configurable in `config.js`)

---

© Aramex · Freight Rate Portal
