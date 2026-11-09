import { memo, useEffect, useRef } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import { CanvasTexture, MeshPhongMaterial, SRGBColorSpace } from 'three';
import type { Topology } from 'topojson-specification';
import { displayName, geometryOf, pickRow, type Dataset, type Row } from '../lib/data';
import { MapTexture } from '../lib/mapTexture';
import type { Lang } from '../lib/years';

export interface HoverInfo { row: Row; x: number; y: number }

interface Props {
  ds: Dataset;
  land: Topology;
  lang: Lang;
  active: Row[];
  selected: Row | null;
  autoRotate: boolean;
  focusRequest: { row: Row; nonce: number } | null;
  resetRequest: number;
  onSelect: (row: Row | null) => void;
  onHover: (info: HoverInfo | null) => void;
  onReady: () => void;
}

interface LabelDatum { row: Row; lat: number; lng: number; text: string }

const MIN_REDRAW_MS = 110;
const INITIAL_POV = { lat: 28, lng: 44, altitude: 2.1 };

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
    out.push({ row, lat, lng, text: displayName(ds.names[row.n], lang) });
    if (out.length >= 60) break;
  }
  return out;
}

function makeLabel(d: object): HTMLElement {
  const el = document.createElement('div');
  el.className = 'globe-label';
  el.textContent = (d as LabelDatum).text;
  return el;
}

function GlobeViewImpl({ ds, land, lang, active, selected, autoRotate, focusRequest, resetRequest, onSelect, onHover, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const mapRef = useRef<MapTexture | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const activeRef = useRef(active);
  const langRef = useRef(lang);
  const dirtyRef = useRef(true);
  const altitudeBucket = useRef(-1);
  const handlers = useRef({ onSelect, onHover });
  handlers.current = { onSelect, onHover };

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
      .polygonCapColor(() => 'rgba(255, 214, 130, 0.32)')
      .polygonSideColor(() => 'rgba(255, 214, 130, 0.5)')
      .polygonStrokeColor(() => '#ffe2a8')
      .polygonAltitude(0.012)
      .polygonsTransitionDuration(0)
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(0.004)
      .htmlElement(makeLabel)
      .htmlTransitionDuration(0);
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
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
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
        globe.htmlElementsData(chooseLabels(ds, activeRef.current, altitude, langRef.current));
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
    let down: { x: number; y: number } | null = null;
    let hoverFrame = 0;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) handlers.current.onSelect(rowAt(e));
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType === 'touch' || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const row = rowAt(e);
        host.style.cursor = row ? 'pointer' : 'grab';
        handlers.current.onHover(row ? { row, x: e.clientX, y: e.clientY } : null);
      });
    };
    const onLeave = () => handlers.current.onHover(null);
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
    globeRef.current?.polygonsData(selected ? [{ geometry: geometryOf(ds, selected).feature.geometry }] : []);
  }, [ds, selected]);

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

  return <div ref={hostRef} className="globe-host" data-testid="globe" />;
}

export const GlobeView = memo(GlobeViewImpl);
