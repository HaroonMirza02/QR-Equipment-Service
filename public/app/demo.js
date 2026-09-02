'use strict';

const grid = document.querySelector('#label-grid');
const count = document.querySelector('#label-count');
const categorySelect = document.querySelector('#category-select');
const prevPageBtn = document.querySelector('#prev-page');
const nextPageBtn = document.querySelector('#next-page');
const pageInfo = document.querySelector('#page-info');

let equipment = [];
let paginationData = {};
let activeFilter = 'all';
let currentCategory = 'all';
let currentPage = 1;
const pageSize = 12;

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function presentation(item) {
  if (item.qrStatus === 'revoked') return { group: 'lifecycle', className: 'lifecycle', label: 'Retired label' };
  if (item.qrStatus === 'replaced') return { group: 'lifecycle', className: 'lifecycle', label: 'Replaced label' };
  if (item.status === 'Faulty') return { group: 'attention', className: 'attention', label: 'Faulty · isolate' };
  if (item.status === 'Under Maintenance') return { group: 'attention', className: 'warning', label: 'Under maintenance' };
  if (item.isOverdue) return { group: 'attention', className: 'warning', label: `${item.daysOverdue} days overdue` };
  return { group: 'normal', className: '', label: 'Operational' };
}

async function fetchEquipment() {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      pageSize,
      category: currentCategory,
    });
    const response = await fetch(`/api/public/demo-equipment?${params}`, { headers: { Accept: 'application/json' } });
    
    if (!response.ok) throw new Error('Demo directory unavailable');
    
    const payload = await response.json();
    paginationData = payload.data;
    equipment = paginationData.data || [];
    
    count.textContent = paginationData.total;
    updatePaginationUI();
    render();
  } catch (err) {
    grid.innerHTML = '<div class="demo-loading">The demo label directory is not available in this environment.</div>';
    console.error('Error fetching equipment:', err);
  }
}

function updatePaginationUI() {
  const { pages, page } = paginationData;
  
  // Update page info
  pageInfo.textContent = pages > 0 ? `Page ${page} of ${pages}` : 'No results';
  
  // Update button states
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= pages;
}

function render() {
  const filtered = equipment.filter((item) => activeFilter === 'all' || presentation(item).group === activeFilter);
  
  grid.innerHTML = filtered.map((item) => {
    const state = presentation(item);
    const location = [item.location?.site, item.location?.building, item.location?.zone].filter(Boolean).join(' · ');
    return `<article class="qr-label" data-group="${state.group}">
      <div class="qr-visual">
        <img src="${escapeHtml(item.qrCodeUrl)}" alt="QR code for ${escapeHtml(item.equipmentCode)}" />
        <small>Scan for service record</small>
      </div>
      <div class="label-copy">
        <span class="label-category">${escapeHtml(item.category)}</span>
        <span class="label-state ${state.className}">${escapeHtml(state.label)}</span>
        <strong class="label-code">${escapeHtml(item.equipmentCode)}</strong>
        <p class="label-name">${escapeHtml(item.name)}</p>
        <span class="label-location">${escapeHtml(location)}</span>
        <span class="label-action"><a href="${escapeHtml(item.profileUrl)}">Open profile</a></span>
      </div>
    </article>`;
  }).join('') || '<div class="demo-loading">No labels match this filter.</div>';
}

// Status filter buttons
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));

// Category select
categorySelect.addEventListener('change', async (e) => {
  currentCategory = e.target.value;
  currentPage = 1;
  await fetchEquipment();
});

// Pagination buttons
prevPageBtn.addEventListener('click', async () => {
  if (currentPage > 1) {
    currentPage--;
    await fetchEquipment();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

nextPageBtn.addEventListener('click', async () => {
  if (currentPage < paginationData.pages) {
    currentPage++;
    await fetchEquipment();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Print button
document.querySelector('#print-labels').addEventListener('click', () => window.print());

// Initial load
fetchEquipment();
