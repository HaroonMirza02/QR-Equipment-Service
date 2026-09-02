'use strict';

const app = document.querySelector('#app');
const footerState = document.querySelector('#footer-state');

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatDate = (value, fallback = 'Not scheduled') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const relativeDate = (value) => {
  if (!value) return '';
  const days = Math.round((new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
};

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
const badgeClass = (value = '') => value.toLowerCase().replaceAll(' ', '-');

function getToken() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'equipment' ? parts[1] || '' : '';
}

function conditionFor(profile) {
  const severity = profile.faultSummary?.highestOpenSeverity;
  if (profile.status === 'Faulty' || severity === 'Critical') {
    return { tone: 'critical', icon: '!', title: profile.status === 'Faulty' ? 'Critical attention required' : 'Critical fault open', detail: `${profile.faultSummary?.openCount || 1} unresolved fault${profile.faultSummary?.openCount === 1 ? '' : 's'}` };
  }
  if (profile.status === 'Under Maintenance') {
    return { tone: 'warning', icon: '∼', title: 'Maintenance in progress', detail: 'Equipment may be unavailable' };
  }
  if (profile.isOverdue) {
    return { tone: 'warning', icon: '!', title: 'Maintenance overdue', detail: `Service due ${profile.daysOverdue} day${profile.daysOverdue === 1 ? '' : 's'} ago` };
  }
  if (severity === 'High' || severity === 'Medium') {
    return { tone: 'warning', icon: '!', title: 'Operational with open fault', detail: `${severity} severity · monitor condition` };
  }
  return { tone: 'operational', icon: '✓', title: 'Operational', detail: 'No critical issues reported' };
}

function renderMaintenance(events = []) {
  if (!events.length) return '<div class="empty-history">No maintenance events have been recorded yet.</div>';
  return `<ol class="timeline">${events.map((event) => `
    <li class="timeline-item">
      <div class="timeline-head">
        <span class="timeline-type">${escapeHtml(event.type)}</span>
        <time class="timeline-date" datetime="${escapeHtml(event.date)}">${formatDate(event.date)}</time>
      </div>
      <p class="timeline-description">${escapeHtml(event.description)}</p>
      <div class="timeline-meta">
        ${event.technician?.name ? `<span>By ${escapeHtml(event.technician.name)}</span>` : ''}
        ${event.nextRecommendedDate ? `<span>Next advised ${formatDate(event.nextRecommendedDate)}</span>` : ''}
      </div>
      ${event.partsUsed?.length ? `<div class="parts">Parts: ${event.partsUsed.map(escapeHtml).join(' · ')}</div>` : ''}
    </li>`).join('')}</ol>`;
}

function renderFaults(faults = []) {
  if (!faults.length) return '<div class="empty-history">No fault incidents have been recorded.</div>';
  return `<ol class="timeline">${faults.map((fault) => `
    <li class="timeline-item fault">
      <div class="timeline-head">
        <span class="timeline-type">Fault incident</span>
        <time class="timeline-date" datetime="${escapeHtml(fault.reportedDate)}">${formatDate(fault.reportedDate)}</time>
      </div>
      <div class="timeline-meta">
        <span class="badge ${badgeClass(fault.severity)}">${escapeHtml(fault.severity)}</span>
        <span class="badge ${badgeClass(fault.status)}">${escapeHtml(fault.status)}</span>
      </div>
      <p class="timeline-description">${escapeHtml(fault.description)}</p>
      ${fault.resolutionNotes ? `<div class="parts">Resolution: ${escapeHtml(fault.resolutionNotes)}</div>` : ''}
    </li>`).join('')}</ol>`;
}

function renderProfile(profile) {
  const condition = conditionFor(profile);
  const maintenanceEvents = profile.maintenanceHistory || [];
  const faultEvents = profile.faultHistory || [];
  const lastMaintenance = profile.maintenanceSummary?.lastMaintenanceDate;
  const technician = profile.assignedTechnician;
  const location = [profile.location?.site, profile.location?.building, profile.location?.zone].filter(Boolean).join(' · ');
  const now = new Date();

  document.title = `${profile.equipmentCode} · ${profile.name}`;
  footerState.textContent = 'Live record';
  app.innerHTML = `
    <article>
      <header class="profile-header">
        <div class="identity">
          <div class="identity-top">
            <div>
              <div class="asset-code">${escapeHtml(profile.category)} · ${escapeHtml(profile.equipmentCode)}</div>
              <h1>${escapeHtml(profile.name)}</h1>
              <div class="location-line">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
                <span>${escapeHtml(location || 'Location not recorded')}</span>
              </div>
            </div>
            <button class="share-button" id="share-profile" type="button" aria-label="Share equipment profile">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>
              <span>Share</span>
            </button>
          </div>
        </div>
        <div class="condition-banner ${condition.tone}">
          <div class="condition-main">
            <span class="condition-icon" aria-hidden="true">${condition.icon}</span>
            <span class="condition-copy"><strong>${condition.title}</strong><span>${condition.detail}</span></span>
          </div>
          <span class="condition-age">Current status</span>
        </div>
      </header>

      <section class="summary-grid" aria-label="Maintenance summary">
        <div class="summary-item">
          <span class="summary-label">Last maintenance</span>
          <strong class="summary-value">${formatDate(lastMaintenance, 'No record')}</strong>
          <span class="summary-meta">${lastMaintenance ? escapeHtml(profile.maintenanceSummary.lastMaintenanceType || 'Service completed') : 'Awaiting first service'}</span>
        </div>
        <div class="summary-item ${profile.isOverdue ? 'danger' : ''}">
          <span class="summary-label">Next maintenance</span>
          <strong class="summary-value">${formatDate(profile.nextMaintenanceDate)}</strong>
          <span class="summary-meta">${profile.nextMaintenanceDate ? relativeDate(profile.nextMaintenanceDate) : 'Schedule not set'}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Open faults</span>
          <strong class="summary-value">${profile.faultSummary?.openCount || 0}</strong>
          <span class="summary-meta">${profile.faultSummary?.highestOpenSeverity ? `${escapeHtml(profile.faultSummary.highestOpenSeverity)} highest severity` : 'No unresolved incidents'}</span>
        </div>
      </section>

      <div class="content-grid">
        <section class="panel history-panel">
          <div class="panel-heading">
            <div><h2>Equipment history</h2><p>Newest records first</p></div>
            <span class="record-count">${profile.maintenanceSummary?.totalCount || 0} service records</span>
          </div>
          <div class="tabs" role="tablist" aria-label="Equipment history">
            <button class="tab" id="maintenance-tab" role="tab" aria-selected="true" aria-controls="maintenance-panel" type="button">Maintenance (${maintenanceEvents.length})</button>
            <button class="tab" id="fault-tab" role="tab" aria-selected="false" aria-controls="fault-panel" type="button">Faults (${faultEvents.length})</button>
          </div>
          <div id="maintenance-panel" role="tabpanel" aria-labelledby="maintenance-tab">${renderMaintenance(maintenanceEvents)}</div>
          <div id="fault-panel" role="tabpanel" aria-labelledby="fault-tab" hidden>${renderFaults(faultEvents)}</div>
        </section>

        <section class="panel technician-panel">
          <div class="panel-heading"><div><h2>Assigned technician</h2><p>Service ownership</p></div></div>
          ${technician ? `<div class="technician"><div class="avatar" aria-hidden="true">${initials(technician.name)}</div><div><strong>${escapeHtml(technician.name)}</strong><span>${escapeHtml(technician.specialty || 'Maintenance technician')}</span></div></div>` : '<div class="unassigned">No technician is currently assigned.</div>'}
        </section>

        <section class="panel details-panel">
          <div class="panel-heading"><div><h2>Asset details</h2><p>Installation and identification</p></div></div>
          <dl class="details-list">
            <div class="detail-row"><dt>Manufacturer</dt><dd>${escapeHtml(profile.manufacturer)}</dd></div>
            <div class="detail-row"><dt>Model</dt><dd>${escapeHtml(profile.model)}</dd></div>
            <div class="detail-row"><dt>Serial number</dt><dd>${escapeHtml(profile.serialNumber || 'Not recorded')}</dd></div>
            <div class="detail-row"><dt>Installed</dt><dd>${formatDate(profile.installationDate)}</dd></div>
            <div class="detail-row"><dt>Service interval</dt><dd>${profile.maintenanceIntervalDays ? `${profile.maintenanceIntervalDays} days` : 'Not set'}</dd></div>
          </dl>
        </section>
      </div>

      <div class="freshness">
        <span>Record checked ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(now)}</span>
        <button class="refresh-button" id="refresh-profile" type="button">Refresh record</button>
      </div>
    </article>`;

  bindProfileActions(profile);
}

function bindProfileActions(profile) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    document.querySelector('#maintenance-panel').hidden = tab.id !== 'maintenance-tab';
    document.querySelector('#fault-panel').hidden = tab.id !== 'fault-tab';
  }));

  document.querySelector('#refresh-profile')?.addEventListener('click', () => loadProfile());
  document.querySelector('#share-profile')?.addEventListener('click', async () => {
    const shareData = { title: `${profile.equipmentCode} · ${profile.name}`, text: `Equipment status: ${profile.status}`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => {});
    else await navigator.clipboard?.writeText(window.location.href);
  });
}

