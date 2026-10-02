import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { AGENTS, STATUS_LABEL, type AgentId, type AgentState } from '../shared/types';
import { useStore } from '../store';
import { clip } from '../lib/format';
import { destinationFor, planPath, seatOf, type Dest, type Pt } from './layout';

const WALK_SPEED = 2.4;
const damp = THREE.MathUtils.damp;

/** selisih sudut terpendek */
function angleTo(current: number, target: number) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + d;
}

const IDLE: Omit<AgentState, 'id'> = { status: 'istirahat', anim: 'istirahat', target: null, task: null, bubble: null, sessions: 0, tokens: 0, actions: 0 };

function Hair({ style, color }: { style: (typeof AGENTS)[AgentId]['hairStyle']; color: string }) {
  const mat = <meshLambertMaterial color={color} flatShading />;
  if (style === 'hijab') {
    return (
      <group>
        <mesh position={[0, 0.02, -0.035]} castShadow>
          <sphereGeometry args={[0.235, 10, 8]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.24, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.3, 0.2, 8]} />
          {mat}
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.055, -0.04]} scale={[1.06, 0.92, 1.06]} castShadow>
        <sphereGeometry args={[0.205, 10, 8]} />
        {mat}
      </mesh>
      {style === 'panjang' && (
        <mesh position={[0, -0.14, -0.15]} castShadow>
          <boxGeometry args={[0.36, 0.42, 0.12]} />
          {mat}
        </mesh>
      )}
      {style === 'sanggul' && (
        <mesh position={[0, 0.24, -0.1]} castShadow>
          <sphereGeometry args={[0.095, 8, 6]} />
          {mat}
        </mesh>
      )}
      {style === 'kuncir' && (
        <mesh position={[0, 0.02, -0.27]} rotation={[0.5, 0, 0]} scale={[0.7, 1.5, 0.7]} castShadow>
          <sphereGeometry args={[0.085, 8, 6]} />
          {mat}
        </mesh>
      )}
    </group>
  );
}

