let currentHouse = null;
let currentChar = null;
let searchFilter = 'all';
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let mapRendered = false;
let pageTransitionTimer = null;
let pageTransitionClearTimer = null;

const PAGE_TRANSITION_SWAP_MS = 240;
const PAGE_TRANSITION_TOTAL_MS = 600;

// ===== MAJOR TRANSITION DETECTION =====
function isMajorTransition(fromPage, toPage) {
  const majorRoutes = [
    ['home','map'],['map','home'],
    ['map','house'],['house','map'],
    ['house','character'],['character','house']
  ];
  return majorRoutes.some(([from,to]) => from === fromPage && to === toPage);
}

// ===== NAVIGATION =====
function resetSearchFilter() {
  searchFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.filter-btn');
  if (allBtn) allBtn.classList.add('active');
}

function preparePage(pageId) {
  if (pageId === 'timeline') renderTimeline();
  if (pageId === 'house' && currentHouse) renderHousePage(currentHouse);
  if (pageId === 'character' && currentChar) renderCharPage(currentChar);
  if (pageId === 'map') renderMap();
  if (pageId === 'search') {
    renderSearch('');
    const si = document.getElementById('searchInput');
    if (si) si.value = '';
    resetSearchFilter();
  }
}

function clearPageTransition(overlay, pages) {
  if (overlay) overlay.classList.remove('flipping');
  document.body.classList.remove('page-transitioning');
  if (pages) pages.forEach(p => p.classList.remove('page-leaving','page-entering'));
}

function navigateTo(pageId) {  const overlay = document.getElementById('flipOverlay');
  const pages = Array.from(document.querySelectorAll('.page'));
  const target = document.getElementById('page-' + pageId);
  if (!target) return;

  const currentPageEl = document.querySelector('.page.active');
  const currentPageId = currentPageEl ? currentPageEl.id.replace('page-','') : '';

  // Don't re-navigate to the same page
  if (currentPageEl === target) return;

  const useFlip = isMajorTransition(currentPageId, pageId);

  clearTimeout(pageTransitionTimer);
  clearTimeout(pageTransitionClearTimer);
  clearPageTransition(overlay, pages);

  // Prepare content before animating
  preparePage(pageId);

  document.body.classList.add('page-transitioning');

  // Mark leaving page
  if (currentPageEl) {
    currentPageEl.classList.add('page-leaving');
  }

  // Trigger flip if applicable
  if (useFlip && overlay) {
    navigator.vibrate?.(12);
    overlay.classList.remove('flipping');
    void overlay.offsetWidth; // reflow to restart animation
    overlay.classList.add('flipping');
  }

  pageTransitionTimer = setTimeout(() => {
    // Hide all non-target pages
    pages.forEach(p => {
      if (p === target) return;
      p.classList.remove('active','page-leaving','page-entering');
      p.style.display = 'none';
      p.style.opacity = '';
    });

    // Show target
    target.classList.remove('page-entering');
    target.style.display = 'flex';
    target.style.opacity = '';
    target.classList.add('active');
    void target.offsetWidth; // reflow — ensures page-entering animation fires fresh
    target.classList.add('page-entering');

    pageTransitionClearTimer = setTimeout(() => {
      clearPageTransition(overlay, pages);
    }, useFlip ? (PAGE_TRANSITION_TOTAL_MS - PAGE_TRANSITION_SWAP_MS) : 200);

  }, useFlip ? PAGE_TRANSITION_SWAP_MS : 120);
}

