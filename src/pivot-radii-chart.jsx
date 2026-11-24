import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

const HA_BINS = [
  { id: 'h1', label: 'أقل من 10 هكتار', short: '< 10 هـ', min: 0, max: 10, color: '#38BDF8' },
  { id: 'h2', label: '10 – 25 هكتار', short: '10–25 هـ', min: 10, max: 25, color: '#00E5FF' },
  { id: 'h3', label: '25 – 50 هكتار', short: '25–50 هـ', min: 25, max: 50, color: '#2E7D32' },
  { id: 'h4', label: '50 – 80 هكتار', short: '50–80 هـ', min: 50, max: 80, color: '#66BB6A' },
  { id: 'h5', label: 'أكثر من 80 هكتار', short: '80+ هـ', min: 80, max: Infinity, color: '#C9A227' },
];

const CROP_PALETTE = ['#2E7D32', '#C9A227', '#00E5FF', '#66BB6A', '#1E88E5', '#EF6C00', '#8E24AA', '#38BDF8'];

const haFromRadius = (r) => {
  const num = Number(r);
  return Number.isFinite(num) && num > 0 ? (Math.PI * num * num) / 10000 : 0;
};

const fmtHa = (v) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function calcPivotsAreaStats(pivots = [], filters = {}) {
  const list = Array.isArray(pivots) ? pivots : [];
  const minR = Number(filters.minRadius) || 0;
  const maxR = Number(filters.maxRadius) > 0 ? Number(filters.maxRadius) : Infinity;
  const cropFilter = (filters.crop || 'all').trim();

  const items = [];
  for (let idx = 0; idx < list.length; idx += 1) {
    const p = list[idx];
    if (!p) continue;
    const radius = Number(p.radius_m ?? p.radius ?? p.r ?? 0);
    if (!Number.isFinite(radius) || radius <= 0) continue;
    if (radius < minR || radius > maxR) continue;
    const crop = (p.crop || 'غير محدد').trim() || 'غير محدد';
    if (cropFilter && cropFilter !== 'all' && crop !== cropFilter) continue;
    items.push({
      id: p.id ?? idx,
      radius,
      areaHa: haFromRadius(radius),
      farmer: (p.farmer_name || 'غير محدد').trim() || 'غير محدد',
      crop,
    });
  }

  if (!items.length) {
    return {
      count: 0,
      registeredCount: list.length,
      totalHa: 0,
      avgHa: 0,
      minHa: 0,
      maxHa: 0,
      avgRadius: 0,
      minRadius: 0,
      maxRadius: 0,
      items,
    };
  }

  let totalHa = 0;
  let totalRadius = 0;
  let minHa = Infinity;
  let maxHa = 0;
  let minRadius = Infinity;
  let maxRadius = 0;

  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    totalHa += it.areaHa;
    totalRadius += it.radius;
    if (it.areaHa < minHa) minHa = it.areaHa;
    if (it.areaHa > maxHa) maxHa = it.areaHa;
    if (it.radius < minRadius) minRadius = it.radius;
    if (it.radius > maxRadius) maxRadius = it.radius;
  }

  return {
    count: items.length,
    registeredCount: list.length,
    totalHa,
    avgHa: totalHa / items.length,
    minHa,
    maxHa,
    avgRadius: Math.round(totalRadius / items.length),
    minRadius: Math.round(minRadius),
    maxRadius: Math.round(maxRadius),
    items,
  };
}

