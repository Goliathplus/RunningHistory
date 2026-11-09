import { memo, useEffect, useRef } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import { CanvasTexture, MeshPhongMaterial, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import type { Topology } from 'topojson-specification';
import { displayName, geometryOf, pickRow, type Dataset, type Row } from '../lib/data';
import { MapTexture } from '../lib/mapTexture';
import type { Lang } from '../lib/years';
import type { Battle } from '../lib/battles';

export interface HoverInfo { row: Row; x: number; y: number }

export interface BattleDot { battle: Battle; lat: number; lng: number; color: string; radius: number }
export interface BattleArc { startLat: number; startLng: number; endLat: number; endLng: number }
export interface BattleView {
  dots: BattleDot[];
  selected: Battle | null;
  preview: Battle | null;
  arcs: BattleArc[];
  sides: { row: Row; side: 'a' | 'b' }[];
  sequenceLabel: string | null;
}

interface Props {
  ds: Dataset;
  land: Topology;
  lang: Lang;
  active: Row[];
  selected: Row | null;
  battleView: BattleView;
  battleFocus: { battle: Battle; nonce: number } | null;
  autoRotate: boolean;
  focusRequest: { row: Row; nonce: number } | null;
  resetRequest: number;
  onSelect: (row: Row | null) => void;
  onSelectBattle: (battle: Battle) => void;
  onHoverBattle: (q: string | null) => void;
  onHover: (info: HoverInfo | null) => void;
  onReady: () => void;
}

interface LabelDatum { lat: number; lng: number; text: string; className?: string }
interface PolygonDatum { geometry: object; kind: 'selected' | 'a' | 'b' }

const MIN_REDRAW_MS = 110;
const INITIAL_POV = { lat: 28, lng: 44, altitude: 2.1 };
const GLOBE_RADIUS = 100;
const POLYGON_STYLE = {
  selected: { cap: 'rgba(255, 214, 130, 0.32)', side: 'rgba(255, 214, 130, 0.5)', stroke: '#ffe2a8', altitude: 0.012 },
  a: { cap: 'rgba(92, 200, 230, 0.42)', side: 'rgba(92, 200, 230, 0.55)', stroke: '#b8ecfa', altitude: 0.007 },
  b: { cap: 'rgba(240, 130, 96, 0.42)', side: 'rgba(240, 130, 96, 0.55)', stroke: '#fbc9b6', altitude: 0.007 },
};

function arcMidpoint(arc: BattleArc): { lat: number; lng: number } {
  const toVec = (lat: number, lng: number) => {
    const [p, l] = [(lat * Math.PI) / 180, (lng * Math.PI) / 180];
    return new Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l));
  };
  const m = toVec(arc.startLat, arc.startLng).add(toVec(arc.endLat, arc.endLng)).normalize();
  return { lat: (Math.asin(m.y) * 180) / Math.PI, lng: (Math.atan2(m.z, m.x) * 180) / Math.PI };
}

function chooseLabels(ds: Dataset, active: Row[], altitude: number, lang: Lang): LabelDatum[] {
  const spacing = 11 * altitude;
  const out: LabelDatum[] = [];
  for (const row of [...active].sort((a, b) => b.area - a.area)) {
    const [lng, lat] = geometryOf(ds, row).center;
    const clashes = out.some((l) => {
      const dLng = Math.abs(l.lng - lng) * Math.cos((lat * Math.PI) / 180);
      return Math.abs(l.lat - lat) < spacing * 0.55 && dLng < spacing * 1.25;
    });
    if (clashes) continue;
    out.push({ lat, lng, text: displayName(ds.names[row.n], lang) });
    if (out.length >= 60) break;
  }
  return out;
}

function makeLabel(d: object): HTMLElement {
  const el = document.createElement('div');
  el.className = (d as LabelDatum).className ?? 'globe-label';
  el.textContent = (d as LabelDatum).text;
  return el;
}

