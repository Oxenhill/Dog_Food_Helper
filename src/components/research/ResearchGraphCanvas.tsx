'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import { ResearchGraph, ResearchGraphEdge, ResearchGraphNodeKind } from '@/lib/researchGraphReadModel';
import {
  GroupByMode,
  LABEL_PRIORITY,
  LayoutEdge,
  LayoutNode,
  RADIUS_BY_KIND,
  buildLayoutEdges,
  buildLayoutNodes,
  edgeStroke,
  formatConcept,
  groupKeyFor,
  hashAngle,
  truncateLabel,
} from '@/lib/researchGraphLayout';

interface SimNode extends LayoutNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const EMPTY_GRAPH: ResearchGraph = { nodes: [], edges: [] };

const KIND_LABEL: Record<ResearchGraphNodeKind, string> = {
  document: 'Document',
  claim: 'Claim',
  cluster: 'Cluster',
  concept: 'Concept',
  context: 'Dog-profile context',
  event: 'Lifecycle event',
};

const DEFAULT_ACTIVE_KINDS: Record<ResearchGraphNodeKind, boolean> = {
  document: true,
  claim: true,
  cluster: true,
  event: true,
  concept: false,
  context: false,
};

const LANES: Record<ResearchGraphNodeKind, number> = {
  document: -130,
  cluster: -45,
  claim: 40,
  concept: 40,
  context: 40,
  event: 125,
};

const MAX_SPEED = 11;

function canvasLabelFor(n: SimNode): string {
  const max = n.kind === 'claim' ? 30 : n.kind === 'cluster' ? 34 : n.kind === 'event' ? 30 : 34;
  return truncateLabel(n.label || n.id, max);
}

