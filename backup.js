/* Cadangan data: unduh/pulihkan file, salinan otomatis, penyimpanan permanen */
(function () {
  'use strict';
  var SNAP_KEY = 'gigiAutoBackupV1';
  var LAST_KEY = 'gigiLastBackupV1';
  var MAX_DAYS = 10;      /* salinan harian */
  var MAX_UNDO = 8;       /* keadaan sebelum hapus/ubah transaksi */
  var $ = function (id) { return document.getElementById(id); };

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function niceDate(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function isDayKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }
  function isUndo(k) { return /^undo-\d+$/.test(k); }

  /* ---------- salinan otomatis di perangkat ---------- */
  function loadSnaps() {
    try { var o = JSON.parse(ls(SNAP_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
    catch (_) { return {}; }
  }
  function writeSnaps(snaps) {
    var days = Object.keys(snaps).filter(isDayKey).sort();
    while (days.length > MAX_DAYS) delete snaps[days.shift()];
    var undos = Object.keys(snaps).filter(isUndo).sort();
    while (undos.length > MAX_UNDO) delete snaps[undos.shift()];
    /* kalau penyimpanan penuh, buang yang paling lama dulu */
    while (!lsSet(SNAP_KEY, JSON.stringify(snaps)) && (days.length > 1 || undos.length > 1)) {
      if (days.length > 1) delete snaps[days.shift()]; else delete snaps[undos.shift()];
    }
    refreshUI();
  }
  function hasData() {
    return tx.length || nameOptions.expense.length || nameOptions.income.length;
  }
  function saveSnap(key) {
    if (!hasData()) return;
    var snaps = loadSnaps();
    snaps[key] = { at: new Date().toISOString(), tx: tx, options: nameOptions };
    writeSnaps(snaps);
  }
  /* keadaan sebelum ada transaksi yang dihapus / diubah */
  var lastTx = null;
  function track() { lastTx = JSON.stringify(tx); }
  function destructive(prevJson) {
    var prev;
    try { prev = JSON.parse(prevJson); } catch (_) { return false; }
    var cur = {};
    tx.forEach(function (t) { cur[String(t.id)] = JSON.stringify(t); });
    return prev.some(function (t) { return cur[String(t.id)] !== JSON.stringify(t); });
  }
  function saveUndo(prevJson) {
    var prev;
    try { prev = JSON.parse(prevJson); } catch (_) { return; }
    var snaps = loadSnaps();
    snaps['undo-' + Date.now()] = { at: new Date().toISOString(), tx: prev, options: nameOptions };
    writeSnaps(snaps);
  }

  /* ---------- unduh cadangan ---------- */
  function payload() {
    return {
      app: 'hallo-dear-dompet-jerapah', version: 1,
      exportedAt: new Date().toISOString(),
      user: ls('gigiName') || '',
      transactions: tx, nameOptions: nameOptions
    };
  }
  function markExported() { lsSet(LAST_KEY, new Date().toISOString()); refreshUI(); }
  function download(json, name) {
    var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    markExported();
  }
  function exportFile() {
    var json = JSON.stringify(payload(), null, 2);
    var name = 'cadangan-dompet-jerapah-' + dayStr() + '.json';
    var file = null;
    try { file = new File([json], name, { type: 'application/json' }); } catch (_) {}
    var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Cadangan Dompet Jerapah' })
        .then(markExported)
        .catch(function (e) { if (!e || e.name !== 'AbortError') download(json, name); });
    } else {
      download(json, name);
    }
    say('Cadangan siap ♡ Simpan file-nya di tempat aman (Google Drive, WhatsApp ke diri sendiri, atau email).');
  }

  /* ---------- pulihkan ---------- */
  function cleanTx(list) {
    var out = [], bad = 0, stamp = Date.now();
    list.forEach(function (t, i) {
      var amount = Number(t && t.amount);
      var date = String((t && t.date) || '');
      var type = t && (t.type === 'income' || t.type === 'expense') ? t.type : null;
      if (!isDayKey(date) || !isFinite(amount) || amount <= 0 || !type) { bad++; return; }
      out.push({
        id: String(t.id || ('tx-' + stamp + '-' + i)),
        name: String(t.name || '').trim(), amount: amount, type: type, date: date,
        category: String(t.category || '').trim(), account: String(t.account || '').trim()
      });
    });
    return { items: out, bad: bad };
  }
  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('File ini bukan cadangan yang valid.'); }
    var list = Array.isArray(data) ? data : data && data.transactions;
    if (!Array.isArray(list)) throw new Error('Isi file tidak dikenali.');
    return { tx: list, options: (data && !Array.isArray(data) && data.nameOptions) || {} };
  }
  /* revert=false: hanya menambahkan yang belum ada (aman). revert=true: juga mengembalikan versi lama yang diubah. */
  function restore(parsed, label, revert) {
    var cleaned = cleanTx(parsed.tx);
    if (!cleaned.items.length) { say('Tidak ada transaksi yang bisa dipulihkan dari ' + label + '.', true); return; }
    var index = {}, next = tx.slice(), added = [], reverted = 0;
    tx.forEach(function (t, i) { index[String(t.id)] = i; });
    cleaned.items.forEach(function (t) {
      var at = index[t.id];
      if (at === undefined) { index[t.id] = next.length; next.push(t); added.push(t); }
      else if (revert && JSON.stringify(next[at]) !== JSON.stringify(t)) { next[at] = t; reverted++; }
    });
    if (!added.length && !reverted) { say('Tidak ada yang perlu dikembalikan — datamu sudah lengkap ♡'); return; }
    var ask = revert
      ? 'Kembalikan datamu ke keadaan ' + label + '?\n\n' + added.length + ' transaksi terhapus akan dikembalikan' +
        (reverted ? ', ' + reverted + ' transaksi yang diubah kembali ke versi sebelumnya' : '') +
        '.\nTransaksi baru yang kamu tambah sesudahnya tetap aman.'
      : 'Tambahkan ' + added.length + ' transaksi dari ' + label + ' ke datamu sekarang?\n\nData yang sudah ada tidak akan dihapus atau ditimpa.';
    if (!confirm(ask)) return;
    tx = next;
    ['expense', 'income'].forEach(function (k) {
      var own = (parsed.options && parsed.options[k]) || [];
      var names = added.filter(function (t) { return t.type === k; }).map(function (t) { return t.name; });
      nameOptions[k] = cleanOptionList((nameOptions[k] || []).concat(own, names));
    });
    saveNameOptions();
    persist();
    afterOptionsChange();
    say('Selesai ♡ ' + added.length + ' transaksi dikembalikan' +
        (reverted ? ', ' + reverted + ' perubahan dibatalkan' : '') +
        (cleaned.bad ? ', ' + cleaned.bad + ' baris rusak dilewati' : '') + '.');
  }
  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { restore(parseBackup(String(reader.result)), 'file ' + file.name, false); }
      catch (err) { say(err.message, true); }
    };
    reader.onerror = function () { say('File tidak bisa dibaca.', true); };
    reader.readAsText(file);
  }
  function restoreAuto() {
    var key = $('autoSnapshots').value;
    var snap = loadSnaps()[key];
    if (!snap) { say('Salinan tidak ditemukan.', true); return; }
    var undo = isUndo(key);
    restore({ tx: snap.tx || [], options: snap.options || {} },
            undo ? snapLabel(key, snap).toLowerCase() : 'salinan otomatis ' + snapLabel(key, snap), undo);
  }

  /* ---------- tampilan ---------- */
  var msgTimer;
  function say(text, isError) {
    var el = $('backupMsg'); if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#d05a85' : '';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.textContent = ''; }, 9000);
  }
  function snapLabel(key, snap) {
    var n = (snap.tx || []).length;
    if (isUndo(key)) {
      var d = new Date(snap.at);
      return 'Sebelum perubahan ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' (' + n + ' transaksi)';
    }
    var p = key.split('-');
    return niceDate(new Date(+p[0], +p[1] - 1, +p[2])) + ' (' + n + ' transaksi)';
  }
  function refreshUI() {
    var status = $('backupStatus'); if (!status) return;
    var last = ls(LAST_KEY), warn = false, text;
    if (last) {
      var d = new Date(last), days = Math.floor((Date.now() - d.getTime()) / 86400000);
      text = 'Terakhir diunduh: ' + niceDate(d) + (days >= 7 ? ' — sudah ' + days + ' hari, yuk unduh lagi' : '');
      warn = days >= 7;
    } else {
      text = tx.length ? 'Kamu belum pernah mengunduh cadangan. Yuk unduh sekarang supaya datamu aman.' : 'Belum ada data untuk dicadangkan.';
      warn = tx.length > 0;
    }
    status.textContent = text;
    status.classList.toggle('warn', warn);

    var snaps = loadSnaps();
    var keys = Object.keys(snaps).filter(isUndo).sort().reverse()
      .concat(Object.keys(snaps).filter(isDayKey).sort().reverse());
    var sel = $('autoSnapshots');
    var current = sel.value;
    sel.innerHTML = keys.length
      ? keys.map(function (k) { return '<option value="' + k + '">' + esc(snapLabel(k, snaps[k])) + '</option>'; }).join('')
      : '<option value="" disabled selected>Belum ada salinan otomatis</option>';
    /* pilihan pengguna dipertahankan, kecuali ada salinan terbaru yang baru muncul */
    var newest = keys[0] || '';
    if (keys.indexOf(current) > -1 && sel.dataset.newest === newest) sel.value = current;
    sel.dataset.newest = newest;
    $('btnRestoreAuto').disabled = !keys.length;
  }
  function injectStyle() {
    var css = '.backup-panel{margin-top:28px}.backup-panel h3{margin:0 0 6px}' +
      '.panel .backup-status{margin:0 0 14px;font-size:12px;color:var(--muted)}.panel .backup-status.warn{color:#d05a85;font-weight:700}' +
      '.backup-actions{display:flex;gap:10px;flex-wrap:wrap}' +
      '.backup-actions .primary,.backup-actions .secondary{flex:1 1 160px;width:auto;margin-top:0}' +
      '.backup-auto{margin-top:14px;font-size:12px}.backup-auto summary{cursor:pointer;font-weight:700;color:var(--deep)}' +
      '.backup-restore{display:flex;gap:8px;align-items:center;margin-top:10px}' +
      '.backup-restore .cs{flex:1;margin-top:0!important}.backup-restore .secondary{margin-top:0;flex:none}' +
      '.backup-restore .secondary:disabled{opacity:.5;cursor:default}' +
      '.panel .backup-note{font-size:11px;margin:14px 0 0}' +
      '.backup-msg{font-size:12px;min-height:16px;margin:10px 0 0;color:var(--green)}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }
  function buildUI() {
    if ($('backupPanel')) { refreshUI(); return; }
    var footer = document.querySelector('.main-content footer'); if (!footer) return;
    injectStyle();
    var sec = document.createElement('section');
    sec.id = 'backupPanel'; sec.className = 'panel backup-panel';
    sec.innerHTML =
      '<h3>💾 Cadangan data</h3>' +
      '<p id="backupStatus" class="backup-status"></p>' +
      '<div class="backup-actions">' +
        '<button type="button" id="btnExport" class="primary">⬇ Unduh cadangan</button>' +
        '<button type="button" id="btnImport" class="secondary">⬆ Pulihkan dari file</button>' +
        '<input type="file" id="fileImport" accept=".json,application/json" style="display:none">' +
      '</div>' +
      '<details class="backup-auto"><summary>Salinan otomatis di perangkat ini</summary>' +
        '<p class="backup-note">Tersimpan sendiri: salinan harian (' + MAX_DAYS + ' hari terakhir) dan ' + MAX_UNDO +
        ' keadaan terakhir sebelum kamu menghapus atau mengubah transaksi. Pilih salah satu untuk mengembalikan kalau ada yang terhapus tidak sengaja.</p>' +
        '<div class="backup-restore"><select id="autoSnapshots" aria-label="Salinan otomatis"></select>' +
        '<button type="button" id="btnRestoreAuto" class="secondary">Pulihkan</button></div>' +
      '</details>' +
      '<p class="backup-note">Datamu tersimpan di browser perangkat ini. Kalau data situs dihapus atau ganti HP, datanya ikut hilang — jadi simpan file cadangan di tempat lain.</p>' +
      '<p id="backupMsg" class="backup-msg" role="status" aria-live="polite"></p>';
    footer.parentNode.insertBefore(sec, footer);
    $('btnExport').addEventListener('click', exportFile);
    $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
    $('fileImport').addEventListener('change', function (e) { importFile(e.target.files[0]); e.target.value = ''; });
    $('btnRestoreAuto').addEventListener('click', restoreAuto);
    refreshUI();
  }
  function onReady() {
    buildUI();
    if (!loadSnaps()[dayStr()]) saveSnap(dayStr());
    track();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  }

  /* ---------- kait ke aplikasi: salin otomatis setiap ada perubahan ---------- */
  var origPersist = window.persist;
  window.persist = function () {
    var prev = lastTx;
    var r = origPersist.apply(this, arguments);
    try {
      if (prev && destructive(prev)) saveUndo(prev);
      saveSnap(dayStr());
      track();
    } catch (_) {}
    return r;
  };
  var origSaveOptions = window.saveNameOptions;
  window.saveNameOptions = function () {
    var r = origSaveOptions.apply(this, arguments);
    try { saveSnap(dayStr()); } catch (_) {}
    return r;
  };
  var origEnter = window.enterApp;
  window.enterApp = function () {
    var r = origEnter.apply(this, arguments);
    onReady();
    return r;
  };
  if (!$('app').classList.contains('hidden')) onReady();
})();