function GlobeViewImpl({ ds, land, lang, active, selected, battleView, battleFocus, autoRotate, focusRequest, resetRequest, onSelect, onSelectBattle, onHoverBattle, onHover, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<SVGPathElement>(null);
  const leaderEndRef = useRef<SVGCircleElement>(null);
  const battleViewRef = useRef(battleView);
  const globeRef = useRef<GlobeInstance | null>(null);
  const mapRef = useRef<MapTexture | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const activeRef = useRef(active);
  const langRef = useRef(lang);
  const dirtyRef = useRef(true);
  const altitudeBucket = useRef(-1);
  const handlers = useRef({ onSelect, onHover, onSelectBattle, onHoverBattle });
  handlers.current = { onSelect, onHover, onSelectBattle, onHoverBattle };

  useEffect(() => {
    const host = hostRef.current!;
    const globe = new Globe(host, { animateIn: false })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#7fb4cf')
      .atmosphereAltitude(0.16)
      .showGraticules(true)
      .width(host.clientWidth)
      .height(host.clientHeight)
      .polygonGeoJsonGeometry('geometry')
      .polygonCapColor((d) => POLYGON_STYLE[(d as PolygonDatum).kind].cap)
      .polygonSideColor((d) => POLYGON_STYLE[(d as PolygonDatum).kind].side)
      .polygonStrokeColor((d) => POLYGON_STYLE[(d as PolygonDatum).kind].stroke)
      .polygonAltitude((d) => POLYGON_STYLE[(d as PolygonDatum).kind].altitude)
      .polygonsTransitionDuration(0)
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(0.004)
      .htmlElement(makeLabel)
      .htmlTransitionDuration(0)
      .pointLat('lat')
      .pointLng('lng')
      .pointColor('color')
      .pointRadius('radius')
      .pointAltitude(0.014)
      .pointsTransitionDuration(0)
      .ringColor(() => (t: number) => `rgba(255, 150, 110, ${1 - t})`)
      .ringMaxRadius('radius')
      .ringPropagationSpeed(3)
      .ringRepeatPeriod(800)
      .ringAltitude(0.016)
      .arcColor(() => '#ffd79a')
      .arcDashLength(0.03)
      .arcDashGap(0.022)
      .arcStroke(0.35)
      .arcAltitudeAutoScale(0.25)
      .arcsTransitionDuration(0);
    globeRef.current = globe;

    const renderer = globe.renderer();
    const width = renderer.capabilities.maxTextureSize >= 8192 && (navigator.hardwareConcurrency ?? 4) > 4 ? 8192 : 4096;
    const map = new MapTexture(width, land);
    mapRef.current = map;
    const texture = new CanvasTexture(map.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textureRef.current = texture;
    const material = globe.globeMaterial() as MeshPhongMaterial;
    material.map = texture;
    material.color.set('#ffffff');
    material.shininess = 6;
    material.needsUpdate = true;

    const controls = globe.controls();
    controls.minDistance = 118;
    controls.maxDistance = 720;
    controls.autoRotateSpeed = 0.45;
    controls.enablePan = false;
    globe.pointOfView(INITIAL_POV, 0);

    // 貼圖上傳成本高，依實測繪製時間自適應節流。
    let raf = 0;
    let lastDraw = 0;
    let interval = MIN_REDRAW_MS;
    let notified = false;
    const camera = globe.camera() as PerspectiveCamera;

    // 虛線由面板列連到戰場；戰場轉到背面時改連地球邊緣並變淡，避免穿過地球。
    const updateLeader = () => {
      const path = leaderRef.current!;
      const end = leaderEndRef.current!;
      const view = battleViewRef.current;
      const target = view.preview ?? view.selected;
      const row = target && document.querySelector(`[data-battle="${target.q}"]`);
      if (!target || !row) {
        path.style.display = end.style.display = 'none';
        return;
      }
      const list = row.closest('.battle-list')!.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const x1 = list.right;
      const y1 = Math.min(list.bottom - 8, Math.max(list.top + 8, rowRect.top + rowRect.height / 2));
      const c = globe.getCoords(target.lat, target.lng, 0.014);
      const point = new Vector3(c.x, c.y, c.z);
      const visible = point.clone().normalize().dot(camera.position.clone().sub(point)) > 0;
      let { x: x2, y: y2 } = globe.getScreenCoords(target.lat, target.lng, 0.014);
      if (!visible) {
        const centre = new Vector3(0, 0, 0).project(camera);
        const cx = ((centre.x + 1) / 2) * host.clientWidth;
        const cy = ((1 - centre.y) / 2) * host.clientHeight;
        const angular = Math.asin(GLOBE_RADIUS / camera.position.length());
        const limb = ((host.clientHeight / 2) * Math.tan(angular)) / Math.tan((camera.fov * Math.PI) / 360);
        const scale = limb / (Math.hypot(x2 - cx, y2 - cy) || 1);
        x2 = cx + (x2 - cx) * scale;
        y2 = cy + (y2 - cy) * scale;
      }
      path.style.display = '';
      path.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
      path.style.opacity = visible ? '0.95' : '0.4';
      end.style.display = visible ? '' : 'none';
      end.setAttribute('cx', x2.toFixed(1));
      end.setAttribute('cy', y2.toFixed(1));
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      updateLeader();
      const altitude = globe.pointOfView().altitude;
      const bucket = Math.round(altitude * 6);
      const zoomed = bucket !== altitudeBucket.current;
      if ((dirtyRef.current || zoomed) && now - lastDraw >= interval) {
        lastDraw = now;
        if (dirtyRef.current) {
          const t0 = performance.now();
          map.draw(ds, activeRef.current);
          texture.needsUpdate = true;
          interval = Math.max(MIN_REDRAW_MS, (performance.now() - t0) * 3);
          dirtyRef.current = false;
          host.dataset.drawn = activeRef.current.map((r) => r.id).join(',');
        }
        altitudeBucket.current = bucket;
        const labels = chooseLabels(ds, activeRef.current, altitude, langRef.current);
        const view = battleViewRef.current;
        if (view.sequenceLabel && view.arcs.length) {
          labels.push({ ...arcMidpoint(view.arcs[Math.floor(view.arcs.length / 2)]), text: view.sequenceLabel, className: 'sequence-label' });
        }
        globe.htmlElementsData(labels);
        if (!notified) {
          notified = true;
          onReady();
        }
      }
    };
    raf = requestAnimationFrame(tick);

    const resize = new ResizeObserver(() => globe.width(host.clientWidth).height(host.clientHeight));
    resize.observe(host);

    const rowAt = (e: PointerEvent): Row | null => {
      const rect = host.getBoundingClientRect();
      const c = globe.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
      return c ? pickRow(ds, activeRef.current, c.lng, c.lat) : null;
    };
    const battleAt = (e: PointerEvent): Battle | null => {
      const rect = host.getBoundingClientRect();
      const [mx, my] = [e.clientX - rect.left, e.clientY - rect.top];
      let best: Battle | null = null;
      let bestDist = 11;
      for (const dot of battleViewRef.current.dots) {
        const s = globe.getScreenCoords(dot.lat, dot.lng, 0.014);
        const dist = Math.hypot(s.x - mx, s.y - my);
        if (dist >= bestDist) continue;
        const c = globe.getCoords(dot.lat, dot.lng, 0.014);
        const point = new Vector3(c.x, c.y, c.z);
        if (point.clone().normalize().dot(camera.position.clone().sub(point)) <= 0) continue;
        best = dot.battle;
        bestDist = dist;
      }
      return best;
    };
    let down: { x: number; y: number } | null = null;
    let hoverFrame = 0;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const battle = battleAt(e);
        if (battle) handlers.current.onSelectBattle(battle);
        else handlers.current.onSelect(rowAt(e));
      }
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType === 'touch' || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const battle = battleAt(e);
        const row = battle ? null : rowAt(e);
        host.style.cursor = battle || row ? 'pointer' : 'grab';
        handlers.current.onHoverBattle(battle?.q ?? null);
        handlers.current.onHover(row ? { row, x: e.clientX, y: e.clientY } : null);
      });
    };
    const onLeave = () => {
      handlers.current.onHover(null);
      handlers.current.onHoverBattle(null);
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hoverFrame);
      resize.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      texture.dispose();
      globe._destructor();
      host.replaceChildren();
    };
    // 球體只建立一次；資料更新走下方的 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, land]);

  useEffect(() => {
    activeRef.current = active;
    dirtyRef.current = true;
  }, [active]);

  useEffect(() => {
    langRef.current = lang;
    altitudeBucket.current = -1; // 下一幀重建標籤
  }, [lang]);

  useEffect(() => {
    const data: PolygonDatum[] = battleView.sides.map(({ row, side }) => ({ geometry: geometryOf(ds, row).feature.geometry, kind: side }));
    if (selected) data.push({ geometry: geometryOf(ds, selected).feature.geometry, kind: 'selected' });
    globeRef.current?.polygonsData(data);
  }, [ds, selected, battleView.sides]);

  useEffect(() => {
    battleViewRef.current = battleView;
    altitudeBucket.current = -1;
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointsData(battleView.dots);
    const s = battleView.selected;
    globe.ringsData(s ? [{ lat: s.lat, lng: s.lng, radius: s.locUncertain ? 7 : 3.5 }] : []);
    globe.arcsData(battleView.arcs);
  }, [battleView]);

  useEffect(() => {
    if (!battleFocus || !globeRef.current) return;
    const { lat, lng } = battleFocus.battle;
    globeRef.current.pointOfView({ lat, lng, altitude: Math.min(globeRef.current.pointOfView().altitude, 1.7) }, 900);
  }, [battleFocus]);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!focusRequest) return;
    const [lng, lat] = geometryOf(ds, focusRequest.row).center;
    globeRef.current?.pointOfView({ lat, lng, altitude: 1.3 }, 900);
  }, [ds, focusRequest]);

  useEffect(() => {
    if (resetRequest) globeRef.current?.pointOfView(INITIAL_POV, 900);
  }, [resetRequest]);

  return (
    <>
      <div ref={hostRef} className="globe-host" data-testid="globe" />
      <svg className="leader" aria-hidden="true">
        <path ref={leaderRef} data-testid="leader" style={{ display: 'none' }} />
        <circle ref={leaderEndRef} r="4" style={{ display: 'none' }} />
      </svg>
    </>
  );
}

export const GlobeView = memo(GlobeViewImpl);
