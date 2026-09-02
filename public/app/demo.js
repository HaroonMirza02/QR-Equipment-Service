'use strict';

const grid = document.querySelector('#label-grid');
const count = document.querySelector('#label-count');
let equipment = [];
let activeFilter = 'all';

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function presentation(item) {
  if (item.qrStatus === 'revoked') return { group: 'lifecycle', className: 'lifecycle', label: 'Retired label' };
  if (item.qrStatus === 'replaced') return { group: 'lifecycle', className: 'lifecycle', label: 'Replaced label' };
  if (item.status === 'Faulty') return { group: 'attention', className: 'attention', label: 'Faulty · isolate' };
  if (item.status === 'Under Maintenance') return { group: 'attention', className: 'warning', label: 'Under maintenance' };
  if (item.isOverdue) return { group: 'attention', className: 'warning', label: `${item.daysOverdue} days overdue` };
  return { group: 'normal', className: '', label: 'Operational' };
}

function render() {
  const filtered = equipment.filter((item) => activeFilter === 'all' || presentation(item).group === activeFilter);
  count.textContent = equipment.length;
  grid.innerHTML = filtered.map((item) => {
    const state = presentation(item);
    const location = [item.location?.site, item.location?.building, item.location?.zone].filter(Boolean).join(' · ');
    return `<article class="qr-label" data-group="${state.group}">
      <div class="qr-visual">
        <img src="${escapeHtml(item.qrCodeUrl)}" alt="QR code for ${escapeHtml(item.equipmentCode)}" />
        <small>Scan for service record</small>
      </div>
      <div class="label-copy">
        <span class="label-state ${state.className}">${escapeHtml(state.label)}</span>
        <strong class="label-code">${escapeHtml(item.equipmentCode)}</strong>
        <p class="label-name">${escapeHtml(item.name)}</p>
        <span class="label-location">${escapeHtml(location)}</span>
        <span class="label-action"><a href="${escapeHtml(item.profileUrl)}">Open profile</a></span>
      </div>
    </article>`;
  }).join('') || '<div class="demo-loading">No labels match this filter.</div>';
}

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));

document.querySelector('#print-labels').addEventListener('click', () => window.print());

fetch('/api/public/demo-equipment', { headers: { Accept: 'application/json' } })
  .then((response) => {
    if (!response.ok) throw new Error('Demo directory unavailable');
    return response.json();
  })
  .then((payload) => { equipment = payload.data || []; render(); })
  .catch(() => { grid.innerHTML = '<div class="demo-loading">The demo label directory is not available in this environment.</div>'; });
