/**
 * query.js — Public freight rate search & display logic
 *
 * Features (2026-05):
 * - 7 price tiers for air freight (Min, -45, +45, +100, +300, +500, +1000)
 * - CNY / USD currency toggle with exchange rate
 * - Markup percentage applied to displayed prices
 * - Density ratio display
 */

const QueryApp = (() => {
  // ── State ───────────────────────────────────────────────────────
  let _allRates   = [];
  let _activeTab  = 'air';  // 'air' | 'ocean'
  let _settings   = { exchangeRate: 7.0, markupPercent: 0.0 };
  let _displayCurrency = 'CNY';  // 'CNY' | 'USD'

  // ── DOM Refs ────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Init ────────────────────────────────────────────────────────
  async function init() {
    _bindTabButtons();
    _bindFilterInputs();
    _bindCurrencyToggle();
    _setDefaultDate();
    await _loadSettings();
    await _loadRates();
  }

  // ── Settings ────────────────────────────────────────────────────
  async function _loadSettings() {
    try {
      _settings = await API.fetchSettings();
    } catch (err) {
      console.warn('Could not load settings, using defaults:', err.message);
      _settings = { exchangeRate: 7.0, markupPercent: 0.0 };
    }
    _updateMarkupBadge();
  }

  function _updateMarkupBadge() {
    const badge = $('markupBadge');
    if (!badge) return;
    if (_settings.markupPercent && _settings.markupPercent > 0) {
      badge.textContent = `+${_settings.markupPercent}% markup applied`;
      badge.style.display = 'inline-block';
      badge.style.cssText = 'background:#fff3cd;color:#856404;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;';
    } else {
      badge.style.display = 'none';
    }
  }

  function _setDefaultDate() {
    const el = $('filterDate');
    if (el) el.value = Utils.todayStr();
  }

  // ── Currency Toggle ──────────────────────────────────────────────
  function _bindCurrencyToggle() {
    const el = $('filterCurrency');
    if (el) el.addEventListener('change', () => {
      _displayCurrency = el.value;
      _render();
    });
  }

  // ── Data Loading ─────────────────────────────────────────────────
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

  // ── Tab Switching ─────────────────────────────────────────────────
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

  // ── Filters ─────────────────────────────────────────────────────
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
      origin:   ($('filterOrigin')  ? $('filterOrigin').value.trim().toUpperCase()  : ''),
      dest:     ($('filterDest')   ? $('filterDest').value.trim().toUpperCase()    : ''),
      carrier:  ($('filterCarrier')? $('filterCarrier').value.trim().toUpperCase() : ''),
      date:     ($('filterDate')   ? $('filterDate').value                          : ''),
    };
  }

  function _applyFilters(rates) {
    const f = _getFilters();
    return rates.filter(r => {
      if (r.type !== _activeTab) return false;
      if (f.origin  && !r.origin?.toUpperCase().includes(f.origin))    return false;
      if (f.dest    && !r.destination?.toUpperCase().includes(f.dest)) return false;
      if (f.carrier && !r.carrier?.toUpperCase().includes(f.carrier))  return false;
      if (f.date && !Utils.isValid(r, f.date)) return false;
      return true;
    });
  }

  // ── Price Helpers ────────────────────────────────────────────────
  /**
   * Convert a CNY price to display currency, then apply markup.
   * @param {number} cnyVal
   * @returns {number}
   */
  function _applyDisplay(cnyVal) {
    if (cnyVal == null || isNaN(cnyVal)) return null;
    let displayVal = cnyVal;
    if (_displayCurrency === 'USD') {
      displayVal = cnyVal / (_settings.exchangeRate || 7.0);
    }
    return displayVal * (1 + (_settings.markupPercent || 0) / 100);
  }

  /**
   * Format a price value with currency symbol.
   * @param {number|null} val
   * @param {string} currency
   */
  function _fmtVal(val, currency = _displayCurrency) {
    if (val == null || isNaN(val)) return '—';
    const sym = currency === 'USD' ? '$' : '¥';
    return `${sym}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ── Render ───────────────────────────────────────────────────────
  function _render() {
    const filtered = _applyFilters(_allRates);
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

    const isAir = r.type === 'air';
    const origCurrency = r.currency || 'CNY';
    const displayCurrency = _displayCurrency;

    // Price display
    let priceHtml = '—';
    if (isAir) {
      // Show primary tier + density
      const primaryTier = r.rateNeg45 ?? r.rateMin ?? r.ratePos45;
      const displayPrice = _applyDisplay(primaryTier);
      const primaryLabel = r.rateNeg45 ? '+45kg' : (r.rateMin ? 'Min' : '+45kg');
      const densityHtml  = r.densityRatio
        ? `<span class="density-tag">${r.densityRatio}</span>`
        : '';
      priceHtml = `
        <div class="card-price-primary">${_fmtVal(displayPrice)} <span class="card-price-unit">/kg</span></div>
        <div class="card-price-meta">
          <span class="tier-label">${primaryLabel}</span> ${densityHtml}
        </div>`;
    } else {
      const displayPrice = _applyDisplay(parseFloat(r.rate));
      priceHtml = `
        <div class="card-price-primary">${_fmtVal(displayPrice, origCurrency)} <span class="card-price-unit">/${r.unit||'unit'}</span></div>
        <div class="card-price-meta"><span class="tier-label">${origCurrency} base</span></div>`;
    }

    // Tiers detail (expandable for air)
    let tiersDetail = '';
    if (isAir) {
      const tierLabels = [
        { key: 'rateMin',    label: 'Min' },
        { key: 'rateNeg45',  label: '≤45kg' },
        { key: 'ratePos45',  label: '>45kg' },
        { key: 'ratePos100', label: '>100kg' },
        { key: 'ratePos300', label: '>300kg' },
        { key: 'ratePos500', label: '>500kg' },
        { key: 'ratePos1000',label: '>1000kg' },
      ];
      const filled = tierLabels.filter(t => r[t.key] != null && !isNaN(parseFloat(r[t.key])));
      if (filled.length > 1) {
        tiersDetail = `
          <div class="rate-tiers-detail">
            ${filled.map(t => `
              <div class="tier-row">
                <span class="tier-name">${t.label}</span>
                <span class="tier-value">${_fmtVal(_applyDisplay(parseFloat(r[t.key])))}/kg</span>
              </div>`).join('')}
          </div>`;
      }
    }

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
            <span class="rate-field-value price">${priceHtml}</span>
          </div>
          ${isAir && r.densityRatio ? `
          <div class="rate-field">
            <span class="rate-field-label">Density</span>
            <span class="rate-field-value">${r.densityRatio}</span>
          </div>` : ''}
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
          ${tiersDetail}
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
        <tr><td colspan="12" style="text-align:center;padding:32px;color:var(--color-text-muted)">
          No rates found
        </td></tr>`;
      return;
    }

    const isAir = _activeTab === 'air';

    tbody.innerHTML = rates.map(r => {
      const expiring = Utils.expiringSoon(r, 7);
      const days     = Utils.daysUntilExpiry(r);
      const badge    = isAir
        ? `<span class="badge badge-air">Air</span>`
        : `<span class="badge badge-ocean">Ocean</span>`;

      // Density
      const densityHtml = r.densityRatio
        ? `<span class="density-tag-sm">${r.densityRatio}</span>`
        : '—';

      // Tiers
      let tiersHtml = '—';
      if (isAir) {
        const tierKeys = ['rateMin','rateNeg45','ratePos45','ratePos100','ratePos300','ratePos500','ratePos1000'];
        const tierLabels = ['Min','−45','+45','+100','+300','+500','+1000'];
        const filled = tierKeys
          .map((k, i) => ({ key: k, label: tierLabels[i], val: parseFloat(r[k]) }))
          .filter(t => !isNaN(t.val));

        if (filled.length === 1) {
          tiersHtml = _fmtVal(_applyDisplay(filled[0].val)) + '/kg';
        } else if (filled.length > 1) {
          tiersHtml = filled.map(t =>
            `<span class="tier-cell" title="${t.label}">${_fmtVal(_applyDisplay(t.val))}</span>`
          ).join('');
        }
      } else {
        const v = parseFloat(r.rate);
        tiersHtml = isNaN(v) ? '—' : _fmtVal(_applyDisplay(v));
      }

      // Primary rate (for sort)
      const primaryVal = isAir
        ? (r.rateNeg45 ?? r.rateMin ?? r.ratePos45)
        : parseFloat(r.rate);

      return `
        <tr>
          <td>${badge}</td>
          <td><strong>${Utils.esc(r.origin)}</strong></td>
          <td><strong>${Utils.esc(r.destination)}</strong></td>
          <td>${Utils.esc(r.carrier || '—')}</td>
          <td>${Utils.esc(r.commodity || 'General')}</td>
          <td>${densityHtml}</td>
          <td class="td-tiers">${tiersHtml}</td>
          <td class="td-price">${_fmtVal(_applyDisplay(primaryVal))}</td>
          <td>${r.minCharge != null ? _fmtVal(_applyDisplay(parseFloat(r.minCharge))) : '—'}</td>
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
