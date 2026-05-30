let currentHouse = null;
let currentChar = null;
let searchFilter = 'all';

// ===== NAVIGATION =====
function navigateTo(pageId) {
  const overlay = document.getElementById('flipOverlay');
  overlay.classList.add('flipping');
  setTimeout(() => {
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
      p.style.opacity = '0';
    });
    const target = document.getElementById('page-' + pageId);
    if (target) {
      target.style.display = 'flex';
      requestAnimationFrame(() => {
        target.style.opacity = '1';
        target.classList.add('active');
      });
    }
    if (pageId === 'house' && currentHouse) renderHousePage(currentHouse);
    if (pageId === 'character' && currentChar) renderCharPage(currentChar);
    if (pageId === 'map') renderMap();
    if (pageId === 'search') {
      renderSearch('');
      const si = document.getElementById('searchInput');
      if (si) si.value = '';
    }
    overlay.classList.remove('flipping');
  }, 280);
}

// ===== MAP =====
function renderMap() {
  const container = document.getElementById('mapPins');
  if (!container) return;
  container.innerHTML = '';
  const tooltip = document.getElementById('mapTooltip');
  const mapEl = document.getElementById('mapContainer');

  LOCATIONS.forEach(loc => {
    const h = loc.house ? HOUSES[loc.house] : null;
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.style.left = loc.x + '%';
    pin.style.top = loc.y + '%';
    pin.innerHTML =
      (h ? '<div class="pin-sigil">' + h.sigil + '</div>' : '') +
      '<div class="pin-dot"></div>' +
      '<div class="pin-label">' + loc.name + '</div>';

    pin.addEventListener('mouseenter', e => {
      tooltip.classList.add('visible');
      document.getElementById('tooltipHouse').textContent = h ? h.name : 'Free City / Notable Location';
      document.getElementById('tooltipLocation').textContent = loc.name;
      document.getElementById('tooltipDesc').textContent = loc.desc;
      positionTooltip(e, tooltip, mapEl);
    });
    pin.addEventListener('mousemove', e => positionTooltip(e, tooltip, mapEl));
    pin.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    if (loc.house) {
      pin.addEventListener('click', () => { currentHouse = loc.house; navigateTo('house'); });
    }
    container.appendChild(pin);
  });

  const legend = document.getElementById('legendItems');
  if (!legend) return;
  legend.innerHTML = '';
  Object.entries(HOUSES).forEach(([key, h]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = h.sigil + '<span class="legend-text">' + h.name.replace('House ', '') + '</span>';
    item.addEventListener('click', () => { currentHouse = key; navigateTo('house'); });
    legend.appendChild(item);
  });
}

function positionTooltip(e, tooltip, container) {
  const rect = container.getBoundingClientRect();
  let x = e.clientX - rect.left + 16;
  let y = e.clientY - rect.top + 16;
  if (x + 280 > rect.width) x = e.clientX - rect.left - 280;
  if (y + 160 > rect.height) y = e.clientY - rect.top - 160;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

// ===== HOUSE BOOK =====
function renderHousePage(houseKey) {
  const h = HOUSES[houseKey];
  if (!h) return;

  // Re-trigger book open animation
  const book = document.getElementById('bookEl');
  if (book) {
    book.style.animation = 'none';
    requestAnimationFrame(() => { book.style.animation = ''; });
  }

  document.getElementById('houseSigilLarge').innerHTML = h.sigil;
  document.getElementById('houseNameBook').textContent = h.name;
  document.getElementById('houseWordsBook').textContent = h.words;
  document.getElementById('houseRegionBook').textContent = h.region + ' · ' + h.seat;
  document.getElementById('bookSpineText').textContent = h.name;

  // Ruling lines on left page
  const lines = document.getElementById('pageLines');
  lines.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const l = document.createElement('div');
    l.className = 'page-line';
    l.style.top = (60 + i * 28) + 'px';
    lines.appendChild(l);
  }

  // Character list on right page
  const charList = document.getElementById('charList');
  charList.innerHTML = '';
  (h.characters || []).forEach(ck => {
    const ch = CHARACTERS[ck];
    if (!ch) return;
    const card = document.createElement('div');
    card.className = 'char-card';
    const sc = ch.status || 'unknown';
    const sl = { alive: 'Living', dead: 'Deceased', unknown: 'Unknown' }[sc] || 'Unknown';
    card.innerHTML =
      '<div class="char-avatar">' + ch.portrait + '</div>' +
      '<div class="char-info"><div class="char-name">' + ch.name + '</div><div class="char-role">' + ch.title + '</div></div>' +
      '<div class="char-status ' + sc + '">' + sl + '</div>';
    card.addEventListener('click', () => { currentChar = ck; navigateTo('character'); });
    charList.appendChild(card);
  });
}