// ===== MAP =====
function renderMap() {
  const container = document.getElementById('mapPins');
  if (!container) return;
  if (mapRendered) { applyMapZoom(); return; }

  container.innerHTML = '';
  applyMapZoom();

  const tooltip = document.getElementById('mapTooltip');
  const mapEl = document.getElementById('mapContainer');
  if (!tooltip || !mapEl) return;

  LOCATIONS.forEach((loc, i) => {
    const h = loc.house ? HOUSES[loc.house] : null;
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.style.left = loc.x + '%';
    pin.style.top = loc.y + '%';
    pin.style.setProperty('--pin-index', i);
    pin.innerHTML =
      (h ? '<div class="pin-sigil">' + h.sigil + '</div>' : '') +
      '<div class="pin-dot"></div>' +
      '<div class="pin-label">' + escapeHtml(loc.name) + '</div>';

    // Mouse events for desktop tooltip
    pin.addEventListener('mouseenter', e => {
      showTooltip(tooltip, h, loc);
      positionTooltip(e, tooltip, mapEl);
    });
    pin.addEventListener('mousemove', e => positionTooltip(e, tooltip, mapEl));
    pin.addEventListener('mouseleave', () => {
      if (!tooltip.classList.contains('mobile-pin-tooltip')) {
        tooltip.classList.remove('visible');
      }
    });

    if (loc.house) {
      pin.dataset.house = loc.house;
      pin.addEventListener('click', () => {
        // Only navigate on click if NOT a touch device showing first-tap reveal
        // (touch flow handled separately in enableTouchPins)
        if (!('ontouchstart' in window)) {
          currentHouse = loc.house;
          navigateTo('house');
        }
      });
    }

    container.appendChild(pin);
  });

  enableTouchPins(tooltip);

  // Legend
  const legend = document.getElementById('legendItems');
  if (!legend) return;
  legend.innerHTML = '';
  Object.entries(HOUSES).forEach(([key, h]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = h.sigil + '<span class="legend-text">' + escapeHtml(h.name.replace('House ','')) + '</span>';
    item.addEventListener('click', () => { currentHouse = key; navigateTo('house'); });
    legend.appendChild(item);
  });

  mapRendered = true;
}

function showTooltip(tooltip, h, loc) {
  document.getElementById('tooltipHouse').textContent = h ? h.name : 'Free City / Notable Location';
  document.getElementById('tooltipLocation').textContent = loc.name;
  document.getElementById('tooltipDesc').textContent = loc.desc;
  tooltip.classList.add('visible');
}

// ===== TOUCH PINS =====
let _touchPinsDismissAttached = false;
let _suppressDismiss = false;

function enableTouchPins(tooltip) {
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;

  document.querySelectorAll('.map-pin').forEach(pin => {
    pin.addEventListener('touchstart', e => {
      e.stopPropagation();
      _suppressDismiss = true;

      const alreadyShown = pin.classList.contains('touch-show');

      // Dismiss all other pins
      document.querySelectorAll('.map-pin.touch-show').forEach(p => {
        if (p !== pin) p.classList.remove('touch-show');
      });

      if (alreadyShown) {
        // Second tap: navigate if has house
        pin.classList.remove('touch-show');
        tooltip.classList.remove('visible','mobile-pin-tooltip');
        const houseKey = pin.dataset.house;
        if (houseKey) {
          currentHouse = houseKey;
          navigateTo('house');
        }
      } else {
        // First tap: reveal & show tooltip at bottom
        pin.classList.add('touch-show');
        const loc = LOCATIONS.find(l => {
          const px = parseFloat(pin.style.left);
          const py = parseFloat(pin.style.top);
          return Math.abs(l.x - px) < 0.01 && Math.abs(l.y - py) < 0.01;
        });
        if (loc) {
          const h = loc.house ? HOUSES[loc.house] : null;
          showTooltip(tooltip, h, loc);
          // Force fixed bottom position on mobile
          tooltip.classList.add('mobile-pin-tooltip');
          tooltip.style.left = '';
          tooltip.style.top = '';
        }
      }

      requestAnimationFrame(() => { _suppressDismiss = false; });
    }, { passive: true });
  });

  if (!_touchPinsDismissAttached) {
    _touchPinsDismissAttached = true;
    document.addEventListener('touchstart', () => {
      if (_suppressDismiss) return;
      document.querySelectorAll('.map-pin.touch-show').forEach(p => p.classList.remove('touch-show'));
      tooltip.classList.remove('visible','mobile-pin-tooltip');
    }, { passive: true });
  }
}

