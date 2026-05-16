/**
 * admin.js — Admin CRUD + Excel/AI Import + Settings + Logs
 *
 * Depends on: CONFIG, API, Auth, Utils, Tesseract (CDN)
 * Loaded by: admin.html (after auth check)
 */

const AdminApp = (() => {
  // ── State ───────────────────────────────────────────────────────
  let _rates       = [];
  let _settings    = { exchangeRate: 7.0, markupPercent: 0.0 };
  let _logs        = [];
  let _page        = 1;
  let _sortKey     = 'updatedAt';
  let _sortAsc     = false;
  let _filterTab   = 'all';
  let _searchTerm   = '';
  let _editingId   = null;
  let _importRows  = [];
  let _activeTab    = 'rates';  // 'rates' | 'settings' | 'logs'
  let _ocrWorker    = null;

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    if (!Auth.isLoggedIn()) return;

    await _loadSettings();
    _bindLogout();
    _bindAdminTabs();
    _bindToolbar();
    _bindModal();
    _bindImportModal();
    _bindSettings();
    _bindLogs();
    _bindAiScanModal();
    await _loadRates();
  }

  // ── Data ───────────────────────────────────────────────────────
  async function _loadRates() {
    _setLoading(true);
    try {
      _rates = await API.fetchRates();
      _renderStats();
      _renderTable();
    } catch (err) {
      console.error(err);
      alert('Failed to load rates: ' + err.message);
    } finally {
      _setLoading(false);
    }
  }

  async function _loadSettings() {
    try {
      _settings = await API.fetchSettings();
    } catch (err) {
      console.warn('Could not load settings:', err.message);
      _settings = { exchangeRate: 7.0, markupPercent: 0.0 };
    }
  }

  async function _loadLogs() {
    try {
      _logs = await API.fetchLogs(100);
      _renderLogs();
    } catch (err) {
      console.error(err);
      document.getElementById('logsTableBody').innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--color-error)">Failed to load logs</td></tr>';
    }
  }

  // ── Stats ────────────────────────────────────────────────────────
  function _renderStats() {
    const today = Utils.todayStr();
    const total  = _rates.length;
    const active = _rates.filter(r => Utils.isValid(r, today)).length;
    const air    = _rates.filter(r => r.type === 'air').length;
    const ocean  = _rates.filter(r => r.type === 'ocean').length;
    const s = id => document.getElementById(id);
    if (s('statTotal'))  s('statTotal').textContent  = total;
    if (s('statActive')) s('statActive').textContent = active;
    if (s('statAir'))    s('statAir').textContent    = air;
    if (s('statOcean'))  s('statOcean').textContent  = ocean;
  }

  // ── Filter & Sort ─────────────────────────────────────────────
  function _getFilteredRates() {
    let list = [..._rates];

    if (_filterTab !== 'all') {
      list = list.filter(r => r.type === _filterTab);
    }
    if (_searchTerm) {
      const q = _searchTerm.toLowerCase();
      list = list.filter(r =>
        (r.origin       || '').toLowerCase().includes(q) ||
        (r.destination  || '').toLowerCase().includes(q) ||
        (r.carrier      || '').toLowerCase().includes(q) ||
        (r.commodity    || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[_sortKey] ?? '';
      const bv = b[_sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return _sortAsc ? cmp : -cmp;
    });
    return list;
  }

  // ── Table Render ─────────────────────────────────────────────
  function _renderTable() {
    const list  = _getFilteredRates();
    const total = list.length;
    const size  = CONFIG.ADMIN_PAGE_SIZE;
    const pages = Math.ceil(total / size) || 1;
    if (_page > pages) _page = pages;

    const slice = list.slice((_page - 1) * size, _page * size);
    const today = Utils.todayStr();
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    if (!slice.length) {
      tbody.innerHTML = `
        <tr><td colspan="16" style="text-align:center;padding:32px;color:var(--color-text-muted)">
          No rates found
        </td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => _buildTableRow(r, today)).join('');
    }

    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${_page} of ${pages} (${total} records)`;
    document.getElementById('btnPrevPage')?.toggleAttribute('disabled', _page <= 1);
    document.getElementById('btnNextPage')?.toggleAttribute('disabled', _page >= pages);
  }

  function _buildTableRow(r, today) {
    const expired  = !Utils.isValid(r, today);
    const isAir    = r.type === 'air';
    const badge    = isAir
      ? '<span class="badge badge-air">Air</span>'
      : '<span class="badge badge-ocean">Ocean</span>';
    const tierKeys   = ['rateMin','rateNeg45','ratePos45','ratePos100','ratePos300','ratePos500','ratePos1000'];

    // Price tiers display — ALWAYS show all 7 cells for air freight
    let priceTiersHtml = '—';
    if (isAir) {
      const tierLabels = ['Min','≤45','>45','>100','>300','>500','>1000'];
      priceTiersHtml = tierKeys.map((k, i) => {
        const val = parseFloat(r[k]);
        const formatted = isNaN(val) ? '—' : `${r.currency||'¥'}${val.toFixed(2)}`;
        return `<span class="tier-cell" title="${tierLabels[i]}">${formatted}</span>`;
      }).join('');
    } else {
      const v = parseFloat(r.rate);
      priceTiersHtml = isNaN(v) ? '—'
        : `${r.currency||'CNY'} ${v.toFixed(2)} / ${r.unit||'teu'}`;
    }

    // Agent display (internal field, may be empty)
    const agentDisplay = r.agent
      ? `<span class="agent-badge">${Utils.esc(r.agent)}</span>`
      : '—';

    return `
      <tr class="${expired ? 'expired' : ''}">
        <td class="td-check">
          <input type="checkbox" data-id="${Utils.esc(r.id)}">
        </td>
        <td>${badge}</td>
        <td><strong>${Utils.esc(r.origin)}</strong></td>
        <td><strong>${Utils.esc(r.destination)}</strong></td>
        <td>${Utils.esc(r.carrier || '—')}</td>
        <td>${Utils.esc(r.commodity || 'General')}</td>
        <td>${agentDisplay}</td>
        ${isAir ? tierKeys.map(k => `<td class="td-tier-cell">${_fmtTierCell(r, k)}</td>`).join('') : '<td>—</td>'.repeat(7)}
        <td style="color:${expired ? 'var(--color-expired-text)' : 'inherit'};font-weight:${expired?'700':'400'}">
          ${Utils.fmtDate(r.validTo)}
          ${expired ? '<span class="badge badge-expired" style="margin-left:4px">Expired</span>' : ''}
        </td>
        <td class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick="AdminApp.editRate('${Utils.esc(r.id)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteRate('${Utils.esc(r.id)}')">Del</button>
        </td>
      </tr>`;
  }

  /** Format a single tier cell value */
  function _fmtTierCell(r, key) {
    const val = parseFloat(r[key]);
    if (isNaN(val)) return '—';
    return `${r.currency||'¥'}${val.toFixed(2)}`;
  }

  // ── Admin Tab Navigation ───────────────────────────────────
  function _bindAdminTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tab = btn.dataset.adminTab;
        _activeTab = tab;
        document.querySelectorAll('[data-admin-tab]').forEach(b =>
          b.classList.toggle('active', b.dataset.adminTab === tab)
        );
        document.querySelectorAll('.admin-tab-content').forEach(el =>
          el.classList.toggle('hidden', el.id !== 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1))
        );
        if (tab === 'logs' && !_logs.length) {
          await _loadLogs();
        }
        // Reset rates page when switching back
        if (tab === 'rates') { _page = 1; _renderTable(); }
      });
    });
  }

  // ── Toolbar Bindings ────────────────────────────────────────
  function _bindToolbar() {
    // Tab filter buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _filterTab = btn.dataset.tab || 'all';
        _page = 1;
        document.querySelectorAll('.admin-tab-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === _filterTab)
        );
        _renderTable();
      });
    });

    // Search
    const searchEl = document.getElementById('adminSearch');
    if (searchEl) {
      searchEl.addEventListener('input', Utils.debounce(() => {
        _searchTerm = searchEl.value.trim();
        _page = 1;
        _renderTable();
      }, 250));
    }

    // Sort headers
    document.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (_sortKey === key) { _sortAsc = !_sortAsc; }
        else { _sortKey = key; _sortAsc = true; }
        document.querySelectorAll('[data-sort]').forEach(h => {
          h.querySelector('.sort-icon').textContent =
            h.dataset.sort === _sortKey ? (_sortAsc ? '▲' : '▼') : '⇅';
          h.classList.toggle('sorted', h.dataset.sort === _sortKey);
        });
        _renderTable();
      });
    });

    // Pagination
    document.getElementById('btnPrevPage')?.addEventListener('click', () => { _page--; _renderTable(); });
    document.getElementById('btnNextPage')?.addEventListener('click', () => { _page++; _renderTable(); });

    // Actions
    document.getElementById('btnAddRate')?.addEventListener('click', () => openModal(null));
    document.getElementById('btnExportJSON')?.addEventListener('click', () =>
      Utils.downloadJSON(_rates, `freight-rates-${Utils.todayStr()}.json`));
    document.getElementById('btnExportCSV')?.addEventListener('click', () =>
      Utils.downloadCSV(_rates, `freight-rates-${Utils.todayStr()}.csv`));
    document.getElementById('btnImport')?.addEventListener('click', () => openImportModal());
    document.getElementById('btnAiScan')?.addEventListener('click', () => openAiScanModal());
    document.getElementById('btnDeleteSelected')?.addEventListener('click', _deleteSelected);
    document.getElementById('btnReload')?.addEventListener('click', _loadRates);
  }

  // ── Rate Form Modal ────────────────────────────────────────
  function openModal(rateId) {
    _editingId = rateId || null;
    const rate   = rateId ? _rates.find(r => r.id === rateId) : null;
    const isEdit = !!rate;
    const isAir  = isEdit ? rate.type === 'air' : true;

    document.getElementById('modalTitle').textContent = isEdit ? 'Edit Rate' : 'Add New Rate';

    // Common fields
    const f = id => document.getElementById(id);
    f('fType')       && (f('fType').value       = rate?.type        || 'air');
    f('fOrigin')     && (f('fOrigin').value      = rate?.origin      || '');
    f('fDest')       && (f('fDest').value        = rate?.destination || '');
    f('fCarrier')    && (f('fCarrier').value      = rate?.carrier     || '');
    f('fCommodity')  && (f('fCommodity').value   = rate?.commodity   || '');
    f('fCurrency')   && (f('fCurrency').value    = rate?.currency    || 'CNY');
    f('fValidFrom')  && (f('fValidFrom').value   = rate?.validFrom   || '');
    f('fValidTo')    && (f('fValidTo').value      = rate?.validTo     || '');
    f('fRemark')     && (f('fRemark').value       = rate?.remark      || '');

    // Ocean fields
    f('fRateOcean')  && (f('fRateOcean').value    = rate?.rate        ?? '');
    f('fUnitOcean')  && (f('fUnitOcean').value    = rate?.unit        || 'teu');
    f('fMinChargeOcean') && (f('fMinChargeOcean').value = rate?.minCharge ?? '');

    // Air fields
    f('fRateMin')    && (f('fRateMin').value      = rate?.rateMin     ?? '');
    f('fRateNeg45')  && (f('fRateNeg45').value    = rate?.rateNeg45   ?? '');
    f('fRatePos45')  && (f('fRatePos45').value    = rate?.ratePos45   ?? '');
    f('fRatePos100') && (f('fRatePos100').value   = rate?.ratePos100  ?? '');
    f('fRatePos300') && (f('fRatePos300').value   = rate?.ratePos300  ?? '');
    f('fRatePos500') && (f('fRatePos500').value   = rate?.ratePos500  ?? '');
    f('fRatePos1000')&& (f('fRatePos1000').value  = rate?.ratePos1000 ?? '');
    f('fMinChargeAir')&&(f('fMinChargeAir').value = rate?.minCharge ?? '');
    f('fAgent')       && (f('fAgent').value      = rate?.agent    || '');

    // Show/hide pricing sections based on type
    _updatePricingSections();

    // Switch type listener for show/hide
    f('fType')?.removeEventListener('change', _updatePricingSections);
    f('fType')?.addEventListener('change', _updatePricingSections);

    document.getElementById('rateModal').classList.remove('hidden');
    setTimeout(() => f('fOrigin')?.focus(), 50);
  }

  function _updatePricingSections() {
    const type = document.getElementById('fType')?.value || 'air';
    document.getElementById('oceanPricingSection')?.classList.toggle('hidden', type !== 'ocean');
    document.getElementById('airPricingSection')?.classList.toggle('hidden', type !== 'air');
  }

  function _setSelect(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    [...el.options].forEach(opt => { opt.selected = opt.value === value; });
  }

  function _bindModal() {
    document.getElementById('btnModalCancel')?.addEventListener('click', closeModal);
    document.getElementById('btnModalClose')?.addEventListener('click', closeModal);
    document.getElementById('rateModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('rateModal')) closeModal();
    });
    document.getElementById('rateForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      await _saveRate();
    });
  }

  function closeModal() {
    document.getElementById('rateModal')?.classList.add('hidden');
  }

  async function _saveRate() {
    const f = id => document.getElementById(id)?.value?.trim();
    const type  = f('fType') || 'air';
    const now   = new Date().toISOString();

    let rateObj = {};
    let oldRate = null;

    if (_editingId) {
      const idx = _rates.findIndex(r => r.id === _editingId);
      if (idx !== -1) {
        oldRate = { ..._rates[idx] };
        rateObj = { ..._rates[idx] };
      }
    } else {
      rateObj.id = Utils.uuid();
    }

    // Common fields
    rateObj.type        = type;
    rateObj.origin      = f('fOrigin')?.toUpperCase() || '';
    rateObj.destination = f('fDest')?.toUpperCase()   || '';
    rateObj.carrier     = f('fCarrier')?.toUpperCase() || '';
    rateObj.commodity   = f('fCommodity')  || '';
    rateObj.currency    = f('fCurrency') || 'CNY';
    rateObj.validFrom   = f('fValidFrom') || null;
    rateObj.validTo     = f('fValidTo')   || null;
    rateObj.remark      = f('fRemark')    || '';
    rateObj.updatedAt   = now;

    if (type === 'ocean') {
      const rateVal = parseFloat(f('fRateOcean'));
      if (isNaN(rateVal)) { alert('Please enter a valid ocean rate.'); return; }
      rateObj.rate     = rateVal;
      rateObj.unit     = f('fUnitOcean') || 'teu';
      rateObj.minCharge = parseFloat(f('fMinChargeOcean')) || null;
      // Clear air-specific fields
      ['rateMin','rateNeg45','ratePos45','ratePos100','ratePos300','ratePos500','ratePos1000'].forEach(k => delete rateObj[k]);
      rateObj.agent    = f('fAgent') || null;
    } else {
      // Air: use rateNeg45 as primary rate field
      const parseTier = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v; };
      rateObj.rateMin    = parseTier('fRateMin');
      rateObj.rateNeg45  = parseTier('fRateNeg45');
      rateObj.ratePos45  = parseTier('fRatePos45');
      rateObj.ratePos100 = parseTier('fRatePos100');
      rateObj.ratePos300 = parseTier('fRatePos300');
      rateObj.ratePos500 = parseTier('fRatePos500');
      rateObj.ratePos1000= parseTier('fRatePos1000');
      rateObj.minCharge  = parseTier('fMinChargeAir') || null;
      rateObj.agent      = f('fAgent') || null;
      rateObj.unit       = 'kg';
      // Use rateNeg45 as the "main" rate field for ocean compatibility
      rateObj.rate       = rateObj.rateNeg45 ?? rateObj.rateMin ?? 0;
    }

    // Validate: at least one price tier must be filled for air
    if (type === 'air') {
      const hasTier = [rateObj.rateMin, rateObj.rateNeg45, rateObj.ratePos45, rateObj.ratePos100,
                       rateObj.ratePos300, rateObj.ratePos500, rateObj.ratePos1000]
                       .some(v => v != null);
      if (!hasTier) {
        alert('Please enter at least one price tier for air freight.'); return;
      }
    } else {
      if (!rateObj.rate) { alert('Please enter a valid ocean rate.'); return; }
    }

    // Write to state
    if (_editingId) {
      const idx = _rates.findIndex(r => r.id === _editingId);
      if (idx !== -1) _rates[idx] = rateObj;
    } else {
      _rates.push(rateObj);
    }

    closeModal();
    _renderStats();
    _renderTable();

    try {
      await API.upsertRate(rateObj);
      // Log the action
      await API.insertLog({
        action:   _editingId ? 'UPDATE' : 'INSERT',
        targetId: rateObj.id,
        oldData:  oldRate,
        newData:  rateObj,
        summary:  `${type === 'air' ? '✈' : '🚢'} ${rateObj.origin}→${rateObj.destination} ${rateObj.carrier}`,
      });
      Utils.showSyncBar('✓ Rate saved');
    } catch (err) {
      Utils.showSyncBar('✕ Save failed: ' + err.message, true);
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function deleteRate(id) {
    if (!confirm('Delete this rate?')) return;
    const rate = _rates.find(r => r.id === id);
    _rates = _rates.filter(r => r.id !== id);
    _renderStats();
    _renderTable();
    try {
      await API.deleteRate(id);
      if (rate) {
        await API.insertLog({
          action:   'DELETE',
          targetId: id,
          oldData:  rate,
          newData:  null,
          summary:  `${rate.type === 'air' ? '✈' : '🚢'} ${rate.origin}→${rate.destination} ${rate.carrier}`,
        });
      }
      Utils.showSyncBar('✓ Rate deleted');
    } catch (err) {
      Utils.showSyncBar('✕ Delete failed: ' + err.message, true);
    }
  }

  function _deleteSelected() {
    const checked = [...document.querySelectorAll('#adminTableBody input[type=checkbox]:checked')];
    if (!checked.length) { alert('No rows selected.'); return; }
    if (!confirm(`Delete ${checked.length} selected rate(s)?`)) return;
    const ids = new Set(checked.map(c => c.dataset.id));
    const deletedRates = _rates.filter(r => ids.has(r.id));
    _rates = _rates.filter(r => !ids.has(r.id));
    _renderStats();
    _renderTable();
    Promise.all(ids.map(id => API.deleteRate(id)))
      .then(async () => {
        await API.insertLogBatch(deletedRates.map(r => ({
          action:   'DELETE',
          targetId: r.id,
          oldData:  r,
          newData:  null,
          summary:  `${r.type === 'air' ? '✈' : '🚢'} ${r.origin}→${r.destination}`,
        })));
        Utils.showSyncBar(`✓ ${ids.size} rate(s) deleted`);
      })
      .catch(err => Utils.showSyncBar('✕ Delete failed: ' + err.message, true));
  }

  // ── Excel Import Modal ────────────────────────────────────────
  function openImportModal() {
    _importRows = [];
    document.getElementById('importModal')?.classList.remove('hidden');
    document.getElementById('importPreviewSection')?.classList.add('hidden');
    document.getElementById('importDropZone')?.classList.remove('drag-over');
    const fi = document.getElementById('importFileInput');
    if (fi) fi.value = '';
  }

  function _closeImportModal() {
    document.getElementById('importModal')?.classList.add('hidden');
  }

  function _bindImportModal() {
    document.getElementById('btnImportCancel')?.addEventListener('click', _closeImportModal);
    document.getElementById('btnImportClose')?.addEventListener('click', _closeImportModal);
    document.getElementById('importModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('importModal')) _closeImportModal();
    });

    const dropZone = document.getElementById('importDropZone');
    const fileInput = document.getElementById('importFileInput');
    dropZone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => { if (e.target.files[0]) _parseFile(e.target.files[0]); });
    dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) _parseFile(e.dataTransfer.files[0]);
    });

    document.getElementById('btnDownloadTemplate')?.addEventListener('click', () => {
      Utils.downloadCSV(Utils.getTemplateRows(), 'rate-import-template.csv');
    });
    document.getElementById('btnImportConfirm')?.addEventListener('click', _confirmImport);
  }

  function _parseFile(file) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Please check your internet connection.'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        _previewImport(json);
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  }

  function _previewImport(rows) {
    _importRows = rows.map(row => {
      const norm = {};
      Object.keys(row).forEach(k => { norm[k.trim().toLowerCase()] = row[k]; });
      return norm;
    });

    const previewTbody = document.getElementById('importPreviewBody');
    const summaryEl    = document.getElementById('importSummary');
    if (!previewTbody) return;

    let okCount = 0, errCount = 0;
    previewTbody.innerHTML = _importRows.map((r, i) => {
      const hasError = !r.origin || !r.destination || isNaN(parseFloat(r.rate));
      if (hasError) errCount++; else okCount++;
      return `
        <tr class="${hasError ? 'row-error' : ''}">
          <td>${i + 1}</td>
          <td>${Utils.esc(r.type || '—')}</td>
          <td>${Utils.esc(r.origin || '—')}</td>
          <td>${Utils.esc(r.destination || '—')}</td>
          <td>${Utils.esc(r.carrier || '—')}</td>
          <td>${Utils.esc(r.rate)}</td>
          <td>${Utils.esc(r.currency || 'CNY')}</td>
          <td>${Utils.esc(r.unit || 'kg')}</td>
          <td>${Utils.esc(r.validfrom || '—')}</td>
          <td>${Utils.esc(r.validto || '—')}</td>
        </tr>`;
    }).join('');

    if (summaryEl) {
      summaryEl.innerHTML = `
        <span class="summary-item ok">✓ ${okCount} valid rows</span>
        ${errCount > 0 ? `<span class="summary-item error">✕ ${errCount} rows with errors (will be skipped)</span>` : ''}`;
    }

    document.getElementById('importPreviewSection')?.classList.remove('hidden');
    document.getElementById('btnImportConfirm')?.removeAttribute('disabled');
  }

  async function _confirmImport() {
    const now = new Date().toISOString();
    const newRates = _importRows
      .filter(r => r.origin && r.destination && !isNaN(parseFloat(r.rate)))
      .map(r => ({
        id:          Utils.uuid(),
        type:        (r.type || 'air').toLowerCase(),
        origin:      String(r.origin).toUpperCase().trim(),
        destination: String(r.destination).toUpperCase().trim(),
        carrier:     String(r.carrier || '').toUpperCase().trim(),
        commodity:   String(r.commodity || '').trim(),
        rate:        parseFloat(r.rate),
        currency:    String(r.currency || 'CNY').toUpperCase().trim(),
        unit:        String(r.unit || 'kg').toLowerCase().trim(),
        minCharge:   parseFloat(r.mincharge || r.minCharge) || null,
        validFrom:   r.validfrom || r.validFrom || null,
        validTo:     r.validto   || r.validTo   || null,
        remark:      String(r.remark || '').trim(),
        updatedAt:   now,
      }));

    _rates.push(...newRates);
    _closeImportModal();
    _renderStats();
    _renderTable();

    try {
      await API.batchUpsert(newRates);
      await API.insertLog({
        action:   'BATCH_IMPORT',
        targetId: null,
        oldData:  null,
        newData:  newRates,
        summary:  `Imported ${newRates.length} rate(s) from Excel`,
      });
      Utils.showSyncBar(`✓ Imported ${newRates.length} rate(s)`);
    } catch (err) {
      Utils.showSyncBar('✕ Import failed: ' + err.message, true);
    }
  }

  // ── Settings ──────────────────────────────────────────────────
  function _bindSettings() {
    // Load current values into form
    _populateSettingsForm();

    // Save Exchange Rate button
    document.getElementById('btnSaveExchangeRate')?.addEventListener('click', async () => {
      const val = parseFloat(document.getElementById('sExchangeRate')?.value);
      if (isNaN(val) || val <= 0) {
        document.getElementById('feedbackExchange').innerHTML =
          '<span style="color:var(--color-error)">Please enter a valid positive number</span>';
        return;
      }
      const btn = document.getElementById('btnSaveExchangeRate');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await API.saveSettings({ exchangeRate: val, markupPercent: _settings.markupPercent });
        _settings.exchangeRate = val;
        _updateSettingsSummary();
        document.getElementById('feedbackExchange').innerHTML =
          '<span style="color:var(--color-success)">✓ Saved — exchange rate set to ' + val + '</span>';
      } catch (err) {
        document.getElementById('feedbackExchange').innerHTML =
          '<span style="color:var(--color-error)">✕ Failed: ' + err.message + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = 'Save Rate';
      }
    });

    // Save Markup button
    document.getElementById('btnSaveMarkup')?.addEventListener('click', async () => {
      const val = parseFloat(document.getElementById('sMarkupPercent')?.value);
      if (isNaN(val) || val < 0) {
        document.getElementById('feedbackMarkup').innerHTML =
          '<span style="color:var(--color-error)">Please enter a valid percentage (≥ 0)</span>';
        return;
      }
      const btn = document.getElementById('btnSaveMarkup');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await API.saveSettings({ exchangeRate: _settings.exchangeRate, markupPercent: val });
        _settings.markupPercent = val;
        _updateSettingsSummary();
        document.getElementById('feedbackMarkup').innerHTML =
          '<span style="color:var(--color-success)">✓ Saved — markup set to ' + val + '%</span>';
      } catch (err) {
        document.getElementById('feedbackMarkup').innerHTML =
          '<span style="color:var(--color-error)">✕ Failed: ' + err.message + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = 'Save Markup';
      }
    });
  }

  function _populateSettingsForm() {
    const el = id => document.getElementById(id);
    if (el('sExchangeRate'))  el('sExchangeRate').value  = _settings.exchangeRate  ?? 7.0;
    if (el('sMarkupPercent'))  el('sMarkupPercent').value = _settings.markupPercent ?? 0.0;
    _updateSettingsSummary();
  }

  function _updateSettingsSummary() {
    document.getElementById('curExchangeRate')?.setAttribute('data-value', _settings.exchangeRate ?? 7.0);
    document.getElementById('curExchangeRate').textContent = (_settings.exchangeRate ?? 7.0) + ' CNY/USD';
    document.getElementById('curMarkup')?.setAttribute('data-value', _settings.markupPercent ?? 0);
    document.getElementById('curMarkup').textContent = (_settings.markupPercent ?? 0) + '%';
    const updatedAt = _settings.updatedAt
      ? Utils.fmtDate(_settings.updatedAt.slice(0, 10))
      : '—';
    if (document.getElementById('curSettingsUpdated')) {
      document.getElementById('curSettingsUpdated').textContent = updatedAt;
    }
  }

  // ── Logs ──────────────────────────────────────────────────────
  function _bindLogs() {
    document.getElementById('btnReloadLogs')?.addEventListener('click', _loadLogs);
  }

  function _renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    if (!_logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--color-text-muted)">No logs yet</td></tr>';
      return;
    }
    const actionLabel = {
      INSERT:       '<span class="badge badge-success">INSERT</span>',
      UPDATE:       '<span class="badge badge-warning">UPDATE</span>',
      DELETE:       '<span class="badge badge-danger">DELETE</span>',
      BATCH_IMPORT: '<span class="badge" style="background:#7b1fa2;color:white">BATCH_IMPORT</span>',
    };
    tbody.innerHTML = _logs.map(log => `
      <tr>
        <td>${log.createdAt ? Utils.fmtDate(log.createdAt.slice(0, 10)) + ' ' + (log.createdAt.slice(11, 16) || '') : '—'}</td>
        <td>${actionLabel[log.action] || log.action}</td>
        <td><strong>${Utils.esc(log.summary || '—')}</strong></td>
        <td>${Utils.esc(log.operator || 'admin')}</td>
        <td>
          <button class="btn btn-ghost btn-xs" onclick="AdminApp.showLogDetail('${Utils.esc(log.id)}')">
            View
          </button>
        </td>
      </tr>`).join('');
  }

  function showLogDetail(logId) {
    const log = _logs.find(l => l.id === logId);
    if (!log) return;
    const oldStr = log.oldData ? JSON.stringify(log.oldData, null, 2) : '(none)';
    const newStr = log.newData ? JSON.stringify(log.newData, null, 2) : '(none)';
    const detail = `Action: ${log.action}\nRoute: ${log.summary}\nOperator: ${log.operator}\n\n--- Old Data ---\n${oldStr}\n\n--- New Data ---\n${newStr}`;
    alert(detail);
  }

  // ── AI Scan Modal ─────────────────────────────────────────────
  function openAiScanModal() {
    document.getElementById('aiScanModal')?.classList.remove('hidden');
    _resetAiScanModal();
  }

  function _resetAiScanModal() {
    document.getElementById('aiScanStep1')?.classList.remove('hidden');
    document.getElementById('aiScanStep2')?.classList.add('hidden');
    document.getElementById('aiScanStep3')?.classList.add('hidden');
    document.getElementById('aiScanStep4')?.classList.add('hidden');
    document.getElementById('btnAiScanConfirm')?.classList.add('hidden');
    document.getElementById('btnAiTextConfirm')?.classList.add('hidden');
    document.getElementById('aiImagePreview')?.classList.add('hidden');
    document.getElementById('aiDropZone')?.classList.remove('drag-over', 'drag-over-light');
    document.getElementById('btnAiScanStart')?.setAttribute('disabled', 'true');
    document.getElementById('aiProgressBar')?.style.setProperty('width', '0%');
    const fi = document.getElementById('aiFileInput');
    if (fi) fi.value = '';
    // Clear text paste
    const ta = document.getElementById('aiPasteArea');
    if (ta) ta.value = '';
    // Switch back to image tab
    _switchAiTab('image');
    // Clear AI form fields
    ['aiOrigin','aiDest','aiCarrier','aiCommodity','aiRateMin','aiRateNeg45',
     'aiRatePos45','aiRatePos100','aiRatePos300','aiRatePos500',
     'aiRatePos1000','aiMinCharge','aiRemark'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['aiValidFrom','aiValidTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = Utils.todayStr();
    });
  }

  function _closeAiScanModal() {
    document.getElementById('aiScanModal')?.classList.add('hidden');
    if (_ocrWorker) { try { _ocrWorker.terminate(); } catch(e){} _ocrWorker = null; }
  }

  function _bindAiScanModal() {
    document.getElementById('btnAiScanClose')?.addEventListener('click', _closeAiScanModal);
    document.getElementById('btnAiScanCancel')?.addEventListener('click', _closeAiScanModal);
    document.getElementById('aiScanModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('aiScanModal')) _closeAiScanModal();
    });

    // File upload
    const dropZone = document.getElementById('aiDropZone');
    const fileInput = document.getElementById('aiFileInput');
    dropZone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => { if (e.target.files[0]) _handleAiFile(e.target.files[0]); });
    dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over-light'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over-light'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over-light');
      if (e.dataTransfer.files[0]) _handleAiFile(e.dataTransfer.files[0]);
    });

    // Paste from clipboard
    document.addEventListener('paste', e => {
      if (!document.getElementById('aiScanModal')?.classList.contains('hidden')) {
        const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
        if (item) { item.getAsFile(f => f && _handleAiFile(f)); }
      }
    });

    // Scan button
    document.getElementById('btnAiScanStart')?.addEventListener('click', _runOcr);

    // Confirm button (image OCR path)
    document.getElementById('btnAiScanConfirm')?.addEventListener('click', _confirmAiScan);

    // Text paste import
    document.getElementById('btnAiTextConfirm')?.addEventListener('click', _confirmTextImport);
  }

  // ── AI Scan: Tab Switching (Image vs Text) ───────────────
  function _switchAiTab(tab) {
    const imageTab = document.getElementById('aiImageTab');
    const textTab  = document.getElementById('aiTextTab');
    const imgBtn   = document.getElementById('btnAiTabImage');
    const txtBtn   = document.getElementById('btnAiTabText');
    if (tab === 'image') {
      imageTab?.classList.remove('hidden');
      textTab?.classList.add('hidden');
      imgBtn?.classList.add('active');
      txtBtn?.classList.remove('active');
    } else {
      imageTab?.classList.add('hidden');
      textTab?.classList.remove('hidden');
      imgBtn?.classList.remove('active');
      txtBtn?.classList.add('active');
    }
  }

  // ── Text Paste Parsing ────────────────────────────────────
  /** Parse pasted table text into structured row objects */
  function _parsePastedText() {
    const raw = document.getElementById('aiPasteArea')?.value?.trim();
    if (!raw) { alert('Please paste some data first.'); return; }

    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 1) { alert('No data found.'); return; }

    // Detect delimiter: tab, pipe, comma, multiple spaces
    const SEP_PATTERNS = [/\t/, /\s*\|\s*/, /,/];
    let separator = null;
    for (const pat of SEP_PATTERNS) {
      if (lines[0].match(pat)) { separator = pat; break; }
    }
    if (!separator) {
      // Fall back: split by 2+ spaces
      separator = /\s{2,}/;
    }

    // Parse header row
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
    const FIELD_MAP = {
      origin:      ['origin', 'ori', 'from', 'orig'],
      destination: ['destination', 'dest', 'to', 'dst'],
      carrier:     ['carrier', 'airline', '航空公司', 'flight'],
      type:        ['type', 'freight', 'mode'],
      commodity:   ['commodity', 'cargo', '品名'],
      ratemin:     ['min', 'minimum', 'min charge', 'mincharge', '最低'],
      rateneg45:   ['-45', 'neg45', '≤45', '45kg', '≤45kg'],
      ratepos45:   ['+45', 'pos45', '>45', '>45kg', '+45kg'],
      ratepos100:  ['+100', 'pos100', '>100', '>100kg', '+100kg'],
      ratepos300:  ['+300', 'pos300', '>300', '>300kg', '+300kg'],
      ratepos500:  ['+500', 'pos500', '>500', '>500kg', '+500kg'],
      ratepos1000: ['+1000', 'pos1000', '>1000', '>1000kg', '+1000kg'],
      mincharge:   ['minchg', 'min charge', '最低收费'],
      agent:       ['agent'],
      currency:    ['currency', '币种', 'curr'],
      validfrom:   ['valid from', 'validfrom', '起始', 'validfrom'],
      validto:     ['valid to', 'validto', '截止', 'validto'],
    };

    // Find column indices for each field
    const colIndex = {};
    headers.forEach((h, i) => {
      for (const [field, aliases] of Object.entries(FIELD_MAP)) {
        if (aliases.some(a => h.includes(a))) {
          colIndex[field] = i;
        }
      }
    });

    // Parse data rows
    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(separator).map(c => c.trim());
      if (!cells.some(c => c)) continue; // skip empty rows

      const row = {
        _line: i + 1,
        _valid: true,
        origin:       colIndex.origin      != null ? cells[colIndex.origin]      : '',
        destination:  colIndex.destination != null ? cells[colIndex.destination] : '',
        carrier:      colIndex.carrier      != null ? cells[colIndex.carrier]      : '',
        type:         colIndex.type         != null ? cells[colIndex.type]         : 'air',
        commodity:    colIndex.commodity   != null ? cells[colIndex.commodity]   : '',
        rateMin:      colIndex.ratemin      != null ? parseFloat(cells[colIndex.ratemin]?.replace(/,/g,'')) : null,
        rateNeg45:    colIndex.rateneg45    != null ? parseFloat(cells[colIndex.rateneg45]?.replace(/,/g,'')) : null,
        ratePos45:    colIndex.ratepos45    != null ? parseFloat(cells[colIndex.ratepos45]?.replace(/,/g,'')) : null,
        ratePos100:   colIndex.ratepos100   != null ? parseFloat(cells[colIndex.ratepos100]?.replace(/,/g,'')) : null,
        ratePos300:   colIndex.ratepos300   != null ? parseFloat(cells[colIndex.ratepos300]?.replace(/,/g,'')) : null,
        ratePos500:   colIndex.ratepos500   != null ? parseFloat(cells[colIndex.ratepos500]?.replace(/,/g,'')) : null,
        ratePos1000:  colIndex.ratepos1000  != null ? parseFloat(cells[colIndex.ratepos1000]?.replace(/,/g,'')) : null,
        minCharge:    colIndex.mincharge    != null ? parseFloat(cells[colIndex.mincharge]?.replace(/,/g,'')) : null,
        agent:        colIndex.agent        != null ? cells[colIndex.agent]        : '',
        currency:     colIndex.currency     != null ? cells[colIndex.currency]       : 'CNY',
        validFrom:    colIndex.validfrom    != null ? cells[colIndex.validfrom]      : '',
        validTo:      colIndex.validto      != null ? cells[colIndex.validto]        : '',
        remark:       '',
      };

      // Validate: need origin + destination + at least one price
      const hasPrice = [row.rateMin, row.rateNeg45, row.ratePos45, row.ratePos100,
                        row.ratePos300, row.ratePos500, row.ratePos1000].some(v => !isNaN(v));
      if (!row.origin || !row.destination) row._valid = false;

      parsedRows.push(row);
    }

    if (!parsedRows.length) { alert('Could not parse any rows. Check the format.'); return; }

    // Store for editing
    _importRows = parsedRows;
    _renderTextPreview(parsedRows);
  }

  function _renderTextPreview(rows) {
    const wrap = document.getElementById('aiTextPreviewTableWrap');
    const summary = document.getElementById('aiTextPreviewSummary');
    if (!wrap) return;

    const validRows   = rows.filter(r => r._valid);
    const invalidRows = rows.filter(r => !r._valid);

    const headers = ['Origin','Destination','Carrier','Min','≤45kg','>45kg','>100kg','>300kg','>500kg','>1000kg','Agent'];
    const colKeys = ['origin','destination','carrier','rateMin','rateNeg45','ratePos45',
                     'ratePos100','ratePos300','ratePos500','ratePos1000','agent'];

    let html = `<table class="ai-text-preview-table">
      <thead><tr><th>#</th>${headers.map(h => `<th>${Utils.esc(h)}</th>`).join('')}</tr></thead>
      <tbody>`;

    rows.forEach((r, i) => {
      const errCls = r._valid ? '' : ' row-error-cell';
      html += `<tr>
        <td class="${errCls}" style="text-align:center;font-weight:700;">${i + 1}</td>
        ${colKeys.map(k => {
          let val = r[k];
          if (val == null || isNaN(val)) val = '—';
          else if (typeof val === 'number') val = val.toFixed(2);
          return `<td class="editable-cell ${errCls}"
            contenteditable="true"
            data-row="${i}" data-key="${k}">${Utils.esc(String(val))}</td>`;
        }).join('')}
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;

    if (summary) {
      summary.innerHTML = `
        <span class="summary-ok">✓ ${validRows.length} row(s) ready to import</span>
        ${invalidRows.length ? `<span class="summary-warn">⚠ ${invalidRows.length} row(s) missing origin/destination (will be skipped)</span>` : ''}`;
    }

    document.getElementById('aiScanStep1')?.classList.add('hidden');
    document.getElementById('aiScanStep4')?.classList.remove('hidden');
    document.getElementById('btnAiTextConfirm')?.classList.remove('hidden');
    document.getElementById('btnAiScanConfirm')?.classList.add('hidden');

    // Wire up inline editing
    wrap.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('blur', () => {
        const rowIdx = parseInt(cell.dataset.row);
        const key    = cell.dataset.key;
        const raw    = cell.textContent.trim();
        const val    = parseFloat(raw.replace(/,/g, ''));
        if (['rateMin','rateNeg45','ratePos45','ratePos100','ratePos300','ratePos500','ratePos1000',
             'minCharge'].includes(key)) {
          _importRows[rowIdx][key] = isNaN(val) ? null : val;
        } else {
          _importRows[rowIdx][key] = raw.toUpperCase();
        }
      });
    });
  }

  async function _confirmTextImport() {
    const validRows = _importRows.filter(r => r._valid);
    if (!validRows.length) { alert('No valid rows to import.'); return; }

    const now = new Date().toISOString();
    const newRates = validRows.map(r => ({
      id:           Utils.uuid(),
      type:         'air',
      origin:       String(r.origin || '').toUpperCase().trim(),
      destination:  String(r.destination || '').toUpperCase().trim(),
      carrier:      String(r.carrier || '').toUpperCase().trim(),
      commodity:    String(r.commodity || '').trim(),
      currency:     String(r.currency || 'CNY').toUpperCase().trim(),
      unit:         'kg',
      rateMin:      r.rateMin,
      rateNeg45:    r.rateNeg45,
      ratePos45:    r.ratePos45,
      ratePos100:   r.ratePos100,
      ratePos300:   r.ratePos300,
      ratePos500:   r.ratePos500,
      ratePos1000:  r.ratePos1000,
      minCharge:    r.minCharge,
      agent:        r.agent        || null,
      validFrom:    r.validFrom || null,
      validTo:      r.validTo || null,
      remark:      `Imported from text paste (${new Date().toLocaleDateString()})`,
      updatedAt:    now,
      rate:         r.rateNeg45 ?? r.rateMin ?? 0,
    }));

    _rates.push(...newRates);
    _closeAiScanModal();
    _renderStats();
    _renderTable();

    try {
      await API.batchUpsert(_rates);
      await API.insertLog({
        action:   'BATCH_IMPORT',
        targetId: null,
        oldData:  null,
        newData:  newRates,
        summary:  `Imported ${newRates.length} rate(s) from text paste`,
      });
      Utils.showSyncBar(`✓ Imported ${newRates.length} rate(s) from text`);
    } catch (err) {
      Utils.showSyncBar('✕ Import failed: ' + err.message, true);
    }
  }

  function _handleAiFile(file) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Please upload an image file (JPG, PNG) or PDF screenshot.'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('aiImagePreview');
      if (preview) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
      }
      document.getElementById('btnAiScanStart')?.removeAttribute('disabled');
    };
    reader.readAsDataURL(file);
  }

  async function _runOcr() {
    const preview = document.getElementById('aiImagePreview');
    if (!preview?.src) { alert('No image loaded.'); return; }

    document.getElementById('aiScanStep1')?.classList.add('hidden');
    document.getElementById('aiScanStep2')?.classList.remove('hidden');

    const progressBar  = document.getElementById('aiProgressBar');
    const progressText = document.getElementById('aiProgressText');

    try {
      const result = await Tesseract.recognize(preview.src, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            const pct = Math.round(m.progress * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressText) progressText.textContent = `Recognizing text… ${pct}%`;
          }
        },
      });

      const text = result?.data?.text || '';
      if (progressText) progressText.textContent = 'Parsing price data…';
      if (progressBar)  progressBar.style.width = '100%';

      // Parse the recognized text
      const parsed = _parseOcrText(text);
      _populateAiForm(parsed);

      document.getElementById('aiScanStep2')?.classList.add('hidden');
      document.getElementById('aiScanStep3')?.classList.remove('hidden');
      document.getElementById('btnAiScanConfirm')?.classList.remove('hidden');

    } catch (err) {
      alert('OCR failed: ' + err.message);
      document.getElementById('aiScanStep2')?.classList.add('hidden');
      document.getElementById('aiScanStep1')?.classList.remove('hidden');
    }
  }

  /**
   * Parse OCR text to extract rate table data.
   * Looks for common patterns: airport codes, numbers.
   */
  function _parseOcrText(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const AIRPORTS = /([A-Z]{2,3})\s*[-→→]\s*([A-Z]{2,3})/i;
    const AIRLINE  = /([A-Z]{2,6})(?:\s|$)/i;
    const NUMBER   = /[\d,]+\.?\d*/;
    const DECIMAL  = /(\d+\.?\d*)/;
    const TIER_PATTERNS = [
      /([\d,]+\.?\d*)\s*(?:min|minimum|最低)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:-?45|≤?\s*45)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:\+?\s*45|>\s*45)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:\+?\s*100|>\s*100)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:\+?\s*300|>\s*300)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:\+?\s*500|>\s*500)[\s:]*([\d,]+\.?\d*)?/i,
      /([\d,]+\.?\d*)\s*(?:\+?\s*1000|>\s*1000)[\s:]*([\d,]+\.?\d*)?/i,
    ];

    let origin = '', destination = '', carrier = '', agent = '';
    const tiers = { min: null, neg45: null, pos45: null, pos100: null, pos300: null, pos500: null, pos1000: null };

    // Try to find route
    for (const line of lines) {
      const m = line.match(AIRPORTS);
      if (m && !origin) { origin = m[1]; destination = m[2]; }
    }

    // Try to find carrier
    for (const line of lines) {
      const words = line.split(/\s+/);
      for (const word of words) {
        if (/^[A-Z]{2,6}$/.test(word) && word.length >= 2 && word.length <= 6) {
          carrier = word; break;
        }
      }
      if (carrier) break;
    }

    // Try to find tier prices from structured tables
    const numPattern = /(\d+\.?\d*)/g;
    // Find lines that look like a table row with multiple numbers
    for (const line of lines) {
      const nums = [...line.matchAll(numPattern)].map(m => parseFloat(m[1]));
      // If line has 5-8 numbers, it's likely a pricing row
      if (nums.length >= 5 && nums.length <= 8) {
        // Map to tiers
        if (!tiers.min)    tiers.min    = nums[0];
        if (!tiers.neg45)  tiers.neg45  = nums[1];
        if (!tiers.pos45)  tiers.pos45  = nums[2];
        if (!tiers.pos100) tiers.pos100 = nums[3];
        if (!tiers.pos300) tiers.pos300 = nums[4];
        if (nums[5] != null && !tiers.pos500)  tiers.pos500  = nums[5];
        if (nums[6] != null && !tiers.pos1000) tiers.pos1000 = nums[6];
      }
    }

    return { origin, destination, carrier, agent, tiers };
  }

  function _populateAiForm(parsed) {
    const el = id => document.getElementById(id);
    if (el('aiOrigin'))    el('aiOrigin').value    = parsed.origin    || '';
    if (el('aiDest'))      el('aiDest').value       = parsed.destination|| '';
    if (el('aiCarrier'))   el('aiCarrier').value    = parsed.carrier   || '';
    if (el('aiAgent'))     el('aiAgent').value      = parsed.agent      || '';
    if (el('aiRateMin'))   el('aiRateMin').value    = _n(parsed.tiers.min)    || '';
    if (el('aiRateNeg45')) el('aiRateNeg45').value  = _n(parsed.tiers.neg45)  || '';
    if (el('aiRatePos45')) el('aiRatePos45').value  = _n(parsed.tiers.pos45)  || '';
    if (el('aiRatePos100'))el('aiRatePos100').value = _n(parsed.tiers.pos100) || '';
    if (el('aiRatePos300'))el('aiRatePos300').value = _n(parsed.tiers.pos300) || '';
    if (el('aiRatePos500'))el('aiRatePos500').value = _n(parsed.tiers.pos500) || '';
    if (el('aiRatePos1000'))el('aiRatePos1000').value= _n(parsed.tiers.pos1000)|| '';
    if (el('aiValidFrom')) el('aiValidFrom').value  = Utils.todayStr();
  }

  function _n(v) { return (v != null && !isNaN(v)) ? String(v) : ''; }

  async function _confirmAiScan() {
    const f = id => document.getElementById(id)?.value?.trim();
    const tiers = {
      min:    _n(parseFloat(f('aiRateMin'))),
      neg45:  _n(parseFloat(f('aiRateNeg45'))),
      pos45:  _n(parseFloat(f('aiRatePos45'))),
      pos100: _n(parseFloat(f('aiRatePos100'))),
      pos300: _n(parseFloat(f('aiRatePos300'))),
      pos500: _n(parseFloat(f('aiRatePos500'))),
      pos1000:_n(parseFloat(f('aiRatePos1000'))),
    };
    const hasTier = Object.values(tiers).some(v => v);
    if (!hasTier) { alert('Please enter at least one price tier.'); return; }

    _closeAiScanModal();

    // Populate the rate form and open it
    const rateObj = {
      id:           Utils.uuid(),
      type:         'air',
      origin:       f('aiOrigin')?.toUpperCase() || '',
      destination:  f('aiDest')?.toUpperCase()    || '',
      carrier:      f('aiCarrier')?.toUpperCase() || '',
      commodity:    f('aiCommodity')  || '',
      currency:     f('aiCurrency') || 'CNY',
      unit:         'kg',
      rateMin:      tiers.min    ? parseFloat(tiers.min)    : null,
      rateNeg45:    tiers.neg45  ? parseFloat(tiers.neg45)  : null,
      ratePos45:    tiers.pos45  ? parseFloat(tiers.pos45)  : null,
      ratePos100:   tiers.pos100 ? parseFloat(tiers.pos100) : null,
      ratePos300:   tiers.pos300 ? parseFloat(tiers.pos300) : null,
      ratePos500:   tiers.pos500 ? parseFloat(tiers.pos500) : null,
      ratePos1000:  tiers.pos1000? parseFloat(tiers.pos1000): null,
      minCharge:    _n(parseFloat(f('aiMinCharge'))) ? parseFloat(f('aiMinCharge')) : null,
      agent:        f('aiAgent') || null,
      validFrom:    f('aiValidFrom') || null,
      validTo:      f('aiValidTo')   || null,
      remark:       f('aiRemark')    || 'Imported from AI scan',
      updatedAt:    new Date().toISOString(),
      rate:         tiers.neg45 ? parseFloat(tiers.neg45) : (tiers.min ? parseFloat(tiers.min) : 0),
    };

    _rates.push(rateObj);
    _renderStats();
    _renderTable();

    try {
      await API.upsertRate(rateObj);
      await API.insertLog({
        action:   'INSERT',
        targetId: rateObj.id,
        oldData:  null,
        newData:  rateObj,
        summary:  `✈ AI: ${rateObj.origin}→${rateObj.destination} ${rateObj.carrier} (AI scan)`,
      });
      Utils.showSyncBar('✓ Rate added from AI scan');
    } catch (err) {
      Utils.showSyncBar('✕ Save failed: ' + err.message, true);
    }
  }

  // ── Logout ────────────────────────────────────────────────────
  function _bindLogout() {
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      Auth.logout();
      window.location.href = 'admin.html';
    });
  }

  // ── Loading State ─────────────────────────────────────────────
  function _setLoading(show) {
    const el = document.getElementById('adminLoading');
    if (el) el.classList.toggle('hidden', !show);
    const table = document.getElementById('adminTableWrap');
    if (table) table.classList.toggle('hidden', show);
  }

  // ── Expose Public API ─────────────────────────────────────────
  return {
    init,
    editRate:   (id) => openModal(id),
    deleteRate: (id) => deleteRate(id),
    showLogDetail: (id) => showLogDetail(id),
    _switchAiTab,
    _parsePastedText,
  };
})();

// Global wrappers for HTML onclick handlers
function _switchAiTab(tab) { AdminApp._switchAiTab(tab); }
function _parsePastedText() { AdminApp._parsePastedText(); }
