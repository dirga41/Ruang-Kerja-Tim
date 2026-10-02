/**
 * Kantor isometrik 2D (Canvas, tanpa dependensi).
 * Dipakai sebagai tampilan alternatif/cadangan dari scene Three.js dan memakai
 * denah serta rute yang sama (scene/layout.ts), sehingga perilaku avatar identik:
 * mengetik, berjalan ke papan tulis, menghampiri agent lain, menyandar saat istirahat.
 */
import { AGENTS, AGENT_IDS, STATUS_LABEL, type AgentAnim, type AgentId, type AgentStatus } from '../shared/types';
import { BOARD, DESKS, ROOM, SEAT_OFFSET, destinationFor, planPath, seatOf, type Dest, type Pt } from '../scene/layout';

export type BoardKind = 'flow' | 'erd' | 'seq' | 'class' | 'usecase' | 'hub';
export interface IsoAgent { status: AgentStatus; anim: AgentAnim; target: AgentId | null; bubble: string | null }
export interface IsoBoard { title: string; agent: AgentId; kind: BoardKind; image?: { img: CanvasImageSource; width: number; height: number } | null }
export interface IsoScene { agents: Partial<Record<AgentId, IsoAgent>>; board: IsoBoard | null }
export type IsoView = 'semua' | 'meja' | 'papan';

export function boardKindFor(title: string): BoardKind {
  if (/erd|entity|entitas/i.test(title)) return 'erd';
  if (/sequence/i.test(title)) return 'seq';
  if (/class|kelas/i.test(title)) return 'class';
  if (/use ?case/i.test(title)) return 'usecase';
  if (/stakeholder/i.test(title)) return 'hub';
  return 'flow';
}

