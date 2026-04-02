/* === Claw Candidates — Frontend App === */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : '';  // same origin in production

// State
let allCandidates = [];
let currentJobId = null;
let eventSource = null;

// DOM refs
const searchPanel   = document.getElementById('searchPanel');
const searchForm    = document.getElementById('searchForm');
const searchBtn     = document.getElementById('searchBtn');
const queryInput    = document.getElementById('queryInput');
const locationInput = document.getElementById('locationInput');
const limitSelect   = document.getElementById('limitSelect');

const progressPanel   = document.getElementById('progressPanel');
const progressBar     = document.getElementById('progressBar');
const progressMessage = document.getElementById('progressMessage');
const progressPct     = document.getElementById('progressPct');
const progressIcon    = document.getElementById('progressIcon');

const resultsHeader   = document.getElementById('resultsHeader');
const resultsTitle    = document.getElementById('resultsTitle');
const resultsSub      = document.getElementById('resultsSub');
const statsBar        = document.getElementById('statsBar');
const filtersSection  = document.getElementById('filtersSection');
const tableContainer  = document.getElementById('tableContainer');
const emptyState      = document.getElementById('emptyState');
const candidatesBody  = document.getElementById('candidatesBody');

const totalCount    = document.getElementById('totalCount');
const filteredCount = document.getElementById('filteredCount');
const avgScore      = document.getElementById('avgScore');
const topScore      = document.getElementById('topScore');

const searchInput    = document.getElementById('searchInput');
const scoreFilter    = document.getElementById('scoreFilter');
const scoreValue     = document.getElementById('scoreValue');
const platformFilter = document.getElementById('platformFilter');
const sortBy         = document.getElementById('sortBy');
const clearFilters   = document.getElementById('clearFilters');
const exportCsvBtn   = document.getElementById('exportCsvBtn');
const newSearchBtn   = document.getElementById('newSearchBtn');

// ─── Theme Toggle ────────────────────────────────────────────────────────────
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateToggleIcon();

  toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateToggleIcon();
  });

  function updateToggleIcon() {
    toggle.innerHTML = theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
})();

// ─── Platform chip interactivity ─────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('change', () => {
    chip.classList.toggle('chip--active', chip.querySelector('input').checked);
  });
});

// ─── Search Form ─────────────────────────────────────────────────────────────
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const query = queryInput.value.trim();
  const location = locationInput.value.trim() || 'Brasil';

  if (!query) {
    queryInput.focus();
    queryInput.style.borderColor = 'var(--score-low)';
    setTimeout(() => queryInput.style.borderColor = '', 2000);
    return;
  }

  const platforms = [...document.querySelectorAll('input[name="platform"]:checked')]
    .map(el => el.value);

  if (!platforms.length) platforms.push('google', 'indeed');

  const limit = parseInt(limitSelect.value) || 50;

  await startSearch(query, location, platforms, limit);
});

async function startSearch(query, location, platforms, limit) {
  setSection('progress');
  searchBtn.disabled = true;
  allCandidates = [];

  try {
    const res = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, platforms, limit }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { jobId, cached } = await res.json();
    currentJobId = jobId;

    if (cached) {
      setProgress(100, 'Resultados do cache carregados');
      await loadResults(jobId, query, location);
    } else {
      streamProgress(jobId, query, location);
    }
  } catch (err) {
    showError('Erro ao iniciar busca: ' + err.message);
    searchBtn.disabled = false;
  }
}

function streamProgress(jobId, query, location) {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`${API_BASE}/api/search/${jobId}/stream`);

  eventSource.onmessage = async (e) => {
    const data = JSON.parse(e.data);

    if (data.type === 'progress') {
      setProgress(data.progress, data.message);
    } else if (data.type === 'done') {
      eventSource.close();
      setProgress(100, 'Finalizando...');
      await loadResults(jobId, query, location);
    } else if (data.type === 'error') {
      eventSource.close();
      showError(data.message || 'Erro desconhecido');
      searchBtn.disabled = false;
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    pollResults(jobId, query, location);
  };
}

