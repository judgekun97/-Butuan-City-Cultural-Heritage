/* Butuan Heritage Map
 * Leaflet.js + Turf.js 6.5.0. No build step, no terminal needed.
 * Data files (all in /data):
 *   sites.geojson       required  heritage sites (points, or shapes that get turned into points)
 *   barangays.geojson   optional  barangay polygons for the "sites per barangay" tool
 *   agusan_river.geojson optional river lines for the "distance to the river" tool
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Settings you may want to edit
   * ------------------------------------------------------------------ */
  var CONFIG = {
    center: [8.9475, 125.5406],          // starting view only (Butuan City)
    zoom: 12,
    sitesUrl: 'data/sites.geojson',
    barangaysUrl: 'data/barangays.geojson',
    riverUrl: 'data/agusan_river.geojson',
    // Property names to try, in order, when reading a barangay's name
    barangayNameFields: ['ADM4_EN', 'NAME_4', 'NAME_3', 'brgy_name', 'BRGY_NAME', 'name']
  };

  var CATEGORIES = {
    archaeological: { label: 'Archaeological sites',            color: '#b7791f' },
    museum:         { label: 'Museums',                         color: '#1f6fb2' },
    religious:      { label: 'Churches and colonial sites',     color: '#7a3e8e' },
    historic:       { label: 'Historic markers and landmarks',  color: '#2e7d5b' },
    other:          { label: 'Other heritage',                  color: '#6b7a80' }
  };

  var PERIODS = ['Pre-colonial', 'Spanish colonial', 'American and WWII', 'Modern'];
  var NO_PERIOD = 'Not specified';

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Allow http(s) links and relative paths (images/site.jpg). Block javascript: and similar.
  function safeUrl(u) {
    if (!u) { return false; }
    return /^https?:\/\//i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u);
  }

  function fmtDist(km) {
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(2) + ' km';
  }

  function median(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function showBanner(text, kind) {
    var b = el('banner');
    b.textContent = text;
    b.className = kind === 'error' ? 'error' : '';
    b.hidden = false;
  }

  function fetchJSON(url, optional) {
    return fetch(url).then(function (r) {
      if (!r.ok) {
        if (optional) { return null; }
        throw new Error(url + ' returned ' + r.status);
      }
      return r.json();
    });
  }

  /* ------------------------------------------------------------------ *
   * Turning raw GeoJSON (for example an Overpass Turbo export) into
   * clean site points with the properties this app expects
   * ------------------------------------------------------------------ */
  function toPoint(f) {
    if (!f || !f.geometry) { return null; }
    if (f.geometry.type === 'Point') { return f; }
    var c = turf.centroid(f);           // shapes become a single point at their centre
    c.properties = f.properties;
    c.id = f.id;
    return c;
  }

  function categoryOf(p) {
    if (p.category && CATEGORIES[p.category]) { return p.category; }
    if (p.historic === 'archaeological_site') { return 'archaeological'; }
    if (p.tourism === 'museum') { return 'museum'; }
    if (p.amenity === 'place_of_worship' || p.building === 'cathedral' || p.building === 'church') { return 'religious'; }
    if (p.historic) { return 'historic'; }
    return 'other';
  }

  function normalize(f) {
    var pt = toPoint(f);
    if (!pt) { return null; }
    var p = pt.properties || {};
    var name = p.name || p['name:en'] || '';
    if (!name) { return null; }

    var osmId = p['@id'] || (typeof f.id === 'string' ? f.id : '');
    var isOsm = /^(node|way|relation)\//.test(osmId);

    pt.properties = {
      name: name,
      category: categoryOf(p),
      period: PERIODS.indexOf(p.period) >= 0 ? p.period : NO_PERIOD,
      description: p.description || '',
      image: p.image || '',
      barangay: p.barangay || p['addr:suburb'] || '',
      source: p.source || (isOsm ? 'OpenStreetMap' : ''),
      sourceUrl: p.source_url || (isOsm ? 'https://www.openstreetmap.org/' + osmId : (p.website || ''))
    };
    return pt;
  }

  function popupHTML(p) {
    var cat = CATEGORIES[p.category];
    var h = '<div class="popup">';
    if (safeUrl(p.image)) {
      h += '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.remove()">';
    }
    h += '<h3>' + esc(p.name) + '</h3>';
    h += '<p class="tags"><span class="tag" style="--c:' + cat.color + '">' + esc(cat.label) + '</span>';
    h += '<span>' + esc(p.period) + '</span></p>';
    if (p.barangay) { h += '<p>Barangay ' + esc(p.barangay) + '</p>'; }
    if (p.description) { h += '<p>' + esc(p.description) + '</p>'; }
    if (p.source) {
      h += '<p class="src">Source: ';
      h += safeUrl(p.sourceUrl)
        ? '<a href="' + esc(p.sourceUrl) + '" target="_blank" rel="noopener">' + esc(p.source) + '</a>'
        : esc(p.source);
      h += '</p>';
    }
    return h + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Map, panes, and base layers
   * ------------------------------------------------------------------ */
  var map = L.map('map').setView(CONFIG.center, CONFIG.zoom);

  // Panes keep the layer order tidy: barangays < zones < river < site markers
  map.createPane('brgy');  map.getPane('brgy').style.zIndex = 340;
  map.createPane('zones'); map.getPane('zones').style.zIndex = 350;
  map.createPane('river'); map.getPane('river').style.zIndex = 360;

  var street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });

  L.control.layers({ 'Street map': street, 'Satellite': satellite }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var allSites = [];                         // every clean site point
  var visible = [];                          // sites matching the current filters
  var markerLayer = L.featureGroup().addTo(map);
  var nearestLayer = L.layerGroup().addTo(map);
  var zonesLayer = L.geoJSON(null, {
    pane: 'zones', interactive: false,
    style: { color: '#b7791f', weight: 1.5, fillColor: '#b7791f', fillOpacity: 0.2 }
  });

  var barangays = null, brgyLayer = null;
  var riverData = null, riverLines = [], riverLayer = null;

  var zonesOn = false, brgyOn = false, riverOn = false, pickMode = false;

  /* ------------------------------------------------------------------ *
   * Filters, markers, and the results list
   * ------------------------------------------------------------------ */
  function buildFilters() {
    var counts = {};
    allSites.forEach(function (f) {
      counts[f.properties.category] = (counts[f.properties.category] || 0) + 1;
    });

    var box = el('cat-filters');
    box.innerHTML = '';
    Object.keys(CATEGORIES).forEach(function (key) {
      if (!counts[key]) { return; }
      var c = CATEGORIES[key];
      var label = document.createElement('label');
      label.className = 'cat';
      label.innerHTML = '<input type="checkbox" value="' + key + '" checked>' +
        '<span class="dot" style="--c:' + c.color + '"></span>' +
        '<span>' + esc(c.label) + ' (' + counts[key] + ')</span>';
      label.querySelector('input').addEventListener('change', applyFilters);
      box.appendChild(label);
    });

    var sel = el('period');
    sel.innerHTML = '';
    [['all', 'All periods']].concat(PERIODS.concat(NO_PERIOD).map(function (p) { return [p, p]; }))
      .forEach(function (pair) {
        var o = document.createElement('option');
        o.value = pair[0];
        o.textContent = pair[1];
        sel.appendChild(o);
      });
  }

  function buildLegend() {
    var used = {};
    allSites.forEach(function (f) { used[f.properties.category] = true; });
    var legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      var d = L.DomUtil.create('div', 'legend');
      var h = '<strong>Site type</strong>';
      Object.keys(CATEGORIES).forEach(function (key) {
        if (used[key]) {
          h += '<div><span class="dot" style="--c:' + CATEGORIES[key].color + '"></span>' + esc(CATEGORIES[key].label) + '</div>';
        }
      });
      d.innerHTML = h;
      L.DomEvent.disableClickPropagation(d);
      return d;
    };
    legend.addTo(map);
  }

  function applyFilters() {
    var q = el('search').value.trim().toLowerCase();
    var period = el('period').value;
    var on = {};
    Array.prototype.forEach.call(el('cat-filters').querySelectorAll('input:checked'), function (i) { on[i.value] = true; });

    visible = allSites.filter(function (f) {
      var p = f.properties;
      if (!on[p.category]) { return false; }
      if (period !== 'all' && p.period !== period) { return false; }
      if (q && (p.name + ' ' + p.barangay + ' ' + p.description).toLowerCase().indexOf(q) < 0) { return false; }
      return true;
    });

    markerLayer.clearLayers();
    visible.forEach(function (f) {
      var p = f.properties, c = CATEGORIES[p.category];
      var m = L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
        radius: 8, color: '#ffffff', weight: 2, fillColor: c.color, fillOpacity: 1
      });
      m.bindPopup(popupHTML(p), { maxWidth: 280 });
      m.bindTooltip(p.name, { direction: 'top', offset: [0, -6] });
      f._m = m;
      markerLayer.addLayer(m);
    });

    el('count').textContent = 'Showing ' + visible.length + ' of ' + allSites.length + ' sites';
    renderResults();

    nearestLayer.clearLayers();
    el('nearest-out').innerHTML = '';
    refreshAnalyses();
  }

  function renderResults() {
    var ul = el('results');
    ul.innerHTML = '';
    visible.slice(0, 50).forEach(function (f) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'result';
      b.innerHTML = '<span class="dot" style="--c:' + CATEGORIES[f.properties.category].color + '"></span>' +
        '<span>' + esc(f.properties.name) + '</span>';
      b.addEventListener('click', function () {
        if (window.matchMedia('(max-width: 820px)').matches) { el('map').scrollIntoView(); }
        map.setView(f._m.getLatLng(), Math.max(map.getZoom(), 16));
        f._m.openPopup();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    if (visible.length > 50) {
      var more = document.createElement('li');
      more.className = 'out';
      more.textContent = 'Showing the first 50. Narrow your search to see the rest.';
      ul.appendChild(more);
    }
  }

  /* ------------------------------------------------------------------ *
   * Analysis 1: nearest site (turf.nearestPoint + turf.distance)
   * ------------------------------------------------------------------ */
  function showNearest(latlng) {
    var out = el('nearest-out');
    nearestLayer.clearLayers();
    if (!visible.length) {
      out.textContent = 'No sites match your filters, so there is nothing to compare.';
      return;
    }
    var here = turf.point([latlng.lng, latlng.lat]);
    // nearestPoint returns a copy of the winning feature; featureIndex points back to the original
    var hit = turf.nearestPoint(here, turf.featureCollection(visible));
    var site = visible[hit.properties.featureIndex];
    var km = turf.distance(here, site, { units: 'kilometers' });
    var to = [site.geometry.coordinates[1], site.geometry.coordinates[0]];

    L.polyline([[latlng.lat, latlng.lng], to], { color: '#17323a', weight: 2, dashArray: '6 6' }).addTo(nearestLayer);
    L.circleMarker(latlng, { radius: 7, color: '#ffffff', weight: 2, fillColor: '#17323a', fillOpacity: 1 }).addTo(nearestLayer);

    map.fitBounds(L.latLngBounds([[latlng.lat, latlng.lng], to]), { padding: [60, 60], maxZoom: 16 });
    site._m.openPopup();
    out.innerHTML = '<strong>' + esc(site.properties.name) + '</strong> is the nearest site, ' + fmtDist(km) + ' away in a straight line.';
  }

  el('btn-locate').addEventListener('click', function () {
    var out = el('nearest-out');
    if (!navigator.geolocation) {
      out.textContent = 'This browser cannot share your location. Use "Pick a point on the map" instead.';
      return;
    }
    out.textContent = 'Finding your location...';
    navigator.geolocation.getCurrentPosition(
      function (pos) { showNearest(L.latLng(pos.coords.latitude, pos.coords.longitude)); },
      function () { out.textContent = 'Location was blocked or unavailable. Allow location access, or use "Pick a point on the map".'; },
      { timeout: 10000 }
    );
  });

  el('btn-pick').addEventListener('click', function () {
    pickMode = !pickMode;
    this.setAttribute('aria-pressed', String(pickMode));
    map.getContainer().classList.toggle('picking', pickMode);
    if (pickMode) {
      if (window.matchMedia('(max-width: 820px)').matches) { el('map').scrollIntoView(); }
      el('nearest-out').textContent = 'Click anywhere on the map.';
    }
  });

  map.on('click', function (e) {
    if (!pickMode) { return; }
    pickMode = false;
    el('btn-pick').setAttribute('aria-pressed', 'false');
    map.getContainer().classList.remove('picking');
    showNearest(e.latlng);
  });

  /* ------------------------------------------------------------------ *
   * Analysis 2: walking zones (turf.buffer + turf.union + pointsWithinPolygon)
   * ------------------------------------------------------------------ */
  function drawZones() {
    var out = el('zones-out');
    zonesLayer.clearLayers();
    if (!visible.length) { out.textContent = 'No sites match your filters.'; return; }

    var meters = +el('buffer-radius').value;
    var merged = null;
    visible.forEach(function (f) {
      var b = turf.buffer(f, meters / 1000, { units: 'kilometers' });
      merged = merged ? (turf.union(merged, b) || merged) : b;
    });
    zonesLayer.addData(merged);

    var polys = merged.geometry.type === 'MultiPolygon'
      ? merged.geometry.coordinates.map(function (c) { return turf.polygon(c); })
      : [merged];
    var fc = turf.featureCollection(visible);
    var counts = polys.map(function (poly) { return turf.pointsWithinPolygon(fc, poly).features.length; });

    var groups = counts.filter(function (n) { return n >= 2; }).length;
    var alone = counts.filter(function (n) { return n === 1; }).length;
    var largest = Math.max.apply(null, counts);
    var area = turf.area(merged) / 1e6;

    out.innerHTML =
      '<strong>' + polys.length + '</strong> walking zone' + (polys.length === 1 ? '' : 's') +
      ' at ' + meters + ' m, covering ' + area.toFixed(2) + ' km&sup2;.<br>' +
      groups + ' zone' + (groups === 1 ? '' : 's') + ' group two or more sites (the largest has ' + largest + '). ' +
      alone + ' site' + (alone === 1 ? ' stands' : 's stand') + ' alone.';
  }

  el('buffer-radius').addEventListener('input', function () {
    el('buffer-label').textContent = this.value + ' m';
    if (zonesOn) { drawZones(); }
  });

  el('btn-zones').addEventListener('click', function () {
    zonesOn = !zonesOn;
    this.setAttribute('aria-pressed', String(zonesOn));
    if (zonesOn) { zonesLayer.addTo(map); drawZones(); }
    else { map.removeLayer(zonesLayer); el('zones-out').innerHTML = ''; }
  });

  /* ------------------------------------------------------------------ *
   * Analysis 3: sites per barangay (turf.pointsWithinPolygon)
   * ------------------------------------------------------------------ */
  function brgyName(props) {
    for (var i = 0; i < CONFIG.barangayNameFields.length; i++) {
      var v = props && props[CONFIG.barangayNameFields[i]];
      if (v) { return v; }
    }
    return 'Unnamed barangay';
  }

  function shade(n, max) {
    if (!n) { return '#eef2f2'; }
    var steps = ['#cfe6e2', '#8fc7bf', '#4da399', '#1f6b66'];
    return steps[Math.min(steps.length - 1, Math.ceil((n / max) * steps.length) - 1)];
  }

  function drawBrgy() {
    var out = el('brgy-out');
    if (brgyLayer) { map.removeLayer(brgyLayer); brgyLayer = null; }

    var fc = turf.featureCollection(visible);
    var max = 0;
    barangays.features.forEach(function (b) {
      b._n = turf.pointsWithinPolygon(fc, b).features.length;
      if (b._n > max) { max = b._n; }
    });

    brgyLayer = L.geoJSON(barangays, {
      pane: 'brgy',
      style: function (b) {
        return { color: '#7a8f92', weight: 1, fillColor: shade(b._n, max), fillOpacity: 0.65 };
      },
      onEachFeature: function (b, layer) {
        layer.bindTooltip(esc(brgyName(b.properties)) + ': ' + b._n + (b._n === 1 ? ' site' : ' sites'), { sticky: true });
      }
    }).addTo(map);

    var ranked = barangays.features.filter(function (b) { return b._n > 0; })
      .sort(function (a, b) { return b._n - a._n; });
    var empty = barangays.features.length - ranked.length;

    var h = '';
    if (!ranked.length) {
      h = 'No barangay contains a site that matches your filters.';
    } else {
      h = 'Barangays with the most sites:<ol>';
      ranked.slice(0, 5).forEach(function (b) {
        h += '<li>' + esc(brgyName(b.properties)) + ' (' + b._n + ')</li>';
      });
      h += '</ol><p>' + empty + ' of ' + barangays.features.length + ' barangays contain none.</p>';
    }
    out.innerHTML = h;
  }

  el('btn-brgy').addEventListener('click', function () {
    brgyOn = !brgyOn;
    this.setAttribute('aria-pressed', String(brgyOn));
    if (brgyOn) { drawBrgy(); }
    else {
      if (brgyLayer) { map.removeLayer(brgyLayer); brgyLayer = null; }
      el('brgy-out').innerHTML = '';
    }
  });

  /* ------------------------------------------------------------------ *
   * Analysis 4: distance to the Agusan River (turf.pointToLineDistance)
   * ------------------------------------------------------------------ */
  function riverStats() {
    var out = el('river-out');
    if (!visible.length) { out.textContent = 'No sites match your filters.'; return; }

    var rows = visible.map(function (f) {
      var best = Infinity;
      riverLines.forEach(function (line) {
        var d = turf.pointToLineDistance(f, line, { units: 'kilometers' });
        if (d < best) { best = d; }
      });
      return { name: f.properties.name, km: best };
    }).sort(function (a, b) { return a.km - b.km; });

    var within = rows.filter(function (r) { return r.km <= 1; }).length;
    var med = median(rows.map(function (r) { return r.km; }));
    var first = rows[0], last = rows[rows.length - 1];

    out.innerHTML =
      '<strong>' + within + ' of ' + rows.length + '</strong> sites are within 1 km of the river.<br>' +
      'Median distance: ' + fmtDist(med) + '.<br>' +
      'Closest: ' + esc(first.name) + ' (' + fmtDist(first.km) + ').<br>' +
      'Farthest: ' + esc(last.name) + ' (' + fmtDist(last.km) + ').';
  }

  el('btn-river').addEventListener('click', function () {
    riverOn = !riverOn;
    this.setAttribute('aria-pressed', String(riverOn));
    if (riverOn) { riverLayer.addTo(map); riverStats(); }
    else { map.removeLayer(riverLayer); el('river-out').innerHTML = ''; }
  });

  function refreshAnalyses() {
    if (zonesOn) { drawZones(); }
    if (brgyOn) { drawBrgy(); }
    if (riverOn) { riverStats(); }
  }

  /* ------------------------------------------------------------------ *
   * Start-up
   * ------------------------------------------------------------------ */
  el('search').addEventListener('input', applyFilters);
  el('period').addEventListener('change', applyFilters);

  Promise.all([
    fetchJSON(CONFIG.sitesUrl, false),
    fetchJSON(CONFIG.barangaysUrl, true).catch(function () { return null; }),
    fetchJSON(CONFIG.riverUrl, true).catch(function () { return null; })
  ]).then(function (res) {
    var raw = res[0];
    if (!raw || !Array.isArray(raw.features)) {
      throw new Error('sites.geojson is not a valid GeoJSON FeatureCollection');
    }

    allSites = raw.features.map(normalize).filter(Boolean);
    var skipped = raw.features.length - allSites.length;

    if (raw.features.length === 0) {
      showBanner('No heritage sites yet. Add features to data/sites.geojson (see README.md for the steps) and reload.');
    } else if (skipped > 0) {
      showBanner(skipped + ' feature' + (skipped === 1 ? ' was' : 's were') + ' skipped because ' + (skipped === 1 ? 'it has' : 'they have') + ' no name.');
    }

    buildFilters();
    buildLegend();
    applyFilters();

    if (allSites.length) {
      map.fitBounds(markerLayer.getBounds().pad(0.15), { maxZoom: 15 });
    }

    // Optional layers: enable their tools only when the data file exists
    if (res[1] && Array.isArray(res[1].features) && res[1].features.length) {
      barangays = res[1];
    } else {
      el('btn-brgy').disabled = true;
      el('brgy-out').textContent = 'Add data/barangays.geojson to turn this tool on.';
    }

    if (res[2] && res[2].features) {
      riverData = res[2];
      riverLines = turf.flatten(riverData).features.filter(function (f) { return f.geometry.type === 'LineString'; });
      riverLayer = L.geoJSON(riverData, { pane: 'river', interactive: false, style: { color: '#2b7a9b', weight: 3, opacity: 0.85 } });
    }
    if (!riverLines.length) {
      el('btn-river').disabled = true;
      el('river-out').textContent = 'Add data/agusan_river.geojson to turn this tool on.';
    }
  }).catch(function (err) {
    showBanner('The map data could not be loaded (' + err.message + '). If you opened index.html by double-clicking it, open the published GitHub Pages link instead. Browsers block data files on file:// addresses.', 'error');
    console.error(err);
  });
})();
