/**
 * api.js — Supabase REST API read/write wrappers
 * All PostgREST column names are lowercase (mincharge, validfrom, updatedat, etc.)
 * camelCase → lowercase conversion is handled transparently by _normalize().
 */

const API = (() => {
  const BASE = CONFIG.SUPABASE_URL + '/rest/v1';
  const HEADERS_READ = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
    'Accept': 'application/json',
  };
  const HEADERS_WRITE = {
    'apikey': CONFIG.SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
  };
  const HEADERS_WRITE_SILENT = {
    'apikey': CONFIG.SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  /**
   * camelCase → lowercase (snake-style) conversion for PostgREST.
   * e.g. { minCharge: 50, validFrom: "2026-01-01" } → { mincharge: 50, validfrom: "2026-01-01" }
   * @param {Object} obj
   */
  function toSnake(obj) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/[A-Z]/g, c => c.toLowerCase()),
        v,
      ])
    );
  }

  /**
   * lowercase → camelCase conversion for fetched data.
   * e.g. { mincharge: 50, validfrom: "2026-01-01" } → { minCharge: 50, validFrom: "2026-01-01" }
   * @param {Object} obj
   */
  function toCamel(obj) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return [camel, v];
      })
    );
  }

  /**
   * Fetch all rates (public read)
   * @returns {Promise<Array>} array of rate objects (camelCase keys)
   */
  async function fetchRates() {
    const res = await fetch(BASE + '/rates?select=*&order=updatedat.desc', {
      headers: HEADERS_READ,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to fetch rates (${res.status}): ${txt}`);
    }
    const raw = await res.json();
    return Array.isArray(raw) ? raw.map(toCamel) : [];
  }

  /**
   * Insert a single new rate (service role — bypasses RLS)
   * @param {Object} rate — camelCase keys
   * @returns {Promise<Object>}
   */
  async function insertRate(rate) {
    const res = await fetch(BASE + '/rates', {
      method: 'POST',
      headers: HEADERS_WRITE,
      body: JSON.stringify(toSnake(rate)),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Insert failed (${res.status}): ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  /**
   * Upsert a rate by id — insert if new, update if exists (service role)
   * @param {Object} rate — camelCase keys, must have .id
   */
  async function upsertRate(rate) {
    const res = await fetch(BASE + '/rates', {
      method: 'POST',
      headers: { ...HEADERS_WRITE_SILENT, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(toSnake(rate)),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Upsert failed (${res.status}): ${txt}`);
    }
  }

  /**
   * Delete a rate by id (service role)
   * @param {string} id
   */
  async function deleteRate(id) {
    const res = await fetch(`${BASE}/rates?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: HEADERS_WRITE_SILENT,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Delete failed (${res.status}): ${txt}`);
    }
  }

  /**
   * Batch upsert multiple rates (service role)
   * @param {Array} rates — array of camelCase rate objects
   */
  async function batchUpsert(rates) {
    const res = await fetch(BASE + '/rates', {
      method: 'POST',
      headers: { ...HEADERS_WRITE_SILENT, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(rates.map(toSnake)),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Batch upsert failed (${res.status}): ${txt}`);
    }
  }

  return { fetchRates, insertRate, upsertRate, deleteRate, batchUpsert };
})();
