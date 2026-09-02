'use strict';

const TOKEN_KEY = 'plantops_admin_token';
const USER_KEY = 'plantops_admin_user';
const loginView = document.querySelector('#login-view');
const portalView = document.querySelector('#portal-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const equipmentDialog = document.querySelector('#equipment-dialog');
const equipmentForm = document.querySelector('#equipment-form');
const qrDialog = document.querySelector('#qr-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');

let token = sessionStorage.getItem(TOKEN_KEY) || '';
let currentUser = parseStoredUser();
let equipment = [];
let technicians = [];
let editingId = null;
let currentQR = null;
let confirmResolver = null;

function parseStoredUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch (_error) { return null; }
}

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD';
const formatDate = (value, fallback = 'Not scheduled') => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : fallback;

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch (_error) { payload = {}; }
  if (response.status === 401 && token) { clearSession(); throw new Error('Your session expired. Please sign in again.'); }
  if (!response.ok || !payload.success) {
    const details = payload.error?.details?.map((item) => item.message).filter(Boolean).join(' · ');
    throw new Error(details || payload.error?.message || 'The request could not be completed.');
  }
  return payload;
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); token = ''; currentUser = null;
  portalView.hidden = true; loginView.hidden = false;
}

function showPortal() {
  loginView.hidden = true; portalView.hidden = false;
  document.querySelector('#sidebar-name').textContent = currentUser?.name || 'Administrator';
  document.querySelector('#sidebar-avatar').textContent = initials(currentUser?.name || 'Administrator');
  loadPortal();
}

async function loadPortal() {
  document.querySelector('#inventory-content').innerHTML = '<div class="inventory-empty">Loading equipment register…</div>';
  try {
    const [allEquipment, technicianResponse] = await Promise.all([fetchAllEquipment(), api('/api/technicians?pageSize=100&status=active')]);
    equipment = allEquipment;
    technicians = technicianResponse.data || [];
    renderTechnicianOptions(); renderPortal();
  } catch (error) {
    document.querySelector('#inventory-content').innerHTML = `<div class="inventory-empty">${escapeHtml(error.message)}</div>`;
    toast(error.message, true);
  }
}

async function fetchAllEquipment() {
  const first = await api('/api/equipment?page=1&pageSize=100');
  const totalPages = first.pagination?.totalPages || 1;
  if (totalPages === 1) return first.data || [];
  const remaining = await Promise.all(Array.from({ length: totalPages - 1 }, (_value, index) => api(`/api/equipment?page=${index + 2}&pageSize=100`)));
  return [first, ...remaining].flatMap((response) => response.data || []);
}

function statusInfo(item) {
  if (item.status === 'Retired') return { label: 'Retired', tone: 'neutral' };
  if (item.status === 'Faulty') return { label: 'Faulty', tone: 'critical' };
  if (item.status === 'Under Maintenance') return { label: 'Under maintenance', tone: 'warning' };
  if (item.isOverdue) return { label: 'Operational · overdue', tone: 'warning' };
  return { label: 'Operational', tone: '' };
}

function filteredEquipment() {
  const query = document.querySelector('#equipment-search').value.trim().toLowerCase();
  const status = document.querySelector('#status-filter').value;
  const category = document.querySelector('#category-filter').value;
  return equipment.filter((item) => {
    const haystack = [item.equipmentCode, item.name, item.manufacturer, item.model, item.location?.site, item.location?.building, item.location?.zone].filter(Boolean).join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!status || item.status === status) && (!category || item.category === category);
  });
}

function renderPortal() {
  document.querySelector('#metric-total').textContent = equipment.length;
  document.querySelector('#metric-operational').textContent = equipment.filter((item) => item.status === 'Operational' && !item.isOverdue).length;
  document.querySelector('#metric-attention').textContent = equipment.filter((item) => item.status === 'Faulty' || item.isOverdue).length;
  document.querySelector('#metric-maintenance').textContent = equipment.filter((item) => item.status === 'Under Maintenance').length;
  renderInventory();
}

