const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function ringAreaHa(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return 0;
  const refLat = coords[0][0];
  const mLat = 111320;
  const mLng = Math.max(1000, 111320 * Math.cos((refLat * Math.PI) / 180));
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const [la1, ln1] = coords[i];
    const [la2, ln2] = coords[(i + 1) % coords.length];
    area += ln1 * mLng * (la2 * mLat) - ln2 * mLng * (la1 * mLat);
  }
  return Math.abs(area) / 2 / 10000;
}

const AMENITY_GROUPS = [
  { key: 'hospital', label: '🏥 مرفق صحي / مستشفى', cat: 'health' },
  { key: 'clinic', label: '🩺 عيادة', cat: 'health' },
  { key: 'fuel', label: '⛽ محطة وقود', cat: 'fuel' },
  { key: 'school', label: '🏫 مؤسسة تعليمية', cat: 'edu' },
  { key: 'mosque', label: '🕌 مسجد', cat: 'civic' },
  { key: 'police', label: '🛡️ أمن / درك', cat: 'security' },
  { key: 'townhall', label: '🏛️ بلدية / إدارة', cat: 'admin' },
  { key: 'marketplace', label: '🛒 سوق', cat: 'market' },
];

const UA = 'CCLS-Adrar-GIS/1.0 (contact: gis@ccls-adrar.dz)';

