/**
 * admin.js — Admin CRUD + Excel import logic
 *
 * Depends on: CONFIG, API, Auth, Utils
 * Loaded by: admin.html (after auth check)
 */

const AdminApp = (() => {
  // ── State ───────────────────────────────────────────────────────
  let _rates      = [];
  let _page       = 1;
  let _sortKey    = 'updatedAt';
  let _sortAsc    = false;
  let _filterTab  = 'all';   // 'all' | 'air' | 'ocean'
  let _searchTerm = '';
  let _editingId  = null;   // null = new, string = editing existing
  let _importRows = [];     // parsed rows from Excel, pending confirmation

  // ── Init ────────────────────────────────────────────────────────
  async function init() {
    if (!Auth.isLoggedIn()) return;  // guard (page handles redirect)

    _bindLogout();
    _bindToolbar();
    _bindModal();
    _bindImportModal();
    await _loadRates();
  }

  // ── Data ────────────────────────────────────────────────────────
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

  async function _saveRates(successMsg) {
    try {
      await API.batchUpsert(_rates);
      Utils.showSyncBar(successMsg || '✓ Saved to cloud');
    } catch (err) {
      Utils.showSyncBar('✕ Save failed: ' + err.message, true);
      throw err;
    }
  }

  // ── Stats ────────────────────────────────────────────────────────
  function _renderStats() {
    const today = Utils.todayStr();
    const total   = _rates.length;
    const active  = _rates.filter(r => Utils.isValid(r, today)).length;
    const air     = _rates.filter(r => r.type === 'air').length;
    const ocean   = _rates.filter(r => r.type === 'ocean').length;

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

    // Sort
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
        <tr><td colspan="10" style="text-align:center;padding:32px;color:var(--color-text-muted)">
          No rates found
        </td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => {
        const expired = !Utils.isValid(r, today);
        const badge   = r.type === 'air'
          ? '<span class="badge badge-air">Air</span>'
          : '<span class="badge badge-ocean">Ocean</span>';
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
            <td class="td-price">${Utils.fmtPrice(r)}</td>
            <td>${Utils.fmtDate(r.validFrom)}</td>
            <td style="color:${expired ? 'var(--color-expired-text)' : 'inherit'};font-weight:${expired?'700':'400'}">
              ${Utils.fmtDate(r.validTo)}
              ${expired ? '<span class="badge badge-expired" style="margin-left:4px">Expired</span>' : ''}
            </td>
            <td class="td-actions">
              <button class="btn btn-ghost btn-sm" onclick="AdminApp.editRate('${Utils.esc(r.id)}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteRate('${Utils.esc(r.id)}')">Del</button>
            </td>
          </tr>`;
      }).join('');
    }

    // Paginator
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
      pageInfo.textContent = `Page ${_page} of ${pages} (${total} records)`;
    }
    document.getElementById('btnPrevPage')?.toggleAttribute('disabled', _page <= 1);
    document.getElementById('btnNextPage')?.toggleAttribute('disabled', _page >= pages);
  }

  // ── Toolbar Bindings ─────────────────────────────────────────
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
        if (_sortKey === key) {
          _sortAsc = !_sortAsc;
        } else {
          _sortKey = key;
          _sortAsc = true;
        }
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

    // Add rate
    document.getElementById('btnAddRate')?.addEventListener('click', () => openModal(null));

    // Export JSON
    document.getElementById('btnExportJSON')?.addEventListener('click', () => {
      Utils.downloadJSON(_rates, `freight-rates-${Utils.todayStr()}.json`);
    });

    // Export CSV
    document.getElementById('btnExportCSV')?.addEventListener('click', () => {
      Utils.downloadCSV(_rates, `freight-rates-${Utils.todayStr()}.csv`);
    });

    // Import button → open import modal
    document.getElementById('btnImport')?.addEventListener('click', () => openImportModal());

    // Delete selected
    document.getElementById('btnDeleteSelected')?.addEventListener('click', _deleteSelected);

    // Reload from cloud
    document.getElementById('btnReload')?.addEventListener('click', _loadRates);
  }

  // ── Add / Edit Modal ──────────────────────────────────────────
  function openModal(rateId) {
    _editingId = rateId || null;
    const rate   = rateId ? _rates.find(r => r.id === rateId) : null;
    const isEdit = !!rate;

    document.getElementById('modalTitle').textContent = isEdit ? 'Edit Rate' : 'Add New Rate';

    // Populate form
    const f = id => document.getElementById(id);
    f('fType')       && (f('fType').value       = rate?.type        || 'air');
    f('fOrigin')     && (f('fOrigin').value      = rate?.origin      || '');
    f('fDest')       && (f('fDest').value        = rate?.destination || '');
    f('fCarrier')    && (f('fCarrier').value      = rate?.carrier     || '');
    f('fCommodity')  && (f('fCommodity').value   = rate?.commodity   || '');
    f('fRate')       && (f('fRate').value         = rate?.rate        ?? '');
    f('fCurrency')   && (f('fCurrency').value    = rate?.currency    || 'CNY');
    f('fUnit')       && (f('fUnit').value         = rate?.unit        || 'kg');
    f('fMinCharge')  && (f('fMinCharge').value   = rate?.minCharge   ?? '');
    f('fValidFrom')  && (f('fValidFrom').value   = rate?.validFrom   || '');
    f('fValidTo')    && (f('fValidTo').value      = rate?.validTo     || '');
    f('fRemark')     && (f('fRemark').value       = rate?.remark      || '');

    document.getElementById('rateModal').classList.remove('hidden');
    setTimeout(() => f('fOrigin')?.focus(), 50);
  }

  function _bindModal() {
    document.getElementById('btnModalCancel')?.addEventListener('click', closeModal);
    document.getElementById('btnModalClose')?.addEventListener('click',  closeModal);
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
    const rateVal = parseFloat(f('fRate'));
    if (isNaN(rateVal)) { alert('Please enter a valid rate.'); return; }

    const now = new Date().toISOString();

    if (_editingId) {
      const idx = _rates.findIndex(r => r.id === _editingId);
      if (idx !== -1) {
        _rates[idx] = {
          ..._rates[idx],
          type:        f('fType')      || 'air',
          origin:      f('fOrigin')?.toUpperCase() || '',
          destination: f('fDest')?.toUpperCase()   || '',
          carrier:     f('fCarrier')?.toUpperCase() || '',
          commodity:   f('fCommodity')  || '',
          rate:        rateVal,
          currency:    f('fCurrency') || 'CNY',
          unit:        f('fUnit')     || 'kg',
          minCharge:   parseFloat(f('fMinCharge')) || null,
          validFrom:   f('fValidFrom') || null,
          validTo:     f('fValidTo')   || null,
          remark:      f('fRemark')    || '',
          updatedAt:   now,
        };
      }
    } else {
      _rates.push({
        id:          Utils.uuid(),
        type:        f('fType')      || 'air',
        origin:      f('fOrigin')?.toUpperCase() || '',
        destination: f('fDest')?.toUpperCase()   || '',
        carrier:     f('fCarrier')?.toUpperCase() || '',
        commodity:   f('fCommodity')  || '',
        rate:        rateVal,
        currency:    f('fCurrency') || 'CNY',
        unit:        f('fUnit')     || 'kg',
        minCharge:   parseFloat(f('fMinCharge')) || null,
        validFrom:   f('fValidFrom') || null,
        validTo:     f('fValidTo')   || null,
        remark:      f('fRemark')    || '',
        updatedAt:   now,
      });
    }

    closeModal();
    _renderStats();
    _renderTable();
    await _saveRates('✓ Rate saved');
  }

  // ── Delete ────────────────────────────────────────────────────
  async function deleteRate(id) {
    if (!confirm('Delete this rate?')) return;
    _rates = _rates.filter(r => r.id !== id);
    _renderStats();
    _renderTable();
    await _saveRates('✓ Rate deleted');
  }

  function _deleteSelected() {
    const checked = [...document.querySelectorAll('#adminTableBody input[type=checkbox]:checked')];
    if (!checked.length) { alert('No rows selected.'); return; }
    if (!confirm(`Delete ${checked.length} selected rate(s)?`)) return;
    const ids = new Set(checked.map(c => c.dataset.id));
    _rates = _rates.filter(r => !ids.has(r.id));
    _renderStats();
    _renderTable();
    _saveRates(`✓ ${ids.size} rate(s) deleted`);
  }

  // ── Edit (exposed to inline onclick) ─────────────────────────
  function editRate(id) {
    openModal(id);
  }

  // ── Excel Import Modal ────────────────────────────────────────
  function openImportModal() {
    _importRows = [];
    document.getElementById('importModal')?.classList.remove('hidden');
    document.getElementById('importPreviewSection')?.classList.add('hidden');
    document.getElementById('importDropZone')?.classList.remove('drag-over');
    document.getElementById('importFileInput') && (document.getElementById('importFileInput').value = '');
  }

  function _closeImportModal() {
    document.getElementById('importModal')?.classList.add('hidden');
  }

  function _bindImportModal() {
    document.getElementById('btnImportCancel')?.addEventListener('click', _closeImportModal);
    document.getElementById('btnImportClose')?.addEventListener('click',  _closeImportModal);
    document.getElementById('importModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('importModal')) _closeImportModal();
    });

    // Drop zone click
    const dropZone = document.getElementById('importDropZone');
    const fileInput = document.getElementById('importFileInput');
    dropZone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => {
      if (e.target.files[0]) _parseFile(e.target.files[0]);
    });

    // Drag & Drop
    dropZone?.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) _parseFile(e.dataTransfer.files[0]);
    });

    // Template download
    document.getElementById('btnDownloadTemplate')?.addEventListener('click', () => {
      Utils.downloadCSV(Utils.getTemplateRows(), 'rate-import-template.csv');
    });

    // Confirm import
    document.getElementById('btnImportConfirm')?.addEventListener('click', _confirmImport);
  }

  function _parseFile(file) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Please check your internet connection.');
      return;
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

  const EXPECTED_COLS = ['type','origin','destination','carrier','commodity','rate','currency','unit','minCharge','validFrom','validTo','remark'];

  function _previewImport(rows) {
    _importRows = rows.map(row => {
      // Normalize keys: trim & lowercase
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
          <td>${Utils.esc(r.validFrom || '—')}</td>
          <td>${Utils.esc(r.validTo || '—')}</td>
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
    await _saveRates(`✓ Imported ${newRates.length} rate(s)`);
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

  return { init, editRate, deleteRate };
})();
