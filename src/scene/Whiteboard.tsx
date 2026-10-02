import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { AGENTS, type Whiteboard as WB } from '../shared/types';
import { useStore } from '../store';
import { renderMermaid, svgToImage } from '../lib/mermaid';
import { BOARD, ROOM } from './layout';

const TEX_W = 1280;
const TEX_H = Math.round((TEX_W * BOARD.h) / BOARD.w);

function draw(canvas: HTMLCanvasElement, wb: WB | null, diagram: { img: HTMLImageElement; width: number; height: number } | null, failed = false) {
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.textBaseline = 'middle';
  if (!wb) {
    g.fillStyle = '#B8AE9C';
    g.textAlign = 'center';
    g.font = '700 54px "Plus Jakarta Sans", Arial, sans-serif';
    g.fillText('Papan tulis tim', TEX_W / 2, TEX_H / 2 - 30);
    g.font = '500 30px "Plus Jakarta Sans", Arial, sans-serif';
    g.fillText('Diagram yang sedang dikerjakan tampil di sini', TEX_W / 2, TEX_H / 2 + 36);
    return;
  }
  const a = AGENTS[wb.agent];
  // kepala: judul diagram + nama agent
  g.fillStyle = a.soft;
  g.fillRect(0, 0, TEX_W, 84);
  g.fillStyle = a.color;
  g.fillRect(0, 84, TEX_W, 5);
  g.beginPath();
  g.arc(48, 42, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = a.ink;
  g.textAlign = 'left';
  g.font = '700 38px "Plus Jakarta Sans", Arial, sans-serif';
  g.fillText(wb.title.length > 44 ? `${wb.title.slice(0, 43)}…` : wb.title, 78, 44);
  g.textAlign = 'right';
  g.font = '600 26px "Plus Jakarta Sans", Arial, sans-serif';
  g.fillText(`oleh ${a.name}`, TEX_W - 32, 44);

  const top = 108;
  const pad = 28;
  const areaW = TEX_W - pad * 2;
  const areaH = TEX_H - top - pad;
  if (diagram) {
    const k = Math.min(areaW / diagram.width, areaH / diagram.height);
    const w = diagram.width * k;
    const h = diagram.height * k;
    g.drawImage(diagram.img, pad + (areaW - w) / 2, top + (areaH - h) / 2, w, h);
  } else {
    g.fillStyle = '#A39A8A';
    g.textAlign = 'center';
    g.font = '500 30px "Plus Jakarta Sans", Arial, sans-serif';
    g.fillText(failed ? 'Diagram tidak bisa digambar. Buka tab Output untuk melihatnya.' : 'Menggambar diagram…', TEX_W / 2, top + areaH / 2);
  }
}

/** Papan tulis besar di dinding belakang; menampilkan diagram Mermaid terbaru. */
export function Whiteboard() {
  const wb = useStore((s) => s.session?.whiteboard ?? null);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    draw(canvas, null, null);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  useEffect(() => {
    let off = false;
    const canvas = texture.image as HTMLCanvasElement;
    draw(canvas, wb, null);
    texture.needsUpdate = true;
    if (wb) {
      renderMermaid(wb.code)
        .then(svgToImage)
        .then((d) => {
          if (off) return;
          draw(canvas, wb, d);
          texture.needsUpdate = true;
        })
        .catch(() => {
          if (off) return;
          draw(canvas, wb, null, true);
          texture.needsUpdate = true;
        });
    }
    return () => {
      off = true;
    };
  }, [wb, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={[BOARD.x, BOARD.y, ROOM.backZ]}>
      {/* bingkai */}
      <mesh position={[0, 0, 0.04]} castShadow>
        <boxGeometry args={[BOARD.w + 0.22, BOARD.h + 0.22, 0.08]} />
        <meshLambertMaterial color="#C9C2B4" flatShading />
      </mesh>
      <mesh position={[0, 0, 0.085]}>
        <planeGeometry args={[BOARD.w, BOARD.h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* tempat spidol */}
      <mesh position={[0, -BOARD.h / 2 - 0.16, 0.14]} castShadow>
        <boxGeometry args={[BOARD.w * 0.6, 0.05, 0.16]} />
        <meshLambertMaterial color="#C9C2B4" flatShading />
      </mesh>
      {['#E0647A', '#5B8DEF', '#4FB286'].map((c, i) => (
        <mesh key={c} position={[-0.5 + i * 0.3, -BOARD.h / 2 - 0.11, 0.14]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.2, 6]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}