// ===== CHARACTER PAGE =====
function renderCharPage(charKey) {
  const ch = CHARACTERS[charKey];
  if (!ch) return;
  const h = HOUSES[ch.house];

  document.getElementById('breadHouse').textContent = h ? h.name : 'House';
  document.getElementById('breadChar').textContent = ch.name;
  document.getElementById('charPortraitEmoji').textContent = ch.portrait;
  document.getElementById('charBadgeSigil').innerHTML = h ? h.sigil : '⚔';
  document.getElementById('charBadgeHouse').textContent = h ? h.name : '';
  document.getElementById('charBadgeWords').textContent = h ? h.words : '';

  const statusColor = ch.status === 'dead' ? '#5a0a0a' : ch.status === 'alive' ? '#1a4a1a' : '#4a3a0a';
  document.getElementById('charVitals').innerHTML =
    '<div class="vital-row"><span class="vital-label">House</span><span class="vital-value">' + (h ? h.name : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Region</span><span class="vital-value">' + (h ? h.region : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Seat</span><span class="vital-value">' + (h ? h.seat : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Status</span><span class="vital-value" style="color:' + statusColor + '">' + (ch.status_text || ch.status) + '</span></div>';

  document.getElementById('charFullName').textContent = ch.name;
  document.getElementById('charTitleText').textContent = ch.title;
  document.getElementById('charBio').textContent = ch.bio;
  document.getElementById('charBattles').innerHTML = (ch.battles || []).map(b => '<div class="battle-tag">' + b + '</div>').join('');
  document.getElementById('charMoments').textContent = ch.moments;
  document.getElementById('charLineage').textContent = ch.lineage_detail;

  const st = document.getElementById('charStatus');
  st.className = 'char-status-final ' + (ch.status || 'unknown');
  st.textContent = ch.status_text || 'Unknown';
}

// ===== SEARCH =====
function doSearch(query) {
  renderSearch(query);
}

function setFilter(f, btn) {
  searchFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  doSearch(document.getElementById('searchInput').value);
}

function renderSearch(query) {
  const q = query.toLowerCase();
  const results = document.getElementById('searchResults');
  results.innerHTML = '';
  const items = [];

  if (searchFilter === 'all' || searchFilter === 'house') {
    Object.entries(HOUSES).forEach(([key, h]) => {
      if (!q || h.name.toLowerCase().includes(q) || h.region.toLowerCase().includes(q) || h.seat.toLowerCase().includes(q))
        items.push({ type: 'house', key, display: h.name, sub: h.region + ' · ' + h.seat, sigil: h.sigil });
    });
  }
  if (searchFilter === 'all' || searchFilter === 'character') {
    Object.entries(CHARACTERS).forEach(([key, ch]) => {
      if (!q || ch.name.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q) || ch.house.toLowerCase().includes(q))
        items.push({ type: 'character', key, display: ch.name, sub: ch.title, sigil: ch.portrait });
    });
  }
  if (searchFilter === 'all' || searchFilter === 'location') {
    LOCATIONS.forEach(loc => {
      const h = loc.house ? HOUSES[loc.house] : null;
      if (!q || loc.name.toLowerCase().includes(q) || loc.desc.toLowerCase().includes(q))
        items.push({ type: 'location', key: loc.id, display: loc.name, sub: loc.desc.substring(0, 55) + '...', sigil: h ? h.sigil : '🗺' });
    });
  }

  if (!items.length) {
    results.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-family:\'IM Fell English\',serif;font-style:italic;color:rgba(201,168,76,.4);padding:60px 0;font-size:1.1rem">No records found in the maester\'s archives...</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML =
      '<div class="result-card-top">' +
        '<div class="result-card-text">' +
          '<div class="result-type">' + item.type + '</div>' +
          '<div class="result-name">' + item.display + '</div>' +
        '</div>' +
        '<div class="result-sigil">' + item.sigil + '</div>' +
      '</div>' +
      '<div class="result-sub">' + item.sub + '</div>';
    card.addEventListener('click', () => {
      if (item.type === 'house') { currentHouse = item.key; navigateTo('house'); }
      else if (item.type === 'character') { currentChar = item.key; navigateTo('character'); }
      else {
        const loc = LOCATIONS.find(l => l.id === item.key);
        if (loc && loc.house) { currentHouse = loc.house; navigateTo('house'); }
        else navigateTo('map');
      }
    });
    results.appendChild(card);
  });
}

// ===== INIT =====
renderMap();