export default function ResearchGraphCanvas() {
  const [graph, setGraph] = useState<ResearchGraph>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState<'force' | 'timeline'>('force');
  const [groupBy, setGroupBy] = useState<GroupByMode>('concept');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeKinds, setActiveKinds] = useState<Record<ResearchGraphNodeKind, boolean>>(DEFAULT_ACTIVE_KINDS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentWrapRef = useRef<HTMLDivElement | null>(null);

  const liveRef = useRef({ mode, groupBy, searchTerm: searchTerm.trim().toLowerCase(), activeKinds, selectedId });
  useEffect(() => {
    liveRef.current = { mode, groupBy, searchTerm: searchTerm.trim().toLowerCase(), activeKinds, selectedId };
  });

  const simRef = useRef<{
    nodes: SimNode[];
    edges: LayoutEdge[];
    byId: Map<string, SimNode>;
    alpha: number;
    scale: number;
    panX: number;
    panY: number;
    W: number;
    H: number;
    dragNode: SimNode | null;
    panning: boolean;
    lastX: number;
    lastY: number;
  }>({
    nodes: [],
    edges: [],
    byId: new Map(),
    alpha: 1,
    scale: 1,
    panX: 0,
    panY: 0,
    W: 800,
    H: 560,
    dragNode: null,
    panning: false,
    lastX: 0,
    lastY: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/research/graph', { headers: sessionAuthHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load the evidence graph');
      setGraph(body as ResearchGraph);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the evidence graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reheat = useCallback(() => {
    simRef.current.alpha = 1;
  }, []);

  // Rebuild the simulation whenever fresh graph data arrives. Positions seed
  // deterministically by concept so re-fetches don't reshuffle the picture.
  useEffect(() => {
    const layoutNodes = buildLayoutNodes(graph);
    const layoutEdges = buildLayoutEdges(graph);
    const byId = new Map<string, SimNode>();
    const simNodes: SimNode[] = layoutNodes.map((n) => {
      const angle = hashAngle(n.concept || n.kind) + (Math.random() - 0.5) * 0.5;
      const radius = 190 + Math.random() * 90;
      const sim: SimNode = { ...n, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
      byId.set(n.id, sim);
      return sim;
    });
    simRef.current.nodes = simNodes;
    simRef.current.edges = layoutEdges;
    simRef.current.byId = byId;
    simRef.current.alpha = 1;
  }, [graph]);

  function visible(n: SimNode): boolean {
    return liveRef.current.activeKinds[n.kind];
  }
  function matchesSearch(n: SimNode): boolean {
    const term = liveRef.current.searchTerm;
    return !term || n.label.toLowerCase().includes(term);
  }

  const yearToX = useCallback((year: number, W: number) => {
    const minY = 2018;
    const maxY = new Date().getFullYear() + 1;
    const pad = 70;
    return pad + ((year - minY) / (maxY - minY)) * (W - pad * 2) - W / 2;
  }, []);

  // ---- animation loop -----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hatchCanvas = document.createElement('canvas');
    hatchCanvas.width = 10;
    hatchCanvas.height = 10;
    const hctx = hatchCanvas.getContext('2d')!;
    hctx.fillStyle = '#FBEAE7';
    hctx.fillRect(0, 0, 10, 10);
    hctx.strokeStyle = '#B42318';
    hctx.lineWidth = 2;
    hctx.beginPath();
    hctx.moveTo(0, 10);
    hctx.lineTo(10, 0);
    hctx.moveTo(-2, 4);
    hctx.lineTo(4, -2);
    hctx.moveTo(6, 12);
    hctx.lineTo(12, 6);
    hctx.stroke();
    const hatchPattern = ctx.createPattern(hatchCanvas, 'repeat')!;

    function fillFor(status: SimNode['status']): string | CanvasPattern {
      return status === 'tombstoned' ? hatchPattern : '#1E4D45';
    }
    function strokeFor(status: SimNode['status']): string {
      return status === 'tombstoned' ? '#B42318' : '#163A34';
    }
    function radiusFor(kind: ResearchGraphNodeKind): number {
      return RADIUS_BY_KIND[kind];
    }

    function resize() {
      const wrap = wrapRef.current;
      if (!wrap || !canvas) return;
      const w = wrap.clientWidth || 800;
      canvas.width = w;
      canvas.height = canvas.clientHeight || 560;
      simRef.current.W = w;
      simRef.current.H = canvas.height;
    }
    resize();

    function toScreen(x: number, y: number) {
      const s = simRef.current;
      return { x: s.W / 2 + (x + s.panX) * s.scale, y: s.H / 2 + (y + s.panY) * s.scale };
    }
    function toWorld(sx: number, sy: number) {
      const s = simRef.current;
      return { x: (sx - s.W / 2) / s.scale - s.panX, y: (sy - s.H / 2) / s.scale - s.panY };
    }

    function clampSpeed(n: SimNode) {
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > MAX_SPEED) {
        n.vx = (n.vx / sp) * MAX_SPEED;
        n.vy = (n.vy / sp) * MAX_SPEED;
      }
    }

    function tick() {
      const s = simRef.current;
      const active = s.nodes.filter(visible);
      const alpha = s.alpha;
      const mode = liveRef.current.mode;
      const groupBy = liveRef.current.groupBy;

      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const n1 = active[i];
          const n2 = active[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minD = radiusFor(n1.kind) + radiusFor(n2.kind) + 34;
          if (dist < minD) {
            const push = (minD - dist) * 0.05;
            const fx = (dx / dist) * push;
            const fy = (dy / dist) * push;
            n1.vx += fx; n1.vy += fy; n2.vx -= fx; n2.vy -= fy;
          }
        }
      }

      if (alpha > 0.005) {
        if (mode === 'force') {
          for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
              const n1 = active[i];
              const n2 = active[j];
              const dx = n1.x - n2.x;
              const dy = n1.y - n2.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
              if (dist < 340 && dist >= radiusFor(n1.kind) + radiusFor(n2.kind) + 34) {
                const force = (520 / (dist * dist)) * alpha;
                const rfx = (dx / dist) * force;
                const rfy = (dy / dist) * force;
                n1.vx += rfx; n1.vy += rfy; n2.vx -= rfx; n2.vy -= rfy;
              }
            }
          }
          s.edges.forEach((e) => {
            const a = s.byId.get(e.from);
            const b = s.byId.get(e.to);
            if (!a || !b || !visible(a) || !visible(b)) return;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const ideal = e.type === 'MEMBER_OF' ? 115 : 100;
            const f = (dist - ideal) * 0.012 * alpha;
            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;
            a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
          });
          if (groupBy !== 'none') {
            const centroids = new Map<string, { x: number; y: number; c: number }>();
            active.forEach((n) => {
              const key = groupKeyFor(n, groupBy);
              if (!key) return;
              const c = centroids.get(key) ?? { x: 0, y: 0, c: 0 };
              c.x += n.x; c.y += n.y; c.c += 1;
              centroids.set(key, c);
            });
            centroids.forEach((c) => { c.x /= c.c; c.y /= c.c; });
            active.forEach((n) => {
              const key = groupKeyFor(n, groupBy);
              if (!key) return;
              const c = centroids.get(key)!;
              n.vx += (c.x - n.x) * 0.006 * alpha;
              n.vy += (c.y - n.y) * 0.006 * alpha;
            });
          }
          active.forEach((n) => { n.vx += (0 - n.x) * 0.0009 * alpha; n.vy += (0 - n.y) * 0.0009 * alpha; });
        } else {
          active.forEach((n) => {
            if (n.year !== null) {
              const tx = yearToX(n.year, s.W);
              n.vx += (tx - n.x) * 0.16 * alpha;
            }
            const ty = LANES[n.kind] || 0;
            n.vy += (ty - n.y) * 0.08 * alpha;
          });
        }
      }

      active.forEach((n) => {
        clampSpeed(n);
        if (n === s.dragNode) { n.vx = 0; n.vy = 0; return; }
        n.vx *= 0.72; n.vy *= 0.72;
        n.x += n.vx; n.y += n.vy;
      });

      s.alpha = Math.max(0, s.alpha * 0.985);
    }

    function drawShape(kind: ResearchGraphNodeKind, sx: number, sy: number, r: number, fill: string | CanvasPattern, stroke: string) {
      ctx!.beginPath();
      if (kind === 'document') {
        ctx!.rect(sx - r, sy - r, r * 2, r * 2);
      } else if (kind === 'cluster') {
        ctx!.moveTo(sx, sy - r * 1.15); ctx!.lineTo(sx + r * 1.15, sy); ctx!.lineTo(sx, sy + r * 1.15); ctx!.lineTo(sx - r * 1.15, sy); ctx!.closePath();
      } else if (kind === 'event') {
        for (let k = 0; k < 8; k++) {
          const ang = (k * Math.PI) / 4;
          const rr = k % 2 === 0 ? r * 1.2 : r * 0.5;
          const px = sx + Math.cos(ang) * rr;
          const py = sy + Math.sin(ang) * rr;
          if (k === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
        }
        ctx!.closePath();
      } else if (kind === 'context') {
        ctx!.moveTo(sx, sy - r); ctx!.lineTo(sx + r, sy + r); ctx!.lineTo(sx - r, sy + r); ctx!.closePath();
      } else if (kind === 'concept') {
        for (let k = 0; k < 6; k++) {
          const ang = (k * Math.PI) / 3;
          const px = sx + Math.cos(ang) * r;
          const py = sy + Math.sin(ang) * r;
          if (k === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
        }
        ctx!.closePath();
      } else {
        ctx!.arc(sx, sy, r, 0, Math.PI * 2);
      }
      ctx!.fillStyle = fill;
      ctx!.fill();
      ctx!.lineWidth = 1.6;
      ctx!.strokeStyle = stroke;
      ctx!.stroke();
    }

    function drawArrow(sa: { x: number; y: number }, sb: { x: number; y: number }, toRadius: number, color: string) {
      const dx = sb.x - sa.x;
      const dy = sb.y - sa.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const tipX = sb.x - ux * (toRadius + 3);
      const tipY = sb.y - uy * (toRadius + 3);
      const backX = tipX - ux * 7;
      const backY = tipY - uy * 7;
      const perpX = -uy * 3;
      const perpY = ux * 3;
      ctx!.beginPath();
      ctx!.moveTo(tipX, tipY);
      ctx!.lineTo(backX + perpX, backY + perpY);
      ctx!.lineTo(backX - perpX, backY - perpY);
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();
    }

    let occupied: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    function overlapsOccupied(r: { x0: number; y0: number; x1: number; y1: number }) {
      return occupied.some((o) => !(r.x1 < o.x0 || r.x0 > o.x1 || r.y1 < o.y0 || r.y0 > o.y1));
    }
    function drawLabel(n: SimNode, sx: number, sy: number, r: number) {
      const text = canvasLabelFor(n);
      ctx!.font = `${n.kind === 'document' || n.kind === 'cluster' ? '600 ' : ''}11px -apple-system, "Segoe UI", system-ui, sans-serif`;
      const tw = ctx!.measureText(text).width;
      const lx = sx;
      const ly = sy + r + 13;
      const rect = { x0: lx - tw / 2 - 4, y0: ly - 10, x1: lx + tw / 2 + 4, y1: ly + 4 };
      if (overlapsOccupied(rect)) return;
      occupied.push(rect);
      ctx!.fillStyle = 'rgba(244,243,238,0.9)';
      ctx!.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
      ctx!.fillStyle = '#23221F';
      ctx!.textAlign = 'center';
      ctx!.fillText(text, lx, ly);
    }
    function drawGroupCaption(text: string, sx: number, sy: number) {
      ctx!.font = '10px ui-monospace, monospace';
      const tw = ctx!.measureText(text).width;
      const rect = { x0: sx - tw / 2 - 4, y0: sy - 9, x1: sx + tw / 2 + 4, y1: sy + 4 };
      if (overlapsOccupied(rect)) return;
      occupied.push(rect);
      ctx!.fillStyle = '#6A685F';
      ctx!.textAlign = 'center';
      ctx!.fillText(text, sx, sy);
    }

    function edgeConnects(idA: string, idB: string) {
      return simRef.current.edges.some((e) => (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
    }

    function render() {
      const s = simRef.current;
      ctx!.clearRect(0, 0, s.W, s.H);
      ctx!.save();
      occupied = [];

      const selectedId = liveRef.current.selectedId;
      const groupBy = liveRef.current.groupBy;
      const mode = liveRef.current.mode;
      const visNodes = s.nodes.filter(visible);

      const pendingCaptions: Array<{ text: string; x: number; y: number }> = [];
      if (mode === 'force' && groupBy !== 'none') {
        const groups = new Map<string, SimNode[]>();
        visNodes.forEach((n) => {
          const key = groupKeyFor(n, groupBy);
          if (!key) return;
          const arr = groups.get(key) ?? [];
          arr.push(n);
          groups.set(key, arr);
        });
        const capR = (Math.min(s.W, s.H) * 0.4) / s.scale;
        groups.forEach((members, key) => {
          if (members.length < 2) return;
          let cx = 0, cy = 0;
          members.forEach((n) => { cx += n.x; cy += n.y; });
          cx /= members.length; cy /= members.length;
          let sumD = 0;
          members.forEach((n) => { sumD += Math.hypot(n.x - cx, n.y - cy); });
          const avgR = Math.min(sumD / members.length + 24, capR);
          const sc = toScreen(cx, cy);
          const screenR = avgR * s.scale;
          ctx!.save();
          ctx!.strokeStyle = 'rgba(106,104,95,0.28)';
          ctx!.setLineDash([4, 4]);
          ctx!.lineWidth = 1.2;
          ctx!.beginPath();
          ctx!.arc(sc.x, sc.y, screenR, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.restore();
          const type = key.slice(0, key.indexOf(':'));
          const value = key.slice(key.indexOf(':') + 1);
          const text = type === 'concept' ? formatConcept(value) : type === 'sf' ? 'Same study family' : (s.byId.get(value)?.label ?? value);
          pendingCaptions.push({ text: text.toUpperCase(), x: sc.x, y: Math.max(16, sc.y - screenR - 8) });
        });
      }

      if (mode === 'timeline') {
        ctx!.strokeStyle = '#D6D2C6';
        ctx!.lineWidth = 1;
        const maxYear = new Date().getFullYear() + 1;
        for (let yr = 2018; yr <= maxYear; yr++) {
          const sx = toScreen(yearToX(yr, s.W), 0).x;
          ctx!.beginPath(); ctx!.moveTo(sx, 20); ctx!.lineTo(sx, s.H - 24); ctx!.stroke();
          ctx!.font = '10.5px ui-monospace, monospace'; ctx!.fillStyle = '#94918B'; ctx!.textAlign = 'center';
          ctx!.fillText(String(yr), sx, s.H - 10);
        }
        (['document', 'claim', 'cluster', 'event'] as ResearchGraphNodeKind[]).forEach((k) => {
          ctx!.font = '10px ui-monospace, monospace'; ctx!.fillStyle = '#94918B'; ctx!.textAlign = 'left';
          ctx!.fillText(`${k.toUpperCase()}S`, 12, toScreen(0, LANES[k]).y - 10);
        });
      }

      s.edges.forEach((e) => {
        const a = s.byId.get(e.from);
        const b = s.byId.get(e.to);
        if (!a || !b || !visible(a) || !visible(b)) return;
        const connectedToSelection = selectedId !== null && (a.id === selectedId || b.id === selectedId);
        const dim = selectedId !== null && !connectedToSelection;
        const sa = toScreen(a.x, a.y);
        const sb = toScreen(b.x, b.y);
        const es = edgeStroke(e.type);
        ctx!.save();
        ctx!.globalAlpha = dim ? 0.12 : connectedToSelection ? 1 : 0.75;
        ctx!.strokeStyle = es.color; ctx!.setLineDash(es.dash); ctx!.lineWidth = connectedToSelection ? 2.4 : 1.5;
        ctx!.beginPath(); ctx!.moveTo(sa.x, sa.y); ctx!.lineTo(sb.x, sb.y); ctx!.stroke();
        ctx!.setLineDash([]);
        drawArrow(sa, sb, RADIUS_BY_KIND[b.kind] * s.scale, es.color);
        ctx!.restore();
      });

      visNodes.forEach((n) => {
        const sc = toScreen(n.x, n.y);
        const dim = (liveRef.current.searchTerm && !matchesSearch(n)) || (selectedId !== null && selectedId !== n.id && !edgeConnects(selectedId, n.id));
        ctx!.save();
        ctx!.globalAlpha = dim ? 0.22 : 1;
        if (selectedId === n.id) {
          ctx!.beginPath(); ctx!.arc(sc.x, sc.y, (RADIUS_BY_KIND[n.kind] + 6) * s.scale, 0, Math.PI * 2);
          ctx!.strokeStyle = '#1E4D45'; ctx!.lineWidth = 2; ctx!.stroke();
        }
        drawShape(n.kind, sc.x, sc.y, RADIUS_BY_KIND[n.kind] * s.scale, fillFor(n.status), strokeFor(n.status));
        ctx!.restore();
      });

      const labelOrder = visNodes.slice().sort((x, y) => {
        const px = x.id === selectedId ? -1 : LABEL_PRIORITY[x.kind];
        const py = y.id === selectedId ? -1 : LABEL_PRIORITY[y.kind];
        return px - py;
      });
      labelOrder.forEach((n) => {
        const sc = toScreen(n.x, n.y);
        const dim = (liveRef.current.searchTerm && !matchesSearch(n)) || (selectedId !== null && selectedId !== n.id && !edgeConnects(selectedId, n.id));
        ctx!.save();
        ctx!.globalAlpha = dim ? 0.35 : 1;
        drawLabel(n, sc.x, sc.y, RADIUS_BY_KIND[n.kind] * s.scale);
        ctx!.restore();
      });

      pendingCaptions.forEach((c) => drawGroupCaption(c.text, c.x, c.y));
      ctx!.restore();
    }

    function loop() {
      tick();
      render();
      raf = requestAnimationFrame(loop);
    }

    function fitToView() {
      const s = simRef.current;
      const vis = s.nodes.filter(visible);
      if (!vis.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      vis.forEach((n) => {
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      });
      const w = Math.max(maxX - minX, 60);
      const h = Math.max(maxY - minY, 60);
      const pad = 90;
      const fit = Math.min((s.W - pad * 2) / w, (s.H - pad * 2) / h);
      s.scale = Math.min(1.6, Math.max(0.4, fit));
      s.panX = -(minX + maxX) / 2;
      s.panY = -(minY + maxY) / 2;
    }
    (window as unknown as { __researchGraphFit?: () => void }).__researchGraphFit = fitToView;
    (window as unknown as { __researchGraphReheat?: () => void }).__researchGraphReheat = reheat;
    (window as unknown as { __researchGraphResize?: () => void }).__researchGraphResize = () => { resize(); fitToView(); };

    function nodeAt(sx: number, sy: number): SimNode | null {
      let best: SimNode | null = null;
      let bestD = 999;
      simRef.current.nodes.filter(visible).forEach((n) => {
        const sc = toScreen(n.x, n.y);
        const d = Math.hypot(sc.x - sx, sc.y - sy);
        const r = RADIUS_BY_KIND[n.kind] * simRef.current.scale + 6;
        if (d < r && d < bestD) { bestD = d; best = n; }
      });
      return best;
    }

    function onMouseDown(ev: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const n = nodeAt(sx, sy);
      if (n && liveRef.current.mode === 'force') {
        simRef.current.dragNode = n;
        canvas!.classList.add('cursor-grabbing');
        reheat();
      } else {
        simRef.current.panning = true;
        simRef.current.lastX = sx;
        simRef.current.lastY = sy;
      }
    }
    function onMouseMove(ev: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const s = simRef.current;
      if (s.dragNode) {
        const w = toWorld(sx, sy);
        s.dragNode.x = w.x; s.dragNode.y = w.y;
      } else if (s.panning) {
        s.panX += (sx - s.lastX) / s.scale;
        s.panY += (sy - s.lastY) / s.scale;
        s.lastX = sx; s.lastY = sy;
      }
    }
    function onMouseUp() {
      if (simRef.current.dragNode) reheat();
      simRef.current.dragNode = null;
      simRef.current.panning = false;
    }
    function onClick(ev: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const n = nodeAt(sx, sy);
      setSelectedId(n ? n.id : null);
    }
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const s = simRef.current;
      s.scale = Math.min(2.4, Math.max(0.45, s.scale * (ev.deltaY < 0 ? 1.08 : 0.92)));
    }
    function onResize() { resize(); }

    let raf = 0;
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    fitToView();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
    // Intentionally mount-once: interactive state is read from liveRef so the
    // animation loop always sees the latest values without needing to
    // restart on every keystroke/toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, reheat, yearToX]);

  const discoveredConcepts = useMemo(() => {
    const seen = new Set<string>();
    buildLayoutNodes(graph).forEach((n) => { if (n.concept) seen.add(n.concept); });
    return Array.from(seen).sort();
  }, [graph]);

  const selectedNode = selectedId ? simRef.current.byId.get(selectedId) ?? null : null;
  const connectedEdges: ResearchGraphEdge[] = useMemo(() => {
    if (!selectedId) return [];
    return graph.edges.filter((e) => e.from === selectedId || e.to === selectedId);
  }, [graph.edges, selectedId]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  function toggleKind(kind: ResearchGraphNodeKind) {
    setActiveKinds((current) => ({ ...current, [kind]: !current[kind] }));
    (window as unknown as { __researchGraphReheat?: () => void }).__researchGraphReheat?.();
    (window as unknown as { __researchGraphFit?: () => void }).__researchGraphFit?.();
  }
  function setLayoutMode(next: 'force' | 'timeline') {
    setMode(next);
    (window as unknown as { __researchGraphReheat?: () => void }).__researchGraphReheat?.();
    setTimeout(() => (window as unknown as { __researchGraphFit?: () => void }).__researchGraphFit?.(), 30);
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="eyebrow">Spatial companion to Evidence explorer</p>
        <h2 className="section-title mt-1">Graph canvas</h2>
        <p className="help-text mt-2 max-w-3xl">
          Same active, human-reviewed nodes and edges as Evidence explorer, laid out to show how the
          corpus groups by topic and study family, and how it accumulates over time. Topics are
          discovered from each claim&apos;s existing subject → outcome pair, not a maintained list.
          Position and grouping are topical/temporal signals only — never evidence strength. Labels
          thin out automatically when crowded; zoom in to reveal more.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {loading && !graph.nodes.length && <p className="help-text">Loading evidence graph…</p>}
      {!loading && !error && graph.nodes.length === 0 && (
        <div className="rounded border border-line bg-paper p-4">
          <p className="font-semibold">No active reviewed evidence yet</p>
          <p className="help-text mt-1">This is expected before the first cluster is approved on the review queue.</p>
        </div>
      )}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: '196px 1fr' }}>
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Layout</span>
            <div className="flex overflow-hidden rounded border border-line-strong">
              <button
                type="button"
                className={`flex-1 border-0 px-2 py-1.5 text-[12px] font-semibold ${mode === 'force' ? 'bg-pine text-white' : 'bg-surface text-ink-soft'}`}
                onClick={() => setLayoutMode('force')}
              >
                Force
              </button>
              <button
                type="button"
                className={`flex-1 border-0 border-l border-line-strong px-2 py-1.5 text-[12px] font-semibold ${mode === 'timeline' ? 'bg-pine text-white' : 'bg-surface text-ink-soft'}`}
                onClick={() => setLayoutMode('timeline')}
              >
                Timeline
              </button>
            </div>
          </div>

          <label className="field">
            <span className="label">Group by</span>
            <select
              className="select"
              value={groupBy}
              onChange={(event) => { setGroupBy(event.target.value as GroupByMode); reheat(); }}
            >
              <option value="none">None</option>
              <option value="concept">Topic</option>
              <option value="studyFamily">Study family</option>
              <option value="cluster">Cluster</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Search</span>
            <input className="input" placeholder="Find a node…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>

          <div className="flex flex-col gap-1">
            <span className="eyebrow">Show kinds</span>
            {(Object.keys(KIND_LABEL) as ResearchGraphNodeKind[]).map((kind) => (
              <label key={kind} className="flex items-center gap-1.5 py-0.5 text-[12.5px]">
                <input type="checkbox" checked={activeKinds[kind]} onChange={() => toggleKind(kind)} />
                {KIND_LABEL[kind]}
              </label>
            ))}
          </div>

          <div className="flex gap-1.5">
            <button type="button" className="btn-secondary btn-sm flex-1" onClick={() => { simRef.current.scale = Math.max(0.45, simRef.current.scale / 1.2); }}>−</button>
            <button type="button" className="btn-secondary btn-sm flex-1" onClick={() => (window as unknown as { __researchGraphFit?: () => void }).__researchGraphFit?.()}>Fit</button>
            <button type="button" className="btn-secondary btn-sm flex-1" onClick={() => { simRef.current.scale = Math.min(2.4, simRef.current.scale * 1.2); }}>+</button>
          </div>

          <p className="help-text">
            {discoveredConcepts.length} topic{discoveredConcepts.length === 1 ? '' : 's'} discovered ·{' '}
            {graph.nodes.length} nodes · {graph.edges.length} relations.
          </p>
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Topics in view <span className="normal-case tracking-normal">(auto-discovered)</span></span>
            <div className="flex flex-wrap gap-1">
              {discoveredConcepts.map((c) => (
                <span key={c} className="rounded-full border border-dashed border-line-strong px-2 py-0.5 font-mono text-[11px] text-ink-soft">
                  {formatConcept(c)}
                </span>
              ))}
            </div>
            <p className="help-text">Not a configured list — every distinct subject → outcome pair already active becomes its own group here.</p>
          </div>
        </div>

        <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-line bg-surface shadow-card" style={{ height: 'calc(100vh - 200px)', minHeight: 560, maxHeight: 900 }}>
          <canvas ref={canvasRef} className="block h-full w-full cursor-grab" style={{ touchAction: 'none' }} />
          <div className="pointer-events-none absolute bottom-2.5 left-3 max-w-[56%] rounded border border-line bg-paper/90 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-soft">
            Position = topic / study-family / time grouping only. Fill = review status. Line style = relation category. Never corroboration by proximity.
          </div>

          <div ref={contentWrapRef} className="absolute right-3 top-3 max-h-[calc(100%-24px)] w-[280px] max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-line bg-surface/95 p-4 shadow-raised backdrop-blur-sm">
            {!selectedNode ? (
              <>
                <p className="eyebrow">Select a node</p>
                <p className="help-text mt-2">
                  Click any document, claim, cluster, or lifecycle-event marker for its quote, status, and connections — the same provenance rules as Evidence explorer, reached spatially.
                </p>
                <div className="mt-3.5 flex flex-col gap-1.5 text-[12px]">
                  <div className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-pine" />Active / reviewed</div>
                  <div className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-alarm bg-alarm-tint" />Retracted / tombstoned</div>
                  <div className="mt-1.5 flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-pine" />Reviewed relation</div>
                  <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-gold" />Same study family (auto)</div>
                  <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dotted border-alarm" />Supersedes / retracted by</div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="eyebrow">
                    {KIND_LABEL[selectedNode.kind]}
                    {selectedNode.status === 'tombstoned' ? ' — retracted/tombstoned' : ''}
                  </p>
                  <h3 className="mt-1 font-semibold text-ink">{selectedNode.label}</h3>
                  {typeof selectedNode.raw.supporting_quote === 'string' && (
                    <p className="mt-2 font-mono text-[12.5px] leading-relaxed">&ldquo;{String(selectedNode.raw.supporting_quote)}&rdquo;</p>
                  )}
                  {typeof selectedNode.raw.cautious_summary === 'string' && (
                    <p className="mt-2 text-[13px] leading-relaxed text-ink">{String(selectedNode.raw.cautious_summary)}</p>
                  )}
                  {selectedNode.concept && (
                    <span className="badge-neutral mt-2 inline-block">{formatConcept(selectedNode.concept)}</span>
                  )}
                </div>
                <div>
                  <p className="eyebrow">Connections ({connectedEdges.length})</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {connectedEdges.map((edge) => {
                      const otherId = edge.from === selectedId ? edge.to : edge.from;
                      const other = nodeById.get(otherId);
                      return (
                        <div key={edge.id} className="rounded border border-line bg-paper p-2 text-[12px]">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="badge-pine">{edge.edge_type.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="help-text mt-1">{other ? `${KIND_LABEL[other.kind]}: ${other.label}` : otherId}</p>
                          {edge.edge_type === 'SAME_STUDY_FAMILY' ? (
                            <p className="mt-1 text-[11.5px] text-ink-soft">Automatically matched, not human-reviewed.</p>
                          ) : edge.quote_unresolved ? (
                            <p className="error-text mt-1">No literal quote currently resolves for this edge.</p>
                          ) : (
                            edge.quotes.slice(0, 1).map((q) => (
                              <blockquote key={q.claim_id} className="mt-1 border-l-2 border-pine bg-pine-tint/40 px-2 py-1 font-mono text-[11.5px] leading-relaxed">
                                &ldquo;{q.quote}&rdquo;
                              </blockquote>
                            ))
                          )}
                        </div>
                      );
                    })}
                    {connectedEdges.length === 0 && <p className="help-text">This node has no displayed edges.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
