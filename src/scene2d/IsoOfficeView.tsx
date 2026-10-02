import { useEffect, useRef } from 'react';
import { useStore, type CameraPreset } from '../store';
import { renderMermaid, svgToImage } from '../lib/mermaid';
import { IsoOffice, boardKindFor, type IsoBoard, type IsoView } from './isoOffice';

const VIEW: Record<CameraPreset, IsoView> = { isometrik: 'semua', depan: 'meja', papan: 'papan', atas: 'semua' };

/** Kantor isometrik 2D: tampilan alternatif tanpa WebGL dengan animasi yang sama. */
export default function IsoOfficeView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const office = useRef<IsoOffice | null>(null);
  const board = useRef<IsoBoard | null>(null);
  const wb = useStore((s) => s.session?.whiteboard ?? null);
  const camera = useStore((s) => s.camera);

  useEffect(() => {
    if (!canvas.current) return;
    const o = new IsoOffice(canvas.current, () => ({ agents: useStore.getState().session?.agents ?? {}, board: board.current }));
    office.current = o;
    o.start();
    return () => o.dispose();
  }, []);

  // papan tulis: sketsa dulu, lalu diganti gambar Mermaid begitu selesai dirender
  useEffect(() => {
    let off = false;
    board.current = wb ? { title: wb.title, agent: wb.agent, kind: boardKindFor(wb.title), image: null } : null;
    if (wb) {
      renderMermaid(wb.code)
        .then(svgToImage)
        .then((image) => {
          if (!off && board.current) board.current = { ...board.current, image };
        })
        .catch(() => undefined);
    }
    return () => {
      off = true;
    };
  }, [wb]);

  useEffect(() => {
    office.current?.setView(VIEW[camera.preset]);
  }, [camera]);

  return (
    <canvas
      ref={canvas}
      className="block h-full w-full"
      role="img"
      aria-label="Kantor virtual isometrik: agent bekerja di meja, berjalan ke papan tulis, dan saling berbicara"
    />
  );
}