function CustomTooltip({ active, payload, mode, totalHa }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const shareHa = totalHa > 0 ? ((d.totalHa ?? d.areaHa ?? 0) / totalHa) * 100 : 0;

  return (
    <div
      dir="rtl"
      style={{
        background: '#101c14',
        border: '1px solid #27402d',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#e8efe8',
        fontSize: 12,
        lineHeight: 1.7,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {mode === 'bins' ? (
        <>
          <div style={{ fontWeight: 'bold', color: '#c9a227', marginBottom: 4 }}>{d.label}</div>
          <div>المساحة الإجمالية: <b>{fmtHa(d.totalHa)} هكتار</b> ({shareHa.toFixed(1)}%)</div>
          <div>عدد المحاور: <b>{d.count}</b> ({d.countPct}%)</div>
          <div>متوسط المساحة: <b>{fmtHa(d.avgHa)} هكتار</b></div>
          <div>متوسط نصف القطر: <b>{d.count ? Math.round(d.avgRadius) : 0} م</b></div>
        </>
      ) : mode === 'crops' ? (
        <>
          <div style={{ fontWeight: 'bold', color: '#c9a227', marginBottom: 4 }}>{d.crop}</div>
          <div>إجمالي المساحة: <b>{fmtHa(d.totalHa)} هكتار</b> ({shareHa.toFixed(1)}%)</div>
          <div>عدد المحاور: <b>{d.count}</b></div>
          <div>متوسط مساحة المحور: <b>{fmtHa(d.avgHa)} هكتار</b></div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 'bold', color: '#c9a227', marginBottom: 4 }}>{d.farmer}</div>
          {d.crop ? <div>المحصول: <b>{d.crop}</b></div> : null}
          <div>المساحة: <b>{fmtHa(d.areaHa)} هكتار</b> ({shareHa.toFixed(1)}%)</div>
          <div>نصف القطر: <b>{Math.round(d.radius)} م</b></div>
        </>
      )}
    </div>
  );
}

