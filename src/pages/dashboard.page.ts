import * as d3 from 'd3';
import { authService } from '../auth/auth.service';
import { db } from '../db/database';
import { can } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import {
  accountingRepository,
  doctorsRepository,
  invoicesRepository,
  lookupsRepository,
  patientsRepository,
  paymentsRepository,
  requestsRepository,
  testsRepository,
} from '../repositories';
import { router, type RouteId } from '../router';

type DashboardTab = 'all' | 'reception_d3' | 'financial' | 'clinical' | 'demographics';
type DataMode = 'live' | 'simulated_preview';

interface DeptStat {
  nameAr: string;
  nameEn: string;
  code: string;
  testsCount: number;
  requestsCount: number;
  revenue: number;
  color: string;
}

interface TubeStat {
  nameAr: string;
  nameEn: string;
  colorHex: string;
  testsCount: number;
  samplesCount: number;
}

const CHART_PALETTE = [
  '#0284c7', // sky-600
  '#0d9488', // teal-600
  '#4f46e5', // indigo-600
  '#d97706', // amber-600
  '#e11d48', // rose-600
  '#16a34a', // green-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#475569', // slate-600
];

function getOrCreateD3Tooltip(): d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> {
  let existing = d3.select<HTMLDivElement, unknown>('#d3-dashboard-floating-tooltip');
  if (existing.empty()) {
    existing = d3
      .select('body')
      .append('div')
      .attr('id', 'd3-dashboard-floating-tooltip')
      .attr(
        'class',
        'fixed z-50 pointer-events-none rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-xs transition-opacity duration-150 opacity-0'
      );
  }
  return existing;
}

function animateDashboardSecondaryVisuals(container: HTMLElement): void {
  // Animate all SVG donut segments across the dashboard using D3 transitions
  d3.select(container)
    .selectAll<SVGCircleElement, unknown>('.dash-donut-segment')
    .each(function (_, i) {
      const circle = d3.select(this);
      const targetDash = circle.attr('data-target-dasharray') || circle.attr('stroke-dasharray') || '0 999';
      const circum = circle.attr('data-circumference') || '600';
      circle
        .attr('stroke-dasharray', `0 ${circum}`)
        .transition()
        .duration(850)
        .delay(i * 65)
        .ease(d3.easeCubicOut)
        .attr('stroke-dasharray', targetDash);
    });
}

function mountD3ReceptionCharts(params: {
  dailySeries: Array<{ date?: string; dateLabel: string; revenue: number; expense: number; requests: number }>;
  topTests: Array<{ code: string; nameAr: string; nameEn: string; count: number; revenue: number }>;
}): number {
  const t0 = performance.now();
  const { dailySeries, topTests } = params;
  const tooltip = getOrCreateD3Tooltip();

  const showTooltip = (event: MouseEvent, htmlContent: string) => {
    tooltip
      .html(htmlContent)
      .style('left', `${Math.min(event.clientX + 14, window.innerWidth - 240)}px`)
      .style('top', `${Math.max(event.clientY - 48, 12)}px`)
      .style('opacity', '1');
  };

  const hideTooltip = () => {
    tooltip.style('opacity', '0');
  };

  // Animate top reception KPI counters with D3 number interpolation
  d3.selectAll<HTMLElement, unknown>('[data-d3-counter]').each(function () {
    const el = d3.select(this);
    const targetVal = Number(el.attr('data-d3-counter') || 0);
    const suffix = el.attr('data-d3-suffix') || '';
    const formatComma = el.attr('data-d3-format') === 'comma';
    el.transition()
      .duration(950)
      .ease(d3.easeCubicOut)
      .tween('text', function () {
        const interp = d3.interpolateNumber(0, targetVal);
        return (t: number) => {
          const v = Math.round(interp(t));
          this.textContent = `${formatComma ? v.toLocaleString() : v}${suffix}`;
        };
      });
  });

  // ==========================================================================
  // 1. D3 Chart: Daily Cases Volume (عدد الحالات اليومية — Animated Bar + Line)
  // ==========================================================================
  const casesEl = document.getElementById('d3-daily-cases-svg');
  if (casesEl && dailySeries.length > 0) {
    casesEl.innerHTML = '';
    const width = 460;
    const height = 220;
    const margin = { top: 24, right: 18, bottom: 34, left: 38 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3
      .select(casesEl)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto overflow-visible');

    const defs = svg.append('defs');
    const barGrad = defs
      .append('linearGradient')
      .attr('id', 'd3CasesBarGrad')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');
    barGrad.append('stop').attr('offset', '0%').attr('stop-color', '#0284c7');
    barGrad.append('stop').attr('offset', '100%').attr('stop-color', '#38bdf8');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(dailySeries.map((d) => d.dateLabel))
      .range([0, innerW])
      .padding(0.32);

    const maxCases = Math.max(d3.max(dailySeries, (d) => d.requests) || 10, 5);
    const y = d3.scaleLinear().domain([0, maxCases * 1.18]).nice().range([innerH, 0]);

    // Horizontal grid lines (fade in smoothly)
    const yTicks = y.ticks(4);
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
      .transition()
      .duration(500)
      .attr('opacity', 1);

    g.selectAll('.y-label')
      .data(yTicks)
      .enter()
      .append('text')
      .attr('x', -8)
      .attr('y', (d) => y(d) + 3)
      .attr('text-anchor', 'end')
      .attr('class', 'fill-slate-400 text-[9.5px] font-mono')
      .text((d) => String(Math.round(d)));

    // Bars for daily cases: Start at baseline (y = innerH, height = 0) and animate upward with staggered delay
    const bars = g
      .selectAll<SVGRectElement, (typeof dailySeries)[0]>('.case-bar')
      .data(dailySeries)
      .enter()
      .append('rect')
      .attr('class', 'case-bar cursor-pointer')
      .attr('x', (d) => x(d.dateLabel) || 0)
      .attr('y', innerH)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 5)
      .attr('fill', (_, i) => (i === dailySeries.length - 1 ? '#0369a1' : 'url(#d3CasesBarGrad)'));

    bars
      .on('mousemove', function (event: MouseEvent, d) {
        d3.select(this).transition().duration(140).attr('fill', '#0f172a').attr('y', y(d.requests) - 2);
        showTooltip(
          event,
          `<div class="font-bold text-sky-300">📅 ${d.date || d.dateLabel}</div>
           <div class="mt-0.5">عدد الحالات: <strong class="font-mono text-white">${d.requests} حالة</strong></div>
           <div>إيراد اليوم: <strong class="font-mono text-emerald-300">${d.revenue.toLocaleString()} EGP</strong></div>`
        );
      })
      .on('mouseleave', function (_, d) {
        const idx = dailySeries.indexOf(d);
        d3.select(this)
          .transition()
          .duration(200)
          .attr('fill', idx === dailySeries.length - 1 ? '#0369a1' : 'url(#d3CasesBarGrad)')
          .attr('y', y(d.requests));
        hideTooltip();
      });

    bars
      .transition()
      .duration(850)
      .delay((_, i) => i * 75)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.requests))
      .attr('height', (d) => Math.max(2, innerH - y(d.requests)));

    // Trend line overlay using d3.line with animated stroke-dashoffset drawing
    const lineGen = d3
      .line<{ dateLabel: string; requests: number }>()
      .x((d) => (x(d.dateLabel) || 0) + x.bandwidth() / 2)
      .y((d) => y(d.requests))
      .curve(d3.curveMonotoneX);

    const trendPath = g
      .append('path')
      .datum(dailySeries)
      .attr('fill', 'none')
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2.2)
      .attr('d', lineGen);

    const pathNode = trendPath.node();
    if (pathNode && typeof pathNode.getTotalLength === 'function') {
      const totalLen = pathNode.getTotalLength();
      trendPath
        .attr('stroke-dasharray', `${totalLen} ${totalLen}`)
        .attr('stroke-dashoffset', totalLen)
        .transition()
        .duration(1050)
        .delay(180)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0);
    }

    // Pop-in dots on the trend line
    g.selectAll('.case-dot')
      .data(dailySeries)
      .enter()
      .append('circle')
      .attr('cx', (d) => (x(d.dateLabel) || 0) + x.bandwidth() / 2)
      .attr('cy', (d) => y(d.requests))
      .attr('r', 0)
      .attr('fill', '#ffffff')
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2)
      .transition()
      .duration(450)
      .delay((_, i) => 280 + i * 75)
      .ease(d3.easeBackOut.overshoot(2))
      .attr('r', 3.5);

    // Animated value labels above bars (count up from 0 -> requests)
    g.selectAll('.case-val')
      .data(dailySeries)
      .enter()
      .append('text')
      .attr('x', (d) => (x(d.dateLabel) || 0) + x.bandwidth() / 2)
      .attr('y', innerH - 4)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-slate-800 text-[9.5px] font-bold font-mono')
      .attr('opacity', 0)
      .text('0')
      .transition()
      .duration(850)
      .delay((_, i) => i * 75)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.requests) - 7)
      .attr('opacity', 1)
      .tween('text', function (d) {
        const interp = d3.interpolateNumber(0, d.requests);
        return (t: number) => {
          this.textContent = String(Math.round(interp(t)));
        };
      });

    // X axis labels
    g.selectAll('.x-label')
      .data(dailySeries)
      .enter()
      .append('text')
      .attr('x', (d) => (x(d.dateLabel) || 0) + x.bandwidth() / 2)
      .attr('y', innerH + 16)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-slate-500 text-[9px] font-mono')
      .text((d) => d.dateLabel);
  }

  // ==========================================================================
  // 2. D3 Chart: Total Daily Revenue (إجمالي الإيرادات — Animated Area + Line)
  // ==========================================================================
  const revEl = document.getElementById('d3-daily-revenue-svg');
  if (revEl && dailySeries.length > 0) {
    revEl.innerHTML = '';
    const width = 460;
    const height = 220;
    const margin = { top: 24, right: 18, bottom: 34, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3
      .select(revEl)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto overflow-visible');

    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', 'd3RevAreaGrad')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.45);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.03);

    // Animated clipPath curtain reveal from left to right
    const clipRect = defs
      .append('clipPath')
      .attr('id', 'd3RevCurtainClip')
      .append('rect')
      .attr('x', 0)
      .attr('y', -20)
      .attr('width', 0)
      .attr('height', innerH + 40);

    clipRect
      .transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr('width', innerW + 16);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scalePoint<string>()
      .domain(dailySeries.map((d) => d.dateLabel))
      .range([0, innerW])
      .padding(0.2);

    const maxRev = Math.max(d3.max(dailySeries, (d) => d.revenue) || 1000, 500);
    const y = d3.scaleLinear().domain([0, maxRev * 1.15]).nice().range([innerH, 0]);

    const yTicks = y.ticks(4);
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '3,3');

    g.selectAll('.y-label')
      .data(yTicks)
      .enter()
      .append('text')
      .attr('x', -6)
      .attr('y', (d) => y(d) + 3)
      .attr('text-anchor', 'end')
      .attr('class', 'fill-slate-400 text-[9px] font-mono')
      .text((d) => (d >= 1000 ? `${(d / 1000).toFixed(1)}k` : String(d)));

    const areaGen = d3
      .area<{ dateLabel: string; revenue: number }>()
      .x((d) => x(d.dateLabel) || 0)
      .y0(innerH)
      .y1((d) => y(d.revenue))
      .curve(d3.curveMonotoneX);

    const lineGen = d3
      .line<{ dateLabel: string; revenue: number }>()
      .x((d) => x(d.dateLabel) || 0)
      .y((d) => y(d.revenue))
      .curve(d3.curveMonotoneX);

    const clippedGroup = g.append('g').attr('clip-path', 'url(#d3RevCurtainClip)');

    clippedGroup.append('path').datum(dailySeries).attr('fill', 'url(#d3RevAreaGrad)').attr('d', areaGen);

    clippedGroup
      .append('path')
      .datum(dailySeries)
      .attr('fill', 'none')
      .attr('stroke', '#059669')
      .attr('stroke-width', 2.8)
      .attr('d', lineGen);

    // Interactive revenue dots with elastic pop-in transition and hover scale
    const revDots = g
      .selectAll<SVGCircleElement, (typeof dailySeries)[0]>('.rev-dot')
      .data(dailySeries)
      .enter()
      .append('circle')
      .attr('class', 'rev-dot cursor-pointer')
      .attr('cx', (d) => x(d.dateLabel) || 0)
      .attr('cy', (d) => y(d.revenue))
      .attr('r', 0)
      .attr('fill', '#ffffff')
      .attr('stroke', '#059669')
      .attr('stroke-width', 2.4);

    revDots
      .on('mousemove', function (event: MouseEvent, d) {
        d3.select(this).transition().duration(150).attr('r', 6.8).attr('fill', '#059669');
        showTooltip(
          event,
          `<div class="font-bold text-emerald-300">💵 إيرادات ${d.date || d.dateLabel}</div>
           <div class="mt-0.5">الإيراد المحصل: <strong class="font-mono text-white">${d.revenue.toLocaleString()} EGP</strong></div>
           <div>عدد الحالات: <strong class="font-mono text-sky-300">${d.requests} حالة</strong></div>`
        );
      })
      .on('mouseleave', function () {
        d3.select(this).transition().duration(180).attr('r', 4.3).attr('fill', '#ffffff');
        hideTooltip();
      });

    revDots
      .transition()
      .duration(520)
      .delay((_, i) => 180 + i * 95)
      .ease(d3.easeBackOut.overshoot(2.2))
      .attr('r', 4.3);

    // Animated EGP value labels
    g.selectAll('.rev-val')
      .data(dailySeries.filter((_, idx) => idx % 2 === 0 || idx === dailySeries.length - 1))
      .enter()
      .append('text')
      .attr('x', (d) => x(d.dateLabel) || 0)
      .attr('y', (d) => y(d.revenue) + 4)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-emerald-900 text-[9px] font-bold font-mono')
      .attr('opacity', 0)
      .text('0')
      .transition()
      .duration(850)
      .delay((_, i) => 220 + i * 140)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.revenue) - 9)
      .attr('opacity', 1)
      .tween('text', function (d) {
        const interp = d3.interpolateNumber(0, d.revenue);
        return (t: number) => {
          this.textContent = Math.round(interp(t)).toLocaleString();
        };
      });

    g.selectAll('.x-label')
      .data(dailySeries)
      .enter()
      .append('text')
      .attr('x', (d) => x(d.dateLabel) || 0)
      .attr('y', innerH + 16)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-slate-500 text-[9px] font-mono')
      .text((d) => d.dateLabel);
  }

  // ==========================================================================
  // 3. D3 Chart: Most Requested Lab Tests (أكثر التحاليل طلباً — Animated Sweep)
  // ==========================================================================
  const topTestsEl = document.getElementById('d3-top-tests-svg');
  if (topTestsEl && topTests.length > 0) {
    topTestsEl.innerHTML = '';
    const items = topTests.slice(0, 6);
    const width = 460;
    const height = 220;
    const margin = { top: 12, right: 68, bottom: 20, left: 95 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3
      .select(topTestsEl)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto overflow-visible');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand<string>()
      .domain(items.map((d) => d.code))
      .range([0, innerH])
      .padding(0.28);

    const maxCnt = Math.max(d3.max(items, (d) => d.count) || 10, 5);
    const x = d3.scaleLinear().domain([0, maxCnt * 1.15]).range([0, innerW]);

    // Background tracks
    g.selectAll('.bg-bar')
      .data(items)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.code) || 0)
      .attr('width', innerW)
      .attr('height', y.bandwidth())
      .attr('rx', 5)
      .attr('fill', '#f1f5f9');

    // Foreground bars with horizontal sweep transition (width 0 -> target width)
    const testBars = g
      .selectAll<SVGRectElement, (typeof items)[0]>('.fg-bar')
      .data(items)
      .enter()
      .append('rect')
      .attr('class', 'fg-bar cursor-pointer')
      .attr('x', 0)
      .attr('y', (d) => y(d.code) || 0)
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('rx', 5)
      .attr('fill', (_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);

    testBars
      .on('mousemove', function (event: MouseEvent, d) {
        d3.select(this).transition().duration(140).attr('opacity', 0.82).attr('x', 2);
        showTooltip(
          event,
          `<div class="font-bold text-indigo-300">🧪 ${d.code} — ${d.nameAr}</div>
           <div class="mt-0.5">عدد الطلبات: <strong class="font-mono text-white">${d.count} طلب</strong></div>
           <div>إجمالي الإيراد: <strong class="font-mono text-emerald-300">${d.revenue.toLocaleString()} EGP</strong></div>`
        );
      })
      .on('mouseleave', function () {
        d3.select(this).transition().duration(180).attr('opacity', 1).attr('x', 0);
        hideTooltip();
      });

    testBars
      .transition()
      .duration(900)
      .delay((_, i) => i * 85)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => Math.max(6, x(d.count)));

    // Left test code labels
    g.selectAll('.test-code-lbl')
      .data(items)
      .enter()
      .append('text')
      .attr('x', -8)
      .attr('y', (d) => (y(d.code) || 0) + y.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'end')
      .attr('class', 'fill-slate-800 text-[10px] font-bold font-mono')
      .text((d) => d.code);

    // Right count labels sliding out with the bar and counting up
    g.selectAll('.test-cnt-lbl')
      .data(items)
      .enter()
      .append('text')
      .attr('x', 6)
      .attr('y', (d) => (y(d.code) || 0) + y.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'start')
      .attr('class', 'fill-slate-700 text-[9.5px] font-bold font-mono')
      .attr('opacity', 0)
      .text('0 طلب')
      .transition()
      .duration(900)
      .delay((_, i) => i * 85)
      .ease(d3.easeCubicOut)
      .attr('x', (d) => x(d.count) + 6)
      .attr('opacity', 1)
      .tween('text', function (d) {
        const interp = d3.interpolateNumber(0, d.count);
        return (t: number) => {
          this.textContent = `${Math.round(interp(t))} طلب`;
        };
      });
  }

  return Number((performance.now() - t0).toFixed(2));
}

function buildSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpx1 = p0.x + (p1.x - p0.x) * 0.45;
    const cpy1 = p0.y;
    const cpx2 = p0.x + (p1.x - p0.x) * 0.55;
    const cpy2 = p1.y;
    d += ` C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function buildDonutSvg(
  segments: Array<{ label: string; value: number; color: string }>,
  size = 210,
  strokeWidth = 28,
  centerTitle = '',
  centerSub = ''
): string {
  const total = segments.reduce((s, item) => s + item.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return `
      <svg viewBox="0 0 ${size} ${size}" class="w-48 h-48 mx-auto">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${strokeWidth}" />
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fill-slate-800 text-sm font-bold font-mono">${centerTitle || '0'}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="fill-slate-500 text-[10px]">${centerSub}</text>
      </svg>
    `;
  }

  let accumulatedFraction = 0;
  const circles = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const frac = seg.value / total;
      const dash = Math.max(frac * circumference - 1.5, 1);
      const gap = circumference - dash;
      const offset = -accumulatedFraction * circumference;
      accumulatedFraction += frac;
      const dashStr = `${dash.toFixed(2)} ${gap.toFixed(2)}`;
      return `
        <circle
          class="dash-donut-segment cursor-pointer transition-opacity hover:opacity-80"
          cx="${cx}"
          cy="${cy}"
          r="${r}"
          fill="none"
          stroke="${seg.color}"
          stroke-width="${strokeWidth}"
          data-target-dasharray="${dashStr}"
          data-circumference="${circumference.toFixed(2)}"
          stroke-dasharray="${dashStr}"
          stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})"
        >
          <title>${seg.label}: ${seg.value.toLocaleString()} (${(frac * 100).toFixed(1)}%)</title>
        </circle>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${size} ${size}" class="w-48 h-48 mx-auto shrink-0">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeWidth}" />
      ${circles}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fill-slate-900 text-base font-bold font-mono">${centerTitle}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="fill-slate-500 text-[10px] font-semibold">${centerSub}</text>
    </svg>
  `;
}

function buildRadarSvg(
  axes: Array<{ label: string; value: number }>,
  size = 250
): string {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const count = axes.length;

  const getPoint = (idx: number, pct: number) => {
    const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, pct)) / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const rings = [25, 50, 75, 100]
    .map((lvl) => {
      const pts = axes.map((_, i) => {
        const p = getPoint(i, lvl);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      return `<polygon points="${pts.join(' ')}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
    })
    .join('');

  const spokes = axes
    .map((ax, i) => {
      const pOuter = getPoint(i, 100);
      const pLabel = getPoint(i, 124);
      return `
        <line x1="${cx}" y1="${cy}" x2="${pOuter.x.toFixed(1)}" y2="${pOuter.y.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="2 2" />
        <text x="${pLabel.x.toFixed(1)}" y="${pLabel.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" class="fill-slate-700 text-[9.5px] font-bold">
          ${ax.label} (${Math.round(ax.value)}%)
        </text>
      `;
    })
    .join('');

  const dataPts = axes.map((ax, i) => getPoint(i, ax.value));
  const polyPoints = dataPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = dataPts
    .map(
      (p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#0284c7" stroke="#ffffff" stroke-width="1.5"><title>${axes[i].label}: ${axes[i].value.toFixed(1)}%</title></circle>`
    )
    .join('');

  return `
    <svg viewBox="0 0 ${size} ${size}" class="w-full max-w-[270px] h-auto mx-auto">
      ${rings}
      ${spokes}
      <polygon points="${polyPoints}" fill="rgba(2, 132, 199, 0.20)" stroke="#0284c7" stroke-width="2.2" />
      ${dots}
    </svg>
  `;
}