const C = Math.cos(Math.PI / 6);
const S = 0.5;
const IDLE: IsoAgent = { status: 'istirahat', anim: 'istirahat', target: null, bubble: null };
const VIEWS: Record<IsoView, { x: number; y: number; z: number; zoom: number }> = {
  semua: { x: 0, y: 2.5, z: 0, zoom: 1 },
  meja: { x: 0, y: 1, z: -0.4, zoom: 1.55 },
  papan: { x: BOARD.x + 0.6, y: 1.9, z: ROOM.backZ + 1.6, zoom: 2 },
};
const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Teks di ruang bersatuan meter: font 100px lalu diperkecil, karena ukuran font sub-piksel tidak andal. */
function mtext(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, align: CanvasTextAlign) {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.font = `${weight} 100px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, 0, 0);
  g.restore();
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function angleTo(cur: number, target: number) {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d;
}
/** acak berseed, supaya dekorasi stabil antar frame */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Mover { pos: Pt; yaw: number; path: Pt[]; dest: Dest; key: string; moving: boolean; phase: number; lean: number; arm: number }

export class IsoOffice {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private unit = 20;
  private cam = { ...VIEWS.semua };
  private goal: { x: number; y: number; z: number; zoom: number } | null = null;
  private movers = {} as Record<AgentId, Mover>;
  private city: HTMLCanvasElement[] = [];
  private ro: ResizeObserver;
  private boardKey = '';
  private boardAt = -99;
  private drag: { x: number; y: number } | null = null;
  private pinch = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private cleanup: (() => void)[] = [];
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement, private getScene: () => IsoScene | null) {
    this.ctx = canvas.getContext('2d')!;
    for (const id of AGENT_IDS) {
      const s = seatOf(id);
      this.movers[id] = { pos: { ...s }, yaw: 0, path: [], dest: { kind: 'seat', x: s.x, z: s.z, yaw: 0 }, key: 'seat', moving: false, phase: Math.random() * 10, lean: 0, arm: 0 };
    }
    this.city = [this.makeCity(7), this.makeCity(21)];
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.bindInput();
    this.reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
  }

  setView(v: IsoView) {
    this.goal = { ...VIEWS[v] };
  }

  zoomBy(f: number) {
    this.goal = null;
    this.cam.zoom = Math.max(0.6, Math.min(4, this.cam.zoom * f));
  }

  // ---------- input: geser, zoom roda, cubit ----------
  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.style.cursor = 'grab';
    const on = <K extends keyof HTMLElementEventMap>(k: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(k, fn as EventListener, opts);
      this.cleanup.push(() => c.removeEventListener(k, fn as EventListener));
    };
    on('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.drag = { x: e.clientX, y: e.clientY };
      this.pinch = 0;
      c.style.cursor = 'grabbing';
    });
    on('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.goal = null;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.cam.zoom = Math.max(0.6, Math.min(4, this.cam.zoom * (d / this.pinch)));
        this.pinch = d;
        return;
      }
      if (!this.drag) return;
      const k = this.unit * this.cam.zoom;
      const dx = (e.clientX - this.drag.x) / k;
      const dy = (e.clientY - this.drag.y) / k;
      // balik proyeksi: sx = (x - z)C, sy = (x + z)S
      this.cam.x -= (dx / C + dy / S) / 2;
      this.cam.z -= (dy / S - dx / C) / 2;
      this.cam.x = Math.max(-10, Math.min(10, this.cam.x));
      this.cam.z = Math.max(-8, Math.min(8, this.cam.z));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.drag = null;
      this.pinch = 0;
      c.style.cursor = 'grab';
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.unit = Math.min(this.w / 28.5, this.h / 23);
  }

  // ---------- proyeksi ----------
  private P(x: number, y: number, z: number): [number, number] {
    const k = this.unit * this.cam.zoom;
    const cx = (this.cam.x - this.cam.z) * C;
    const cy = (this.cam.x + this.cam.z) * S - this.cam.y;
    return [this.w / 2 + ((x - z) * C - cx) * k, this.h / 2 + ((x + z) * S - y - cy) * k];
  }

  private poly(pts: [number, number, number][], fill: string | null, stroke?: string, lw = 1) {
    const g = this.ctx;
    g.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = this.P(p[0], p[1], p[2]);
      if (i) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
    });
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }

  /** kotak dengan pusat alas (cx, y0, cz): tampak atas, sisi +X, dan sisi +Z */
  private box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: string) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    this.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], shade(color, 0.8));
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(color, 0.9));
    this.poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color);
  }

  private line(a: [number, number, number], b: [number, number, number], color: string, widthM: number) {
    const g = this.ctx;
    const [ax, ay] = this.P(...a);
    const [bx, by] = this.P(...b);
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, widthM * this.unit * this.cam.zoom);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }

  private dot(p: [number, number, number], rM: number, color: string) {
    const g = this.ctx;
    const [x, y] = this.P(...p);
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, Math.max(0.5, rM * this.unit * this.cam.zoom), 0, Math.PI * 2);
    g.fill();
  }

  /** gambar di bidang dinding: `wall` belakang (u = +X) atau kiri (u = +Z); v ke atas, satuan meter */
  private onWall(wall: 'back' | 'left', fn: (g: CanvasRenderingContext2D) => void) {
    const g = this.ctx;
    const k = this.unit * this.cam.zoom;
    const [ox, oy] = wall === 'back' ? this.P(0, 0, ROOM.backZ) : this.P(ROOM.leftX, 0, 0);
    g.save();
    g.transform(wall === 'back' ? C * k : -C * k, S * k, 0, -k, ox, oy);
    fn(g);
    g.restore();
  }

  // ---------- tekstur kota malam ----------
  private makeCity(seed: number) {
    const r = rng(seed);
    const c = document.createElement('canvas');
    c.width = 760;
    c.height = 270;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, c.height);
    sky.addColorStop(0, '#0B1433');
    sky.addColorStop(0.6, '#253A73');
    sky.addColorStop(1, '#6B5B95');
    g.fillStyle = sky;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(r() * c.width, r() * c.height * 0.5, 1.5, 1.5);
    }
    g.fillStyle = '#FFF4D6';
    g.beginPath();
    g.arc(c.width * 0.8, 50, 19, 0, Math.PI * 2);
    g.fill();
    for (const layer of [0, 1]) {
      let x = -8;
      while (x < c.width) {
        const w = 26 + r() * 42;
        const h = (layer ? 60 : 105) + r() * (layer ? 95 : 105);
        const top = c.height - h;
        g.fillStyle = layer ? '#0E1730' : '#1B2A55';
        g.fillRect(x, top, w, h);
        for (let wy = top + 8; wy < c.height - 6; wy += 11) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) {
            if (r() < (layer ? 0.42 : 0.3)) {
              g.fillStyle = r() < 0.8 ? '#FFD98A' : '#BFE3FF';
              g.fillRect(wx, wy, 4, 5.5);
            }
          }
        }
        x += w + 2 + r() * 8;
      }
    }
    return c;
  }

  // ---------- pembaruan gerak ----------
  private update(dt: number) {
    const scene = this.getScene();
    if (this.goal) {
      const k = 1 - Math.exp(-5 * dt);
      this.cam.x = lerp(this.cam.x, this.goal.x, k);
      this.cam.y = lerp(this.cam.y, this.goal.y, k);
      this.cam.z = lerp(this.cam.z, this.goal.z, k);
      this.cam.zoom = lerp(this.cam.zoom, this.goal.zoom, k);
      if (Math.abs(this.cam.zoom - this.goal.zoom) < 0.005 && Math.hypot(this.cam.x - this.goal.x, this.cam.z - this.goal.z) < 0.02) this.goal = null;
    }
    const bk = scene?.board ? `${scene.board.title}|${scene.board.agent}|${scene.board.image ? 1 : 0}` : '';
    if (bk !== this.boardKey) {
      this.boardKey = bk;
      this.boardAt = this.t;
    }
    for (const id of AGENT_IDS) {
      const a = scene?.agents[id] ?? IDLE;
      const m = this.movers[id];
      const key = a.anim === 'ke_papan' ? 'board' : a.anim === 'berbicara' ? `talk:${a.target}` : 'seat';
      if (key !== m.key) {
        m.key = key;
        m.dest = destinationFor(id, a.anim, a.target);
        m.path = Math.hypot(m.dest.x - m.pos.x, m.dest.z - m.pos.z) > 0.05 ? planPath(m.pos, m.dest) : [];
      }
      let step = 2.4 * dt;
      m.moving = m.path.length > 0;
      while (m.path.length && step > 0) {
        const n = m.path[0];
        const dx = n.x - m.pos.x, dz = n.z - m.pos.z, dist = Math.hypot(dx, dz);
        if (dist <= step) {
          m.pos.x = n.x;
          m.pos.z = n.z;
          m.path.shift();
          step -= dist;
        } else {
          m.pos.x += (dx / dist) * step;
          m.pos.z += (dz / dist) * step;
          m.yaw = lerp(m.yaw, angleTo(m.yaw, Math.atan2(dx, dz)), 1 - Math.exp(-12 * dt));
          step = 0;
        }
      }
      if (!m.moving) m.yaw = lerp(m.yaw, angleTo(m.yaw, m.dest.yaw), 1 - Math.exp(-8 * dt));
      const resting = !m.moving && m.dest.kind === 'seat' && a.status === 'istirahat';
      m.lean = lerp(m.lean, resting ? 1 : 0, 1 - Math.exp(-6 * dt));
    }
  }

  // ---------- gambar ----------
  private draw() {
    const g = this.ctx;
    const scene = this.getScene();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, '#F6EEDF');
    bg.addColorStop(1, '#E9D9BD');
    g.fillStyle = bg;
    g.fillRect(0, 0, this.w, this.h);

    this.drawRoom(scene);

    // objek diurutkan dari jauh ke dekat (kunci = x + z)
    const items: { key: number; draw: () => void }[] = [];
    for (const id of AGENT_IDS) {
      const d = DESKS[id];
      const a = scene?.agents[id] ?? IDLE;
      items.push({ key: d.x + d.z + SEAT_OFFSET - 0.3, draw: () => this.drawChair(id) });
      items.push({ key: d.x + d.z + 0.2, draw: () => this.drawDesk(id, a) });
      const m = this.movers[id];
      items.push({ key: m.pos.x + m.pos.z, draw: () => this.drawAvatar(id, a) });
    }
    const plants: [number, number, number][] = [[8.1, ROOM.backZ + 0.8, 1.15], [ROOM.leftX + 0.9, ROOM.backZ + 0.8, 1], [ROOM.leftX + 0.9, 5.4, 1.25], [8.1, 2.6, 1], [-2.1, 4.4, 0.7]];
    plants.forEach(([x, z, sc], i) => items.push({ key: x + z, draw: () => this.drawPlant(x, z, sc, i) }));
    items.push({ key: ROOM.leftX + 0.35 - 4.6, draw: () => this.drawShelf() });
    items.push({ key: 6.9 + 5.0, draw: () => this.drawSofa() });
    items.push({ key: 5.4 + 4.9, draw: () => this.drawTable() });
    items.sort((p, q) => p.key - q.key);
    for (const it of items) it.draw();

    for (const id of AGENT_IDS) this.drawLabel(id, scene?.agents[id] ?? IDLE);
  }

  private drawRoom(scene: IsoScene | null) {
    const { w, d, h, backZ, leftX } = ROOM;
    const x1 = leftX + w, z1 = backZ + d;
    // lantai
    this.poly([[leftX, 0, backZ], [x1, 0, backZ], [x1, 0, z1], [leftX, 0, z1]], '#EBD6B4');
    for (let i = 1; i < 12; i++) {
      const x = leftX + (i * w) / 12;
      this.line([x, 0, backZ], [x, 0, z1], '#DFC79F', 0.025);
    }
    this.poly([[x1, 0, backZ], [x1, 0, z1], [x1, -0.25, z1], [x1, -0.25, backZ]], '#C9AE84');
    this.poly([[leftX, 0, z1], [x1, 0, z1], [x1, -0.25, z1], [leftX, -0.25, z1]], '#D8BE95');
    // karpet
    this.poly([[-6.3, 0, -4.3], [6.3, 0, -4.3], [6.3, 0, 3.1], [-6.3, 0, 3.1]], '#F7EEDF', '#EADBC2', 1.5);
    // dinding
    this.poly([[leftX, 0, backZ], [x1, 0, backZ], [x1, h, backZ], [leftX, h, backZ]], '#FBF3E4');
    this.poly([[leftX, 0, backZ], [leftX, 0, z1], [leftX, h, z1], [leftX, h, backZ]], '#F3E7D2');
    this.poly([[leftX, h, backZ], [x1, h, backZ], [x1 + 0.25, h, backZ - 0.25], [leftX - 0.25, h, backZ - 0.25]], '#EADCC4');
    this.poly([[leftX, h, backZ], [leftX, h, z1], [leftX - 0.25, h, z1 + 0.25], [leftX - 0.25, h, backZ - 0.25]], '#E2D2B6');
    this.line([leftX, 0.07, backZ], [x1, 0.07, backZ], '#B98F5E', 0.14);
    this.line([leftX, 0.07, backZ], [leftX, 0.07, z1], '#B98F5E', 0.14);

    // jendela kota malam + kelap-kelip
    const win = (wall: 'back' | 'left', u0: number, tex: HTMLCanvasElement, seed: number) => this.onWall(wall, (g) => {
      const ww = 7.6, wh = 2.7, v0 = 1.2;
      g.save();
      g.translate(u0, v0 + wh);
      g.scale(1, -1);
      g.drawImage(tex, 0, 0, ww, wh);
      const r = rng(seed);
      for (let i = 0; i < 26; i++) {
        const px = r() * ww, py = wh * (0.45 + r() * 0.5), ph = r() * 9;
        if (Math.sin(this.t * (0.5 + r()) + ph) > 0.55) {
          g.fillStyle = 'rgba(255,225,150,.9)';
          g.fillRect(px, py, 0.05, 0.065);
        }
      }
      g.restore();
      g.strokeStyle = '#FBF7EF';
      g.lineWidth = 0.1;
      g.strokeRect(u0, v0, ww, wh);
      g.lineWidth = 0.07;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(u0 + (i * ww) / 4, v0);
        g.lineTo(u0 + (i * ww) / 4, v0 + wh);
        g.stroke();
      }
      g.fillStyle = '#FBF7EF';
      g.fillRect(u0 - 0.1, v0 - 0.14, ww + 0.2, 0.14);
    });
    win('back', 0.8, this.city[0], 3);
    win('left', -3.2, this.city[1], 9);

    // jam dinding
    this.onWall('back', (g) => {
      const cx = -7.4, cy = 3.3;
      g.fillStyle = '#fff';
      g.strokeStyle = '#C9C2B4';
      g.lineWidth = 0.06;
      g.beginPath();
      g.arc(cx, cy, 0.38, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const hand = (ang: number, len: number, lw: number, col: string) => {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.sin(ang) * len, cy + Math.cos(ang) * len);
        g.stroke();
      };
      const now = new Date();
      hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 0.2, 0.05, '#2E2A25');
      hand((now.getMinutes() + now.getSeconds() / 60) * (Math.PI / 30), 0.3, 0.035, '#2E2A25');
      hand(now.getSeconds() * (Math.PI / 30), 0.32, 0.015, '#E0647A');
    });

    this.drawBoard(scene?.board ?? null);
  }

  private drawBoard(b: IsoBoard | null) {
    const prog = this.reducedMotion ? 1 : Math.max(0, Math.min(1, (this.t - this.boardAt) / 3.6));
    this.onWall('back', (g) => {
      const x0 = BOARD.x - BOARD.w / 2, y0 = BOARD.y - BOARD.h / 2, W = BOARD.w, H = BOARD.h;
      g.fillStyle = '#C9C2B4';
      g.fillRect(x0 - 0.11, y0 - 0.11, W + 0.22, H + 0.22);
      g.fillStyle = '#fff';
      g.fillRect(x0, y0, W, H);
      g.fillStyle = '#B5AE9F';
      g.fillRect(x0 + W * 0.2, y0 - 0.2, W * 0.6, 0.07);
      // isi papan digambar dengan sumbu Y ke bawah (seperti kanvas biasa), satuan meter
      g.save();
      g.translate(x0, y0 + H);
      g.scale(1, -1);
      g.textBaseline = 'middle';
      if (!b) {
        g.fillStyle = '#B8AE9C';
        mtext(g, 'Papan tulis tim', W / 2, H / 2 - 0.15, 0.26, 700, 'center');
        mtext(g, 'Diagram yang sedang dikerjakan tampil di sini', W / 2, H / 2 + 0.2, 0.15, 500, 'center');
        g.restore();
        return;
      }
      const a = AGENTS[b.agent];
      g.fillStyle = a.soft;
      g.fillRect(0, 0, W, 0.4);
      g.fillStyle = a.color;
      g.fillRect(0, 0.4, W, 0.03);
      g.beginPath();
      g.arc(0.22, 0.2, 0.07, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = a.ink;
      mtext(g, b.title.length > 38 ? `${b.title.slice(0, 37)}…` : b.title, 0.38, 0.21, 0.19, 700, 'left');
      mtext(g, `oleh ${a.name}`, W - 0.15, 0.21, 0.13, 600, 'right');
      const ax = 0.2, ay = 0.55, aw = W - 0.4, ah = H - 0.75;
      if (b.image) {
        const k = Math.min(aw / b.image.width, ah / b.image.height);
        const iw = b.image.width * k, ih = b.image.height * k;
        g.beginPath();
        g.rect(ax, ay, aw * prog, ah);
        g.clip();
        g.drawImage(b.image.img, ax + (aw - iw) / 2, ay + (ah - ih) / 2, iw, ih);
      } else {
        g.translate(ax, ay);
        this.sketch(g, b.kind, aw, ah, prog, a.color);
      }
      g.restore();
    });
  }

  /** sketsa diagram bergaya spidol; elemen muncul bertahap seperti sedang digambar */
  private sketch(g: CanvasRenderingContext2D, kind: BoardKind, W: number, H: number, prog: number, accent: string) {
    type Op = () => void;
    const ops: Op[] = [];
    const ink = '#3A3F4B';
    g.lineWidth = 0.025;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const rect = (x: number, y: number, w: number, h: number, fill = '#fff', label = '', round = 0.05) => ops.push(() => {
      g.fillStyle = fill;
      g.strokeStyle = ink;
      g.beginPath();
      g.roundRect(x * W, y * H, w * W, h * H, round);
      g.fill();
      g.stroke();
      if (label) {
        g.fillStyle = ink;
        mtext(g, label, (x + w / 2) * W, (y + h / 2) * H, 0.115, 600, 'center');
      }
    });
    const arrow = (x0: number, y0: number, x1: number, y1: number, dashed = false) => ops.push(() => {
      const ax = x0 * W, ay = y0 * H, bx = x1 * W, by = y1 * H;
      g.strokeStyle = ink;
      g.setLineDash(dashed ? [0.06, 0.05] : []);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
      const an = Math.atan2(by - ay, bx - ax);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx - Math.cos(an - 0.45) * 0.09, by - Math.sin(an - 0.45) * 0.09);
      g.moveTo(bx, by);
      g.lineTo(bx - Math.cos(an + 0.45) * 0.09, by - Math.sin(an + 0.45) * 0.09);
      g.stroke();
    });
    const text = (x: number, y: number, s: string, size = 0.1) => ops.push(() => {
      g.fillStyle = ink;
      mtext(g, s, x * W, y * H, size, 500, 'center');
    });
    const soft = `${accent}33`;

    if (kind === 'flow') {
      rect(0.02, 0.38, 0.16, 0.24, soft, 'Aktor');
      rect(0.3, 0.06, 0.2, 0.24, '#fff', '1.0 Kelola', 0.2);
      rect(0.3, 0.7, 0.2, 0.24, '#fff', '2.0 Cari', 0.2);
      rect(0.6, 0.38, 0.2, 0.24, '#fff', '3.0 Transaksi', 0.2);
      rect(0.86, 0.1, 0.13, 0.18, soft, 'D1');
      rect(0.86, 0.72, 0.13, 0.18, soft, 'D2');
      arrow(0.18, 0.44, 0.3, 0.22);
      arrow(0.18, 0.56, 0.3, 0.78);
      arrow(0.5, 0.2, 0.62, 0.4);
      arrow(0.5, 0.8, 0.62, 0.6);
      arrow(0.8, 0.42, 0.88, 0.28);
      arrow(0.8, 0.58, 0.88, 0.72);
    } else if (kind === 'erd') {
      const table = (x: number, y: number, name: string, rows: number) => {
        rect(x, y, 0.24, 0.13, soft, name, 0.02);
        for (let i = 0; i < rows; i++) rect(x, y + 0.13 + i * 0.1, 0.24, 0.1, '#fff', '', 0);
        ops.push(() => {
          g.strokeStyle = '#B9BEC9';
          for (let i = 0; i < rows; i++) {
            g.beginPath();
            g.moveTo((x + 0.03) * W, (y + 0.18 + i * 0.1) * H);
            g.lineTo((x + 0.19 - (i % 2) * 0.05) * W, (y + 0.18 + i * 0.1) * H);
            g.stroke();
          }
        });
      };
      table(0.02, 0.05, 'ANGGOTA', 3);
      table(0.38, 0.3, 'TRANSAKSI', 4);
      table(0.74, 0.05, 'ITEM', 3);
      table(0.74, 0.62, 'DETAIL', 2);
      arrow(0.26, 0.25, 0.38, 0.42);
      arrow(0.62, 0.5, 0.74, 0.72);
      arrow(0.86, 0.48, 0.86, 0.62);
      text(0.32, 0.27, '1..n', 0.09);
    } else if (kind === 'seq') {
      const xs = [0.1, 0.37, 0.63, 0.9];
      ['Petugas', 'UI', 'API', 'DB'].forEach((n, i) => {
        rect(xs[i] - 0.09, 0.02, 0.18, 0.14, i ? '#fff' : soft, n);
        arrow(xs[i], 0.16, xs[i], 0.98, true);
      });
      arrow(xs[0], 0.3, xs[1], 0.3);
      arrow(xs[1], 0.42, xs[2], 0.42);
      arrow(xs[2], 0.54, xs[3], 0.54);
      arrow(xs[3], 0.66, xs[2], 0.66, true);
      arrow(xs[2], 0.78, xs[1], 0.78, true);
      arrow(xs[1], 0.9, xs[0], 0.9, true);
    } else if (kind === 'class') {
      const cls = (x: number, y: number, n: string) => {
        rect(x, y, 0.24, 0.13, soft, n, 0.02);
        rect(x, y + 0.13, 0.24, 0.17, '#fff', '+ atribut', 0);
        rect(x, y + 0.3, 0.24, 0.13, '#fff', '+ metode()', 0);
      };
      cls(0.03, 0.04, 'Anggota');
      cls(0.38, 0.5, 'Transaksi');
      cls(0.73, 0.04, 'Item');
      arrow(0.27, 0.3, 0.42, 0.5);
      arrow(0.62, 0.6, 0.8, 0.47);
    } else if (kind === 'usecase') {
      const actor = (x: number, y: number) => ops.push(() => {
        g.strokeStyle = ink;
        g.beginPath();
        g.arc(x * W, y * H, 0.07, 0, Math.PI * 2);
        g.moveTo(x * W, y * H + 0.07);
        g.lineTo(x * W, y * H + 0.3);
        g.moveTo(x * W - 0.12, y * H + 0.15);
        g.lineTo(x * W + 0.12, y * H + 0.15);
        g.moveTo(x * W, y * H + 0.3);
        g.lineTo(x * W - 0.1, y * H + 0.45);
        g.moveTo(x * W, y * H + 0.3);
        g.lineTo(x * W + 0.1, y * H + 0.45);
        g.stroke();
      });
      rect(0.22, 0.02, 0.56, 0.96, '#FAFAFA', '', 0.04);
      actor(0.08, 0.2);
      actor(0.08, 0.62);
      actor(0.92, 0.4);
      ['UC-01 Login', 'UC-04 Catat', 'UC-05 Proses', 'UC-06 Laporan'].forEach((n, i) => rect(0.3 + (i % 2) * 0.22, 0.1 + i * 0.2, 0.2, 0.16, i === 3 ? soft : '#fff', n, 0.4));
      arrow(0.13, 0.3, 0.3, 0.18);
      arrow(0.13, 0.72, 0.3, 0.58);
      arrow(0.87, 0.52, 0.72, 0.78);
      arrow(0.13, 0.34, 0.52, 0.38);
    } else {
      rect(0.4, 0.38, 0.2, 0.24, soft, 'Sistem', 0.6);
      const names = ['Anggota', 'Petugas', 'Admin', 'Pimpinan', 'Tim TI', 'Keuangan'];
      names.forEach((n, i) => {
        const an = (i / names.length) * Math.PI * 2 + 0.5;
        const x = 0.5 + Math.cos(an) * 0.38, y = 0.5 + Math.sin(an) * 0.38;
        rect(x - 0.09, y - 0.08, 0.18, 0.16, '#fff', n);
        arrow(x + (0.5 - x) * 0.28, y + (0.5 - y) * 0.28, 0.5 + (x - 0.5) * 0.36, 0.5 + (y - 0.5) * 0.36);
      });
    }
    const n = Math.ceil(ops.length * prog);
    for (let i = 0; i < n; i++) ops[i]();
  }

  private drawChair(id: AgentId) {
    const d = DESKS[id];
    const def = AGENTS[id];
    const z = d.z + SEAT_OFFSET;
    this.line([d.x, 0.05, z], [d.x, 0.45, z], '#9A958C', 0.08);
    this.box(d.x, 0, z, 0.5, 0.06, 0.5, '#A8A398');
    this.box(d.x, 0.78 - 0.26, z - 0.27, 0.5, 0.62, 0.08, def.soft);
    this.box(d.x, 0.41, z, 0.52, 0.08, 0.5, '#F2EDE4');
  }

  private drawDesk(id: AgentId, a: IsoAgent) {
    const d = DESKS[id];
    const def = AGENTS[id];
    for (const [lx, lz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]]) this.box(d.x + lx, 0, d.z + lz, 0.07, 0.72, 0.07, '#FBF7EF');
    this.box(d.x, 0.72, d.z, 2.3, 0.08, 1.1, '#DDB887');
    // keyboard, buku, mug
    this.box(d.x, 0.8, d.z - 0.25, 0.5, 0.025, 0.16, '#F4F1EA');
    this.box(d.x - 0.75, 0.8, d.z - 0.1, 0.26, 0.03, 0.34, def.soft);
    this.box(d.x + 0.72, 0.8, d.z - 0.15, 0.1, 0.12, 0.1, def.color);
    if (a.status !== 'bekerja' && !this.reducedMotion) {
      // uap kopi saat santai
      for (let i = 0; i < 2; i++) {
        const ph = (this.t * 0.6 + i * 0.5) % 1;
        const [sx, sy] = this.P(d.x + 0.72 + Math.sin(this.t * 2 + i) * 0.03, 0.95 + ph * 0.3, d.z - 0.15);
        this.ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, (0.03 + ph * 0.03) * this.unit * this.cam.zoom, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    // monitor: layar menghadap avatar, punggung beraksen warna agent
    this.box(d.x, 0.8, d.z + 0.22, 0.3, 0.03, 0.2, '#C9C4BA');
    this.box(d.x, 0.83, d.z + 0.24, 0.06, 0.2, 0.05, '#C9C4BA');
    const working = a.status === 'bekerja';
    if (working) {
      // pendar layar ke arah avatar
      const [gx, gy] = this.P(d.x, 1.25, d.z - 0.1);
      const r = 1.1 * this.unit * this.cam.zoom;
      const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      glow.addColorStop(0, `rgba(190,225,255,${0.3 + Math.sin(this.t * 7 + d.x) * 0.05})`);
      glow.addColorStop(1, 'rgba(190,225,255,0)');
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    this.box(d.x, 1.0, d.z + 0.22, 0.95, 0.56, 0.05, '#EDEAE3');
    const [lx, ly] = this.P(d.x, 1.28, d.z + 0.245);
    const k = this.unit * this.cam.zoom;
    this.ctx.fillStyle = def.color;
    this.ctx.beginPath();
    this.ctx.ellipse(lx, ly, 0.09 * k * C, 0.09 * k, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // sisi layar terlihat sebagai garis terang bila bekerja
    this.line([d.x - 0.47, 1.56, d.z + 0.195], [d.x + 0.47, 1.56, d.z + 0.195], working ? '#BFE3FF' : '#5A616B', 0.025);
  }

  private drawPlant(x: number, z: number, sc: number, i: number) {
    this.box(x, 0, z, 0.44 * sc, 0.5 * sc, 0.44 * sc, '#E9DFCF');
    this.line([x, 0.5 * sc, z], [x, 0.95 * sc, z], '#7A5A3A', 0.05 * sc);
    const sway = this.reducedMotion ? 0 : Math.sin(this.t * 0.9 + i * 1.7) * 0.03;
    const blobs: [number, number, number, number][] = [[0, 1.15, 0, 0.42], [0.25, 0.92, 0.1, 0.3], [-0.22, 0.98, -0.08, 0.32], [0.05, 1.42, -0.05, 0.26]];
    blobs.forEach(([px, py, pz, r], j) => this.dot([x + (px + sway * (py - 0.5)) * sc, py * sc, z + pz * sc], r * sc * 0.95, j % 2 ? '#6FBF8B' : '#4FA574'));
    this.dot([x - 0.1 * sc + sway, 1.25 * sc, z], 0.16 * sc, '#86CFA0');
  }

  private drawShelf() {
    const x = ROOM.leftX + 0.35, z = -4.6;
    this.box(x, 0, z, 0.5, 1.5, 1.8, '#DDB887');
    [0.3, 0.75, 1.2].forEach((y, r) => [-0.6, -0.3, 0, 0.3, 0.6].forEach((bz, i) => {
      const col = AGENTS[AGENT_IDS[(i + r * 2) % AGENT_IDS.length]].color;
      this.poly([[x + 0.251, y, z + bz - 0.1], [x + 0.251, y, z + bz + 0.1], [x + 0.251, y + 0.3, z + bz + 0.1], [x + 0.251, y + 0.3, z + bz - 0.1]], col);
    }));
  }

  private drawSofa() {
    const x = 6.9, z = 5.0;
    this.box(x + 0.36, 0.1, z, 0.22, 0.9, 2.2, '#EDB9A1');
    this.box(x, 0.1, z, 0.9, 0.4, 2.2, '#F3C9B5');
    this.box(x, 0.5, z - 1.1, 0.9, 0.25, 0.22, '#EDB9A1');
    this.box(x, 0.5, z + 1.1, 0.9, 0.25, 0.22, '#EDB9A1');
  }

  private drawTable() {
    this.box(5.4, 0, 4.9, 0.1, 0.36, 0.1, '#FBF7EF');
    this.box(5.4, 0.36, 4.9, 0.8, 0.06, 0.8, '#DDB887');
    this.box(5.3, 0.42, 4.8, 0.3, 0.03, 0.22, '#E4EDFF');
  }

  // ---------- avatar: kerangka 3D sederhana yang diproyeksikan ----------
  private drawAvatar(id: AgentId, a: IsoAgent) {
    const def = AGENTS[id];
    const m = this.movers[id];
    const t = this.reducedMotion ? 0 : this.t + m.phase;
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw); // arah hadap
    const rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw); // arah kanan
    const { x, z } = m.pos;
    const seated = !m.moving && m.dest.kind === 'seat';
    const bob = m.moving ? Math.abs(Math.cos(t * 9)) * 0.03 : 0;
    const hipY = 0.5 + bob;
    type V = [number, number, number];
    const at = (side: number, fwd: number, y: number): V => [x + rx * side + fx * fwd, y, z + rz * side + fz * fwd];

    // bayangan
    const [shx, shy] = this.P(x, 0, z);
    const k = this.unit * this.cam.zoom;
    if (!seated) {
      this.ctx.fillStyle = 'rgba(90,62,20,.16)';
      this.ctx.beginPath();
      this.ctx.ellipse(shx, shy, 0.3 * k, 0.15 * k, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // pose
    const lean = seated ? (m.lean > 0.01 ? -0.22 * m.lean : a.status === 'bekerja' ? 0.06 : 0) : 0;
    const neck: V = at(0, lean, hipY + 0.5);
    const head: V = at(0, lean * 1.25, hipY + 0.74);
    let handL: V, handR: V;
    const sh = (side: number): V => at(side * 0.22, lean * 0.9, hipY + 0.44);
    if (m.moving) {
      const sw = Math.sin(t * 9) * 0.22;
      handL = at(-0.26, -sw, hipY + 0.08);
      handR = at(0.26, sw, hipY + 0.08);
    } else if (seated) {
      if (a.status === 'bekerja') {
        handL = at(-0.14, 0.42, 0.84 + Math.max(0, Math.sin(t * 16)) * 0.035);
        handR = at(0.14, 0.42, 0.84 + Math.max(0, Math.sin(t * 16 + 1.7)) * 0.035);
      } else if (a.status === 'menunggu') {
        handL = at(-0.16, 0.3, 0.82);
        handR = at(0.16, 0.3, 0.82);
      } else {
        // menyandar: tangan santai di pangkuan
        handL = at(-0.15, 0.22, hipY + 0.14);
        handR = at(0.15, 0.22, hipY + 0.14);
      }
    } else if (m.dest.kind === 'board') {
      handR = at(0.2, 0.3, hipY + 0.85 + Math.sin(t * 2.2) * 0.07);
      handL = at(-0.26, 0.02, hipY + 0.08);
    } else {
      handR = at(0.24, 0.28 + Math.sin(t * 5) * 0.05, hipY + 0.35 + Math.sin(t * 5) * 0.08);
      handL = at(-0.26, 0.08, hipY + 0.12);
    }

    const pants = '#4B4A57';
    const leg = (side: number) => {
      const hip = at(side * 0.1, 0, hipY);
      if (seated) {
        const knee = at(side * 0.1, 0.42, hipY);
        this.line(hip, knee, pants, 0.15);
        this.line(knee, at(side * 0.1, 0.42, 0.06), pants, 0.14);
      } else {
        const sw = m.moving ? Math.sin(t * 9) * 0.28 * side : 0;
        this.line(hip, at(side * 0.1, sw, 0.05), pants, 0.15);
      }
    };
    const arm = (side: number, hand: V) => {
      this.line(sh(side), hand, def.color, 0.11);
      this.dot(hand, 0.06, def.skin);
    };
    // lengan yang lebih jauh dari kamera digambar dulu
    const rightIsFar = rx + rz < 0;
    arm(rightIsFar ? 1 : -1, rightIsFar ? handR : handL);
    leg(rightIsFar ? 1 : -1);
    leg(rightIsFar ? -1 : 1);
    this.line(at(0, 0, hipY + 0.08), at(0, lean * 0.85, hipY + 0.42), def.color, 0.4);
    arm(rightIsFar ? -1 : 1, rightIsFar ? handL : handR);

    // kepala, rambut, wajah
    const [hx, hy] = this.P(...head);
    const R = 0.2 * k;
    const sfx = (fx - fz) * C, sfy = (fx + fz) * S; // arah hadap di layar
    const g = this.ctx;
    const hijab = def.hairStyle === 'hijab';
    if (hijab) this.line(at(0, lean, hipY + 0.5), at(0, lean * 0.9, hipY + 0.38), def.hair, 0.5);
    if (def.hairStyle === 'panjang') this.line([head[0] - fx * 0.1, head[1], head[2] - fz * 0.1], [neck[0] - fx * 0.14, neck[1] - 0.12, neck[2] - fz * 0.14], def.hair, 0.34);
    if (def.hairStyle === 'kuncir') this.dot([head[0] - fx * 0.26, head[1] - 0.04, head[2] - fz * 0.26], 0.1, def.hair);
    if (def.hairStyle === 'sanggul') this.dot([head[0] - fx * 0.1, head[1] + 0.22, head[2] - fz * 0.1], 0.1, def.hair);
    g.fillStyle = def.hair;
    g.beginPath();
    g.arc(hx - sfx * R * 0.12, hy - R * 0.1, R * (hijab ? 1.16 : 1.08), 0, Math.PI * 2);
    g.fill();
    if (sfy > -0.2) {
      // wajah terlihat bila menghadap ke arah kamera
      const lookY = !m.moving && seated && a.status === 'menunggu' ? Math.sin(t * 0.8) * 0.25 : 0;
      const ox = (sfx + lookY) * R * 0.3, oy = R * (0.12 + Math.max(0, sfy) * 0.12);
      g.fillStyle = def.skin;
      g.beginPath();
      g.ellipse(hx + ox, hy + oy, R * 0.84, R * (hijab ? 0.78 : 0.86), 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2320';
      const ex = (sfx + lookY) * R * 0.55;
      const blink = Math.sin(t * 0.7 + m.phase) > 0.985 || (m.lean > 0.6);
      for (const s of [-1, 1]) {
        g.beginPath();
        if (blink) g.ellipse(hx + ex + s * R * 0.3, hy + oy + R * 0.06, R * 0.11, R * 0.03, 0, 0, Math.PI * 2);
        else g.arc(hx + ex + s * R * 0.3, hy + oy + R * 0.02, R * 0.1, 0, Math.PI * 2);
        g.fill();
      }
      // pipi dan mulut
      g.fillStyle = 'rgba(232,120,120,.35)';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(hx + ex + s * R * 0.5, hy + oy + R * 0.3, R * 0.13, 0, Math.PI * 2);
        g.fill();
      }
      const talking = !m.moving && (m.dest.kind === 'talk' || m.dest.kind === 'board');
      g.strokeStyle = '#8a4a3a';
      g.lineWidth = Math.max(1, R * 0.08);
      g.beginPath();
      if (talking) g.ellipse(hx + ex, hy + oy + R * 0.42, R * 0.1, R * (0.05 + Math.abs(Math.sin(t * 9)) * 0.1), 0, 0, Math.PI * 2);
      else g.arc(hx + ex, hy + oy + R * 0.32, R * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }

    // "z z z" saat istirahat
    if (m.lean > 0.6 && !this.reducedMotion) {
      g.fillStyle = shade(def.ink, 1);
      for (let i = 0; i < 3; i++) {
        const ph = (this.t * 0.45 + i / 3 + m.phase) % 1;
        g.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        g.font = `700 ${Math.max(7, (0.14 + ph * 0.12) * k)}px ${FONT}`;
        g.fillText('z', hx + R * (1.1 + ph * 1.2), hy - R * (0.6 + ph * 2.2));
      }
      g.globalAlpha = 1;
    }
  }

  /** name tag (nama + peran + status) dan speech bubble; ukuran piksel tetap agar selalu terbaca */
  private drawLabel(id: AgentId, a: IsoAgent) {
    const def = AGENTS[id];
    const m = this.movers[id];
    const g = this.ctx;
    const [x, y0] = this.P(m.pos.x, 1.58, m.pos.z);
    const small = this.unit * this.cam.zoom < 30;
    const tiny = this.unit * this.cam.zoom < 17;
    let y = y0 - 4;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    const l1 = small ? def.name : `${def.name} · ${def.role.split(' · ')[0]}`;
    const l2 = STATUS_LABEL[a.status];
    g.font = `700 ${small ? 10 : 11}px ${FONT}`;
    const w1 = g.measureText(l1).width;
    g.font = `600 9.5px ${FONT}`;
    const w2 = g.measureText(l2).width + 10;
    const tw = (tiny ? w1 : Math.max(w1, w2)) + 16, th = tiny ? 17 : small ? 27 : 30;
    g.fillStyle = def.soft;
    g.strokeStyle = def.color;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(x - tw / 2, y - th, tw, th, 9);
    g.fill();
    g.stroke();
    g.fillStyle = def.ink;
    g.font = `700 ${small ? 10 : 11}px ${FONT}`;
    g.fillText(l1, x, tiny ? y - th / 2 : y - th + 10);
    if (!tiny) {
      g.font = `600 9.5px ${FONT}`;
      g.fillText(l2, x + 5, y - 8);
      g.fillStyle = a.status === 'bekerja' ? '#1E9E62' : a.status === 'menunggu' ? '#C98A12' : '#8C857A';
      g.beginPath();
      g.arc(x - w2 / 2 + 3, y - 8, 3, 0, Math.PI * 2);
      g.fill();
    }
    y -= th + 6;

    if (!a.bubble) return;
    const limit = tiny ? 26 : 62;
    const text = a.bubble.length > limit ? `${a.bubble.slice(0, limit - 1)}…` : a.bubble;
    g.font = `600 11px ${FONT}`;
    const maxW = small ? 130 : 170;
    const lines: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (g.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    const bw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 16;
    const bh = lines.length * 14 + 10;
    g.fillStyle = '#fff';
    g.strokeStyle = def.color;
    g.beginPath();
    g.roundRect(x - bw / 2, y - bh, bw, bh, 10);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x - 5, y - 1);
    g.lineTo(x, y + 5);
    g.lineTo(x + 5, y - 1);
    g.fillStyle = '#fff';
    g.fill();
    g.strokeStyle = def.color;
    g.beginPath();
    g.moveTo(x - 5, y);
    g.lineTo(x, y + 5);
    g.lineTo(x + 5, y);
    g.stroke();
    g.fillStyle = '#2E2A25';
    lines.forEach((l, i) => g.fillText(l, x, y - bh + 12 + i * 14));
  }
}