function PivotRadiiChart({ pivots = [], onCloseDash, onStatsChange }) {
  const [mode, setMode] = useState('bins');
  const [binMetric, setBinMetric] = useState('ha');
  const [cropFilter, setCropFilter] = useState('all');
  const [minRadiusFilter, setMinRadiusFilter] = useState(0);

  const allStats = useMemo(() => calcPivotsAreaStats(pivots), [pivots]);
  const stats = useMemo(
    () => calcPivotsAreaStats(pivots, { crop: cropFilter, minRadius: minRadiusFilter }),
    [pivots, cropFilter, minRadiusFilter]
  );
  const parsed = stats.items;
  const isFiltered = cropFilter !== 'all' || minRadiusFilter > 0;

  const cropOptions = useMemo(() => {
    const counts = {};
    allStats.items.forEach((p) => {
      counts[p.crop] = (counts[p.crop] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allStats.items]);

  useEffect(() => {
    if (cropFilter !== 'all' && !cropOptions.some(([c]) => c === cropFilter)) {
      setCropFilter('all');
    }
  }, [cropOptions, cropFilter]);

  useEffect(() => {
    if (typeof onStatsChange === 'function') {
      onStatsChange({ filtered: stats, total: allStats, isFiltered });
    }
  }, [stats, allStats, isFiltered, onStatsChange]);

  const binData = useMemo(() => {
    const totalCount = parsed.length || 1;
    return HA_BINS.map((b) => {
      const items = parsed.filter((p) =>
        b.max === Infinity ? p.areaHa >= b.min : p.areaHa >= b.min && p.areaHa < b.max
      );
      const count = items.length;
      const totalHa = Number(items.reduce((s, p) => s + p.areaHa, 0).toFixed(2));
      const avgHa = count ? totalHa / count : 0;
      const avgRadius = count ? items.reduce((s, p) => s + p.radius, 0) / count : 0;
      return {
        ...b,
        count,
        countPct: Math.round((count / totalCount) * 100),
        totalHa,
        avgHa,
        avgRadius,
      };
    });
  }, [parsed]);

  const cropData = useMemo(() => {
    const map = {};
    parsed.forEach((p) => {
      const k = p.crop || 'غير محدد';
      if (!map[k]) map[k] = { crop: k, count: 0, totalHa: 0 };
      map[k].count += 1;
      map[k].totalHa += p.areaHa;
    });
    return Object.values(map)
      .sort((a, b) => b.totalHa - a.totalHa)
      .map((c, idx) => ({
        ...c,
        name: c.crop.length > 16 ? c.crop.slice(0, 16) + '…' : c.crop,
        totalHa: Number(c.totalHa.toFixed(2)),
        avgHa: c.count ? c.totalHa / c.count : 0,
        color: CROP_PALETTE[idx % CROP_PALETTE.length],
      }));
  }, [parsed]);

  const individualData = useMemo(() => {
    return [...parsed]
      .sort((a, b) => b.areaHa - a.areaHa)
      .slice(0, 30)
      .map((p, i) => ({
        name: p.farmer.length > 14 ? p.farmer.slice(0, 14) + '…' : p.farmer || `#${i + 1}`,
        farmer: p.farmer,
        crop: p.crop,
        radius: Math.round(p.radius),
        areaHa: Number(p.areaHa.toFixed(2)),
        color: p.areaHa >= 50 ? '#C9A227' : p.areaHa >= 25 ? '#4CAF50' : '#00E5FF',
      }));
  }, [parsed]);

  if (!allStats.count) {
    return (
      <div className="pv-empty">
        <p style={{ margin: '0 0 10px', color: '#a9c4ae', fontSize: 13 }}>
          لا توجد محاور دوّارة مسجّلة حالياً لعرض دراسة المساحات بالهكتار. أضف محوراً من الخريطة أو استخدم الكشف التلقائي.
        </p>
        {onCloseDash ? (
          <button type="button" className="pv-action-btn" onClick={onCloseDash}>
            الانتقال إلى الخريطة
          </button>
        ) : null}
      </div>
    );
  }

  const sliderMax = Math.max(100, Math.ceil(allStats.maxRadius / 50) * 50);

  return (
    <div className="pv-chart-shell">
      <div className="pv-chart-bar">
        <div className="pv-stats-inline">
          <span>
            إجمالي المساحة: <b style={{ color: '#00E5FF' }}>{fmtHa(stats.totalHa)} هكتار</b>
            {isFiltered ? (
              <small style={{ color: '#8fae95', marginRight: 4 }}>
                (من أصل {fmtHa(allStats.totalHa)} هـ)
              </small>
            ) : null}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            المحاور: <b>{stats.count}</b>
            {isFiltered ? ` / ${allStats.count}` : ''}
          </span>
          <span aria-hidden="true">·</span>
          <span>متوسط المساحة: <b>{fmtHa(stats.avgHa)} هكتار</b></span>
          <span aria-hidden="true">·</span>
          <span>النطاق: <b>{fmtHa(stats.minHa)}–{fmtHa(stats.maxHa)} هكتار</b></span>
          <span aria-hidden="true">·</span>
          <span>متوسط نصف القطر: <b>{stats.avgRadius} م</b></span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {mode === 'bins' ? (
            <div className="pv-seg" role="group" aria-label="المقياس">
              <button
                type="button"
                className={binMetric === 'ha' ? 'on' : ''}
                onClick={() => setBinMetric('ha')}
              >
                المساحة (هكتار)
              </button>
              <button
                type="button"
                className={binMetric === 'count' ? 'on' : ''}
                onClick={() => setBinMetric('count')}
              >
                عدد المحاور
              </button>
            </div>
          ) : null}

          <div className="pv-seg" role="tablist" aria-label="طريقة تحليل المحاور">
            <button
              type="button"
              className={mode === 'bins' ? 'on' : ''}
              onClick={() => setMode('bins')}
            >
              فئات المساحة (هـ)
            </button>
            <button
              type="button"
              className={mode === 'crops' ? 'on' : ''}
              onClick={() => setMode('crops')}
            >
              حسب المحصول (هـ)
            </button>
            <button
              type="button"
              className={mode === 'items' ? 'on' : ''}
              onClick={() => setMode('items')}
            >
              كل محور ({individualData.length})
            </button>
          </div>
        </div>
      </div>

      <div className="pv-filter-bar">
        <label className="pv-filter-item">
          <span>🌾 المحصول:</span>
          <select
            className="pv-select"
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
          >
            <option value="all">جميع المحاصيل ({allStats.count})</option>
            {cropOptions.map(([crop, cnt]) => (
              <option key={crop} value={crop}>
                {crop} ({cnt})
              </option>
            ))}
          </select>
        </label>

        <label className="pv-filter-item pv-range-wrap">
          <span>📐 نصف القطر ≥ <b>{minRadiusFilter} م</b></span>
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={10}
            value={Math.min(minRadiusFilter, sliderMax)}
            onChange={(e) => setMinRadiusFilter(Number(e.target.value) || 0)}
          />
        </label>

        {isFiltered ? (
          <button
            type="button"
            className="pv-reset-btn"
            onClick={() => {
              setCropFilter('all');
              setMinRadiusFilter(0);
            }}
          >
            ↺ عرض الكل
          </button>
        ) : null}
      </div>

      {!parsed.length ? (
        <div className="pv-empty" style={{ padding: '18px 12px' }}>
          <p style={{ margin: 0, color: '#a9c4ae', fontSize: 13 }}>
            لا توجد محاور تطابق شروط التصفية الحالية (نصف القطر ≥ {minRadiusFilter} م).
          </p>
        </div>
      ) : (
        <div dir="ltr" style={{ width: '100%', height: 275 }}>
          <ResponsiveContainer width="100%" height="100%">
          {mode === 'bins' ? (
            <BarChart data={binData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243a2a" vertical={false} />
              <XAxis
                dataKey="short"
                tick={{ fill: '#bcd5c0', fontSize: 12 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={binMetric === 'ha'}
                tick={{ fill: '#bcd5c0', fontSize: 12 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
                width={52}
                unit={binMetric === 'ha' ? ' هـ' : ''}
              />
              <Tooltip
                cursor={{ fill: 'rgba(201, 162, 39, 0.08)' }}
                content={<CustomTooltip mode="bins" totalHa={stats.totalHa} />}
              />
              <Bar
                dataKey={binMetric === 'ha' ? 'totalHa' : 'count'}
                name={binMetric === 'ha' ? 'المساحة (هكتار)' : 'عدد المحاور'}
                radius={[6, 6, 0, 0]}
                maxBarSize={58}
              >
                {binData.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          ) : mode === 'crops' ? (
            <BarChart data={cropData} margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243a2a" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#bcd5c0', fontSize: 11 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
                interval={0}
                angle={cropData.length > 6 ? -20 : 0}
                textAnchor={cropData.length > 6 ? 'end' : 'middle'}
              />
              <YAxis
                tick={{ fill: '#bcd5c0', fontSize: 12 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
                width={52}
                unit=" هـ"
              />
              <Tooltip
                cursor={{ fill: 'rgba(76, 175, 80, 0.08)' }}
                content={<CustomTooltip mode="crops" totalHa={stats.totalHa} />}
              />
              <Bar dataKey="totalHa" name="المساحة (هكتار)" radius={[6, 6, 0, 0]} maxBarSize={54}>
                {cropData.map((entry, idx) => (
                  <Cell key={`${entry.crop}-${idx}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={individualData} margin={{ top: 12, right: 16, left: 4, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243a2a" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#bcd5c0', fontSize: 11 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
                interval={0}
                angle={individualData.length > 8 ? -25 : 0}
                textAnchor={individualData.length > 8 ? 'end' : 'middle'}
              />
              <YAxis
                tick={{ fill: '#bcd5c0', fontSize: 12 }}
                axisLine={{ stroke: '#27402d' }}
                tickLine={false}
                width={52}
                unit=" هـ"
              />
              <Tooltip
                cursor={{ fill: 'rgba(0, 229, 255, 0.08)' }}
                content={<CustomTooltip mode="items" totalHa={stats.totalHa} />}
              />
              <Bar dataKey="areaHa" name="المساحة (هكتار)" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {individualData.map((entry, idx) => (
                  <Cell key={`${entry.farmer}-${idx}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

let activeRoot = null;
let activeContainer = null;

window.calcPivotsAreaStats = calcPivotsAreaStats;

window.renderPivotRadiiChart = function renderPivotRadiiChart(container, pivots, options = {}) {
  if (!container) return;
  if (activeRoot && activeContainer !== container) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (!activeRoot) {
    activeRoot = createRoot(container);
    activeContainer = container;
  }
  activeRoot.render(
    <PivotRadiiChart
      pivots={pivots}
      onCloseDash={options.onCloseDash}
      onStatsChange={options.onStatsChange}
    />
  );
};

window.unmountPivotRadiiChart = function unmountPivotRadiiChart() {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
    activeContainer = null;
  }
};