export function Avatar({ id }: { id: AgentId }) {
  const def = AGENTS[id];
  const agent = useStore((s) => s.session?.agents[id]) ?? { id, ...IDLE };

  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);

  // state gerak disimpan di ref agar tidak memicu render React tiap frame
  const motion = useRef<{ pos: Pt; yaw: number; path: Pt[]; dest: Dest; key: string; moving: boolean }>(
    (() => {
      const s = seatOf(id);
      return { pos: { ...s }, yaw: 0, path: [], dest: { kind: 'seat', x: s.x, z: s.z, yaw: 0 }, key: '', moving: false };
    })(),
  );
  const phase = useMemo(() => Math.random() * 10, []);

  // tujuan baru setiap kali animasi/target dari server berubah
  const destKey = `${agent.anim === 'ke_papan' ? 'board' : agent.anim === 'berbicara' ? `talk:${agent.target}` : 'seat'}`;
  if (motion.current.key !== destKey) {
    const m = motion.current;
    m.key = destKey;
    m.dest = destinationFor(id, agent.anim, agent.target);
    const far = Math.hypot(m.dest.x - m.pos.x, m.dest.z - m.pos.z) > 0.05;
    m.path = far ? planPath(m.pos, m.dest) : [];
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime + phase;
    const m = motion.current;
    if (!root.current || !torso.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current) return;

    // ---- berpindah tempat ----
    let step = WALK_SPEED * dt;
    m.moving = m.path.length > 0;
    while (m.path.length && step > 0) {
      const next = m.path[0];
      const dx = next.x - m.pos.x;
      const dz = next.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= step) {
        m.pos.x = next.x;
        m.pos.z = next.z;
        m.path.shift();
        step -= dist;
      } else {
        m.pos.x += (dx / dist) * step;
        m.pos.z += (dz / dist) * step;
        m.yaw = damp(m.yaw, angleTo(m.yaw, Math.atan2(dx, dz)), 12, dt);
        step = 0;
      }
    }

    // ---- pose target ----
    let torsoX = 0, headX = 0, headY = 0, aL = 0, aR = 0, lL = 0, lR = 0, bob = 0, armZ = 0.08;
    if (m.moving) {
      const sw = Math.sin(t * 9);
      lL = sw * 0.6; lR = -sw * 0.6; aL = -sw * 0.5; aR = sw * 0.5;
      bob = Math.abs(Math.cos(t * 9)) * 0.03;
    } else {
      m.yaw = damp(m.yaw, angleTo(m.yaw, m.dest.yaw), 8, dt);
      if (m.dest.kind === 'seat') {
        lL = lR = -Math.PI / 2;
        if (agent.anim === 'mengetik' || agent.status === 'bekerja') {
          // mengetik: lengan ke depan, jari naik-turun cepat
          torsoX = 0.1;
          aL = -1.25 + Math.sin(t * 16) * 0.07;
          aR = -1.25 + Math.sin(t * 16 + 1.7) * 0.07;
          headX = 0.12 + Math.sin(t * 1.3) * 0.03;
        } else if (agent.status === 'menunggu') {
          // menunggu: duduk tegak, menoleh pelan
          aL = aR = -0.9;
          headY = Math.sin(t * 0.8) * 0.45;
        } else {
          // istirahat: menyandar ke kursi
          torsoX = -0.3 + Math.sin(t * 0.9) * 0.015;
          headX = -0.18;
          aL = aR = -0.35;
          armZ = 0.22;
        }
      } else if (m.dest.kind === 'board') {
        // menunjuk papan tulis
        aR = -2.45 + Math.sin(t * 2.2) * 0.18;
        aL = 0.05;
        headX = -0.12;
      } else {
        // berbicara: tangan bergerak, kepala mengangguk
        aR = -0.9 + Math.sin(t * 5) * 0.3;
        aL = -0.25 + Math.sin(t * 3.1) * 0.12;
        headX = Math.sin(t * 4) * 0.07;
        bob = Math.abs(Math.sin(t * 2.5)) * 0.012;
      }
    }

    root.current.position.set(m.pos.x, bob, m.pos.z);
    root.current.rotation.y = m.yaw;
    const k = 10;
    torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, k, dt);
    head.current.rotation.x = damp(head.current.rotation.x, headX, k, dt);
    head.current.rotation.y = damp(head.current.rotation.y, headY, 4, dt);
    armL.current.rotation.x = damp(armL.current.rotation.x, aL, 14, dt);
    armR.current.rotation.x = damp(armR.current.rotation.x, aR, 14, dt);
    armL.current.rotation.z = damp(armL.current.rotation.z, -armZ, k, dt);
    armR.current.rotation.z = damp(armR.current.rotation.z, armZ, k, dt);
    legL.current.rotation.x = damp(legL.current.rotation.x, lL, 14, dt);
    legR.current.rotation.x = damp(legR.current.rotation.x, lR, 14, dt);
  });

  const seat = seatOf(id);
  const pants = '#4B4A57';
  return (
    <group ref={root} position={[seat.x, 0, seat.z]}>
      {/* kaki: pivot di pinggul */}
      <group ref={legL} position={[-0.1, 0.52, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.15, 0.5, 0.16]} />
          <meshLambertMaterial color={pants} flatShading />
        </mesh>
      </group>
      <group ref={legR} position={[0.1, 0.52, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.15, 0.5, 0.16]} />
          <meshLambertMaterial color={pants} flatShading />
        </mesh>
      </group>

      {/* badan, lengan, kepala: pivot di pinggul supaya bisa menyandar */}
      <group ref={torso} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <boxGeometry args={[0.44, 0.54, 0.27]} />
          <meshLambertMaterial color={def.color} flatShading />
        </mesh>
        <group ref={armL} position={[-0.28, 0.48, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <boxGeometry args={[0.11, 0.42, 0.12]} />
            <meshLambertMaterial color={def.color} flatShading />
          </mesh>
          <mesh position={[0, -0.44, 0]}>
            <sphereGeometry args={[0.062, 6, 5]} />
            <meshLambertMaterial color={def.skin} flatShading />
          </mesh>
        </group>
        <group ref={armR} position={[0.28, 0.48, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <boxGeometry args={[0.11, 0.42, 0.12]} />
            <meshLambertMaterial color={def.color} flatShading />
          </mesh>
          <mesh position={[0, -0.44, 0]}>
            <sphereGeometry args={[0.062, 6, 5]} />
            <meshLambertMaterial color={def.skin} flatShading />
          </mesh>
        </group>
        <group ref={head} position={[0, 0.76, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshLambertMaterial color={def.skin} />
          </mesh>
          <mesh position={[-0.07, 0.01, 0.185]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshBasicMaterial color="#2a2320" />
          </mesh>
          <mesh position={[0.07, 0.01, 0.185]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshBasicMaterial color="#2a2320" />
          </mesh>
          <Hair style={def.hairStyle} color={def.hair} />
        </group>
      </group>

      {/* name tag + speech bubble (DOM, ukuran tetap agar selalu terbaca) */}
      <Html position={[0, 1.78, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 190 }}>
          {agent.bubble && (
            <div
              key={agent.bubble}
              className="bubble-in"
              style={{
                background: '#fff', color: '#2E2A25', border: `1.5px solid ${def.color}`, borderRadius: 12,
                padding: '4px 8px', fontSize: 11, fontWeight: 600, lineHeight: 1.25, textAlign: 'center',
                boxShadow: '0 4px 14px -6px rgba(0,0,0,.35)', maxWidth: 190,
              }}
            >
              {clip(agent.bubble, 64)}
            </div>
          )}
          <div
            style={{
              background: def.soft, color: def.ink, border: `1.5px solid ${def.color}`, borderRadius: 999,
              padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'center',
            }}
          >
            {def.emoji} {def.name}
            <span style={{ fontWeight: 500, opacity: 0.9 }}> · {def.role.split(' · ')[0]}</span>
            <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600 }}>{STATUS_LABEL[agent.status]}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}
