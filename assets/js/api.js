/**
 * api.js — Supabase REST API read/write wrappers
 * All PostgREST column names are lowercase (mincharge, validfrom, updatedat, etc.)
 * camelCase → lowercase conversion is handled transparently by toSnake() / toCamel().
 *
 * 新增字段（2026-05）：
 *   rate_min, rate_neg45, rate_pos45, rate_pos100, rate_pos300, rate_pos500, rate_pos1000
 *   density_ratio
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
   * e.g. { minCharge: 50, rateMin: 120 } → { mincharge: 50, rate_min: 120 }
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
   * e.g. { mincharge: 50, rate_min: 120 } → { minCharge: 50, rateMin: 120 }
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
   * Fetch all rates (public read, ordered by updatedAt desc)
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

  // ─────────────────────────────────────────────────────────────────
  // Settings (global config: exchange rate + markup)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fetch global settings (exchange rate, markup)
   * @returns {Promise<Object>} camelCase { exchangeRate, markupPercent }
   */
  async function fetchSettings() {
    const res = await fetch(BASE + '/settings?id=eq.global&select=*', {
      headers: HEADERS_READ,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to fetch settings (${res.status}): ${txt}`);
    }
    const raw = await res.json();
    if (!raw || !raw.length) {
      return { exchangeRate: 7.0, markupPercent: 0.0 };
    }
    return toCamel(raw[0]);
  }

  /**
   * Save (upsert) global settings
   * @param {Object} settings — camelCase { exchangeRate, markupPercent }
   */
  async function saveSettings(settings) {
    const payload = {
      id:             'global',
      exchange_rate:   settings.exchangeRate ?? 7.0,
      markup_percent:  settings.markupPercent ?? 0.0,
      updated_at:      new Date().toISOString(),
    };
    const res = await fetch(BASE + '/settings', {
      method: 'POST',
      headers: { ...HEADERS_WRITE_SILENT, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Save settings failed (${res.status}): ${txt}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Rate Logs
  // ─────────────────────────────────────────────────────────────────

  /**
   * Insert a single log entry
   * @param {Object} log — camelCase { action, targetId, oldData, newData, summary }
   */
  async function insertLog(log) {
    const payload = {
      action:    log.action,
      target_id: log.targetId   || null,
      old_data:  log.oldData     || null,
      new_data:  log.newData     || null,
      summary:   log.summary     || '',
      operator:  'admin',
    };
    const res = await fetch(BASE + '/rate_logs', {
      method: 'POST',
      headers: { ...HEADERS_WRITE_SILENT },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('insertLog failed (non-fatal):', await res.text());
    }
  }

  /**
   * Insert multiple log entries at once (batch import)
   * @param {Array} logs
   */
  async function insertLogBatch(logs) {
    if (!logs || !logs.length) return;
    const payload = logs.map(log => ({
      action:    log.action,
      target_id: log.targetId   || null,
      old_data:  log.oldData     || null,
      new_data:  log.newData     || null,
      summary:   log.summary     || '',
      operator:  'admin',
    }));
    const res = await fetch(BASE + '/rate_logs', {
      method: 'POST',
      headers: { ...HEADERS_WRITE_SILENT },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('insertLogBatch failed (non-fatal):', await res.text());
    }
  }

  /**
   * Fetch rate logs (admin only — public via RLS)
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async function fetchLogs(limit = 50) {
    const res = await fetch(
      BASE + `/rate_logs?select=*&order=created_at.desc&limit=${limit}`,
      { headers: HEADERS_READ }
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to fetch logs (${res.status}): ${txt}`);
    }
    const raw = await res.json();
    return Array.isArray(raw) ? raw.map(toCamel) : [];
  }

  return {
    fetchRates,
    insertRate,
    upsertRate,
    deleteRate,
    batchUpsert,
    fetchSettings,
    saveSettings,
    insertLog,
    insertLogBatch,
    fetchLogs,
  };
})();