function renderSystemState(data, httpStatus) {
  const kind = data?.status || (httpStatus === 404 ? 'invalid' : 'error');
  const states = {
    retired: { symbol: '×', label: 'Retired equipment', title: data.retiredEquipmentName || 'This asset is no longer in service', message: data.message },
    replaced: { symbol: '↗', label: 'Equipment replaced', title: `${data.retiredEquipmentCode || 'This asset'} has been replaced`, message: data.message },
    restricted: { symbol: '⌁', label: 'Restricted record', title: 'Profile access is limited', message: data.message },
    revoked: { symbol: '×', label: 'Revoked label', title: `${data.equipmentCode || 'This'} label is no longer current`, message: data.message },
    invalid: { symbol: '?', label: 'Unrecognized label', title: 'This QR code is not valid', message: 'The label may be damaged, incomplete, or not issued by this equipment system.' },
    error: { symbol: '!', label: 'Record unavailable', title: 'We could not open this profile', message: 'Check your connection and try the scan again.' },
  };
  const state = states[kind] || states.error;
  document.title = `${state.label} · PlantOps`;
  footerState.textContent = 'Scan state';
  app.innerHTML = `<section class="system-state">
    <div class="system-symbol" aria-hidden="true">${state.symbol}</div>
    <p class="eyebrow state-code">${escapeHtml(state.label)}</p>
    <h1>${escapeHtml(state.title)}</h1>
    <p>${escapeHtml(state.message)}</p>
    ${data?.successor ? `<div class="successor-card"><small>Replacement equipment</small><strong>${escapeHtml(data.successor.equipmentCode)} · ${escapeHtml(data.successor.name)}</strong></div>` : ''}
    <div class="system-actions">
      ${data?.successor?.profileUrl ? `<a class="state-button primary" href="${escapeHtml(data.successor.profileUrl)}">Open replacement profile</a>` : ''}
      <button class="state-button" type="button" id="retry-scan">Try again</button>
    </div>
  </section>`;
  document.querySelector('#retry-scan')?.addEventListener('click', () => loadProfile());
}

async function loadProfile() {
  const token = getToken();
  if (!/^[0-9a-f]{64}$/.test(token)) {
    renderSystemState({ status: 'invalid' }, 422);
    return;
  }

  try {
    const response = await fetch(`/api/public/scan/${token}`, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      renderSystemState({ status: response.status === 404 || response.status === 422 ? 'invalid' : 'error' }, response.status);
      return;
    }
    if (payload.data.status && ['retired', 'replaced', 'revoked', 'restricted'].includes(payload.data.status)) {
      renderSystemState(payload.data, response.status);
      return;
    }
    renderProfile(payload.data);
  } catch (_error) {
    renderSystemState({ status: 'error' }, 0);
  }
}

loadProfile();
