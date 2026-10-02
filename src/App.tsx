import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { connect, useStore, type CameraPreset } from './store';
import { LiveCard, StatsCard, TitleCard } from './components/Header';
import { ActivityFeed } from './components/ActivityFeed';
import { RightPanel } from './components/RightPanel';
import { AgentBar } from './components/AgentBar';
import { ChatBar, StartCard } from './components/Composer';
import { ArtifactModal } from './components/ArtifactModal';

// Scene 3D dimuat terpisah agar mode ringkas tidak ikut mengunduh Three.js.
const Office = lazy(() => import('./scene/Office'));
const IsoOfficeView = lazy(() => import('./scene2d/IsoOfficeView'));

const COMPACT_BELOW = 1180;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < COMPACT_BELOW);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < COMPACT_BELOW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'isometrik', label: 'Isometrik' },
  { id: 'depan', label: 'Depan' },
  { id: 'papan', label: 'Papan tulis' },
  { id: 'atas', label: 'Atas' },
];
// preset untuk kantor isometrik 2D (tanpa orbit)
const PRESETS_2D: { id: CameraPreset; label: string }[] = [
  { id: 'isometrik', label: 'Seluruh kantor' },
  { id: 'depan', label: 'Meja kerja' },
  { id: 'papan', label: 'Papan tulis' },
];

function CameraBar() {
  const preset = useStore((s) => s.camera.preset);
  const setCamera = useStore((s) => s.setCamera);
  const sceneMode = useStore((s) => s.sceneMode);
  const setSceneMode = useStore((s) => s.setSceneMode);
  return (
    <div className="card flex items-center gap-1 px-1.5 py-1" role="group" aria-label="Sudut kamera">
      <span className="px-1.5 text-[11px] font-semibold text-ink-mute">Kamera</span>
      {(sceneMode === '3d' ? PRESETS : PRESETS_2D).map((p) => (
        <button
          key={p.id} onClick={() => setCamera(p.id)} aria-pressed={preset === p.id}
          className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
            preset === p.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100'
          }`}
        >
          {p.label}
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-4 w-px bg-stone-200" />
      <button
        onClick={() => setSceneMode(sceneMode === '3d' ? '2d' : '3d')}
        title="Ganti antara kantor 3D (Three.js) dan kantor isometrik 2D"
        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-soft transition hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {sceneMode === '3d' ? 'Tampilan 2D' : 'Tampilan 3D'}
      </button>
    </div>
  );
}

function ModeToggle({ compact, narrow }: { compact: boolean; narrow: boolean }) {
  const setCompact = useStore((s) => s.setCompact);
  return (
    <button
      className="btn-ghost"
      onClick={() => setCompact(compact ? (narrow ? false : null) : true)}
      title={compact ? 'Tampilkan kantor 3D' : 'Sembunyikan kantor 3D dan tampilkan panel saja'}
    >
      {compact ? 'Tampilkan kantor 3D' : 'Mode ringkas'}
    </button>
  );
}

/** Bila WebGL tidak tersedia atau scene gagal dimuat, aplikasi tetap bisa dipakai lewat mode ringkas. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Scene gagal dimuat:', error);
    // WebGL/Three.js bermasalah → beralih otomatis ke kantor isometrik 2D
    if (useStore.getState().sceneMode === '3d') {
      useStore.getState().setSceneMode('2d');
      this.setState({ failed: false });
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-cream-200 p-6 text-center">
        <p className="text-sm font-bold">Kantor tidak bisa ditampilkan di perangkat ini.</p>
        <p className="max-w-sm text-xs text-ink-soft">Semua panel tetap berfungsi. Pakai mode ringkas untuk tampilan tanpa kantor.</p>
        <button className="btn-primary" onClick={() => useStore.getState().setCompact(true)}>Buka mode ringkas</button>
      </div>
    );
  }
}

function SceneFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-cream-200 text-sm font-semibold text-ink-mute">
      Menyiapkan kantor…
    </div>
  );
}

/** Tata letak penuh: scene 3D sebagai latar, panel sebagai overlay. */
function FullLayout({ narrow }: { narrow: boolean }) {
  const hasSession = useStore((s) => !!s.session);
  const fullOffice = useStore((s) => s.fullOffice);
  const toggleFullOffice = useStore((s) => s.toggleFullOffice);
  const sceneMode = useStore((s) => s.sceneMode);

  return (
    <div className="relative h-full w-full overflow-hidden bg-cream-200">
      {/* `isolate` menjaga name tag/bubble 3D tetap di bawah panel UI */}
      <div className="absolute inset-0 isolate">
        <SceneBoundary>
          <Suspense fallback={<SceneFallback />}>
            {sceneMode === '3d' ? <Office /> : <IsoOfficeView />}
          </Suspense>
        </SceneBoundary>
      </div>

      {fullOffice ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto"><CameraBar /></div>
          <button className="btn-primary pointer-events-auto" onClick={toggleFullOffice}>Tampilkan panel</button>
        </div>
      ) : (
        <>
          <header className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
            <div className="pointer-events-auto min-w-0 max-w-[360px] flex-1"><TitleCard /></div>
            <div className="pointer-events-auto"><LiveCard /></div>
            <div className="pointer-events-auto"><StatsCard /></div>
          </header>

          <aside className="pointer-events-none absolute bottom-[164px] left-3 top-[104px] flex w-[310px] flex-col">
            <div className="pointer-events-auto flex min-h-0 flex-1 flex-col"><ActivityFeed /></div>
          </aside>

          <aside className="absolute bottom-[164px] right-3 top-[104px] w-[370px]">
            <RightPanel />
          </aside>

          <div className="pointer-events-none absolute left-[334px] right-[394px] top-[104px] flex flex-wrap items-center justify-center gap-2">
            <div className="pointer-events-auto"><CameraBar /></div>
            <div className="pointer-events-auto"><ModeToggle compact={false} narrow={narrow} /></div>
          </div>

          <div className="pointer-events-none absolute bottom-[164px] left-[334px] right-[394px] flex justify-center">
            <div className="pointer-events-auto w-full max-w-xl">{hasSession ? <ChatBar /> : <StartCard />}</div>
          </div>

          <footer className="absolute inset-x-3 bottom-3">
            <AgentBar columns={6} />
          </footer>
        </>
      )}
    </div>
  );
}

/** Mode ringkas: tanpa 3D, hanya panel, untuk layar kecil. */
function CompactLayout({ narrow }: { narrow: boolean }) {
  const hasSession = useStore((s) => !!s.session);
  return (
    <div className="thin-scroll h-full overflow-y-auto bg-gradient-to-b from-cream-100 to-cream-200">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
        <TitleCard />
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="min-w-[220px] flex-1"><LiveCard /></div>
          <div className="thin-scroll max-w-full overflow-x-auto"><StatsCard showOfficeButton={false} /></div>
        </div>
        <div className="flex justify-end"><ModeToggle compact narrow={narrow} /></div>
        {hasSession ? <ChatBar /> : <StartCard />}
        <AgentBar columns={2} />
        <div className="h-[460px]"><RightPanel /></div>
        <div className="h-[460px]"><ActivityFeed collapsible={false} /></div>
      </div>
    </div>
  );
}

export default function App() {
  const narrow = useIsNarrow();
  const override = useStore((s) => s.compactOverride);
  const compact = override ?? narrow;

  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="h-full w-full">
      {compact ? <CompactLayout narrow={narrow} /> : <FullLayout narrow={narrow} />}
      <ArtifactModal />
    </div>
  );
}