function renderInventory() {
  const items = filteredEquipment();
  const content = document.querySelector('#inventory-content');
  if (!items.length) { content.innerHTML = '<div class="inventory-empty">No equipment matches the current filters.</div>'; return; }
  const rows = items.map((item) => {
    const state = statusInfo(item);
    const location = [item.location?.site, item.location?.building, item.location?.zone].filter(Boolean).join(' · ');
    return `<tr><td class="equipment-cell"><strong>${escapeHtml(item.equipmentCode)}</strong><span>${escapeHtml(item.name)}</span></td><td class="subtle-cell">${escapeHtml(item.category)}<br>${escapeHtml(item.manufacturer)} · ${escapeHtml(item.model)}</td><td><span class="status-badge ${state.tone}">${escapeHtml(state.label)}</span></td><td class="subtle-cell">${escapeHtml(location)}</td><td><div class="maintenance-due ${item.isOverdue ? 'overdue' : ''}"><strong>${formatDate(item.nextMaintenanceDate)}</strong><span>${item.isOverdue ? `${item.daysOverdue} days overdue` : item.nextMaintenanceDate ? 'Scheduled' : 'Awaiting service'}</span></div></td><td><div class="row-actions"><button class="action-button" data-action="qr" data-id="${item.id}" ${item.status === 'Retired' ? 'disabled' : ''}>QR</button><button class="action-button" data-action="edit" data-id="${item.id}" ${item.status === 'Retired' ? 'disabled' : ''}>Edit</button><details class="more-menu"><summary aria-label="More actions">•••</summary><div class="menu-popover"><button data-action="profile" data-id="${item.id}" ${item.status === 'Retired' ? 'disabled' : ''}>Open mobile profile</button><button data-action="retire" data-id="${item.id}" class="danger-text" ${item.status === 'Retired' ? 'disabled' : ''}>Retire equipment</button></div></details></div></td></tr>`;
  }).join('');
  const cards = items.map((item) => {
    const state = statusInfo(item);
    const location = [item.location?.site, item.location?.building, item.location?.zone].filter(Boolean).join(' · ');
    return `<article class="inventory-card"><div class="inventory-card-head"><div><span class="inventory-card-code">${escapeHtml(item.equipmentCode)}</span><h3>${escapeHtml(item.name)}</h3></div><span class="status-badge ${state.tone}">${escapeHtml(state.label)}</span></div><div class="inventory-card-meta"><span>${escapeHtml(item.category)}<br>${escapeHtml(item.manufacturer)}</span><span>${escapeHtml(location)}<br>${item.isOverdue ? `<b style="color:var(--red)">${item.daysOverdue} days overdue</b>` : formatDate(item.nextMaintenanceDate)}</span></div><div class="inventory-card-actions"><button class="action-button" data-action="qr" data-id="${item.id}" ${item.status === 'Retired' ? 'disabled' : ''}>View QR</button><button class="action-button" data-action="edit" data-id="${item.id}" ${item.status === 'Retired' ? 'disabled' : ''}>Edit asset</button></div></article>`;
  }).join('');
  content.innerHTML = `<div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>Equipment</th><th>Type / model</th><th>Condition</th><th>Location</th><th>Next maintenance</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="inventory-cards">${cards}</div><div class="results-meta">Showing ${items.length} of ${equipment.length} registered assets</div>`;
}

function renderTechnicianOptions() {
  document.querySelector('#field-technician').innerHTML = '<option value="">Unassigned</option>' + technicians.map((tech) => `<option value="${tech.id}">${escapeHtml(tech.name)} · ${escapeHtml(tech.specialty)}</option>`).join('');
}

