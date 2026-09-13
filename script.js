/**
 * script.js — SatuAtap: Manajemen Kos
 * ─────────────────────────────────────────────────────────────
 * Fitur:
 *  - CRUD penghuni kamar (Create, Read, Update, Delete)
 *  - Penyimpanan data di localStorage
 *  - Filter: Semua / Lunas / Belum Lunas
 *  - Search real-time berdasarkan nama atau nomor kamar
 *  - Statistik ringkasan (total, lunas, belum lunas)
 *  - Toast notifikasi
 *  - Modal form dengan validasi
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   KONSTANTA & STATE
═══════════════════════════════════════════════════════════ */

/** Kunci penyimpanan localStorage */
const STORAGE_KEY = 'satuatap_residents';

/**
 * State aplikasi terpusat.
 * Semua perubahan data HARUS melalui fungsi setter agar
 * render otomatis dipanggil setelahnya.
 */
const state = {
  residents: [],    // array objek penghuni
  filter: 'semua',  // 'semua' | 'lunas' | 'belum'
  query: '',        // kata kunci pencarian
};

/* ═══════════════════════════════════════════════════════════
   REFERENSI DOM
═══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const el = {
  grid:           $('resident-grid'),
  emptyNoData:    $('empty-state-no-data'),   // nol penghuni di database
  emptyNoResult:  $('empty-state-no-result'), // ada data tapi filter/search nol hasil
  statTotal:      $('stat-total'),
  statLunas:   $('stat-lunas'),
  statBelum:   $('stat-belum'),
  modalOverlay: $('modal-overlay'),
  modalTitle:   $('modal-title'),
  form:         $('resident-form'),
  formId:       $('form-id'),
  formNama:     $('form-nama'),
  formKamar:    $('form-kamar'),
  formHarga:    $('form-harga'),
  formTanggal:  $('form-tanggal'),
  btnOpenModal: $('btn-open-modal'),
  btnCloseModal:$('btn-close-modal'),
  btnCancel:    $('btn-cancel'),
  btnSubmit:    $('btn-submit'),
  searchInput:  $('search-input'),
  toast:        $('toast'),
};

/* ═══════════════════════════════════════════════════════════
   LOCAL STORAGE HELPERS
═══════════════════════════════════════════════════════════ */

/** Memuat data penghuni dari localStorage ke state.residents */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.residents = raw ? JSON.parse(raw) : [];
  } catch {
    state.residents = [];
  }
}

/** Menyimpan state.residents ke localStorage */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.residents));
}

/* ═══════════════════════════════════════════════════════════
   UTILITAS
═══════════════════════════════════════════════════════════ */

/** Membuat ID unik sederhana berbasis timestamp + random */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Format angka menjadi rupiah: 750000 → "Rp 750.000" */
function formatRupiah(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/** Format tanggal ISO ke lokal: "2024-06-15" → "15 Juni 2024" */
function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

/** Ambil dua inisial nama: "Budi Santoso" → "BS" */
function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Warna latar avatar berdasarkan huruf pertama nama.
 * Rotasi dari palet warna yang tidak mencolok.
 */
const AVATAR_COLORS = [
  ['#dbeafe', '#1d4ed8'], // biru
  ['#fce7f3', '#be185d'], // pink
  ['#d1fae5', '#065f46'], // hijau
  ['#fef3c7', '#92400e'], // amber
  ['#ede9fe', '#5b21b6'], // ungu
  ['#ffedd5', '#9a3412'], // oranye
];
function avatarColor(name) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/* ═══════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════ */

/**
 * Render ulang seluruh tampilan:
 * statistik, daftar kartu sesuai filter & query.
 */
function render() {
  updateStats();
  renderCards();
}

/**
 * Perbarui angka di stat cards.
 * Statistik selalu mencerminkan SELURUH data (bukan hanya yang terfilter),
 * sehingga angkanya konsisten dengan jumlah penghuni sesungguhnya.
 */
function updateStats() {
  const total = state.residents.length;
  const lunas = state.residents.filter((r) => r.status === 'lunas').length;
  el.statTotal.textContent = total;
  el.statLunas.textContent = lunas;
  el.statBelum.textContent = total - lunas;
}

/**
 * Filter & render kartu penghuni ke grid.
 * Urutan: belum lunas lebih dulu, lalu lunas.
 *
 * Tiga kasus empty state yang mungkin terjadi:
 *  1. Database kosong total          → tampilkan emptyNoData
 *  2. Ada data tapi filter/search 0  → tampilkan emptyNoResult
 *  3. Ada hasil yang cocok           → render kartu, sembunyikan keduanya
 */
function renderCards() {
  const q = state.query.toLowerCase().trim();

  const visible = state.residents.filter((r) => {
    // Filter tab: cocokkan status pembayaran
    if (state.filter === 'lunas' && r.status !== 'lunas') return false;
    if (state.filter === 'belum' && r.status !== 'belum') return false;
    // Filter search: cocokkan nama ATAU nomor kamar (case-insensitive)
    if (q && !r.nama.toLowerCase().includes(q) && !r.kamar.toLowerCase().includes(q)) return false;
    return true;
  });

  // Urutkan: belum lunas di atas
  visible.sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === 'belum' ? -1 : 1;
  });

  // Bersihkan grid sebelum render ulang
  el.grid.innerHTML = '';

  // Sembunyikan kedua empty-state terlebih dahulu
  hideEmptyStates();

  if (state.residents.length === 0) {
    // Kasus 1: belum ada penghuni sama sekali
    showEmptyState(el.emptyNoData);
  } else if (visible.length === 0) {
    // Kasus 2: ada data tapi kombinasi filter + search tidak menghasilkan apa pun
    showEmptyState(el.emptyNoResult);
  } else {
    // Kasus 3: ada hasil — render semua kartu yang cocok
    visible.forEach((resident) => {
      el.grid.appendChild(createCard(resident));
    });
  }
}