function positionTooltip(e, tooltip, container) {
  // Skip repositioning if in mobile-pinned mode
  if (tooltip.classList.contains('mobile-pin-tooltip')) return;

  const rect = container.getBoundingClientRect();
  const tw = tooltip.offsetWidth || 260;
  const th = tooltip.offsetHeight || 160;
  let x = e.clientX - rect.left + 16;
  let y = e.clientY - rect.top + 16;
  if (x + tw > rect.width) x = e.clientX - rect.left - tw - 8;
  if (y + th > rect.height) y = e.clientY - rect.top - th - 8;
  x = Math.max(0, x);
  y = Math.max(0, y);
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

// ===== HOUSE BOOK =====
function renderHousePage(houseKey) {
  const h = HOUSES[houseKey];
  if (!h) return;

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

  const lines = document.getElementById('pageLines');
  if (lines) lines.innerHTML = '';

  const charList = document.getElementById('charList');
  charList.innerHTML = '';
  (h.characters || []).forEach((ck, i) => {
    const ch = CHARACTERS[ck];
    if (!ch) return;
    const card = document.createElement('div');
    card.className = 'char-card';
    card.style.setProperty('--item-index', i);
    const sc = ch.status || 'unknown';
    const sl = { alive:'Living', dead:'Deceased', unknown:'Unknown' }[sc] || 'Unknown';
    card.innerHTML =
      '<div class="char-avatar">' + ch.portrait + '</div>' +
      '<div class="char-info"><div class="char-name">' + escapeHtml(ch.name) + '</div><div class="char-role">' + escapeHtml(ch.title) + '</div></div>' +
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

  const breadHouseEl = document.getElementById('breadHouse');
  if (breadHouseEl) {
    breadHouseEl.textContent = h ? h.name : (ch.house || 'Unknown');
    breadHouseEl.style.display = h ? '' : 'none';
  }
  document.getElementById('breadChar').textContent = ch.name;
  document.getElementById('charPortraitEmoji').innerHTML = ch.portrait;
  document.getElementById('charBadgeSigil').innerHTML = h ? h.sigil : '⚔';
  document.getElementById('charBadgeHouse').textContent = h ? h.name : '';
  document.getElementById('charBadgeWords').textContent = h ? h.words : '';

  const statusColor = ch.status === 'dead' ? '#5a0a0a' : ch.status === 'alive' ? '#1a4a1a' : '#4a3a0a';
  document.getElementById('charVitals').innerHTML =
    '<div class="vital-row"><span class="vital-label">House</span><span class="vital-value">' + escapeHtml(h ? h.name : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Region</span><span class="vital-value">' + escapeHtml(h ? h.region : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Seat</span><span class="vital-value">' + escapeHtml(h ? h.seat : '—') + '</span></div>' +
    '<div class="vital-row"><span class="vital-label">Status</span><span class="vital-value" style="color:' + statusColor + '">' + escapeHtml(ch.status_text || ch.status) + '</span></div>';

  document.getElementById('charFullName').textContent = ch.name;
  document.getElementById('charTitleText').textContent = ch.title;
  document.getElementById('charBio').textContent = ch.bio;
  document.getElementById('charBattles').innerHTML = (ch.battles || []).map(b => '<div class="battle-tag">' + escapeHtml(b) + '</div>').join('');
  document.getElementById('charMoments').textContent = ch.moments;
  document.getElementById('charLineage').textContent = ch.lineage_detail;

  const st = document.getElementById('charStatus');
  st.className = 'char-status-final ' + (ch.status || 'unknown');
  st.textContent = ch.status_text || 'Unknown';
}

// ===== SEARCH =====
let _searchDebounceTimer = null;
function doSearch(query) {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => renderSearch(query), 200);
}

function setFilter(f, btn) {
  searchFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const input = document.getElementById('searchInput');
  doSearch(input ? input.value : '');
}

function renderSearch(query) {
  const q = (query || '').toLowerCase().trim();
  const results = document.getElementById('searchResults');
  if (!results) return;
  results.innerHTML = '';
  const items = [];

  if (searchFilter === 'all' || searchFilter === 'house') {
    Object.entries(HOUSES).forEach(([key, h]) => {
      if (!q || h.name.toLowerCase().includes(q) || h.region.toLowerCase().includes(q) || h.seat.toLowerCase().includes(q))
        items.push({ type:'house', key, display:h.name, sub:h.region + ' · ' + h.seat, sigil:h.sigil });
    });
  }
  if (searchFilter === 'all' || searchFilter === 'character') {
    Object.entries(CHARACTERS).forEach(([key, ch]) => {
      if (!q || ch.name.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q) || (ch.house && ch.house.toLowerCase().includes(q)))
        items.push({ type:'character', key, display:ch.name, sub:ch.title, sigil:ch.portrait });
    });
  }
  if (searchFilter === 'all' || searchFilter === 'location') {
    LOCATIONS.forEach(loc => {
      const h = loc.house ? HOUSES[loc.house] : null;
      if (!q || loc.name.toLowerCase().includes(q) || loc.desc.toLowerCase().includes(q)) {
        const sub = loc.desc.length > 58
          ? loc.desc.substring(0, loc.desc.lastIndexOf(' ', 58)) + '…'
          : loc.desc;
        items.push({ type:'location', key:loc.id, display:loc.name, sub, sigil:h ? h.sigil : '🗺' });
      }
    });
  }

  if (!items.length) {
    results.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-family:\'IM Fell English\',serif;font-style:italic;color:rgba(201,168,76,.4);padding:60px 0;font-size:1.1rem">No records found in the maester\'s archives...</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.setProperty('--item-index', Math.min(i, 18));
    card.innerHTML =
      '<div class="result-card-top">' +
        '<div class="result-card-text">' +
          '<div class="result-type">' + item.type + '</div>' +
          '<div class="result-name">' + escapeHtml(item.display) + '</div>' +
        '</div>' +
        '<div class="result-sigil">' + item.sigil + '</div>' +
      '</div>' +
      '<div class="result-sub">' + escapeHtml(item.sub) + '</div>';
    card.addEventListener('click', () => {
      if (item.type === 'house') { currentHouse = item.key; navigateTo('house'); }
      else if (item.type === 'character') { currentChar = item.key; navigateTo('character'); }
      else {
        const loc = LOCATIONS.find(l => l.id === item.key);
        if (loc && loc.house) { currentHouse = loc.house; navigateTo('house'); }
        else navigateTo('map');
      }
    });
    fragment.appendChild(card);
  });
  results.appendChild(fragment);
}

// ===== MAP ZOOM/PAN =====
function applyMapZoom() {
  const stage = document.getElementById('mapStage');
  if (!stage) return;
  stage.style.transform =
    `translate(calc(-50% + ${mapPanX}px), calc(-50% + ${mapPanY}px)) scale(${mapZoom})`;
}

function zoomMap(amount) {
  mapZoom = Math.min(2.5, Math.max(0.6, mapZoom + amount));
  applyMapZoom();
}

function resetMapZoom() {
  mapZoom = 1; mapPanX = 0; mapPanY = 0;
  applyMapZoom();
}

// ===== DRAG TO PAN MAP =====
let _mapDragEnabled = false;
function enableMapDrag() {
  const stage = document.getElementById('mapStage');
  if (!stage || _mapDragEnabled) return;
  _mapDragEnabled = true;

  let dragging = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  function startDrag(x, y) {
    dragging = true;
    startX = x; startY = y;
    startPanX = mapPanX; startPanY = mapPanY;
    document.body.style.cursor = 'grabbing';
    const mc = document.getElementById('mapContainer');
    if (mc) mc.classList.add('dragging');
  }
  function moveDrag(x, y) {
    if (!dragging) return;
    const dx = x - startX, dy = y - startY;
    mapPanX = startPanX + dx;
    mapPanY = startPanY + dy;
    applyMapZoom();
  }
  function endDrag() {
    dragging = false;
    document.body.style.cursor = '';
    const mc = document.getElementById('mapContainer');
    if (mc) mc.classList.remove('dragging');
  }

  // Mouse
  stage.addEventListener('mousedown', e => {
    if (e.target.closest('.map-pin')) return;
    startDrag(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup', endDrag);

  // Touch (single finger pan + two finger pinch)
  let _lastPinchDist = null;
  stage.addEventListener('touchstart', e => {
    if (e.target.closest('.map-pin')) return;
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      dragging = false;
      _lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && _lastPinchDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - _lastPinchDist) * 0.005;
      mapZoom = Math.min(2.5, Math.max(0.6, mapZoom + delta));
      _lastPinchDist = dist;
      applyMapZoom();
    }
  }, { passive: true });

  stage.addEventListener('touchend', e => {
    if (e.touches.length < 2) _lastPinchDist = null;
    endDrag();
  });
}

// ===== LEGEND DROPDOWN =====
function enableLegendDropdown() {
  const legend = document.querySelector('.map-legend');
  const title = document.querySelector('.legend-title');
  const items = document.getElementById('legendItems');
  if (!legend || !title || !items) return;

  title.addEventListener('click', e => {
    e.stopPropagation();
    legend.classList.toggle('open');
  });
  items.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => legend.classList.remove('open'));
}

// ===== TIMELINE =====
function renderTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = '';

  if (typeof TIMELINE_EVENTS === 'undefined' || !TIMELINE_EVENTS.length) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = "No records found in the maester's timeline.";
    list.appendChild(empty);
    return;
  }

  const events = [...TIMELINE_EVENTS].sort((a, b) => {
    const yd = a.year - b.year;
    return yd !== 0 ? yd : (a.order || 0) - (b.order || 0);
  });

  const intro = document.createElement('div');
  intro.className = 'timeline-intro';
  intro.innerHTML =
    '<div class="timeline-kicker">Chronicle of the Realm</div>' +
    '<div class="timeline-intro-title">From the Dawn Age to Winter Returned</div>' +
    '<div class="timeline-intro-copy">Trace the pressure points that shaped Westeros: migrations, prophecies, dragonfire, rebellions, betrayals, and the wars that broke old certainties.</div>';
  list.appendChild(intro);

  const fragment = document.createDocumentFragment();
  let activeEra = '';
  let visualIndex = 0;

  events.forEach((ev, eventIndex) => {
    if (ev.era && ev.era !== activeEra) {
      activeEra = ev.era;
      const era = document.createElement('div');
      era.className = 'timeline-era-marker';
      era.style.setProperty('--item-index', visualIndex++);
      const eraLabel = document.createElement('span');
      eraLabel.textContent = activeEra;
      era.appendChild(eraLabel);
      fragment.appendChild(era);
    }

    const item = document.createElement('article');
    item.className = 'timeline-item tone-' + (ev.tone || 'gold');
    item.style.setProperty('--item-index', visualIndex++);

    const datePlate = document.createElement('div');
    datePlate.className = 'timeline-dateplate';
    datePlate.textContent = formatTimelineDate(ev);

    const rail = document.createElement('div');
    rail.className = 'timeline-rail';
    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    rail.appendChild(dot);
    if (eventIndex < events.length - 1) {
      const line = document.createElement('div');
      line.className = 'timeline-line';
      rail.appendChild(line);
    }

    const card = document.createElement('div');
    card.className = 'timeline-card';
    const top = document.createElement('div');
    top.className = 'timeline-card-top';
    const meta = document.createElement('div');
    meta.className = 'timeline-meta';
    if (ev.type) meta.appendChild(createTimelineChip(ev.type, 'timeline-chip type'));
    if (ev.location) meta.appendChild(createTimelineChip(ev.location, 'timeline-chip location'));
    const sigils = document.createElement('div');
    sigils.className = 'timeline-sigils';
    (ev.factions || []).forEach(key => {
      const house = HOUSES[key];
      if (!house) return;
      const sigil = document.createElement('span');
      sigil.className = 'timeline-sigil';
      sigil.title = house.name;
      sigil.innerHTML = house.sigil;
      sigils.appendChild(sigil);
    });
    top.appendChild(meta);
    if (sigils.children.length) top.appendChild(sigils);

    const title = document.createElement('div');
    title.className = 'timeline-title';
    title.textContent = ev.title;
    const desc = document.createElement('div');
    desc.className = 'timeline-desc';
    desc.textContent = ev.desc;

    card.appendChild(top);
    card.appendChild(title);
    card.appendChild(desc);

    if (ev.consequence) {
      const consequence = document.createElement('div');
      consequence.className = 'timeline-consequence';
      const label = document.createElement('span');
      label.textContent = 'Aftermath';
      consequence.appendChild(label);
      consequence.appendChild(document.createTextNode(ev.consequence));
      card.appendChild(consequence);
    }

    item.appendChild(datePlate);
    item.appendChild(rail);
    item.appendChild(card);
    fragment.appendChild(item);
  });

  list.appendChild(fragment);
}

