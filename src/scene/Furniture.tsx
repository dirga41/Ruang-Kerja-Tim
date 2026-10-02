import { useMemo } from 'react';
import * as THREE from 'three';
import { AGENTS, AGENT_IDS, type AgentId } from '../shared/types';
import { useStore } from '../store';
import { DESKS, ROOM, SEAT_OFFSET } from './layout';

const WOOD = '#DDB887';
const WOOD_DARK = '#B98F5E';
const WHITE = '#FBF7EF';

function Box({ args, position, color, rotation, cast = true, receive = false }: {
  args: [number, number, number]; position: [number, number, number]; color: string;
  rotation?: [number, number, number]; cast?: boolean; receive?: boolean;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={args} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  );
}

/** Meja + monitor + kursi untuk satu agent. Layar menyala saat agent bekerja. */
function Workstation({ id }: { id: AgentId }) {
  const { x, z } = DESKS[id];
  const def = AGENTS[id];
  const working = useStore((s) => s.session?.agents[id]?.status === 'bekerja');
  return (
    <group position={[x, 0, z]}>
      {/* meja */}
      <Box args={[2.3, 0.08, 1.1]} position={[0, 0.76, 0]} color={WOOD} receive />
      {([[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const).map(([lx, lz], i) => (
        <Box key={i} args={[0.07, 0.72, 0.07]} position={[lx, 0.36, lz]} color={WHITE} />
      ))}
      {/* monitor: layar menghadap avatar (-Z), punggung beraksen warna agent */}
      <Box args={[0.3, 0.03, 0.2]} position={[0, 0.815, 0.22]} color="#C9C4BA" />
      <Box args={[0.06, 0.22, 0.05]} position={[0, 0.92, 0.24]} color="#C9C4BA" />
      <Box args={[0.95, 0.56, 0.05]} position={[0, 1.28, 0.22]} color="#EDEAE3" />
      <mesh position={[0, 1.28, 0.193]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.87, 0.48]} />
        <meshBasicMaterial color={working ? '#DDF1FF' : '#39404A'} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.28, 0.247]}>
        <circleGeometry args={[0.09, 20]} />
        <meshBasicMaterial color={def.color} toneMapped={false} />
      </mesh>
      {/* keyboard, mug, buku catatan */}
      <Box args={[0.5, 0.025, 0.16]} position={[0, 0.815, -0.25]} color="#F4F1EA" cast={false} />
      <mesh position={[0.72, 0.86, -0.15]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.12, 10]} />
        <meshLambertMaterial color={def.color} flatShading />
      </mesh>
      <Box args={[0.26, 0.03, 0.34]} position={[-0.75, 0.815, -0.1]} color={def.soft} rotation={[0, 0.25, 0]} cast={false} />

      {/* kursi */}
      <group position={[0, 0, SEAT_OFFSET]}>
        <Box args={[0.52, 0.08, 0.5]} position={[0, 0.45, 0]} color="#F2EDE4" />
        <Box args={[0.5, 0.62, 0.08]} position={[0, 0.84, -0.27]} color={def.soft} rotation={[-0.12, 0, 0]} />
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.42, 8]} />
          <meshLambertMaterial color="#9A958C" />
        </mesh>
        <mesh position={[0, 0.03, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.3, 0.05, 5]} />
          <meshLambertMaterial color="#9A958C" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.5, 8]} />
        <meshLambertMaterial color="#E9DFCF" flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.5, 6]} />
        <meshLambertMaterial color="#7A5A3A" />
      </mesh>
      {([[0, 1.15, 0, 0.42], [0.25, 0.92, 0.1, 0.3], [-0.22, 0.98, -0.08, 0.32], [0.05, 1.42, -0.05, 0.26]] as const).map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]} castShadow>
          <icosahedronGeometry args={[r, 0]} />
          <meshLambertMaterial color={i % 2 ? '#6FBF8B' : '#4FA574'} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Tekstur pemandangan kota malam untuk jendela (dibuat sekali, acak berseed). */
function useCityTexture(seed: number) {
  return useMemo(() => {
    let s = seed;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 384;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, c.height);
    sky.addColorStop(0, '#0B1433');
    sky.addColorStop(0.6, '#253A73');
    sky.addColorStop(1, '#6B5B95');
    g.fillStyle = sky;
    g.fillRect(0, 0, c.width, c.height);
    // bintang dan bulan
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      g.fillRect(rnd() * c.width, rnd() * c.height * 0.55, 1.6, 1.6);
    }
    g.fillStyle = '#FFF4D6';
    g.beginPath();
    g.arc(c.width * 0.82, 70, 26, 0, Math.PI * 2);
    g.fill();
    // dua lapis gedung
    for (const layer of [0, 1]) {
      let x = -10;
      while (x < c.width) {
        const w = 34 + rnd() * 56;
        const h = (layer ? 90 : 150) + rnd() * (layer ? 130 : 150);
        const top = c.height - h;
        g.fillStyle = layer ? '#0E1730' : '#1B2A55';
        g.fillRect(x, top, w, h);
        for (let wy = top + 10; wy < c.height - 8; wy += 14) {
          for (let wx = x + 6; wx < x + w - 8; wx += 11) {
            if (rnd() < (layer ? 0.42 : 0.3)) {
              g.fillStyle = rnd() < 0.8 ? '#FFD98A' : '#BFE3FF';
              g.fillRect(wx, wy, 5, 7);
            }
          }
        }
        x += w + 3 + rnd() * 10;
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [seed]);
}

function WindowWall({ width, height, seed }: { width: number; height: number; seed: number }) {
  const tex = useCityTexture(seed);
  const panes = Math.max(2, Math.round(width / 1.9));
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* kusen */}
      <Box args={[width + 0.24, 0.12, 0.12]} position={[0, height / 2 + 0.06, 0.03]} color={WHITE} cast={false} />
      <Box args={[width + 0.24, 0.14, 0.2]} position={[0, -height / 2 - 0.07, 0.06]} color={WHITE} cast={false} />
      {Array.from({ length: panes + 1 }, (_, i) => (
        <Box key={i} args={[0.09, height, 0.1]} position={[-width / 2 + (i * width) / panes, 0, 0.03]} color={WHITE} cast={false} />
      ))}
    </group>
  );
}