async function pollResults(jobId, query, location, attempts = 0) {
  if (attempts > 60) {
    showError('Timeout — tente novamente');
    searchBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/search/${jobId}/results`);
    const data = await res.json();

    if (res.status === 202) {
      setProgress(data.progress || 0, 'Processando...');
      setTimeout(() => pollResults(jobId, query, location, attempts + 1), 2000);
    } else if (res.ok) {
      allCandidates = data.candidates || [];
      renderResults(query, location, data.total);
    } else {
      showError(data.error || 'Erro desconhecido');
      searchBtn.disabled = false;
    }
  } catch (err) {
    setTimeout(() => pollResults(jobId, query, location, attempts + 1), 3000);
  }
}

async function loadResults(jobId, query, location) {
  try {
    const res = await fetch(`${API_BASE}/api/search/${jobId}/results`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allCandidates = data.candidates || [];
    renderResults(query, location, data.total);
  } catch (err) {
    showError('Erro ao carregar resultados: ' + err.message);
    searchBtn.disabled = false;
  }
}

function renderResults(query, location, total) {
  searchBtn.disabled = false;

  const platforms = [...new Set(allCandidates.map(c => c.platform).filter(Boolean))];
  platformFilter.innerHTML = '<option value="">Todas</option>';
  platforms.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = platformLabel(p);
    platformFilter.appendChild(opt);
  });

  resultsTitle.textContent = `Candidatos para "${query}"`;
  resultsSub.textContent = `${location} · ${total} encontrados`;

  setSection('results');
  render();
}

function render() {
  const search  = searchInput.value.toLowerCase().trim();
  const minScore = parseInt(scoreFilter.value);
  const platform = platformFilter.value;
  const sort    = sortBy.value;

  let filtered = allCandidates.filter(c => {
    if (search && !c.name?.toLowerCase().includes(search) &&
        !c.title?.toLowerCase().includes(search) &&
        !c.company?.toLowerCase().includes(search)) return false;
    if (c.score < minScore) return false;
    if (platform && c.platform !== platform) return false;
    return true;
  });

  const [field, dir] = sort.split('-');
  filtered.sort((a, b) => {
    let cmp = 0;
    if      (field === 'score')    cmp = (a.score || 0) - (b.score || 0);
    else if (field === 'name')     cmp = (a.name || '').localeCompare(b.name || '', 'pt-BR');
    else if (field === 'company')  cmp = (a.company || '').localeCompare(b.company || '', 'pt-BR');
    else if (field === 'location') cmp = (a.location || '').localeCompare(b.location || '', 'pt-BR');
    return dir === 'desc' ? -cmp : cmp;
  });

  totalCount.textContent = allCandidates.length;
  filteredCount.textContent = filtered.length;
  if (filtered.length > 0) {
    const scores = filtered.map(c => c.score || 0);
    avgScore.textContent = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    topScore.textContent = Math.max(...scores);
  } else {
    avgScore.textContent = '—';
    topScore.textContent = '—';
  }

  if (filtered.length === 0) {
    tableContainer.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  tableContainer.style.display = 'block';
  emptyState.style.display = 'none';

  candidatesBody.innerHTML = filtered.map((c, i) => `
    <tr>
      <td class="td-rank">${i + 1}</td>
      <td class="td-name">${esc(c.name)}</td>
      <td class="td-title" title="${esc(c.title)}">${esc(c.title)}</td>
      <td class="td-company" title="${esc(c.company)}">${esc(c.company)}</td>
      <td class="td-location">${esc(c.location)}</td>
      <td class="td-platform">
        <span class="platform-tag platform-tag--${esc(c.platform)}">${platformLabel(c.platform)}</span>
      </td>
      <td class="td-score">
        <span class="score-badge ${scoreClass(c.score)}">${c.score || 0}</span>
      </td>
      <td class="td-profile">
        ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="profile-link" title="Ver perfil">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>` : '<span style="color:var(--text-faint);font-size:12px">—</span>'}
      </td>
    </tr>
  `).join('');
}

function setSection(section) {
  progressPanel.style.display  = section === 'progress' ? 'block' : 'none';
  resultsHeader.style.display  = section === 'results' ? 'flex' : 'none';
  statsBar.style.display       = section === 'results' ? 'grid' : 'none';
  filtersSection.style.display = section === 'results' ? 'block' : 'none';

  if (section === 'results') {
    tableContainer.style.display = 'block';
    searchPanel.style.display = 'none';
  } else {
    searchPanel.style.display = 'block';
    tableContainer.style.display = 'none';
    emptyState.style.display = 'none';
  }
}

function setProgress(pct, msg) {
  progressBar.style.width = pct + '%';
  progressMessage.textContent = msg;
  progressPct.textContent = pct + '%';

  if (pct >= 100) {
    progressIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--score-high)" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>`;
  }
}

function showError(msg) {
  progressIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--score-low)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  progressMessage.textContent = 'Erro: ' + msg;
  progressMessage.style.color = 'var(--score-low)';
}

function scoreClass(score) {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-mid';
  return 'score-low';
}

function platformLabel(p) {
  const labels = { linkedin: 'LinkedIn', indeed: 'Indeed', catho: 'Catho', vagas: 'Vagas', google: 'Google' };
  return labels[p] || p || '—';
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

searchInput.addEventListener('input', render);
scoreFilter.addEventListener('input', () => { scoreValue.textContent = scoreFilter.value; render(); });
platformFilter.addEventListener('change', render);
sortBy.addEventListener('change', render);

clearFilters.addEventListener('click', () => {
  searchInput.value = '';
  scoreFilter.value = 0; scoreValue.textContent = '0';
  platformFilter.value = '';
  sortBy.value = 'score-desc';
  render();
});

document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    const [cur, dir] = sortBy.value.split('-');
    sortBy.value = cur === field ? `${field}-${dir === 'asc' ? 'desc' : 'asc'}` : (field === 'score' ? `${field}-desc` : `${field}-asc`);
    render();
  });
});

exportCsvBtn.addEventListener('click', () => {
  if (!currentJobId) return;
  window.open(`${API_BASE}/api/export/${currentJobId}?format=csv`, '_blank');
});

newSearchBtn.addEventListener('click', () => {
  if (eventSource) eventSource.close();
  allCandidates = [];
  currentJobId = null;
  searchBtn.disabled = false;
  progressMessage.style.color = '';
  progressIcon.innerHTML = `<svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  setSection('search');
  queryInput.focus();
});