function formatTimelineDate(ev) {
  if (ev.date) return ev.date;
  return ev.year < 0 ? Math.abs(ev.year) + ' BC' : ev.year + ' AC';
}

function createTimelineChip(text, className) {
  const chip = document.createElement('span');
  chip.className = className;
  chip.textContent = text;
  return chip;
}

// ===== HOME PARALLAX =====
function enableHomeParallax() {
  const home = document.getElementById('page-home');
  if (!home || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let ticking = false, nextX = 0, nextY = 0;
  window.addEventListener('pointermove', e => {
    nextX = (0.5 - e.clientX / window.innerWidth) * 18;
    nextY = (0.5 - e.clientY / window.innerHeight) * 12;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      home.style.setProperty('--home-shift-x', nextX.toFixed(2) + 'px');
      home.style.setProperty('--home-shift-y', nextY.toFixed(2) + 'px');
      ticking = false;
    });
  }, { passive: true });
}

// ===== UTILITY =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  enableLegendDropdown();
  enableMapDrag();
  enableHomeParallax();
});

// ===== EMBER PARTICLE SYSTEM =====
function initEmbers() {
  const canvas = document.createElement('canvas');
  canvas.id = 'emberCanvas';
  const home = document.getElementById('page-home');
  if (!home) return;
  home.insertBefore(canvas, home.firstChild);

  const ctx = canvas.getContext('2d');
  let W, H, particles = [], animFrame;
  const MAX = 55;

  function resize() {
    W = canvas.width = home.offsetWidth;
    H = canvas.height = home.offsetHeight;
  }

  function randomParticle(forceBottom) {
    const x = Math.random() * W;
    const y = forceBottom ? H + 10 : Math.random() * H;
    const size = Math.random() * 2.4 + 0.6;
    const speed = Math.random() * 0.5 + 0.18;
    const drift = (Math.random() - 0.5) * 0.4;
    const life = Math.random() * 0.7 + 0.3;
    const maxLife = Math.random() * 280 + 180;
    // colour: ember orange → gold → pale yellow
    const hue = Math.random() > 0.5
      ? `rgba(${200 + Math.random()*40|0},${80 + Math.random()*60|0},${20 + Math.random()*20|0},`
      : `rgba(${230 + Math.random()*25|0},${170 + Math.random()*40|0},${50 + Math.random()*30|0},`;
    return { x, y, size, speed, drift, life, maxLife, age: 0, hue, wobble: Math.random()*Math.PI*2, wobbleSpeed: (Math.random()-0.5)*0.04 };
  }

  function spawn() {
    while (particles.length < MAX) particles.push(randomParticle(true));
  }

  function tick() {
    if (!document.getElementById('page-home')?.classList.contains('active')) {
      animFrame = requestAnimationFrame(tick);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;
      p.wobble += p.wobbleSpeed;
      p.x += p.drift + Math.sin(p.wobble) * 0.35;
      p.y -= p.speed;

      // fade in/out
      const progress = p.age / p.maxLife;
      const alpha = progress < 0.15
        ? (progress / 0.15) * p.life
        : progress > 0.75
          ? ((1 - progress) / 0.25) * p.life
          : p.life;

      // glow
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
      grd.addColorStop(0, p.hue + Math.min(alpha, 1) + ')');
      grd.addColorStop(0.4, p.hue + (alpha * 0.5) + ')');
      grd.addColorStop(1, p.hue + '0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = p.hue + Math.min(alpha * 1.4, 1) + ')';
      ctx.fill();

      if (p.age > p.maxLife || p.y < -20) {
        particles[i] = randomParticle(true);
      }
    }
    animFrame = requestAnimationFrame(tick);
  }

  resize();
  spawn();
  tick();
  window.addEventListener('resize', () => { resize(); }, { passive: true });
}