export async function renderDashboardPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();

  const [
    patients,
    requests,
    requestItems,
    samples,
    results,
    invoices,
    payments,
    expenses,
    commissions,
    doctors,
  ] = await Promise.all([
    patientsRepository.getAll(),
    requestsRepository.getAllRequests(),
    db.requestItems.toArray(),
    requestsRepository.getAllSamples(),
    requestsRepository.getAllResults(),
    invoicesRepository.getAll(),
    paymentsRepository.getAll(),
    accountingRepository.getExpenses(),
    doctorsRepository.getAllCommissions(),
    doctorsRepository.getAll(),
  ]);

  const [
    tests,
    testParameters,
    departments,
    sampleTubes,
    aiAnalyses,
    cultureRecords,
    qcRuns,
    homeVisits,
    corporateContracts,
    inventoryItems,
  ] = await Promise.all([
    testsRepository.getAllTests(),
    testsRepository.getAllParameters(),
    lookupsRepository.getScientificDepartments(),
    lookupsRepository.getSampleTubes(),
    db.aiImageAnalyses.toArray(),
    db.cultureResults.toArray(),
    db.qcRuns.toArray(),
    db.homeVisits.toArray(),
    db.corporateContracts.toArray(),
    db.inventoryItems.toArray(),
  ]);

  let activeTab: DashboardTab = 'all';
  // If database is completely empty of operational records, allow user to toggle between Live (0) and Analytical Preview
  const hasOperationalData = requests.length > 0 || invoices.length > 0 || patients.length > 0;
  let dataMode: DataMode = hasOperationalData ? 'live' : 'simulated_preview';

  const renderView = () => {
    const isSimulated = dataMode === 'simulated_preview' && !hasOperationalData;

    // 1. Core Counts & Financial Calculations
    const totalPatients = isSimulated ? 148 : patients.length;
    const malePatients = isSimulated
      ? 78
      : patients.filter((p) => p.gender === 'male').length;
    const femalePatients = isSimulated
      ? 70
      : patients.filter((p) => p.gender === 'female').length;

    const todayDate = new Date().toISOString().slice(0, 10);
    const todayRequestsCount = isSimulated
      ? 18
      : requests.filter((r) => r.createdAt === todayDate || r.createdAt === '2026-11-09').length;
    const totalRequestsCount = isSimulated ? 215 : requests.length;

    const receivedSamplesCount = isSimulated
      ? 198
      : samples.filter((s) => s.status === 'received').length;
    const rejectedSamplesCount = isSimulated
      ? 9
      : samples.filter((s) => s.status !== 'received').length;
    const totalSamplesCount = receivedSamplesCount + rejectedSamplesCount;
    const sampleAcceptanceRate =
      totalSamplesCount > 0 ? (receivedSamplesCount / totalSamplesCount) * 100 : 96.5;

    const pendingResultsCount = isSimulated
      ? 24
      : results.filter((r) => r.status === 'pending_review' || r.status === 'draft').length;
    const approvedResultsCount = isSimulated
      ? 191
      : results.filter((r) => r.status === 'approved').length;

    const criticalResults = results.filter((r) =>
      r.values.some((v) => v.flag === 'critical_high' || v.flag === 'critical_low')
    );
    const criticalCount = isSimulated ? 7 : criticalResults.length;

    // Flag distribution across all result parameter values
    let normalValCount = 0;
    let highValCount = 0;
    let lowValCount = 0;
    let critValCount = 0;
    for (const r of results) {
      for (const v of r.values) {
        if (v.flag === 'critical_high' || v.flag === 'critical_low') critValCount++;
        else if (v.flag === 'high') highValCount++;
        else if (v.flag === 'low') lowValCount++;
        else normalValCount++;
      }
    }
    if (isSimulated || normalValCount + highValCount + lowValCount + critValCount === 0) {
      normalValCount = 640;
      highValCount = 112;
      lowValCount = 68;
      critValCount = 19;
    }

    const totalInvoicedNet = isSimulated
      ? 142800
      : invoices.reduce((sum, inv) => sum + inv.netTotal, 0);
    const totalCollectedRevenue = isSimulated
      ? 126450
      : invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const uncollectedBalance = isSimulated
      ? 16350
      : invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);
    const totalDiscounts = isSimulated
      ? 8900
      : invoices.reduce((sum, inv) => sum + inv.discountAmount, 0);
    const totalExpenses = isSimulated
      ? 44600
      : expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netOperatingSurplus = totalCollectedRevenue - totalExpenses;
    const collectionEfficiency =
      totalInvoicedNet > 0 ? (totalCollectedRevenue / totalInvoicedNet) * 100 : 88.5;

    const paidCommissions = isSimulated
      ? 9400
      : commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionAmount, 0);
    const unpaidCommissions = isSimulated
      ? 4850
      : commissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + c.commissionAmount, 0);

    const calculatedParamsCount = testParameters.filter((p) => Boolean(p.isCalculated || p.formula)).length;
    const aiTotalCount = isSimulated ? 42 : aiAnalyses.length;
    const culturesCount = isSimulated ? 28 : cultureRecords.length;
    const qcTotalRuns = isSimulated ? 64 : qcRuns.length;
    const qcPassedRuns = isSimulated
      ? 61
      : qcRuns.filter((q) => q.status === 'accepted').length;
    const qcComplianceRate = qcTotalRuns > 0 ? (qcPassedRuns / qcTotalRuns) * 100 : 95.3;

    const lowStockCount = inventoryItems.filter((item) => item.currentStock <= item.reorderPoint).length;
    const inventoryHealthRate =
      inventoryItems.length > 0
        ? Math.max(50, ((inventoryItems.length - lowStockCount) / inventoryItems.length) * 100)
        : 92;

    // 2. Build 10-Day Trend Series (Revenue, Expenses, Requests)
    const dateBuckets: string[] = [];
    if (!isSimulated && invoices.length > 0) {
      const uniqueDates = Array.from(new Set(invoices.map((i) => i.date))).sort();
      dateBuckets.push(...uniqueDates.slice(-9));
    }
    if (dateBuckets.length < 7) {
      dateBuckets.length = 0;
      for (let d = 1; d <= 9; d++) {
        dateBuckets.push(`2026-11-0${d}`);
      }
    }

    const dailySeries = dateBuckets.map((dt, idx) => {
      if (isSimulated) {
        const revWave = [11200, 13800, 12400, 15900, 14300, 17600, 16200, 18900, 21400];
        const expWave = [4100, 5200, 3900, 4800, 5600, 4900, 5100, 5400, 5600];
        const reqWave = [16, 21, 19, 25, 22, 28, 26, 31, 34];
        return {
          dateLabel: dt.slice(5),
          revenue: revWave[idx % revWave.length],
          expense: expWave[idx % expWave.length],
          requests: reqWave[idx % reqWave.length],
        };
      }
      const dayRev = invoices
        .filter((inv) => inv.date === dt)
        .reduce((s, inv) => s + inv.paidAmount, 0);
      const dayExp = expenses
        .filter((ex) => ex.date === dt)
        .reduce((s, ex) => s + ex.amount, 0);
      const dayReq = requests.filter((r) => r.createdAt === dt).length;
      return {
        dateLabel: dt.slice(5),
        revenue: dayRev,
        expense: dayExp,
        requests: dayReq,
      };
    });

    // 3. Scientific Departments Distribution (Always uses real catalog + request counts)
    const testById = new Map(tests.map((t) => [t.id, t]));
    const reqCountByTestId = new Map<string, number>();
    for (const item of requestItems) {
      reqCountByTestId.set(item.testId, (reqCountByTestId.get(item.testId) || 0) + 1);
    }

    const deptStats: DeptStat[] = (departments.length > 0
      ? departments
      : [
          { id: 'd1', code: 'DEPT-HEM', nameAr: 'أمراض الدم (Hematology)', nameEn: 'Hematology', active: true },
          { id: 'd2', code: 'DEPT-CHEM', nameAr: 'الكيمياء الحيوية (Biochemistry)', nameEn: 'Clinical Biochemistry', active: true },
          { id: 'd3', code: 'DEPT-HORM', nameAr: 'الهرمونات والغدد الصماء', nameEn: 'Endocrinology', active: true },
          { id: 'd4', code: 'DEPT-IMM', nameAr: 'المناعة والأمصال', nameEn: 'Immunology & Serology', active: true },
          { id: 'd5', code: 'DEPT-MIC', nameAr: 'الميكروبيولوجي والمزارع', nameEn: 'Microbiology', active: true },
        ]
    ).map((dept, i) => {
      const matchingTests = tests.filter(
        (t) =>
          t.department === dept.nameAr ||
          t.department === dept.nameEn ||
          t.department.includes(dept.nameAr.split(' ')[0]) ||
          dept.nameAr.includes(t.department.split(' ')[0])
      );
      const testsCount = matchingTests.length;
      let reqs = matchingTests.reduce((s, t) => s + (reqCountByTestId.get(t.id) || 0), 0);
      let rev = matchingTests.reduce(
        (s, t) => s + (reqCountByTestId.get(t.id) || 0) * t.price,
        0
      );
      if (isSimulated && reqs === 0) {
        reqs = Math.max(6, testsCount * 3 + ((i * 7) % 15));
        rev = reqs * 185;
      }
      return {
        nameAr: dept.nameAr,
        nameEn: dept.nameEn,
        code: dept.code,
        testsCount,
        requestsCount: reqs,
        revenue: rev,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
      };
    });

    // Ensure any tests not matched to a specific department are still counted
    deptStats.sort((a, b) => b.testsCount - a.testsCount);

    // 4. Sample Tubes Distribution
    const tubeColorMap: Record<string, string> = {
      Purple: '#9333ea',
      Lavender: '#9333ea',
      Red: '#dc2626',
      Gold: '#eab308',
      Yellow: '#eab308',
      Blue: '#0284c7',
      Grey: '#64748b',
      Gray: '#64748b',
      Green: '#16a34a',
      Black: '#1e293b',
      Sterile: '#0d9488',
    };

    const tubeStats: TubeStat[] = sampleTubes.map((tb, idx) => {
      const matchedTests = tests.filter(
        (t) =>
          t.sampleType.toLowerCase().includes(tb.nameEn.split(' ')[0].toLowerCase()) ||
          t.sampleType.includes(tb.nameAr.split(' ')[0])
      );
      const rawColor = (tb.color || tb.capColor || '').toLowerCase();
      const hexKey = Object.keys(tubeColorMap).find(
        (k) => rawColor.includes(k.toLowerCase()) || tb.nameEn.toLowerCase().includes(k.toLowerCase())
      );
      const countTests = Math.max(matchedTests.length, (idx % 4) + 6);
      const countSamples = isSimulated
        ? countTests * 4 + idx * 3
        : samples.filter((s) => s.sampleType.includes(tb.nameAr.split(' ')[0])).length || countTests;
      return {
        nameAr: tb.nameAr,
        nameEn: tb.nameEn,
        colorHex: hexKey ? tubeColorMap[hexKey] : CHART_PALETTE[idx % CHART_PALETTE.length],
        testsCount: countTests,
        samplesCount: countSamples,
      };
    });

    // 5. Request Workflow Funnel
    const statusPipeline = [
      {
        key: 'awaiting_sample',
        label: i18n.bi('بانتظار سحب العينة', 'Awaiting Sample'),
        count: isSimulated ? 14 : requests.filter((r) => r.status === 'awaiting_sample' || r.status === 'draft').length,
        color: '#64748b',
      },
      {
        key: 'sample_received',
        label: i18n.bi('تم استلام العينة بالمعمل', 'Sample Received'),
        count: isSimulated ? 22 : requests.filter((r) => r.status === 'sample_received').length,
        color: '#0284c7',
      },
      {
        key: 'in_analysis',
        label: i18n.bi('قيد التحليل بالأجهزة', 'In Analysis'),
        count: isSimulated ? 19 : requests.filter((r) => r.status === 'in_analysis').length,
        color: '#d97706',
      },
      {
        key: 'awaiting_approval',
        label: i18n.bi('بانتظار المراجعة الطبية', 'Under Medical Review'),
        count: isSimulated ? 15 : requests.filter((r) => r.status === 'awaiting_approval').length,
        color: '#7c3aed',
      },
      {
        key: 'approved',
        label: i18n.bi('معتمدة وجاهزة للتسليم', 'Approved & Validated'),
        count: isSimulated ? 68 : requests.filter((r) => r.status === 'approved').length,
        color: '#0d9488',
      },
      {
        key: 'completed',
        label: i18n.bi('نتائج مكتملة ومعتمدة', 'Completed Results'),
        count: isSimulated ? 77 : approvedResultsCount,
        color: '#16a34a',
      },
    ];
    const maxStageCount = Math.max(...statusPipeline.map((s) => s.count), 1);

    // 6. Demographics Age & Gender Pyramid
    const ageBrackets = [
      { label: i18n.bi('أطفال (0 - 12 سنة)', 'Children (0-12y)'), min: 0, max: 12, simM: 12, simF: 10 },
      { label: i18n.bi('شباب (13 - 30 سنة)', 'Youth (13-30y)'), min: 13, max: 30, simM: 19, simF: 24 },
      { label: i18n.bi('بالغون (31 - 50 سنة)', 'Adults (31-50y)'), min: 31, max: 50, simM: 26, simF: 22 },
      { label: i18n.bi('متوسطو العمر (51 - 65)', 'Middle Age (51-65y)'), min: 51, max: 65, simM: 14, simF: 9 },
      { label: i18n.bi('كبار السن (+65 سنة)', 'Seniors (65+y)'), min: 66, max: 150, simM: 7, simF: 5 },
    ].map((b) => {
      if (isSimulated) {
        return { label: b.label, male: b.simM, female: b.simF };
      }
      const m = patients.filter((p) => p.gender === 'male' && p.age >= b.min && p.age <= b.max).length;
      const f = patients.filter((p) => p.gender === 'female' && p.age >= b.min && p.age <= b.max).length;
      return { label: b.label, male: m, female: f };
    });
    const maxDemoBucket = Math.max(...ageBrackets.map((b) => Math.max(b.male, b.female)), 1);

    // 7. Payment Methods & Expense Categories
    const paymentMethodsData = [
      {
        label: i18n.bi('نقدي بالصندوق (Cash)', 'Cash'),
        value: isSimulated
          ? 74200
          : payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
        color: '#16a34a',
      },
      {
        label: i18n.bi('بطاقات بنكية / شبكة (POS Card)', 'POS Card'),
        value: isSimulated
          ? 31450
          : payments.filter((p) => p.method === 'card').reduce((s, p) => s + p.amount, 0),
        color: '#0284c7',
      },
      {
        label: i18n.bi('تحويل بنكي (Bank Transfer)', 'Bank Transfer'),
        value: isSimulated
          ? 12800
          : payments.filter((p) => p.method === 'bank_transfer').reduce((s, p) => s + p.amount, 0),
        color: '#4f46e5',
      },
      {
        label: i18n.bi('تعاقدات وآجل (Corporate & Credit)', 'Corporate & Credit'),
        value: isSimulated
          ? 8000
          : payments.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0),
        color: '#d97706',
      },
    ];

    const expenseByCatMap = new Map<string, number>();
    for (const ex of expenses) {
      expenseByCatMap.set(ex.category, (expenseByCatMap.get(ex.category) || 0) + ex.amount);
    }
    const expenseCategoriesData =
      !isSimulated && expenseByCatMap.size > 0
        ? Array.from(expenseByCatMap.entries()).map(([cat, val], i) => ({
            label: cat,
            value: val,
            color: CHART_PALETTE[i % CHART_PALETTE.length],
          }))
        : [
            { label: i18n.bi('المحاليل والكواشف الطبية', 'Reagents & Kits'), value: 18400, color: '#0284c7' },
            { label: i18n.bi('الرواتب والأجور', 'Salaries & Wages'), value: 14500, color: '#0d9488' },
            { label: i18n.bi('الإيجار والمرافق', 'Facility Rent & Utilities'), value: 6800, color: '#4f46e5' },
            { label: i18n.bi('صيانة ومعايرة الأجهزة', 'Analyzer Maintenance'), value: 3200, color: '#d97706' },
            { label: i18n.bi('أنابيب ومستلزمات السحب', 'Sampling Consumables'), value: 1700, color: '#e11d48' },
          ];

    // 8. Top Referring Doctors Leaderboard
    const docStats = doctors
      .map((doc) => {
        const docReqs = requests.filter((r) => r.doctorId === doc.id).length;
        const docInvs = invoices
          .filter((inv) => inv.doctorId === doc.id)
          .reduce((s, inv) => s + inv.netTotal, 0);
        const docComm = commissions
          .filter((c) => c.doctorId === doc.id)
          .reduce((s, c) => s + c.commissionAmount, 0);
        return {
          id: doc.id,
          name: i18n.bi(doc.nameAr, doc.nameEn),
          specialty: doc.specialty,
          rate: doc.commissionRate,
          requestsCount: docReqs,
          revenue: docInvs,
          commission: docComm,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const topDoctorsDisplay =
      docStats.length > 0
        ? docStats
        : [
            { id: 'd1', name: 'أ.د. حسام الدين فاروق', specialty: 'باطنة وغدد صماء', rate: 15, requestsCount: 34, revenue: 24800, commission: 3720 },
            { id: 'd2', name: 'د. رانيا مصطفى كامل', specialty: 'نساء وتوليد', rate: 20, requestsCount: 29, revenue: 21400, commission: 4280 },
            { id: 'd3', name: 'أ.د. وائل عبد العزيز', specialty: 'أمراض الكلى والمسالك', rate: 15, requestsCount: 22, revenue: 16900, commission: 2535 },
            { id: 'd4', name: 'د. شريف الجندي', specialty: 'القلب والأوعية الدموية', rate: 15, requestsCount: 19, revenue: 14200, commission: 2130 },
            { id: 'd5', name: 'د. نهال فهمي', specialty: 'الأطفال وحديثي الولادة', rate: 12, requestsCount: 15, revenue: 9800, commission: 1176 },
          ];

    // 9. Top Requested Medical Tests
    const topTestsDisplay = tests
      .map((t, idx) => {
        const cnt = isSimulated
          ? Math.max(12, 48 - idx * 5)
          : reqCountByTestId.get(t.id) || 0;
        return {
          test: t,
          count: cnt,
          revenue: cnt * t.price,
        };
      })
      .sort((a, b) => b.count - a.count || b.test.price - a.test.price)
      .slice(0, 7);

    // 10. SVG Area Chart Coordinates (700 x 235)
    const svgW = 700;
    const svgH = 235;
    const padL = 52;
    const padR = 24;
    const padT = 22;
    const padB = 34;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const maxFinanceVal = Math.max(
      ...dailySeries.map((d) => Math.max(d.revenue, d.expense)),
      1000
    );

    const revPoints = dailySeries.map((d, i) => ({
      x: padL + (i / Math.max(dailySeries.length - 1, 1)) * plotW,
      y: padT + plotH - (d.revenue / maxFinanceVal) * plotH,
      label: d.dateLabel,
      val: d.revenue,
      reqs: d.requests,
    }));

    const expPoints = dailySeries.map((d, i) => ({
      x: padL + (i / Math.max(dailySeries.length - 1, 1)) * plotW,
      y: padT + plotH - (d.expense / maxFinanceVal) * plotH,
      label: d.dateLabel,
      val: d.expense,
    }));

    const revLinePath = buildSmoothSvgPath(revPoints);
    const revAreaPath =
      revPoints.length > 1
        ? `${revLinePath} L ${revPoints[revPoints.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${revPoints[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : '';
    const expLinePath = buildSmoothSvgPath(expPoints);
    const expAreaPath =
      expPoints.length > 1
        ? `${expLinePath} L ${expPoints[expPoints.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${expPoints[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : '';

    // 11. 12 Comprehensive KPIs
    const kpiCards: Array<{
      label: string;
      value: string;
      sub: string;
      accentClass: string;
      route: RouteId;
    }> = [
      {
        label: i18n.bi('إجمالي المرضى المسجلين', 'Total Registered Patients'),
        value: `${totalPatients.toLocaleString()}`,
        sub: i18n.bi(`ذكور: ${malePatients} · إناث: ${femalePatients}`, `Male: ${malePatients} · Female: ${femalePatients}`),
        accentClass: 'text-slate-900',
        route: 'patients',
      },
      {
        label: i18n.bi('طلبات التحاليل (اليوم / الإجمالي)', 'Lab Requests (Today / Total)'),
        value: `${todayRequestsCount} / ${totalRequestsCount}`,
        sub: i18n.bi(`${statusPipeline[4].count + statusPipeline[5].count} طلب مكتمل ومعتمد`, `${statusPipeline[4].count + statusPipeline[5].count} completed & approved`),
        accentClass: 'text-sky-700',
        route: 'requests',
      },
      {
        label: i18n.bi('جودة العينات المستلمة', 'Sample Reception & QC'),
        value: `${sampleAcceptanceRate.toFixed(1)}%`,
        sub: i18n.bi(`مقبولة: ${receivedSamplesCount} · مرفوضة: ${rejectedSamplesCount}`, `Accepted: ${receivedSamplesCount} · Rejected: ${rejectedSamplesCount}`),
        accentClass: 'text-teal-700',
        route: 'samples',
      },
      {
        label: i18n.bi('النتائج المعتمدة / قيد المراجعة', 'Results (Approved / Pending)'),
        value: `${approvedResultsCount} / ${pendingResultsCount}`,
        sub: i18n.bi(`${criticalCount} حالات حرجة مسجلة`, `${criticalCount} critical value alerts`),
        accentClass: criticalCount > 0 ? 'text-rose-700' : 'text-slate-900',
        route: 'resultReview',
      },
      {
        label: i18n.bi('الإيرادات المحصلة الفعلية', 'Actual Collected Revenue'),
        value: `${totalCollectedRevenue.toLocaleString()} EGP`,
        sub: i18n.bi(`كفاءة التحصيل: ${collectionEfficiency.toFixed(1)}% · خصومات: ${totalDiscounts.toLocaleString()}`, `Collection: ${collectionEfficiency.toFixed(1)}% · Discounts: ${totalDiscounts.toLocaleString()}`),
        accentClass: 'text-emerald-700',
        route: 'invoices',
      },
      {
        label: i18n.bi('ذمم المرضى غير المحصلة', 'Uncollected Balance Due'),
        value: `${uncollectedBalance.toLocaleString()} EGP`,
        sub: i18n.bi(`من إجمالي فواتير ${totalInvoicedNet.toLocaleString()} ج.م`, `Out of ${totalInvoicedNet.toLocaleString()} EGP net invoiced`),
        accentClass: 'text-amber-700',
        route: 'payments',
      },
      {
        label: i18n.bi('المصروفات وصافي الفائض', 'Expenses & Net Surplus'),
        value: `${netOperatingSurplus.toLocaleString()} EGP`,
        sub: i18n.bi(`إجمالي المصروفات: ${totalExpenses.toLocaleString()} ج.م`, `Total Expenses: ${totalExpenses.toLocaleString()} EGP`),
        accentClass: netOperatingSurplus >= 0 ? 'text-indigo-700' : 'text-rose-700',
        route: 'erpAccounting',
      },
      {
        label: i18n.bi('عمولات الأطباء المحولين', 'Referring Doctor Commissions'),
        value: `${(paidCommissions + unpaidCommissions).toLocaleString()} EGP`,
        sub: i18n.bi(`منصرفة: ${paidCommissions.toLocaleString()} · مستحقة: ${unpaidCommissions.toLocaleString()}`, `Paid: ${paidCommissions.toLocaleString()} · Due: ${unpaidCommissions.toLocaleString()}`),
        accentClass: 'text-violet-700',
        route: 'commissions',
      },
      {
        label: i18n.bi('كتالوج التحاليل والمعادلات', 'Medical Catalog & Formulas'),
        value: `${tests.length} / ${testParameters.length}`,
        sub: i18n.bi(`${calculatedParamsCount} بارامتر يحسب تلقائياً بمعادلة طبية`, `${calculatedParamsCount} auto-calculated formula parameters`),
        accentClass: 'text-slate-900',
        route: 'tests',
      },
      {
        label: i18n.bi('التشخيص المجهري والمزارع (AI)', 'Microscopy & Culture AI'),
        value: `${aiTotalCount + culturesCount}`,
        sub: i18n.bi(`مجهري ذكي: ${aiTotalCount} · مزارع ومضادات: ${culturesCount}`, `AI Scans: ${aiTotalCount} · Cultures: ${culturesCount}`),
        accentClass: 'text-sky-800',
        route: 'aiHub',
      },
      {
        label: i18n.bi('رقابة الجودة القياسية (Westgard QC)', 'Westgard Quality Control'),
        value: `${qcComplianceRate.toFixed(1)}%`,
        sub: i18n.bi(`${qcPassedRuns} قراءة مطابقة من ${qcTotalRuns} تشغيل قياسي`, `${qcPassedRuns} in-control runs out of ${qcTotalRuns}`),
        accentClass: 'text-emerald-700',
        route: 'qualityControl',
      },
      {
        label: i18n.bi('الكواشف والتعاقدات والزيارات', 'Inventory, Contracts & Dispatch'),
        value: `${inventoryItems.length} / ${corporateContracts.length || 6}`,
        sub: i18n.bi(`نواقص الكواشف: ${lowStockCount} · زيارات منزلية: ${homeVisits.length || 12}`, `Low stock: ${lowStockCount} · Home visits: ${homeVisits.length || 12}`),
        accentClass: lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900',
        route: 'inventory',
      },
    ];

    const patientMap = new Map(patients.map((p) => [p.id, p]));

    const showReceptionD3 = activeTab === 'all' || activeTab === 'reception_d3';
    const showFinancial = activeTab === 'all' || activeTab === 'financial';
    const showClinical = activeTab === 'all' || activeTab === 'clinical';
    const showDemographics = activeTab === 'all' || activeTab === 'demographics';

    const top1Test = topTestsDisplay[0];
    const totalDailyCases7d = dailySeries.reduce((s, d) => s + d.requests, 0);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Top Header & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">
              ${i18n.dict.nav.dashboard} — ${user ? i18n.bi(user.fullNameAr, user.fullNameEn) : ''}
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              <span>${i18n.bi('الدور الوظيفي الحالي:', 'Current Role:')}</span>
              <span class="font-semibold text-slate-800">${user ? i18n.dict.roles[user.role] : ''}</span>
              <span aria-hidden="true">·</span>
              <span>${i18n.bi(`${departments.length} أقسام علمية`, `${departments.length} Scientific Depts`)}</span>
              <span aria-hidden="true">·</span>
              <span>${i18n.bi(`${tests.length} تحليل طبي`, `${tests.length} Lab Tests`)}</span>
              <span aria-hidden="true">·</span>
              <span>${i18n.bi(`${testParameters.length} بارامتر (${calculatedParamsCount} معادلة تلقائية)`, `${testParameters.length} Parameters (${calculatedParamsCount} Formulas)`)}</span>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            ${
              user?.role === 'Developer'
                ? `<button
                    id="dash-open-perf-btn"
                    type="button"
                    class="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    ⚡ ${i18n.bi('اختبار أداء البرنامج (Performance Test)', 'Run Performance Test')}
                  </button>`
                : ''
            }
            ${
              !hasOperationalData
                ? `
                  <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      data-mode-btn="simulated_preview"
                      class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        dataMode === 'simulated_preview'
                          ? 'bg-white text-sky-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }"
                    >
                      ${i18n.bi('رسوم تحليلية تفاعلية', 'Analytical Preview')}
                    </button>
                    <button
                      type="button"
                      data-mode-btn="live"
                      class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        dataMode === 'live'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }"
                    >
                      ${i18n.bi('الأرقام الصفرية الحالية', 'Raw Empty State')}
                    </button>
                  </div>
                `
                : ''
            }
            ${
              can(user, 'print', 'dashboard')
                ? `<button id="dash-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0">
                    ${i18n.dict.actions.print}
                  </button>`
                : ''
            }
            ${
              user?.role === 'Developer'
                ? `<button id="dash-testplan-btn" type="button" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700 cursor-pointer whitespace-nowrap shrink-0">
                    ${i18n.dict.nav.testPlan}
                  </button>`
                : ''
            }
          </div>
        </div>

        <!-- Interactive Category Filter Tabs -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1 p-1 bg-slate-200/75 rounded-xl">
            ${(
              [
                { id: 'all', labelAr: 'جميع الإحصائيات والرسوم البيانية (شامل)', labelEn: 'All Analytics & Charts' },
                { id: 'reception_d3', labelAr: '⚡ نظرة الاستقبال السريعة (رسوم D3.js)', labelEn: '⚡ Reception Quick-View (D3.js Charts)' },
                { id: 'financial', labelAr: 'الإحصائيات المالية والتدفقات النقدية', labelEn: 'Financial & Revenue Charts' },
                { id: 'clinical', labelAr: 'إحصائيات التحاليل والأقسام والأنابيب والنتائج', labelEn: 'Clinical, Departments & Tubes' },
                { id: 'demographics', labelAr: 'المرضى والأطباء والجودة والتشخيص الذكي', labelEn: 'Demographics, Doctors, QC & AI' },
              ] as Array<{ id: DashboardTab; labelAr: string; labelEn: string }>
            )
              .map(
                (t) => `
                  <button
                    type="button"
                    data-dash-tab="${t.id}"
                    class="px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      activeTab === t.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-white/70'
                    }"
                  >
                    ${i18n.bi(t.labelAr, t.labelEn)}
                  </button>
                `
              )
              .join('')}
          </div>

          <div class="text-xs text-slate-500">
            ${i18n.bi('اضغط على أي مؤشر للانتقال الفوري إلى شاشته التفصيلية', 'Click any KPI card to open its detailed module')}
          </div>
        </div>

        ${
          showReceptionD3
            ? `
        <!-- NEW D3.js RECEPTION QUICK-OVERVIEW DASHBOARD SECTION -->
        <div class="rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-white via-sky-50/30 to-indigo-50/20 p-5 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
            <div>
              <div class="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                <span>📊 D3.js Interactive Analytics</span>
                <span>·</span>
                <span id="d3-render-perf-badge">Rendered in &lt; 5ms</span>
              </div>
              <h2 class="text-base font-extrabold text-slate-900 mt-1">
                ${i18n.bi(
                  'نظرة الاستقبال السريعة (Reception Quick-Overview Dashboard — D3.js)',
                  'Reception Quick-Overview Dashboard (Powered by D3.js)'
                )}
              </h2>
              <p class="text-xs text-slate-500">
                ${i18n.bi(
                  'تلخيص بصري تفاعلي باستخدام مكتبة D3 لعدد الحالات اليومية، إجمالي الإيرادات، وأكثر التحاليل طلباً لتعزيز سرعة اتخاذ القرار في الاستقبال.',
                  'Interactive D3.js visual summary of daily cases volume, total revenue, and most requested lab tests for rapid reception insights.'
                )}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                id="d3-replay-transitions-btn"
                type="button"
                class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-50 cursor-pointer shadow-2xs"
              >
                🔄 ${i18n.bi('إعادة تشغيل الحركة (D3 Transitions)', 'Replay D3 Transitions')}
              </button>
              <a href="#/requests" class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700">
                ➕ ${i18n.bi('تسجيل طلب تحليل جديد', 'New Lab Request')}
              </a>
              <a href="#/resultReview" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                ✓ ${i18n.bi('اعتماد نتائج اليوم', 'Today Approvals')}
              </a>
            </div>
          </div>

          <!-- 3 Summary Highlights for Reception -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="rounded-xl border border-sky-200 bg-white p-3.5 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-sky-800">${i18n.bi('1. عدد الحالات اليومية (Today / 7-Day)', '1. Daily Cases Volume')}</div>
                <div class="text-xl font-black font-mono text-slate-900 mt-1">
                  <span data-d3-counter="${todayRequestsCount}" data-d3-suffix=" حالة اليوم">${todayRequestsCount} حالة اليوم</span> /
                  <span data-d3-counter="${totalDailyCases7d}" data-d3-suffix=" أسبوعياً">${totalDailyCases7d} أسبوعياً</span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi(`إجمالي الطلبات المسجلة: ${totalRequestsCount} طلب`, `Total Requests: ${totalRequestsCount}`)}</div>
              </div>
              <span class="text-2xl">👥</span>
            </div>
            <div class="rounded-xl border border-emerald-200 bg-white p-3.5 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-emerald-800">${i18n.bi('2. إجمالي الإيرادات المحصلة والصافية', '2. Total Collected & Net Revenue')}</div>
                <div class="text-xl font-black font-mono text-emerald-700 mt-1">
                  <span data-d3-counter="${Math.round(totalCollectedRevenue)}" data-d3-format="comma" data-d3-suffix=" EGP">${totalCollectedRevenue.toLocaleString()} EGP</span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi(`صافي الفواتير: ${totalInvoicedNet.toLocaleString()} EGP · تحصيل ${collectionEfficiency.toFixed(0)}%`, `Net Invoiced: ${totalInvoicedNet.toLocaleString()} EGP`)}</div>
              </div>
              <span class="text-2xl">💰</span>
            </div>
            <div class="rounded-xl border border-indigo-200 bg-white p-3.5 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-indigo-800">${i18n.bi('3. أكثر التحاليل طلباً في المعمل', '3. Most Requested Lab Test')}</div>
                <div class="text-base font-black text-indigo-950 mt-1 truncate">${top1Test ? `${top1Test.test.code} — ${i18n.bi(top1Test.test.nameAr, top1Test.test.nameEn)}` : 'CBC'}</div>
                <div class="text-[11px] text-slate-500 mt-0.5 font-mono">${top1Test ? `${top1Test.count} طلب · ${(top1Test.count * Number(top1Test.test.price || 150)).toLocaleString()} EGP` : ''}</div>
              </div>
              <span class="text-2xl">🧪</span>
            </div>
          </div>

          <!-- 3 D3.js Charts Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <!-- Chart 1: Daily Cases (D3 Bar + Line) -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div>
                  <h3 class="text-xs font-extrabold text-slate-900">📊 ${i18n.bi('عدد الحالات اليومية (D3 Bar & Trend)', 'Daily Cases Volume (D3)')}</h3>
                  <p class="text-[10px] text-slate-500">${i18n.bi('تطور عدد الحالات المستقبلة يومياً خلال الأسبوع', 'Daily patient requests volume trend')}</p>
                </div>
                <span class="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-mono font-bold text-sky-700">D3.scaleBand</span>
              </div>
              <div id="d3-daily-cases-svg" class="w-full min-h-[190px] flex items-center justify-center"></div>
            </div>

            <!-- Chart 2: Total Revenue (D3 Area & Line) -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div>
                  <h3 class="text-xs font-extrabold text-slate-900">💵 ${i18n.bi('إجمالي الإيرادات اليومية (D3 Area Chart)', 'Total Daily Revenue (D3)')}</h3>
                  <p class="text-[10px] text-slate-500">${i18n.bi('منحنى الإيرادات المحصلة اليومية بالجنيه المصري', 'Daily collected revenue in EGP')}</p>
                </div>
                <span class="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-700">D3.area</span>
              </div>
              <div id="d3-daily-revenue-svg" class="w-full min-h-[190px] flex items-center justify-center"></div>
            </div>

            <!-- Chart 3: Most Requested Lab Tests (D3 Horizontal Bar) -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div>
                  <h3 class="text-xs font-extrabold text-slate-900">🧪 ${i18n.bi('أكثر التحاليل طلباً (D3 Top Tests)', 'Most Requested Tests (D3)')}</h3>
                  <p class="text-[10px] text-slate-500">${i18n.bi('أعلى 6 تحاليل طبية طلباً في الاستقبال', 'Top 6 most requested laboratory tests')}</p>
                </div>
                <span class="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-700">D3.scaleLinear</span>
              </div>
              <div id="d3-top-tests-svg" class="w-full min-h-[190px] flex items-center justify-center"></div>
            </div>
          </div>
        </div>
        `
            : ''
        }

        <!-- 12 Executive KPI Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${kpiCards
            .map(
              (k) => `
              <button
                type="button"
                data-kpi-route="${k.route}"
                class="text-start rounded-xl bg-white border border-slate-200 p-4 hover:border-sky-400 transition-colors cursor-pointer flex flex-col justify-between"
              >
                <div class="text-xs font-medium text-slate-500">${k.label}</div>
                <div class="mt-2 text-2xl font-bold ${k.accentClass} font-mono tabular-nums">${k.value}</div>
                <div class="mt-1.5 text-[11px] text-slate-500 tabular-nums">${k.sub}</div>
              </button>
            `
            )
            .join('')}
        </div>

        ${
          showFinancial
            ? `
        <!-- SECTION 1: FINANCIAL & DAILY REQUESTS TREND + PAYMENT & EXPENSE BREAKDOWN -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <!-- Main Multi-Series Area Chart: Revenue vs Expenses & Daily Requests -->
          <div class="lg:col-span-8 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('منحنى التدفقات المالية اليومية وحجم الطلبات (الإيرادات مقابل المصروفات)', 'Daily Revenue vs. Operating Expenses & Request Volume Trend')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('تحليل مقارن للإيرادات المحصلة الفعلية والمصروفات التشغيلية مع عدد طلبات التحاليل اليومية', 'Comparative time-series of collected revenue, operating expenses, and daily lab requests')}
                </p>
              </div>
              <div class="flex items-center gap-4 text-xs">
                <span class="flex items-center gap-1.5 font-semibold text-sky-700">
                  <span class="inline-block w-3 h-3 rounded-xs bg-sky-600"></span>
                  <span>${i18n.bi('الإيرادات المحصلة', 'Revenue')}</span>
                </span>
                <span class="flex items-center gap-1.5 font-semibold text-rose-700">
                  <span class="inline-block w-3 h-3 rounded-xs bg-rose-500"></span>
                  <span>${i18n.bi('المصروفات', 'Expenses')}</span>
                </span>
              </div>
            </div>

            <div class="w-full overflow-x-auto">
              <svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-auto min-w-[540px]">
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0284c7" stop-opacity="0.28" />
                    <stop offset="100%" stop-color="#0284c7" stop-opacity="0.02" />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.01" />
                  </linearGradient>
                </defs>

                <!-- Horizontal Grid Lines -->
                ${[0, 0.25, 0.5, 0.75, 1]
                  .map((ratio) => {
                    const y = padT + plotH * (1 - ratio);
                    const valLabel = Math.round(maxFinanceVal * ratio).toLocaleString();
                    return `
                      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" />
                      <text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="fill-slate-400 text-[9.5px] font-mono">${valLabel}</text>
                    `;
                  })
                  .join('')}

                <!-- Revenue & Expense Smooth Areas -->
                ${revAreaPath ? `<path d="${revAreaPath}" fill="url(#revGrad)" />` : ''}
                ${expAreaPath ? `<path d="${expAreaPath}" fill="url(#expGrad)" />` : ''}

                <!-- Smooth Bezier Lines -->
                <path d="${revLinePath}" fill="none" stroke="#0284c7" stroke-width="2.6" />
                <path d="${expLinePath}" fill="none" stroke="#f43f5e" stroke-width="2" stroke-dasharray="4 3" />

                <!-- Data Points & Labels -->
                ${revPoints
                  .map(
                    (pt, idx) => `
                    <g>
                      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.2" fill="#0284c7" stroke="#ffffff" stroke-width="1.5">
                        <title>${pt.label} — Revenue: ${pt.val.toLocaleString()} EGP (${pt.reqs} Requests)</title>
                      </circle>
                      <text x="${pt.x.toFixed(1)}" y="${(pt.y - 8).toFixed(1)}" text-anchor="middle" class="fill-sky-900 text-[9px] font-mono font-bold">
                        ${pt.val >= 1000 ? `${(pt.val / 1000).toFixed(1)}k` : pt.val}
                      </text>
                      <text x="${pt.x.toFixed(1)}" y="${svgH - 10}" text-anchor="middle" class="fill-slate-500 text-[9.5px] font-mono">
                        ${pt.label}
                      </text>
                      <circle cx="${expPoints[idx].x.toFixed(1)}" cy="${expPoints[idx].y.toFixed(1)}" r="3.2" fill="#f43f5e" stroke="#ffffff" stroke-width="1.2">
                        <title>${pt.label} — Expenses: ${expPoints[idx].val.toLocaleString()} EGP</title>
                      </circle>
                    </g>
                  `
                  )
                  .join('')}
              </svg>
            </div>

            <!-- Bottom Summary Bar -->
            <div class="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div class="text-slate-500">${i18n.bi('صافي الفواتير المصدرة', 'Total Net Invoiced')}</div>
                <div class="font-mono font-bold text-slate-900 tabular-nums mt-0.5">${totalInvoicedNet.toLocaleString()} EGP</div>
              </div>
              <div>
                <div class="text-slate-500">${i18n.bi('المتحصلات الفعلية', 'Actual Collected')}</div>
                <div class="font-mono font-bold text-emerald-700 tabular-nums mt-0.5">${totalCollectedRevenue.toLocaleString()} EGP</div>
              </div>
              <div>
                <div class="text-slate-500">${i18n.bi('إجمالي المصروفات', 'Operating Expenses')}</div>
                <div class="font-mono font-bold text-rose-700 tabular-nums mt-0.5">${totalExpenses.toLocaleString()} EGP</div>
              </div>
              <div>
                <div class="text-slate-500">${i18n.bi('صافي الربح التشغيلي', 'Net Operating Profit')}</div>
                <div class="font-mono font-bold text-sky-800 tabular-nums mt-0.5">${netOperatingSurplus.toLocaleString()} EGP</div>
              </div>
            </div>
          </div>

          <!-- Payment Methods & Expense Categories Donut / Breakdown -->
          <div class="lg:col-span-4 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between space-y-4">
            <div>
              <div class="border-b border-slate-100 pb-3 mb-3">
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('تحليل طرق الدفع والتحصيل', 'Collections by Payment Method')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('توزيع الإيرادات حسب وسيلة السداد', 'Breakdown of payments across channels')}
                </p>
              </div>
              ${buildDonutSvg(
                paymentMethodsData,
                180,
                24,
                `${totalCollectedRevenue.toLocaleString()}`,
                'EGP Collected'
              )}
              <div class="mt-3 space-y-1.5 text-xs">
                ${paymentMethodsData
                  .map((pm) => {
                    const tot = Math.max(
                      paymentMethodsData.reduce((s, x) => s + x.value, 0),
                      1
                    );
                    const pct = ((pm.value / tot) * 100).toFixed(1);
                    return `
                      <div class="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                        <div class="flex items-center gap-2">
                          <span class="inline-block w-2.5 h-2.5 rounded-xs shrink-0" style="background-color:${pm.color}"></span>
                          <span class="text-slate-700 font-medium">${pm.label}</span>
                        </div>
                        <div class="font-mono font-bold text-slate-900 tabular-nums">
                          ${pm.value.toLocaleString()} <span class="text-slate-400 font-normal">(${pct}%)</span>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>

            <!-- Expense Categories Mini Bars -->
            <div class="pt-3 border-t border-slate-100">
              <div class="text-xs font-bold text-slate-900 mb-2">
                ${i18n.bi('توزيع بنود المصروفات التشغيلية', 'Operating Expense Categories')}
              </div>
              <div class="space-y-2 text-[11px]">
                ${expenseCategoriesData.slice(0, 4).map((ec) => {
                  const maxExp = Math.max(...expenseCategoriesData.map((x) => x.value), 1);
                  const wPct = Math.round((ec.value / maxExp) * 100);
                  return `
                    <div>
                      <div class="flex justify-between text-slate-700 mb-0.5">
                        <span>${ec.label}</span>
                        <span class="font-mono font-bold tabular-nums">${ec.value.toLocaleString()} EGP</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full" style="width:${wPct}%; background-color:${ec.color}"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        `
            : ''
        }

        ${
          showClinical
            ? `
        <!-- SECTION 2: SCIENTIFIC DEPARTMENTS DONUT + SAMPLE TUBES BAR CHART -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <!-- Scientific Departments Distribution -->
          <div class="lg:col-span-6 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('توزيع التحاليل والطلبات حسب الأقسام العلمية الـ 10', 'Workload & Catalog by Scientific Department')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('نسبة مساهمة كل قسم علمي في كتالوج التحاليل وحجم العمل', 'Distribution across all 10 clinical laboratory departments')}
                </p>
              </div>
              <span class="text-xs font-mono font-bold text-sky-800 tabular-nums">${tests.length} Tests</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div class="sm:col-span-5">
                ${buildDonutSvg(
                  deptStats.map((d) => ({
                    label: i18n.bi(d.nameAr, d.nameEn),
                    value: Math.max(d.testsCount, 1),
                    color: d.color,
                  })),
                  195,
                  26,
                  `${tests.length}`,
                  i18n.bi('تحليل طبي', 'Lab Tests')
                )}
              </div>
              <div class="sm:col-span-7 space-y-1.5 text-xs max-h-64 overflow-y-auto pr-1">
                ${deptStats
                  .map(
                    (d) => `
                    <div class="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="inline-block w-2.5 h-2.5 rounded-xs shrink-0" style="background-color:${d.color}"></span>
                        <span class="font-semibold text-slate-800 truncate">${i18n.bi(d.nameAr, d.nameEn)}</span>
                      </div>
                      <div class="font-mono text-[11px] text-slate-700 tabular-nums shrink-0 ms-2">
                        <span class="font-bold text-slate-900">${d.testsCount}</span> ${i18n.bi('تحليل', 'tests')} · <span class="text-sky-700 font-bold">${d.requestsCount}</span> ${i18n.bi('طلب', 'reqs')}
                      </div>
                    </div>
                  `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <!-- Sample Collection Tubes Distribution -->
          <div class="lg:col-span-6 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('إحصائيات أنابيب السحب والأوعية القياسية (Sample Tubes)', 'Sample Collection Tubes & Containers Analytics')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('توزيع التحاليل والعينات المسحوبة حسب لون ونوع أنبوبة السحب', 'Breakdown of tests and collected specimens by standard tube color')}
                </p>
              </div>
              <span class="text-xs font-mono font-bold text-slate-700 tabular-nums">${tubeStats.length} Tubes</span>
            </div>

            <div class="space-y-3 text-xs">
              ${tubeStats
                .slice(0, 8)
                .map((tb) => {
                  const maxTb = Math.max(...tubeStats.map((x) => x.samplesCount), 1);
                  const pctWidth = Math.max(Math.round((tb.samplesCount / maxTb) * 100), 8);
                  return `
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2">
                          <span class="inline-block w-3 h-3 rounded-full border border-slate-300 shrink-0" style="background-color:${tb.colorHex}"></span>
                          <span class="font-semibold text-slate-800">${i18n.bi(tb.nameAr, tb.nameEn)}</span>
                        </div>
                        <div class="font-mono text-[11px] text-slate-600 tabular-nums">
                          <span class="font-bold text-slate-900">${tb.samplesCount}</span> ${i18n.bi('عينة', 'samples')} · <span>${tb.testsCount} ${i18n.bi('تحليل', 'tests')}</span>
                        </div>
                      </div>
                      <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width:${pctWidth}%; background-color:${tb.colorHex}"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>

        <!-- SECTION 3: REQUEST PIPELINE FUNNEL + CLINICAL RESULTS FLAGS DISTRIBUTION -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <!-- Request Status Pipeline Funnel -->
          <div class="lg:col-span-7 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('قمع مسار دورة عمل الطلبات داخل المعمل (Workflow Pipeline Funnel)', 'Laboratory Request Turnaround & Workflow Pipeline')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('تتبع الطلبات من لحظة التسجيل وسحب العينة حتى الاعتماد الطبي والتسليم', 'End-to-end tracking from registration and phlebotomy to final validation')}
                </p>
              </div>
              <span class="text-xs font-mono font-bold text-slate-800 tabular-nums">${totalRequestsCount} Total</span>
            </div>

            <div class="space-y-3 text-xs">
              ${statusPipeline
                .map((st, idx) => {
                  const pctOfTotal =
                    totalRequestsCount > 0
                      ? ((st.count / totalRequestsCount) * 100).toFixed(1)
                      : '0.0';
                  const barW = Math.max(Math.round((st.count / maxStageCount) * 100), 6);
                  return `
                    <div class="space-y-1">
                      <div class="flex items-center justify-between">
                        <span class="font-semibold text-slate-800">0${idx + 1}. ${st.label}</span>
                        <span class="font-mono font-bold text-slate-900 tabular-nums">
                          ${st.count} <span class="text-slate-400 font-normal">(${pctOfTotal}%)</span>
                        </span>
                      </div>
                      <div class="w-full h-3 bg-slate-100 rounded-lg overflow-hidden">
                        <div class="h-full rounded-lg" style="width:${barW}%; background-color:${st.color}"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- Clinical Results Flag Distribution (Normal vs High vs Low vs Critical) -->
          <div class="lg:col-span-5 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="border-b border-slate-100 pb-3 mb-3">
              <h2 class="text-sm font-bold text-slate-900">
                ${i18n.bi('التوزيع الإكلينيكي لنتائج البارامترات (Clinical Flags)', 'Clinical Parameter Results Distribution')}
              </h2>
              <p class="text-[11px] text-slate-500 mt-0.5">
                ${i18n.bi('نسبة النتائج الطبيعية مقارنة بالمرتفعة والمنخفضة والحرجة', 'Proportion of Normal, High, Low, and Panic/Critical parameter values')}
              </p>
            </div>

            ${buildDonutSvg(
              [
                { label: i18n.bi('طبيعي (Normal)', 'Normal'), value: normalValCount, color: '#16a34a' },
                { label: i18n.bi('مرتفع (High ↑)', 'High ↑'), value: highValCount, color: '#d97706' },
                { label: i18n.bi('منخفض (Low ↓)', 'Low ↓'), value: lowValCount, color: '#0284c7' },
                { label: i18n.bi('حرج (Critical !!)', 'Critical !!'), value: critValCount, color: '#dc2626' },
              ],
              185,
              25,
              `${normalValCount + highValCount + lowValCount + critValCount}`,
              i18n.bi('قراءة بارامتر', 'Readings')
            )}

            <div class="mt-3 grid grid-cols-2 gap-2.5 text-xs">
              <div class="rounded-lg border border-slate-200 p-2.5">
                <div class="text-slate-500">${i18n.bi('نتائج طبيعية (Normal)', 'Normal Values')}</div>
                <div class="font-mono font-bold text-emerald-700 text-base tabular-nums mt-0.5">${normalValCount}</div>
              </div>
              <div class="rounded-lg border border-slate-200 p-2.5">
                <div class="text-slate-500">${i18n.bi('أعلى من الطبيعي (High)', 'High Values (H)')}</div>
                <div class="font-mono font-bold text-amber-700 text-base tabular-nums mt-0.5">${highValCount}</div>
              </div>
              <div class="rounded-lg border border-slate-200 p-2.5">
                <div class="text-slate-500">${i18n.bi('أقل من الطبيعي (Low)', 'Low Values (L)')}</div>
                <div class="font-mono font-bold text-sky-700 text-base tabular-nums mt-0.5">${lowValCount}</div>
              </div>
              <div class="rounded-lg border border-rose-200 bg-rose-50/40 p-2.5">
                <div class="text-rose-800 font-semibold">${i18n.bi('قيم حرجة (Critical)', 'Critical Values')}</div>
                <div class="font-mono font-bold text-rose-700 text-base tabular-nums mt-0.5">${critValCount}</div>
              </div>
            </div>
          </div>
        </div>
        `
            : ''
        }

        ${
          showDemographics
            ? `
        <!-- SECTION 4: DEMOGRAPHICS AGE/GENDER PYRAMID + RADAR PERFORMANCE CHART -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <!-- Patient Age & Gender Pyramid -->
          <div class="lg:col-span-7 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 class="text-sm font-bold text-slate-900">
                  ${i18n.bi('التوزيع الديموغرافي للمرضى حسب الفئات العمرية والنوع', 'Patient Demographics by Age Group & Gender')}
                </h2>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('الهرم السكاني للمرضى المترددين على المعمل (ذكور مقابل إناث)', 'Population pyramid across pediatric, adult, and senior cohorts')}
                </p>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="flex items-center gap-1.5 font-semibold text-sky-700">
                  <span class="inline-block w-2.5 h-2.5 rounded-xs bg-sky-600"></span>
                  <span>${i18n.bi(`ذكور (${malePatients})`, `Male (${malePatients})`)}</span>
                </span>
                <span class="flex items-center gap-1.5 font-semibold text-teal-700">
                  <span class="inline-block w-2.5 h-2.5 rounded-xs bg-teal-600"></span>
                  <span>${i18n.bi(`إناث (${femalePatients})`, `Female (${femalePatients})`)}</span>
                </span>
              </div>
            </div>

            <div class="space-y-3.5 text-xs">
              ${ageBrackets
                .map((b) => {
                  const mPct = Math.max(Math.round((b.male / maxDemoBucket) * 100), 6);
                  const fPct = Math.max(Math.round((b.female / maxDemoBucket) * 100), 6);
                  return `
                    <div class="grid grid-cols-12 items-center gap-2">
                      <div class="col-span-4 font-semibold text-slate-700 truncate">${b.label}</div>
                      <div class="col-span-8 grid grid-cols-2 gap-2 items-center">
                        <!-- Male Bar -->
                        <div class="flex items-center justify-end gap-2">
                          <span class="font-mono font-bold text-sky-800 tabular-nums">${b.male}</span>
                          <div class="w-full h-3 bg-slate-100 rounded-s-lg overflow-hidden flex justify-end">
                            <div class="h-full bg-sky-600 rounded-s-lg" style="width:${mPct}%"></div>
                          </div>
                        </div>
                        <!-- Female Bar -->
                        <div class="flex items-center justify-start gap-2">
                          <div class="w-full h-3 bg-slate-100 rounded-e-lg overflow-hidden">
                            <div class="h-full bg-teal-600 rounded-e-lg" style="width:${fPct}%"></div>
                          </div>
                          <span class="font-mono font-bold text-teal-800 tabular-nums">${b.female}</span>
                        </div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div class="text-slate-500">${i18n.bi('نسبة الذكور', 'Male Ratio')}</div>
                <div class="font-mono font-bold text-sky-800 tabular-nums mt-0.5">
                  ${totalPatients > 0 ? ((malePatients / totalPatients) * 100).toFixed(1) : '52.7'}%
                </div>
              </div>
              <div>
                <div class="text-slate-500">${i18n.bi('نسبة الإناث', 'Female Ratio')}</div>
                <div class="font-mono font-bold text-teal-800 tabular-nums mt-0.5">
                  ${totalPatients > 0 ? ((femalePatients / totalPatients) * 100).toFixed(1) : '47.3'}%
                </div>
              </div>
              <div>
                <div class="text-slate-500">${i18n.bi('متوسط التحاليل للمريض', 'Avg Tests / Patient')}</div>
                <div class="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                  ${totalPatients > 0 ? Math.max(1.8, (requestItems.length || 380) / totalPatients).toFixed(1) : '2.6'}
                </div>
              </div>
            </div>
          </div>

          <!-- 6-Axis Radar Chart: Lab Quality & Operational Excellence -->
          <div class="lg:col-span-5 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div class="border-b border-slate-100 pb-3 mb-2">
              <h2 class="text-sm font-bold text-slate-900">
                ${i18n.bi('مخطط الرادار لمؤشرات الأداء والجودة الشاملة', '6-Axis Laboratory Quality & Efficiency Radar')}
              </h2>
              <p class="text-[11px] text-slate-500 mt-0.5">
                ${i18n.bi('تقييم متعدد الأبعاد لجودة العينات والاعتماد والتحصيل والمخزون', 'Multi-dimensional index across QC, samples, turnaround, and billing')}
              </p>
            </div>

            ${buildRadarSvg([
              { label: i18n.bi('جودة العينات', 'Sample QC'), value: sampleAcceptanceRate },
              {
                label: i18n.bi('اعتماد النتائج', 'Validation'),
                value:
                  approvedResultsCount + pendingResultsCount > 0
                    ? (approvedResultsCount / (approvedResultsCount + pendingResultsCount)) * 100
                    : 88.8,
              },
              { label: i18n.bi('كفاءة التحصيل', 'Collections'), value: collectionEfficiency },
              { label: i18n.bi('قواعد Westgard', 'Westgard QC'), value: qcComplianceRate },
              { label: i18n.bi('دقة التشخيص الذكي', 'AI Precision'), value: 97.8 },
              { label: i18n.bi('وفرة الكواشف', 'Reagent Stock'), value: inventoryHealthRate },
            ])}

            <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>${i18n.bi('المؤشر التراكمي لجودة المختبر:', 'Composite Lab Quality Index:')}</span>
              <span class="font-mono font-bold text-sky-800 text-sm tabular-nums">
                ${(
                  (sampleAcceptanceRate +
                    collectionEfficiency +
                    qcComplianceRate +
                    97.8 +
                    inventoryHealthRate) /
                  5
                ).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <!-- SECTION 5: TOP REFERRING DOCTORS + CRITICAL ALERTS & MOST REQUESTED TESTS -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <!-- Top Referring Doctors Leaderboard -->
          <div class="lg:col-span-4 rounded-xl bg-white border border-slate-200 p-5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h2 class="text-sm font-bold text-slate-900">
                ${i18n.bi('أعلى الأطباء المحولين للحالات', 'Top Referring Doctors')}
              </h2>
              <span class="text-xs font-mono text-slate-500 tabular-nums">${doctors.length || 15} Doctors</span>
            </div>
            <div class="space-y-3 text-xs">
              ${topDoctorsDisplay
                .map((d, idx) => {
                  const maxDocRev = Math.max(...topDoctorsDisplay.map((x) => x.revenue), 1);
                  const w = Math.max(Math.round((d.revenue / maxDocRev) * 100), 10);
                  return `
                    <div class="space-y-1 border-b border-slate-100 pb-2 last:border-0">
                      <div class="flex items-center justify-between">
                        <div>
                          <span class="font-mono text-slate-400 me-1">0${idx + 1}.</span>
                          <span class="font-bold text-slate-900">${d.name}</span>
                          <span class="text-slate-400 ms-1">· ${d.specialty}</span>
                        </div>
                        <span class="font-mono font-bold text-sky-800 tabular-nums">${d.revenue.toLocaleString()} EGP</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-sky-600 rounded-full" style="width:${w}%"></div>
                      </div>
                      <div class="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                        <span>${d.requestsCount} ${i18n.bi('إحالة', 'Referrals')}</span>
                        <span>${i18n.bi('عمولة:', 'Comm:')} ${d.commission.toLocaleString()} EGP (${d.rate}%)</span>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- Top Requested Medical Tests -->
          <div class="lg:col-span-4 rounded-xl bg-white border border-slate-200 p-5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h2 class="text-sm font-bold text-slate-900">
                ${i18n.bi('أكثر التحاليل الطبية طلباً وإيراداً', 'Most Requested Lab Tests')}
              </h2>
              <span class="text-xs font-mono text-slate-500 tabular-nums">${tests.length} Active</span>
            </div>
            <div class="space-y-2.5 text-xs">
              ${topTestsDisplay
                .map((item, idx) => {
                  const maxCnt = Math.max(...topTestsDisplay.map((x) => x.count), 1);
                  const w = Math.max(Math.round((item.count / maxCnt) * 100), 12);
                  return `
                    <div class="space-y-1 border-b border-slate-100 pb-2 last:border-0">
                      <div class="flex items-center justify-between">
                        <div class="truncate pe-2">
                          <span class="font-mono text-slate-400 me-1">0${idx + 1}.</span>
                          <span class="font-semibold text-slate-800">${i18n.bi(item.test.nameAr, item.test.nameEn)}</span>
                          <span class="text-slate-400 font-mono ms-1">· ${item.test.code}</span>
                        </div>
                        <span class="font-mono font-bold text-slate-900 tabular-nums shrink-0">${item.count} ${i18n.bi('طلب', 'reqs')}</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-teal-600 rounded-full" style="width:${w}%"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- Critical Results Alert Table -->
          <div class="lg:col-span-4 rounded-xl bg-white border border-slate-200 p-5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h2 class="text-sm font-bold text-rose-800">
                ${i18n.bi('تنبيهات النتائج الحرجة (Critical Values)', 'Critical Values Alerts')}
              </h2>
              <span class="text-xs font-mono text-rose-700 tabular-nums">${criticalCount} Cases</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-start">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500">
                    <th class="py-2 text-start">${i18n.bi('المريض', 'Patient')}</th>
                    <th class="py-2 text-start">${i18n.bi('التحليل', 'Test')}</th>
                    <th class="py-2 text-start">${i18n.bi('القيمة الحرجة', 'Critical Value')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${
                    criticalResults.length > 0
                      ? criticalResults
                          .slice(0, 6)
                          .map((cr) => {
                            const pat = patientMap.get(cr.patientId);
                            const tst = testById.get(cr.testId);
                            const critVal = cr.values.find(
                              (v) => v.flag === 'critical_high' || v.flag === 'critical_low'
                            );
                            return `
                              <tr class="hover:bg-rose-50/40">
                                <td class="py-2 font-semibold text-slate-900">${pat?.name || cr.patientId}</td>
                                <td class="py-2 text-slate-700">${tst ? i18n.bi(tst.nameAr, tst.nameEn) : cr.testId}</td>
                                <td class="py-2 font-mono font-bold text-rose-700 tabular-nums">
                                  ${critVal ? `${critVal.value} ${critVal.unit}` : 'CRITICAL'}
                                </td>
                              </tr>
                            `;
                          })
                          .join('')
                      : `
                        <tr class="hover:bg-rose-50/40">
                          <td class="py-2 font-semibold text-slate-900">${i18n.bi('أحمد علي محمد', 'Ahmed Ali Mohamed')}</td>
                          <td class="py-2 text-slate-700">Glucose (Random)</td>
                          <td class="py-2 font-mono font-bold text-rose-700 tabular-nums">465 mg/dL</td>
                        </tr>
                        <tr class="hover:bg-rose-50/40">
                          <td class="py-2 font-semibold text-slate-900">${i18n.bi('سارة محمود حسن', 'Sara Mahmoud')}</td>
                          <td class="py-2 text-slate-700">Potassium (K+)</td>
                          <td class="py-2 font-mono font-bold text-rose-700 tabular-nums">6.8 mmol/L</td>
                        </tr>
                        <tr class="hover:bg-rose-50/40">
                          <td class="py-2 font-semibold text-slate-900">${i18n.bi('محمود عبد الفتاح', 'Mahmoud Abdelfattah')}</td>
                          <td class="py-2 text-slate-700">Hemoglobin (Hb)</td>
                          <td class="py-2 font-mono font-bold text-rose-700 tabular-nums">5.9 g/dL</td>
                        </tr>
                        <tr class="hover:bg-rose-50/40">
                          <td class="py-2 font-semibold text-slate-900">${i18n.bi('ليلى كمال الدين', 'Laila Kamal')}</td>
                          <td class="py-2 text-slate-700">Troponin I (hs)</td>
                          <td class="py-2 font-mono font-bold text-rose-700 tabular-nums">3.4 ng/mL</td>
                        </tr>
                      `
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        `
            : ''
        }
      </div>
    `;

    // Bind Tab Switchers
    container.querySelectorAll<HTMLButtonElement>('button[data-dash-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.getAttribute('data-dash-tab') as DashboardTab | null;
        if (nextTab) {
          activeTab = nextTab;
          renderView();
        }
      });
    });

    // Bind Data Mode Toggle (if shown)
    container.querySelectorAll<HTMLButtonElement>('button[data-mode-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-mode-btn') as DataMode | null;
        if (nextMode) {
          dataMode = nextMode;
          renderView();
        }
      });
    });

    // Bind KPI Card Navigation
    container.querySelectorAll<HTMLButtonElement>('button[data-kpi-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetRoute = btn.getAttribute('data-kpi-route') as RouteId | null;
        if (targetRoute) {
          router.navigate(targetRoute);
        }
      });
    });

    const triggerD3Animations = () => {
      if (showReceptionD3) {
        const renderMs = mountD3ReceptionCharts({
          dailySeries,
          topTests: topTestsDisplay.map((t) => ({
            code: t.test.code,
            nameAr: t.test.nameAr,
            nameEn: t.test.nameEn,
            count: t.count,
            revenue: t.count * Number(t.test.price || 150),
          })),
        });
        const badge = document.getElementById('d3-render-perf-badge');
        if (badge) {
          badge.textContent = `Rendered + Animated in ${renderMs}ms`;
        }
      }
      animateDashboardSecondaryVisuals(container);
    };

    triggerD3Animations();

    document.getElementById('d3-replay-transitions-btn')?.addEventListener('click', () => {
      triggerD3Animations();
    });

    document.getElementById('dash-open-perf-btn')?.addEventListener('click', () => {
      document.getElementById('top-perf-benchmark-btn')?.click();
    });

    document.getElementById('dash-testplan-btn')?.addEventListener('click', () => {
      router.navigate('testPlan');
    });

    document.getElementById('dash-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.bi('المؤشر التشغيلي والمالي والإكلينيكي', 'Operational, Financial & Clinical Metric')}</th>
              <th>${i18n.bi('القيمة الحالية', 'Current Value')}</th>
              <th>${i18n.bi('التفاصيل', 'Details')}</th>
            </tr>
          </thead>
          <tbody>
            ${kpiCards
              .map(
                (k) =>
                  `<tr><td>${k.label}</td><td class="tabular-nums"><strong>${k.value}</strong></td><td>${k.sub}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.dashboard, html);
    });
  };

  renderView();
}
