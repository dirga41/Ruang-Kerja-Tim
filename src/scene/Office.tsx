import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { AGENT_IDS } from '../shared/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Room } from './Furniture';
import { Whiteboard } from './Whiteboard';
import { CAMERA_PRESETS } from './layout';

/** Menggerakkan kamera secara halus ke preset yang dipilih, lalu melepas kendali ke pengguna. */
function CameraRig() {
  const { preset, tick } = useStore((s) => s.camera);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
    goal.current = { pos: new THREE.Vector3(...p.position), target: new THREE.Vector3(...p.target) };
  }, [preset, tick]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-5 * Math.min(dt, 0.1));
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.target) < 0.05) goal.current = null;
  });
  return null;
}

export default function Office() {
  const start = CAMERA_PRESETS.isometrik;
  return (
    <Canvas
      shadows
      flat
      dpr={[1, 1.75]}
      camera={{ position: start.position, fov: 30, near: 0.5, far: 120 }}
      aria-label="Kantor virtual 3D tim analis sistem"
    >
      <color attach="background" args={['#F1E6D3']} />
      <ambientLight intensity={1.25} color="#FFF8EC" />
      <hemisphereLight args={['#FFFDF6', '#E3CFAE', 0.9]} />
      <directionalLight
        position={[9, 15, 11]}
        intensity={1.9}
        color="#FFF3DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
      />

      <Room />
      <Whiteboard />
      {AGENT_IDS.map((id) => <Avatar key={id} id={id} />)}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={42}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2.1}
        target={start.target}
      />
      <CameraRig />
    </Canvas>
  );
}
