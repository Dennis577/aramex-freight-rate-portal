/**
 * utils.js — Shared utility functions
 */

const Utils = (() => {

  /** Generate a UUID v4 (browser native) */
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Format a date string (YYYY-MM-DD) to locale display */
  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** Today's date as YYYY-MM-DD */
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Check if a rate is currently valid
   * @param {Object} rate
   * @param {string} [asOfDate] YYYY-MM-DD, defaults to today
   */
  function isValid(rate, asOfDate) {
    const ref = asOfDate || todayStr();
    const from = rate.validFrom || '2000-01-01';
    const to   = rate.validTo   || '2099-12-31';
    return ref >= from && ref <= to;
  }

  /**
   * Check if a rate expires within N days
   */
  function expiringSoon(rate, days = 7) {
    if (!rate.validTo) return false;
    const now   = new Date();
    const expiry = new Date(rate.validTo + 'T00:00:00');
    const diff  = (expiry - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= days;
  }

  /** Compute days until expiry (negative if expired) */
  function daysUntilExpiry(rate) {
    if (!rate.validTo) return null;
    const now    = new Date();
    const expiry = new Date(rate.validTo + 'T00:00:00');
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  }

  /** Format a rate price with currency and unit */
  function fmtPrice(rate) {
    const currency = rate.currency || 'CNY';
    const unit     = rate.unit     || 'kg';
    const val      = parseFloat(rate.rate);
    if (isNaN(val)) return '—';
    return `${currency} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${unit}`;
  }

  /**
   * Export data as a JSON file download
   * @param {*} data
   * @param {string} filename
   */
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    _triggerDownload(blob, filename);
  }

  /**
   * Export data as a CSV file download
   * @param {Array<Object>} rows
   * @param {string} filename
   */
  function downloadCSV(rows, filename) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const v = r[h] == null ? '' : String(r[h]);
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(',')
      )
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    _triggerDownload(blob, filename);
  }

  function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Build Excel template rows for rate import
   * Returns array of objects matching the import column spec
   */
  function getTemplateRows() {
    return [
      {
        type: 'air',
        origin: 'SHA',
        destination: 'LAX',
        carrier: 'CX',
        commodity: 'General Cargo',
        rate: 4.5,
        currency: 'CNY',
        unit: 'kg',
        minCharge: 50,
        validFrom: '2026-06-01',
        validTo: '2026-06-30',
        remark: 'Sample air rate'
      },
      {
        type: 'ocean',
        origin: 'SHA',
        destination: 'USLAX',
        carrier: 'COSCO',
        commodity: 'FCL',
        rate: 1200,
        currency: 'USD',
        unit: 'teu',
        minCharge: '',
        validFrom: '2026-06-01',
        validTo: '2026-06-30',
        remark: 'Sample ocean rate'
      }
    ];
  }

  /** Debounce helper */
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Escape HTML to prevent XSS */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  /** Show a toast-style notification */
  function showSyncBar(message, isError = false) {
    let bar = document.getElementById('syncBar');
    if (!bar) return;
    bar.textContent = message;
    bar.classList.toggle('error', isError);
    bar.classList.add('show');
    setTimeout(() => bar.classList.remove('show'), 3000);
  }

  return {
    uuid,
    fmtDate,
    todayStr,
    isValid,
    expiringSoon,
    daysUntilExpiry,
    fmtPrice,
    downloadJSON,
    downloadCSV,
    getTemplateRows,
    debounce,
    esc,
    showSyncBar,
  };
})();