/** Sembunyikan kedua elemen empty-state */
function hideEmptyStates() {
  [el.emptyNoData, el.emptyNoResult].forEach((el) => {
    el.classList.add('hidden');
    el.classList.remove('flex');
  });
}

/**
 * Tampilkan satu elemen empty-state.
 * @param {HTMLElement} target
 */
function showEmptyState(target) {
  target.classList.remove('hidden');
  target.classList.add('flex');
}

/**
 * Buat elemen kartu untuk satu penghuni.
 * @param {object} r - objek penghuni
 * @returns {HTMLElement}
 */
function createCard(r) {
  const card = document.createElement('article');
  card.className = 'resident-card';
  card.dataset.id = r.id;

  const [bgColor, textColor] = avatarColor(r.nama);
  const isLunas = r.status === 'lunas';

  card.innerHTML = `
    <!-- Header kartu: avatar + nama + kamar -->
    <div class="flex items-start gap-3">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
           style="background:${bgColor}; color:${textColor}">
        ${getInitials(r.nama)}
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-bold text-slate-800 text-sm truncate">${escapeHtml(r.nama)}</h3>
        <p class="text-xs text-slate-500 mt-0.5">Kamar <span class="font-semibold text-slate-700">${escapeHtml(r.kamar)}</span></p>
      </div>
      <!-- Badge status -->
      <span class="badge ${isLunas ? 'badge-lunas' : 'badge-belum'} flex-shrink-0">
        ${isLunas ? '✓ Lunas' : '⏳ Belum'}
      </span>
    </div>

    <hr class="border-slate-100" />

    <!-- Info sewa & tanggal masuk -->
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-xs text-slate-600">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-semibold text-slate-700">${formatRupiah(r.harga)}</span>
        <span class="text-slate-400">/ bulan</span>
      </div>
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <span>Masuk: ${formatDate(r.tanggal)}</span>
      </div>
    </div>

    <hr class="border-slate-100" />

    <!-- Tombol aksi -->
    <div class="flex items-center gap-2">
      <!-- Toggle status -->
      <button class="card-action-btn ${isLunas ? 'toggle-belum' : 'toggle-lunas'} flex-1 !w-auto px-2 text-xs font-semibold gap-1.5"
              data-action="toggle" data-id="${r.id}"
              title="${isLunas ? 'Tandai Belum Lunas' : 'Tandai Lunas'}">
        ${isLunas
          ? `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Belum Lunas`
          : `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Lunas`}
      </button>

      <!-- Edit -->
      <button class="card-action-btn edit" data-action="edit" data-id="${r.id}" title="Edit penghuni">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>

      <!-- Hapus -->
      <button class="card-action-btn delete" data-action="delete" data-id="${r.id}" title="Hapus penghuni">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

/**
 * Escape karakter HTML untuk mencegah XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════
   CRUD OPERATIONS
═══════════════════════════════════════════════════════════ */

/**
 * Tambah penghuni baru ke state & simpan ke storage.
 * @param {object} data - { nama, kamar, harga, tanggal, status }
 */
function addResident(data) {
  const resident = { id: generateId(), ...data };
  state.residents.push(resident);
  saveToStorage();
  render();
  showToast('Penghuni berhasil ditambahkan!', 'success');
}

/**
 * Perbarui data penghuni yang sudah ada.
 * @param {string} id
 * @param {object} data - field yang diperbarui
 */
function updateResident(id, data) {
  const idx = state.residents.findIndex((r) => r.id === id);
  if (idx === -1) return;
  state.residents[idx] = { ...state.residents[idx], ...data };
  saveToStorage();
  render();
  showToast('Data penghuni berhasil diperbarui.', 'info');
}

/**
 * Hapus penghuni berdasarkan ID.
 * @param {string} id
 */
function deleteResident(id) {
  state.residents = state.residents.filter((r) => r.id !== id);
  saveToStorage();
  render();
  showToast('Penghuni berhasil dihapus.', 'error');
}

/**
 * Toggle status pembayaran penghuni (lunas ↔ belum).
 * @param {string} id
 */
function toggleStatus(id) {
  const resident = state.residents.find((r) => r.id === id);
  if (!resident) return;
  const newStatus = resident.status === 'lunas' ? 'belum' : 'lunas';
  updateResident(id, { status: newStatus });
  const msg = newStatus === 'lunas' ? 'Status diubah: Lunas ✓' : 'Status diubah: Belum Lunas';
  showToast(msg, newStatus === 'lunas' ? 'success' : 'info');
}

/* ═══════════════════════════════════════════════════════════
   MODAL MANAGEMENT
═══════════════════════════════════════════════════════════ */

/** Buka modal dalam mode tambah (reset form) */
function openModalAdd() {
  el.modalTitle.textContent = 'Tambah Penghuni';
  el.btnSubmit.textContent = 'Simpan';
  resetForm();
  openModal();
}

/**
 * Buka modal dalam mode edit (isi form dengan data penghuni)
 * @param {string} id
 */
function openModalEdit(id) {
  const r = state.residents.find((res) => res.id === id);
  if (!r) return;

  el.modalTitle.textContent = 'Edit Penghuni';
  el.btnSubmit.textContent = 'Perbarui';

  // Isi nilai form
  el.formId.value      = r.id;
  el.formNama.value    = r.nama;
  el.formKamar.value   = r.kamar;
  el.formHarga.value   = r.harga;
  el.formTanggal.value = r.tanggal;

  // Set radio status
  const radios = el.form.querySelectorAll('input[name="status"]');
  radios.forEach((radio) => { radio.checked = radio.value === r.status; });

  clearErrors();
  openModal();
}

/** Tampilkan modal overlay (dengan animasi CSS class) */
function openModal() {
  el.modalOverlay.classList.add('open');
  // Fokus ke input pertama setelah transisi
  setTimeout(() => el.formNama.focus(), 50);
}

/** Sembunyikan modal overlay */
function closeModal() {
  el.modalOverlay.classList.remove('open');
}

/** Reset semua nilai form dan hapus error */
function resetForm() {
  el.formId.value      = '';
  el.formNama.value    = '';
  el.formKamar.value   = '';
  el.formHarga.value   = '';
  el.formTanggal.value = '';

  // Reset radio ke "lunas"
  const radios = el.form.querySelectorAll('input[name="status"]');
  radios.forEach((radio) => { radio.checked = radio.value === 'lunas'; });

  clearErrors();
}

/* ═══════════════════════════════════════════════════════════
   FORM VALIDATION
═══════════════════════════════════════════════════════════ */

/**
 * Validasi form dan kembalikan objek data jika valid,
 * atau null jika tidak valid.
 * @returns {object|null}
 */
function validateForm() {
  clearErrors();
  let valid = true;

  const nama    = el.formNama.value.trim();
  const kamar   = el.formKamar.value.trim();
  const harga   = el.formHarga.value.trim();
  const tanggal = el.formTanggal.value;
  const status  = el.form.querySelector('input[name="status"]:checked')?.value ?? 'lunas';

  if (!nama) {
    showError('err-nama', 'form-nama');
    valid = false;
  }
  if (!kamar) {
    showError('err-kamar', 'form-kamar');
    valid = false;
  }
  if (!harga || isNaN(Number(harga)) || Number(harga) < 0) {
    showError('err-harga', 'form-harga');
    valid = false;
  }
  if (!tanggal) {
    showError('err-tanggal', 'form-tanggal');
    valid = false;
  }

  if (!valid) return null;

  return { nama, kamar, harga: Number(harga), tanggal, status };
}

/**
 * Tampilkan pesan error untuk satu field.
 * @param {string} errId - ID elemen pesan error
 * @param {string} inputId - ID input yang error
 */
function showError(errId, inputId) {
  const errEl   = $(errId);
  const inputEl = $(inputId);
  if (errEl)   errEl.classList.remove('hidden');
  if (inputEl) inputEl.classList.add('error');
}

/** Hapus semua pesan error di form */
function clearErrors() {
  el.form.querySelectorAll('.form-error').forEach((e) => e.classList.add('hidden'));
  el.form.querySelectorAll('.form-input').forEach((e) => e.classList.remove('error'));
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════════════════════ */

let toastTimer = null;

/**
 * Tampilkan notifikasi toast sementara.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'info') {
  // Hapus type kelas sebelumnya
  el.toast.classList.remove('success', 'error', 'info', 'show');

  el.toast.textContent = message;
  el.toast.classList.add(type);

  // Paksa reflow agar transisi berjalan ulang
  void el.toast.offsetWidth;
  el.toast.classList.add('show');

  // Auto-sembunyikan setelah 2.8 detik
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
  }, 2800);
}

/* ═══════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════ */

/** Inisialisasi semua event listener */
function initEvents() {

  // ── Tombol buka modal tambah ──────────────────────────────
  el.btnOpenModal.addEventListener('click', openModalAdd);

  // ── Tombol tutup modal ────────────────────────────────────
  el.btnCloseModal.addEventListener('click', closeModal);
  el.btnCancel.addEventListener('click', closeModal);

  // ── Klik di luar modal box untuk menutup ──────────────────
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });

  // ── Tekan Escape untuk menutup modal ─────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.modalOverlay.classList.contains('open')) {
      closeModal();
    }
  });

  // ── Submit form (tambah / edit) ───────────────────────────
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = validateForm();
    if (!data) return;

    const id = el.formId.value;
    if (id) {
      // Mode edit: ada ID tersimpan
      updateResident(id, data);
    } else {
      // Mode tambah: tidak ada ID
      addResident(data);
    }
    closeModal();
  });

  // ── Delegasi klik pada grid kartu ─────────────────────────
  // Satu listener untuk tombol toggle, edit, dan hapus di semua kartu
  el.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, id } = btn.dataset;

    if (action === 'toggle') toggleStatus(id);
    if (action === 'edit')   openModalEdit(id);
    if (action === 'delete') confirmDelete(id);
  });

  // ── Filter tabs ───────────────────────────────────────────
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Update state
      state.filter = btn.dataset.filter;
      // Update UI active class
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Re-render
      renderCards();
    });
  });

  // ── Search input (real-time) ──────────────────────────────
  el.searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderCards();
  });
}

/* ═══════════════════════════════════════════════════════════
   KONFIRMASI HAPUS (native confirm — sederhana & bersih)
═══════════════════════════════════════════════════════════ */

/**
 * Minta konfirmasi sebelum menghapus penghuni.
 * Menggunakan window.confirm agar kode tetap ringan tanpa
 * perlu modal konfirmasi terpisah.
 * @param {string} id
 */
function confirmDelete(id) {
  const resident = state.residents.find((r) => r.id === id);
  if (!resident) return;
  const ok = window.confirm(
    `Hapus penghuni "${resident.nama}" dari kamar ${resident.kamar}?\n\nData tidak dapat dikembalikan.`
  );
  if (ok) deleteResident(id);
}

/* ═══════════════════════════════════════════════════════════
   INISIALISASI APLIKASI
═══════════════════════════════════════════════════════════ */

/**
 * Titik masuk utama. Dipanggil saat DOM siap.
 */
function init() {
  loadFromStorage();
  initEvents();
  render();
}

// Jalankan saat DOM selesai dimuat
document.addEventListener('DOMContentLoaded', init);
