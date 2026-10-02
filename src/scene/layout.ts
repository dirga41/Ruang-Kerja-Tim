import type { AgentAnim, AgentId } from '../shared/types';

/**
 * Denah kantor (satuan ≈ meter). Sumbu X ke kanan, Z ke arah kamera.
 * Dua baris meja; avatar duduk di belakang meja menghadap +Z (ke kamera).
 */
export const ROOM = { w: 18, d: 13, h: 4.6, backZ: -6.5, leftX: -9 };

export const DESKS: Record<AgentId, { x: number; z: number; row: 0 | 1 }> = {
  anggrek: { x: -4.2, z: -2.2, row: 0 },
  azza: { x: 0, z: -2.2, row: 0 },
  melati: { x: 4.2, z: -2.2, row: 0 },
  mawar: { x: -4.2, z: 1.8, row: 1 },
  lavender: { x: 0, z: 1.8, row: 1 },
  teratai: { x: 4.2, z: 1.8, row: 1 },
};

/** kursi berada di belakang meja */
export const SEAT_OFFSET = -0.9;
export const seatOf = (id: AgentId) => ({ x: DESKS[id].x, z: DESKS[id].z + SEAT_OFFSET });

/** Lorong horizontal di belakang kursi tiap baris, dan gang vertikal di antara meja. */
const CORRIDOR_Z = [-3.85, 0.25] as const;
const AISLE_X = [-2.1, 2.1] as const;

export const BOARD = { x: -3.2, y: 2.45, w: 5.2, h: 2.9 };
const BOARD_SLOTS: Record<AgentId, number> = { azza: 0, anggrek: -1.5, melati: 1.5, mawar: -0.8, lavender: 0.8, teratai: 2.1 };

export interface Pt { x: number; z: number }
export interface Dest extends Pt {
  kind: 'seat' | 'board' | 'talk';
  /** arah hadap (yaw) setelah tiba */
  yaw: number;
}

const corridorOf = (z: number) => (z < -1.7 ? 0 : 1);

/** Tujuan avatar berdasarkan animasi yang dikirim server. */
export function destinationFor(id: AgentId, anim: AgentAnim, target: AgentId | null): Dest {
  if (anim === 'ke_papan') {
    return { kind: 'board', x: BOARD.x + BOARD_SLOTS[id], z: ROOM.backZ + 1.25, yaw: Math.PI * 0.82 };
  }
  if (anim === 'berbicara' && target && target !== id) {
    const t = seatOf(target);
    const me = seatOf(id);
    const side = me.x >= t.x ? 1 : -1;
    const x = t.x + side * 1.05;
    const z = CORRIDOR_Z[DESKS[target].row] + 0.25;
    return { kind: 'talk', x, z, yaw: Math.atan2(t.x - x, t.z - z) };
  }
  const s = seatOf(id);
  return { kind: 'seat', x: s.x, z: s.z, yaw: 0 };
}

/** Rute sederhana lewat lorong agar avatar tidak menembus meja. */
export function planPath(from: Pt, to: Pt): Pt[] {
  const cFrom = corridorOf(from.z);
  const cTo = corridorOf(to.z);
  const pts: Pt[] = [{ x: from.x, z: CORRIDOR_Z[cFrom] }];
  if (cFrom !== cTo) {
    const ax = (from.x + to.x) / 2 < 0 ? AISLE_X[0] : AISLE_X[1];
    pts.push({ x: ax, z: CORRIDOR_Z[cFrom] }, { x: ax, z: CORRIDOR_Z[cTo] });
  }
  pts.push({ x: to.x, z: CORRIDOR_Z[cTo] }, { x: to.x, z: to.z });
  // buang titik yang berimpit
  const out: Pt[] = [];
  let prev = from;
  for (const p of pts) {
    if (Math.hypot(p.x - prev.x, p.z - prev.z) > 0.05) {
      out.push(p);
      prev = p;
    }
  }
  return out;
}

type V3 = [number, number, number];
export const CAMERA_PRESETS: Record<'isometrik' | 'depan' | 'papan' | 'atas', { position: V3; target: V3 }> = {
  isometrik: { position: [15.5, 12.5, 16.5], target: [0, 1.1, -1.4] },
  depan: { position: [0, 7.5, 23], target: [0, 1.6, -2] },
  papan: { position: [-1.2, 3.4, 3.2], target: [BOARD.x, BOARD.y, ROOM.backZ] },
  atas: { position: [0, 30, 0.6], target: [0, 0, -1] },
};
