import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { colorKey, geometryOf, hueFor, type Dataset, type Row } from './data';

// 將疆域畫到等距圓柱貼圖再包覆球體：原始資料本來就是經緯度平面多邊形，
// 平面填色不受環繞方向與球面三角化影響，切換年代只需重畫一張貼圖。
const BASE_W = 4096;
const OCEAN = '#10222f';
const LAND = '#3b4543';
const COAST = 'rgba(214, 200, 165, 0.34)';

const projectX = (lon: number) => ((lon + 180) / 360) * BASE_W;
const projectY = (lat: number) => ((90 - lat) / 180) * (BASE_W / 2);

function polygonsToPath(polygons: Position[][][]): Path2D {
  const path = new Path2D();
  for (const poly of polygons) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => (i === 0 ? path.moveTo(projectX(lon), projectY(lat)) : path.lineTo(projectX(lon), projectY(lat))));
      path.closePath();
    }
  }
  return path;
}

// 邊界線略過 ±180° 上的線段，否則跨換日線的政權會在接縫出現假邊界。
function polygonsToBorderPath(polygons: Position[][][]): Path2D {
  const path = new Path2D();
  const seam = (a: Position, b: Position) => Math.abs(a[0]) >= 179.99 && Math.abs(b[0]) >= 179.99;
  for (const poly of polygons) {
    for (const ring of poly) {
      ring.forEach((p, i) => {
        if (i === 0 || seam(ring[i - 1], p)) path.moveTo(projectX(p[0]), projectY(p[1]));
        else path.lineTo(projectX(p[0]), projectY(p[1]));
      });
    }
  }
  return path;
}

interface Paths { fill: Path2D; border: Path2D; fillColor: string; borderColor: string }
const pathCache = new Map<number, Paths>();

function pathsFor(ds: Dataset, row: Row): Paths {
  let p = pathCache.get(row.id);
  if (!p) {
    const g = geometryOf(ds, row);
    const hue = hueFor(colorKey(ds, row));
    p = {
      fill: polygonsToPath(g.polygons),
      border: polygonsToBorderPath(g.polygons),
      fillColor: `hsla(${hue}, 58%, 56%, 0.8)`,
      borderColor: `hsla(${hue}, 45%, 88%, 0.75)`,
    };
    pathCache.set(row.id, p);
  }
  return p;
}

export class MapTexture {
  readonly canvas = document.createElement('canvas');
  private base = document.createElement('canvas');
  private scale: number;

  constructor(width: number, land: Topology) {
    this.canvas.width = this.base.width = width;
    this.canvas.height = this.base.height = width / 2;
    this.scale = width / BASE_W;
    this.drawBase(land);
  }

  private drawBase(land: Topology) {
    const ctx = this.base.getContext('2d')!;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const fc = feature(land, land.objects.land) as unknown as FeatureCollection<Polygon | MultiPolygon>;
    const features = fc.features ?? [fc as never];
    for (const f of features) {
      const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const path = polygonsToPath(polygons);
      ctx.fillStyle = LAND;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = COAST;
      ctx.lineWidth = 0.7;
      ctx.stroke(polygonsToBorderPath(polygons));
    }
  }

  /** 由大到小繪製，小政權疊在上層。 */
  draw(ds: Dataset, active: Row[]) {
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.8;
    const ordered = [...active].sort((a, b) => b.area - a.area);
    for (const row of ordered) {
      const p = pathsFor(ds, row);
      ctx.fillStyle = p.fillColor;
      ctx.fill(p.fill, 'evenodd');
    }
    for (const row of ordered) {
      const p = pathsFor(ds, row);
      ctx.strokeStyle = p.borderColor;
      ctx.stroke(p.border);
    }
  }
}