export function Room() {
  const { w, d, h, backZ, leftX } = ROOM;
  const midZ = backZ + d / 2;
  return (
    <group>
      {/* lantai kayu terang + karpet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshLambertMaterial color="#EBD6B4" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[leftX + ((i + 1) * w) / 10, 0.004, midZ]}>
          <planeGeometry args={[0.03, d]} />
          <meshBasicMaterial color="#DCC39B" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -0.6]} receiveShadow>
        <planeGeometry args={[12.6, 7.4]} />
        <meshLambertMaterial color="#F7EEDF" />
      </mesh>

      {/* dinding belakang dan kiri */}
      <Box args={[w + 0.3, h, 0.3]} position={[0, h / 2, backZ - 0.15]} color="#FBF3E4" cast={false} receive />
      <Box args={[0.3, h, d]} position={[leftX - 0.15, h / 2, midZ]} color="#F6EBD8" cast={false} receive />
      <Box args={[w, 0.16, 0.06]} position={[0, 0.08, backZ + 0.03]} color={WOOD_DARK} cast={false} />
      <Box args={[0.06, 0.16, d]} position={[leftX + 0.03, 0.08, midZ]} color={WOOD_DARK} cast={false} />

      {/* jendela kota malam: dinding belakang (kanan) dan dinding kiri */}
      <group position={[4.6, 2.55, backZ + 0.02]}>
        <WindowWall width={7.6} height={2.7} seed={7} />
      </group>
      <group position={[leftX + 0.02, 2.55, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <WindowWall width={7.6} height={2.7} seed={21} />
      </group>

      {/* meja kerja */}
      {AGENT_IDS.map((id) => <Workstation key={id} id={id} />)}

      {/* tanaman */}
      <Plant position={[8.1, 0, backZ + 0.8]} scale={1.15} />
      <Plant position={[leftX + 0.9, 0, backZ + 0.8]} />
      <Plant position={[leftX + 0.9, 0, 5.4]} scale={1.25} />
      <Plant position={[8.1, 0, 4.9]} />
      <Plant position={[-2.1, 0, 3.9]} scale={0.7} />

      {/* rak buku di dinding kiri */}
      <group position={[leftX + 0.35, 0, -4.6]}>
        <Box args={[0.5, 1.5, 1.8]} position={[0, 0.75, 0]} color={WOOD} />
        {[0.35, 0.8, 1.25].map((y) => (
          <group key={y}>
            {[-0.6, -0.3, 0, 0.3, 0.6].map((bz, i) => (
              <Box
                key={bz} args={[0.3, 0.3, 0.16]} position={[0.14, y, bz]}
                color={AGENTS[AGENT_IDS[(i + Math.round(y * 10)) % AGENT_IDS.length]].color} cast={false}
              />
            ))}
          </group>
        ))}
      </group>

      {/* sudut santai: sofa + meja kopi */}
      <group position={[6.6, 0, 4.6]} rotation={[0, -Math.PI / 2, 0]}>
        <Box args={[2.2, 0.4, 0.9]} position={[0, 0.3, 0]} color="#F3C9B5" />
        <Box args={[2.2, 0.55, 0.22]} position={[0, 0.72, -0.36]} color="#EDB9A1" />
        <Box args={[0.22, 0.3, 0.9]} position={[-1.1, 0.6, 0]} color="#EDB9A1" />
        <Box args={[0.22, 0.3, 0.9]} position={[1.1, 0.6, 0]} color="#EDB9A1" />
        <mesh position={[0, 0.38, 1.2]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.06, 16]} />
          <meshLambertMaterial color={WOOD} />
        </mesh>
        <mesh position={[0, 0.18, 1.2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 8]} />
          <meshLambertMaterial color={WHITE} />
        </mesh>
      </group>

      {/* lampu gantung */}
      {[-4.2, 0, 4.2].map((lx) => (
        <group key={lx} position={[lx, 0, -0.2]}>
          <mesh position={[0, 4.0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.2, 4]} />
            <meshBasicMaterial color="#8C857A" />
          </mesh>
          <mesh position={[0, 3.3, 0]}>
            <coneGeometry args={[0.42, 0.34, 10, 1, true]} />
            <meshLambertMaterial color="#FFE9B8" side={THREE.DoubleSide} flatShading />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#FFF6D8" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