function openEquipmentForm(item = null) {
  editingId = item?.id || null; equipmentForm.reset();
  document.querySelector('#field-public').checked = item ? item.isPublicVisible : true;
  document.querySelector('#field-interval').value = item?.maintenanceIntervalDays || 90;
  document.querySelector('#equipment-form-eyebrow').textContent = item ? item.equipmentCode : 'New asset';
  document.querySelector('#equipment-form-title').textContent = item ? 'Edit equipment' : 'Add equipment';
  document.querySelector('#equipment-form-copy').textContent = item ? 'Update the live asset record. Its QR will remain unchanged.' : 'Create the record first; its stable QR will be issued immediately.';
  document.querySelector('#equipment-submit').textContent = item ? 'Save changes' : 'Save equipment & generate QR';
  document.querySelector('#field-installation').disabled = Boolean(item);
  document.querySelector('#equipment-form-error').hidden = true;
  if (item) {
    document.querySelector('#field-code').value = item.equipmentCode || ''; document.querySelector('#field-name').value = item.name || ''; document.querySelector('#field-category').value = item.category || ''; document.querySelector('#field-serial').value = item.serialNumber || ''; document.querySelector('#field-manufacturer').value = item.manufacturer || ''; document.querySelector('#field-model').value = item.model || '';
    document.querySelector('#field-site').value = item.location?.site || ''; document.querySelector('#field-building').value = item.location?.building || ''; document.querySelector('#field-zone').value = item.location?.zone || ''; document.querySelector('#field-installation').value = item.installationDate?.slice(0, 10) || ''; document.querySelector('#field-technician').value = item.assignedTechnicianId || ''; document.querySelector('#field-notes').value = item.notes || '';
  } else document.querySelector('#field-installation').value = new Date().toISOString().slice(0, 10);
  updateLabelPreview(); equipmentDialog.showModal();
}

function updateLabelPreview() {
  document.querySelector('#preview-code').textContent = document.querySelector('#field-code').value.trim().toUpperCase() || 'EQUIPMENT CODE';
  document.querySelector('#preview-name').textContent = document.querySelector('#field-name').value.trim() || 'Equipment name';
  document.querySelector('#preview-location').textContent = [document.querySelector('#field-site').value.trim(), document.querySelector('#field-building').value.trim(), document.querySelector('#field-zone').value.trim()].filter(Boolean).join(' · ') || 'Site · Building · Zone';
}

function equipmentPayload() {
  const payload = { equipmentCode: document.querySelector('#field-code').value.trim(), name: document.querySelector('#field-name').value.trim(), category: document.querySelector('#field-category').value, manufacturer: document.querySelector('#field-manufacturer').value.trim(), model: document.querySelector('#field-model').value.trim(), serialNumber: document.querySelector('#field-serial').value.trim(), location: { site: document.querySelector('#field-site').value.trim(), building: document.querySelector('#field-building').value.trim(), zone: document.querySelector('#field-zone').value.trim() }, maintenanceIntervalDays: Number(document.querySelector('#field-interval').value), assignedTechnicianId: document.querySelector('#field-technician').value || (editingId ? null : undefined), isPublicVisible: document.querySelector('#field-public').checked, notes: document.querySelector('#field-notes').value.trim() || (editingId ? null : undefined) };
  if (!editingId) payload.installationDate = document.querySelector('#field-installation').value;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]); return payload;
}

async function showQRFor(id) {
  const response = await api(`/api/equipment/${id}/qr`); currentQR = { ...response.data, id };
  document.querySelector('#qr-title').textContent = `${currentQR.equipmentCode} QR label`; document.querySelector('#qr-subtitle').textContent = currentQR.name; document.querySelector('#qr-code').textContent = currentQR.equipmentCode; document.querySelector('#qr-name').textContent = currentQR.name;
  document.querySelector('#qr-image').src = currentQR.qrCodeUrl; document.querySelector('#qr-image').alt = `QR code for ${currentQR.equipmentCode}`; document.querySelector('#qr-profile-link').href = currentQR.profileUrl; document.querySelector('#download-qr').href = currentQR.qrCodeUrl; document.querySelector('#download-qr').download = `${currentQR.equipmentCode}-QR.png`; qrDialog.showModal();
}

function askConfirmation({ eyebrow = 'Confirm action', title, message, acceptLabel = 'Confirm', symbol = '!' }) {
  document.querySelector('#confirm-eyebrow').textContent = eyebrow; document.querySelector('#confirm-title').textContent = title; document.querySelector('#confirm-message').textContent = message; document.querySelector('#confirm-accept').textContent = acceptLabel; document.querySelector('#confirm-symbol').textContent = symbol; confirmDialog.showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function toast(message, error = false) {
  const element = document.createElement('div'); element.className = `toast${error ? ' error' : ''}`; element.textContent = message; document.querySelector('#toast-region').appendChild(element); setTimeout(() => element.remove(), 4200);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); loginError.hidden = true; const button = loginForm.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Signing in…';
  try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.querySelector('#login-email').value.trim(), password: document.querySelector('#login-password').value }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to sign in'); if (payload.data.user.role !== 'Admin') throw new Error('Administrator access is required.'); token = payload.data.token; currentUser = payload.data.user; sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser)); showPortal(); }
  catch (error) { loginError.textContent = error.message; loginError.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Sign in'; }
});

