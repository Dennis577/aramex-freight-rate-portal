/**
 * config.template.js
 * ------------------------------------------------------------------
 * DO NOT hard-code secrets here. In production, Netlify's build
 * script (scripts/inject-env.sh) replaces the __PLACEHOLDER__ tokens
 * with real values from Netlify environment variables.
 *
 * For local development, copy this file to config.js and fill in
 * your values manually. NEVER commit a filled-in config.js.
 * ------------------------------------------------------------------
 */

const CONFIG = {
  // ── Supabase Settings ─────────────────────────────────────────
  // 1. Sign up at https://supabase.com (free, GitHub login available)
  // 2. Create a new Project
  // 3. Go to Settings > API — copy:
  //    - Project URL        → SUPABASE_URL
  //    - anon/public key    → SUPABASE_ANON_KEY
  //    - service_role secret → SUPABASE_SERVICE_KEY (KEEP SECRET)

  SUPABASE_URL:          '__SUPABASE_URL__',
  SUPABASE_ANON_KEY:     '__SUPABASE_ANON_KEY__',
  SUPABASE_SERVICE_KEY:  '__SUPABASE_SERVICE_KEY__',   // KEEP SECRET — write/admin only

  // ── Admin Authentication ─────────────────────────────────────────
  // SHA-256 hex of your admin password.
  // Generate in browser console:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))

  ADMIN_PASSWORD_HASH: '__ADMIN_PASSWORD_HASH__',

  // ── Site Settings ───────────────────────────────────────────────
  SITE_NAME:     'Freight Rate Portal',
  COMPANY_NAME:  'Aramex',
  VERSION:       '1.0.0',

  // Session timeout (milliseconds). Default: 8 hours
  SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000,

  // How many rates to show per page in admin table
  ADMIN_PAGE_SIZE: 25,
};

Object.freeze(CONFIG);
