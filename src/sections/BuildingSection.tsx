import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuildingScene, type BuildingViewMode } from '../building/BuildingScene';
import { paletteForBuilding } from '../building/palette';
import {
  BUILDING_TYPES,
  BUILDING_TYPE_ORDER,
  type BuildingTypeId,
} from '../building/types';
import { ShareIcon, HouseIcon, TowerIcon, ShrineIcon } from '../ui/icons';

const DEFAULT_URL = 'https://example.com';
const REBUILD_DELAY = 500;

const TYPE_ICONS: Record<BuildingTypeId, () => React.ReactElement> = {
  house: HouseIcon,
  tower: TowerIcon,
  shrine: ShrineIcon,
};

export function BuildingSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BuildingScene | null>(null);

  const [draft, setDraft] = useState(DEFAULT_URL);
  const [committed, setCommitted] = useState(DEFAULT_URL);
  const [buildingType, setBuildingType] = useState<BuildingTypeId>('house');
  const [mode, setMode] = useState<BuildingViewMode>('model');
  const [toast, setToast] = useState<string | null>(null);
  const [finePointer, setFinePointer] = useState(false);

  const palette = useMemo(
    () => paletteForBuilding(BUILDING_TYPES[buildingType].paletteId),
    [buildingType],
  );

  const typeLabel = BUILDING_TYPES[buildingType].label.toLowerCase();

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new BuildingScene(canvasRef.current, committed, buildingType);
    sceneRef.current = scene;
    const onResize = () => scene.resize();
    window.addEventListener('orientationchange', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(canvasRef.current);
    return () => {
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setText(committed);
  }, [committed]);

  useEffect(() => {
    sceneRef.current?.setBuildingType(buildingType);
  }, [buildingType]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const report = () => sceneRef.current?.setDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setCommitted(draft.trim() || DEFAULT_URL), REBUILD_DELAY);
    return () => window.clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'model' ? 'code' : 'model'));
  }, []);

  const share = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Magic Building',
          text: 'A building that is also a scannable QR code.',
          url: committed,
        });
        return;
      }
      await navigator.clipboard.writeText(committed);
      setToast('Link copied');
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setToast('Could not share');
    }
  }, [committed]);

  const onCanvasKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMode();
    }
  };

  const hint =
    mode === 'model'
      ? finePointer
        ? `Click the ${typeLabel} to see the QR code`
        : `Tap the ${typeLabel} to see the QR code`
      : finePointer
        ? `Click to see the ${typeLabel}`
        : `Tap to see the ${typeLabel}`;

  return (
    <div className="stage stage--building" style={{ background: palette.ground }}>
      <div className="section-badge" aria-hidden="true">
        {BUILDING_TYPES[buildingType].label}
      </div>

      <canvas
        ref={canvasRef}
        className="stage__canvas"
        role="button"
        tabIndex={0}
        aria-label={hint}
        onClick={toggleMode}
        onKeyDown={onCanvasKey}
      />

      <div className="dock" ref={dockRef}>
        <div className="dock__toast-anchor">
          {toast && <div className="toast">{toast}</div>}
          <button className="hint" type="button" onClick={toggleMode}>
            {hint}
          </button>
        </div>

        <div className="field">
          <input
            className="field__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://your-link.com"
            aria-label="Link to encode"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            className="field__action"
            type="button"
            onClick={share}
            aria-label="Share this building"
          >
            <ShareIcon />
          </button>
        </div>

        <div className="trees" role="radiogroup" aria-label="Building shape">
          {BUILDING_TYPE_ORDER.map((id) => {
            const Icon = TYPE_ICONS[id];
            return (
              <button
                key={id}
                className="tree"
                type="button"
                role="radio"
                title={BUILDING_TYPES[id].label}
                aria-checked={buildingType === id}
                aria-pressed={buildingType === id}
                onClick={() => setBuildingType(id)}
              >
                <Icon />
                <span className="tree__label">{BUILDING_TYPES[id].label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