equipmentForm.addEventListener('input', updateLabelPreview);
equipmentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const wasEditing = Boolean(editingId); const submit = document.querySelector('#equipment-submit'); const errorBox = document.querySelector('#equipment-form-error'); submit.disabled = true; submit.textContent = wasEditing ? 'Saving changes…' : 'Creating equipment…'; errorBox.hidden = true;
  try { const response = await api(wasEditing ? `/api/equipment/${editingId}` : '/api/equipment', { method: wasEditing ? 'PATCH' : 'POST', body: JSON.stringify(equipmentPayload()) }); const id = response.data.id; equipmentDialog.close(); await loadPortal(); toast(wasEditing ? `${response.data.equipmentCode} updated successfully.` : `${response.data.equipmentCode} created successfully.`); if (!wasEditing) await showQRFor(id); }
  catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
  finally { submit.disabled = false; submit.textContent = wasEditing ? 'Save changes' : 'Save equipment & generate QR'; }
});

document.querySelector('#inventory-content').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return; const item = equipment.find((record) => record.id === button.dataset.id); if (!item) return; button.closest('details')?.removeAttribute('open');
  try {
    if (button.dataset.action === 'qr') await showQRFor(item.id);
    if (button.dataset.action === 'edit') openEquipmentForm(item);
    if (button.dataset.action === 'profile') { const qr = await api(`/api/equipment/${item.id}/qr`); window.open(qr.data.profileUrl, '_blank', 'noopener'); }
    if (button.dataset.action === 'retire') { const approved = await askConfirmation({ eyebrow: 'Retire equipment', title: `Retire ${item.equipmentCode}?`, message: 'The current QR will become a retired tombstone and new service records can no longer be added.', acceptLabel: 'Retire equipment' }); if (!approved) return; await api(`/api/equipment/${item.id}/retire`, { method: 'POST', body: JSON.stringify({ reason: 'Retired from admin portal' }) }); toast(`${item.equipmentCode} retired.`); await loadPortal(); }
  } catch (error) { toast(error.message, true); }
});

document.querySelector('#open-create').addEventListener('click', () => openEquipmentForm());
document.querySelector('#logout-button').addEventListener('click', () => { clearSession(); location.reload(); });
document.querySelectorAll('#equipment-search, #status-filter, #category-filter').forEach((control) => control.addEventListener('input', renderInventory));
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
document.querySelector('#print-qr').addEventListener('click', () => window.print());
document.querySelector('#regenerate-qr').addEventListener('click', async () => {
  if (!currentQR) return; const approved = await askConfirmation({ eyebrow: 'Replace physical label', title: `Regenerate ${currentQR.equipmentCode} QR?`, message: 'The existing printed QR will be revoked immediately. You must print and apply the new label.', acceptLabel: 'Regenerate QR', symbol: '↻' }); if (!approved) return;
  try { await api(`/api/equipment/${currentQR.id}/qr/regenerate`, { method: 'POST', body: JSON.stringify({ reason: 'Regenerated from admin portal' }) }); qrDialog.close(); await showQRFor(currentQR.id); toast('New QR generated. Replace the old physical label.'); } catch (error) { toast(error.message, true); }
});
document.querySelector('#confirm-cancel').addEventListener('click', () => { confirmDialog.close(); confirmResolver?.(false); confirmResolver = null; });
document.querySelector('#confirm-accept').addEventListener('click', () => { confirmDialog.close(); confirmResolver?.(true); confirmResolver = null; });
confirmDialog.addEventListener('cancel', (event) => { event.preventDefault(); confirmDialog.close(); confirmResolver?.(false); confirmResolver = null; });

if (token && currentUser?.role === 'Admin') showPortal();