app.get('/api/gis/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Math.max(1, Math.min(25, Number(req.query.radiusKm) || 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid lat/lng coordinates' });
  }

  const radiusM = Math.round(radiusKm * 1000);
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / Math.max(20, 111.32 * Math.cos((lat * Math.PI) / 180));
  const viewbox = `${(lng - dLng).toFixed(4)},${(lat + dLat).toFixed(4)},${(lng + dLng).toFixed(4)},${(lat - dLat).toFixed(4)}`;

  const qOverpass = `[out:json][timeout:6];(way["highway"~"trunk|primary|secondary|tertiary|unclassified|track|residential"](around:${Math.min(radiusM, 6000)},${lat},${lng});nwr["amenity"~"hospital|clinic|fuel|school|place_of_worship|police|townhall|marketplace"](around:${radiusM},${lat},${lng});way["landuse"~"farmland|farmyard|industrial|commercial"](around:${radiusM},${lat},${lng});way["building"](around:${Math.min(radiusM, 1200)},${lat},${lng}););out geom 180;`;

  const overpassPromise = fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    signal: AbortSignal.timeout(5500),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(qOverpass),
  })
    .then(async (r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const reversePromise = fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=ar`,
    { signal: AbortSignal.timeout(4500), headers: { 'User-Agent': UA } }
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const nominatimPromises = AMENITY_GROUPS.map((g) =>
    fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&amenity=${g.key}&viewbox=${viewbox}&bounded=1&limit=6&accept-language=ar`,
      { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': UA } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => (Array.isArray(arr) ? arr.map((item) => ({ ...item, _group: g })) : []))
      .catch(() => [])
  );

  const osrmNearestPromise = fetch(
    `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=12`,
    { signal: AbortSignal.timeout(4500) }
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const [ovData, revData, osrmNear, ...nomChunks] = await Promise.all([
    overpassPromise,
    reversePromise,
    osrmNearestPromise,
    ...nominatimPromises,
  ]);

  const roads = [];
  const roadSeen = new Set();
  const facilities = [];
  const facSeen = new Set();
  const osmParcels = [];

  if (ovData && Array.isArray(ovData.elements)) {
    for (const el of ovData.elements) {
      const tags = el.tags || {};
      if (el.type === 'way' && tags.highway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        const coords = el.geometry.map((pt) => [pt.lat, pt.lon]);
        const mid = coords[Math.floor(coords.length / 2)];
        const dKm = haversineKm(lat, lng, mid[0], mid[1]);
        const name = tags.ref || tags.name || tags['name:ar'] || tags.highway;
        const paved = !['track', 'path', 'footway', 'bridleway'].includes(tags.highway) && tags.surface !== 'sand' && tags.surface !== 'unpaved';
        roads.push({
          id: `ov_w_${el.id}`,
          name,
          highway: tags.highway,
          paved,
          distKm: dKm,
          lat: mid[0],
          lng: mid[1],
          coords,
        });
      } else if ((tags.landuse || tags.building) && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        const coords = el.geometry.map((pt) => [pt.lat, pt.lon]);
        const areaHa = ringAreaHa(coords);
        const kind = tags.building === 'warehouse' ? 'warehouse' : (tags.building ? 'building' : tags.landuse);
        const label = tags['name:ar'] || tags.name || (kind === 'warehouse' ? 'مخزن (OSM)' : kind === 'building' ? 'مبنى (OSM)' : tags.landuse === 'industrial' ? 'منطقة صناعية / لوجستية' : 'قطعة فلاحية (OSM)');
        osmParcels.push({
          id: `osm_p_${el.id}`,
          name: label,
          kind,
          areaHa,
          geojson: {
            type: 'Feature',
            properties: { name: label, kind, source: 'OSM', areaHa },
            geometry: { type: 'Polygon', coordinates: [el.geometry.map((pt) => [pt.lon, pt.lat])] },
          },
        });
      } else if (tags.amenity) {
        const ptLat = el.lat != null ? el.lat : el.geometry && el.geometry[0] && el.geometry[0].lat;
        const ptLng = el.lon != null ? el.lon : el.geometry && el.geometry[0] && el.geometry[0].lon;
        if (!Number.isFinite(ptLat) || !Number.isFinite(ptLng)) continue;
        const grp = AMENITY_GROUPS.find((g) => g.key === tags.amenity) || (tags.amenity === 'place_of_worship' ? { key: 'mosque', label: '🕌 مسجد', cat: 'civic' } : { key: tags.amenity, label: '📍 مرفق عام', cat: 'civic' });
        const name = tags['name:ar'] || tags.name || grp.label;
        const fKey = `${name}_${ptLat.toFixed(4)}_${ptLng.toFixed(4)}`;
        if (facSeen.has(fKey)) continue;
        facSeen.add(fKey);
        facilities.push({
          id: `ov_f_${el.id}`,
          name,
          category: grp.cat,
          categoryLabel: grp.label,
          lat: ptLat,
          lng: ptLng,
          directKm: haversineKm(lat, lng, ptLat, ptLng),
        });
      }
    }
  }

  for (const item of nomChunks.flat()) {
    const fLat = Number(item.lat);
    const fLng = Number(item.lon);
    if (!Number.isFinite(fLat) || !Number.isFinite(fLng)) continue;
    const dKm = haversineKm(lat, lng, fLat, fLng);
    if (dKm > radiusKm * 1.35) continue;
    const grp = item._group;
    const name = item.name || (item.display_name ? item.display_name.split(',')[0] : grp.label);
    const fKey = `${name}_${fLat.toFixed(4)}_${fLng.toFixed(4)}`;
    if (facSeen.has(fKey)) continue;
    facSeen.add(fKey);
    facilities.push({
      id: `nom_${item.osm_id || fKey}`,
      name,
      category: grp.cat,
      categoryLabel: grp.label,
      lat: fLat,
      lng: fLng,
      directKm: dKm,
    });
  }

  if (osrmNear && Array.isArray(osrmNear.waypoints)) {
    osrmNear.waypoints.forEach((wp, idx) => {
      if (!Array.isArray(wp.location)) return;
      const wLng = wp.location[0];
      const wLat = wp.location[1];
      const name = wp.name && wp.name.trim() ? wp.name.trim() : `نقطة وصول طريق #${idx + 1}`;
      const rKey = `${name}_${wLat.toFixed(4)}_${wLng.toFixed(4)}`;
      if (roadSeen.has(rKey)) return;
      roadSeen.add(rKey);
      const dKm = (Number(wp.distance) || 0) / 1000 || haversineKm(lat, lng, wLat, wLng);
      roads.push({
        id: `osrm_r_${idx}`,
        name,
        highway: wp.name ? 'road' : 'track',
        paved: !!wp.name,
        distKm: dKm,
        lat: wLat,
        lng: wLng,
        coords: null,
      });
    });
  }

  roads.sort((a, b) => a.distKm - b.distKm);
  facilities.sort((a, b) => a.directKm - b.directKm);
  const topFacilities = facilities.slice(0, 20);

  let osrmTableOk = false;
  if (topFacilities.length) {
    try {
      const coordStr = `${lng},${lat};` + topFacilities.map((f) => `${f.lng},${f.lat}`).join(';');
      const tbl = await fetch(
        `https://router.project-osrm.org/table/v1/driving/${coordStr}?sources=0&annotations=distance,duration`,
        { signal: AbortSignal.timeout(4500) }
      ).then((r) => (r.ok ? r.json() : null));
      if (tbl && tbl.code === 'Ok' && tbl.distances && tbl.distances[0] && tbl.durations && tbl.durations[0]) {
        osrmTableOk = true;
        topFacilities.forEach((f, i) => {
          const distM = tbl.distances[0][i + 1];
          const durS = tbl.durations[0][i + 1];
          if (Number.isFinite(distM)) f.roadKm = distM / 1000;
          if (Number.isFinite(durS)) f.durMin = Math.max(1, Math.round(durS / 60));
        });
      }
    } catch (_) {}
  }

  res.json({
    center: {
      lat,
      lng,
      placeName: revData && revData.display_name ? revData.display_name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    },
    radiusKm,
    roads: roads.slice(0, 45),
    facilities: topFacilities,
    osmParcels: osmParcels.slice(0, 120),
    sources: {
      overpassOk: !!(ovData && Array.isArray(ovData.elements)),
      nominatimOk: !!(revData || nomChunks.some((c) => c.length > 0)),
      osrmOk: !!(osrmNear && osrmNear.code === 'Ok') || osrmTableOk,
    },
  });
});

app.use(express.static(__dirname, {
  index: 'index.html',
}));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CCLS Maps server listening on http://0.0.0.0:${PORT}`);
});