// ===== SCROLL-TRIGGERED REVEAL (IntersectionObserver) =====
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  // observe timeline cards, result cards whenever they're added
  function observeAll() {
    document.querySelectorAll('.timeline-card:not(.revealed), .result-card:not(.revealed)').forEach(el => io.observe(el));
  }

  // run on nav
  const origNavigateTo = window.navigateTo;
  window.navigateTo = function(pageId) {
    origNavigateTo(pageId);
    setTimeout(observeAll, 600);
  };
  observeAll();
}

// ===== MAGNETIC HOVER ON MAP PINS =====
function initMagneticPins() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.addEventListener('mousemove', e => {
    document.querySelectorAll('.map-pin').forEach(pin => {
      const rect = pin.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const RADIUS = 60;
      if (dist < RADIUS) {
        const strength = (1 - dist / RADIUS) * 8;
        pin.style.transform = `translate(${dx * strength / dist}px, ${dy * strength / dist}px) scale(1.1)`;
      } else {
        pin.style.transform = '';
      }
    });
  }, { passive: true });
}

// ===== 3D TILT ON RESULT CARDS =====
function initCardTilt() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.addEventListener('mousemove', e => {
    const card = e.target.closest('.result-card');
    if (!card) {
      // reset all
      document.querySelectorAll('.result-card.tilting').forEach(c => {
        c.style.transform = '';
        c.classList.remove('tilting');
      });
      return;
    }
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5 → 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const rotX = -y * 8;
    const rotY = x * 8;
    card.style.transform = `translateY(-5px) scale(1.01) perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    card.classList.add('tilting');
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    document.querySelectorAll('.result-card.tilting').forEach(c => {
      c.style.transform = '';
      c.classList.remove('tilting');
    });
  }, { passive: true });
}

// ===== BOOK 3D MOUSE PARALLAX =====
function initBookParallax() {
  const wrapper = document.getElementById('page-house');
  if (!wrapper) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  wrapper.addEventListener('mousemove', e => {
    const bookEl = document.getElementById('bookEl');
    if (!bookEl) return;
    const rect = wrapper.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    bookEl.style.transform = `perspective(1400px) rotateY(${x * 6}deg) rotateX(${-y * 4}deg) scale(1.012)`;
  }, { passive: true });

  wrapper.addEventListener('mouseleave', () => {
    const bookEl = document.getElementById('bookEl');
    if (bookEl) bookEl.style.transform = '';
  }, { passive: true });
}

// ===== GLINT ON GOLD TEXT =====
function initGoldGlint() {
  // Add a subtle travelling highlight to home title on hover
  const title = document.querySelector('.home-title');
  if (!title) return;
  title.style.backgroundImage = 'linear-gradient(90deg, var(--gold-light) 0%, #fff8dc 45%, var(--gold-light) 55%, var(--gold) 100%)';
  title.style.backgroundSize = '200%';
  title.style.webkitBackgroundClip = 'text';
  title.style.backgroundClip = 'text';
  title.style.webkitTextFillColor = 'transparent';
  title.style.animation = 'goldGlint 4s ease-in-out infinite alternate, titleGlow 4s ease-in-out infinite alternate';

  if (!document.getElementById('goldGlintStyle')) {
    const s = document.createElement('style');
    s.id = 'goldGlintStyle';
    s.textContent = `@keyframes goldGlint{0%{background-position:0% 50%;filter:drop-shadow(0 0 20px rgba(240,208,128,.3))}100%{background-position:100% 50%;filter:drop-shadow(0 0 45px rgba(240,208,128,.7))}}`;
    document.head.appendChild(s);
  }
}

// ===== STAGGER VITALS ON CHAR PAGE =====
const _origRenderCharPage = window.renderCharPage;

// ===== CURSOR RIPPLE on click =====
function initClickRipple() {
  document.addEventListener('click', e => {
    if (e.target.closest('.map-pin, .char-card, .result-card, .enter-btn, .nav-tab')) {
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position:fixed;left:${e.clientX}px;top:${e.clientY}px;
        width:4px;height:4px;border-radius:50%;pointer-events:none;z-index:9999;
        background:radial-gradient(circle,rgba(240,208,128,.9),rgba(201,168,76,.4),transparent);
        transform:translate(-50%,-50%) scale(0);
        animation:rippleOut .5s var(--ease-out-expo) forwards;
      `;
      document.body.appendChild(ripple);
      if (!document.getElementById('rippleStyle')) {
        const s = document.createElement('style');
        s.id = 'rippleStyle';
        s.textContent = `@keyframes rippleOut{0%{transform:translate(-50%,-50%) scale(0);opacity:1}100%{transform:translate(-50%,-50%) scale(28);opacity:0}}`;
        document.head.appendChild(s);
      }
      setTimeout(() => ripple.remove(), 520);
    }
  });
}

// ===== INIT ALL =====
document.addEventListener('DOMContentLoaded', () => {
  enableLegendDropdown();
  enableMapDrag();
  enableHomeParallax();
  initEmbers();
  initScrollReveal();
  initMagneticPins();
  initCardTilt();
  initBookParallax();
  initGoldGlint();
  initClickRipple();
});
