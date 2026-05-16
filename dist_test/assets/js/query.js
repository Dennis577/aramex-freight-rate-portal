/**
 * query.js — Public freight rate search & display logic
 */

const QueryApp = (() => {
  // ── State ───────────────────────────────────────────────────────
  let _allRates  = [];
  let _activeTab = 'air';  // 'air' | 'ocean'

  // ── DOM Refs ────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Init ────────────────────────────────────────────────────────
  async function init() {
    _bindTabButtons();
    _bindFilterInputs();
    _setDefaultDate();
    await _loadRates();
  }

  function _setDefaultDate() {
    const el = $('filterDate');
    if (el) el.value = Utils.todayStr();
  }

  // ── Data Loading ────────────────────────────────────────────────
  async function _loadRates() {
    _showLoading(true);
    try {
      _allRates = await API.fetchRates();
      _renderLastUpdated();
      _render();
    } catch (err) {
      console.error(err);
      _showError('Unable to load rates. Please try again later.');
    } finally {
      _showLoading(false);
    }
  }

  function _renderLastUpdated() {
    const el = $('lastUpdated');
    if (!el) return;
    // Find the most recent updatedAt
    if (!_allRates.length) { el.textContent = ''; return; }
    const latest = _allRates
      .map(r => r.updatedAt || '')
      .filter(Boolean)
      .sort()
      .pop();
    if (latest) {
      const d = new Date(latest);
      el.textContent = 'Last updated: ' +
        d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    }
  }

  // ── Tab Switching ────────────────────────────────────────────────
  function _bindTabButtons() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === _activeTab)
        );
        _render();
      });
    });
  }

  // ── Filters ──────────────────────────────────────────────────────
  function _bindFilterInputs() {
    const ids = ['filterOrigin','filterDest','filterCarrier','filterDate'];
    ids.forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', Utils.debounce(_render, 250));
    });

    const clearBtn = $('btnClearFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        ids.forEach(id => { const el = $(id); if (el) el.value = ''; });
        _setDefaultDate();
        _render();
      });
    }
  }

  function _getFilters() {
    return {
      origin:  ($('filterOrigin')  ? $('filterOrigin').value.trim().toUpperCase()  : ''),
      dest:    ($('filterDest')    ? $('filterDest').value.trim().toUpperCase()    : ''),
      carrier: ($('filterCarrier') ? $('filterCarrier').value.trim().toUpperCase() : ''),
      date:    ($('filterDate')    ? $('filterDate').value                          : ''),
    };
  }

  function _applyFilters(rates) {
    const f = _getFilters();
    return rates.filter(r => {
      if (r.type !== _activeTab) return false;
      if (f.origin  && !r.origin?.toUpperCase().includes(f.origin))   return false;
      if (f.dest    && !r.destination?.toUpperCase().includes(f.dest)) return false;
      if (f.carrier && !r.carrier?.toUpperCase().includes(f.carrier)) return false;
      if (f.date) {
        if (!Utils.isValid(r, f.date)) return false;
      }
      return true;
    });
  }

  // ── Render ───────────────────────────────────────────────────────
  function _render() {
    const filtered = _applyFilters(_allRates);

    // Update count
    const countEl = $('resultsCount');
    if (countEl) {
      countEl.innerHTML = `Showing <strong>${filtered.length}</strong> rate${filtered.length !== 1 ? 's' : ''}`;
    }

    _renderCards(filtered);
    _renderTable(filtered);
  }

  function _renderCards(rates) {
    const container = $('rateCards');
    if (!container) return;

    if (!rates.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <p>No rates found matching your search criteria.</p>
        </div>`;
      return;
    }

    container.innerHTML = rates.map(r => _buildCard(r)).join('');
  }

  function _buildCard(r) {
    const badge     = r.type === 'air' ? 'badge-air' : 'badge-ocean';
    const typeLabel = r.type === 'air' ? '✈ Air'     : '🚢 Ocean';
    const expiring  = Utils.expiringSoon(r, 7);
    const days      = Utils.daysUntilExpiry(r);
    const validText = days === null ? '' :
      days < 0  ? 'Expired' :
      days === 0 ? 'Expires today' :
      expiring   ? `Expires in ${days} day${days !== 1 ? 's' : ''}` :
      `Valid until ${Utils.fmtDate(r.validTo)}`;

    return `
      <div class="rate-card">
        <div class="rate-card-header">
          <div class="rate-route">
            <span>${Utils.esc(r.origin || '—')}</span>
            <span class="arrow">→</span>
            <span>${Utils.esc(r.destination || '—')}</span>
          </div>
          <div class="d-flex align-center gap-2">
            <span class="badge ${badge}">${typeLabel}</span>
          </div>
        </div>
        <div class="rate-card-body">
          <div class="rate-field">
            <span class="rate-field-label">Carrier</span>
            <span class="rate-field-value">${Utils.esc(r.carrier || '—')}</span>
          </div>
          <div class="rate-field">
            <span class="rate-field-label">Rate</span>
            <span class="rate-field-value price">${Utils.fmtPrice(r)}</span>
          </div>
          <div class="rate-field">
            <span class="rate-field-label">Min Charge</span>
            <span class="rate-field-value">${r.minCharge ? `${r.currency || 'CNY'} ${r.minCharge}` : '—'}</span>
          </div>
          <div class="rate-field">
            <span class="rate-field-label">Commodity</span>
            <span class="rate-field-value">${Utils.esc(r.commodity || 'General')}</span>
          </div>
          <div class="rate-field">
            <span class="rate-field-label">Valid From</span>
            <span class="rate-field-value">${Utils.fmtDate(r.validFrom)}</span>
          </div>
          <div class="rate-field">
            <span class="rate-field-label">Valid To</span>
            <span class="rate-field-value">${Utils.fmtDate(r.validTo)}</span>
          </div>
          ${r.remark ? `
          <div class="rate-field" style="grid-column: 1/-1">
            <span class="rate-field-label">Remark</span>
            <span class="rate-field-value text-muted">${Utils.esc(r.remark)}</span>
          </div>` : ''}
        </div>
        ${validText ? `
        <div class="rate-card-footer">
          <span class="validity-text ${expiring && days >= 0 ? 'expiring-soon' : ''}">${Utils.esc(validText)}</span>
        </div>` : ''}
      </div>`;
  }

  function _renderTable(rates) {
    const tbody = $('rateTableBody');
    if (!tbody) return;

    if (!rates.length) {
      tbody.innerHTML = `
        <tr><td colspan="9" style="text-align:center;padding:32px;color:var(--color-text-muted)">
          No rates found
        </td></tr>`;
      return;
    }

    tbody.innerHTML = rates.map(r => {
      const expiring = Utils.expiringSoon(r, 7);
      const days     = Utils.daysUntilExpiry(r);
      const badge    = r.type === 'air'
        ? `<span class="badge badge-air">Air</span>`
        : `<span class="badge badge-ocean">Ocean</span>`;
      return `
        <tr>
          <td>${badge}</td>
          <td><strong>${Utils.esc(r.origin)}</strong></td>
          <td><strong>${Utils.esc(r.destination)}</strong></td>
          <td>${Utils.esc(r.carrier || '—')}</td>
          <td>${Utils.esc(r.commodity || 'General')}</td>
          <td class="td-price">${Utils.fmtPrice(r)}</td>
          <td>${r.minCharge ? `${r.currency||'CNY'} ${r.minCharge}` : '—'}</td>
          <td>${Utils.fmtDate(r.validFrom)}</td>
          <td style="color:${days !== null && days < 0 ? 'var(--color-error)' : expiring ? 'var(--color-warning)' : 'inherit'};font-weight:${expiring ? '700':'400'}">
            ${Utils.fmtDate(r.validTo)}
          </td>
        </tr>`;
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function _showLoading(show) {
    const el = $('loadingOverlay');
    if (el) el.classList.toggle('hidden', !show);
    const results = $('resultsSection');
    if (results) results.classList.toggle('hidden', show);
  }

  function _showError(msg) {
    const el = $('errorBanner');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  return { init };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', QueryApp.init);
