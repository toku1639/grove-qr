import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroveQrScene } from '../scene';
import {
  SEASONS,
  SEASON_ORDER,
  BLOSSOM_SWATCHES,
  AUTUMN_SWATCHES,
  type SeasonId,
  type BlossomId,
  type AutumnId,
  type Palette,
} from '../scene/palette';
import {
  CLIMATES,
  climatesForSeason,
  clampClimateToSeason,
  type ClimateId,
} from '../scene/climate';
import { SPECIES, SPECIES_ORDER, type SpeciesId } from '../scene/species';
import { Ambience } from '../audio/ambience';
import {
  SpringIcon,
  SummerIcon,
  AutumnIcon,
  WinterIcon,
  ShareIcon,
  InfoIcon,
  SoundOnIcon,
  SoundOffIcon,
  OakIcon,
  WillowIcon,
  BirchIcon,
  CalmIcon,
  WindIcon,
  RainIcon,
  SnowIcon,
} from '../ui/icons';

const DEFAULT_URL = 'https://example.com';
const SEASON_ICONS: Record<SeasonId, () => React.ReactElement> = {
  spring: SpringIcon,
  summer: SummerIcon,
  autumn: AutumnIcon,
  winter: WinterIcon,
};
const CLIMATE_ICONS: Record<ClimateId, () => React.ReactElement> = {
  calm: CalmIcon,
  wind: WindIcon,
  rain: RainIcon,
  snow: SnowIcon,
};
const SPECIES_ICONS: Record<SpeciesId, () => React.ReactElement> = {
  oak: OakIcon,
  willow: WillowIcon,
  birch: BirchIcon,
};

/** Debounce regrowing the tree so it does not thrash on every keystroke. */
const REBUILD_DELAY = 500;

export function TreeSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GroveQrScene | null>(null);
  const ambienceRef = useRef<Ambience | null>(null);

  const [draft, setDraft] = useState(DEFAULT_URL);
  const [committed, setCommitted] = useState(DEFAULT_URL);
  const [season, setSeason] = useState<SeasonId>('summer');
  const [climate, setClimate] = useState<ClimateId>('calm');
  const [species, setSpecies] = useState<SpeciesId>('oak');
  const [blossom, setBlossom] = useState<BlossomId>('sakura');
  const [autumnTint, setAutumnTint] = useState<AutumnId>('amber');
  const [muted, setMuted] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [finePointer, setFinePointer] = useState(false);

  const availableClimates = useMemo(() => climatesForSeason(season), [season]);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const palette = useMemo<Palette>(() => {
    const base = SEASONS[season];
    let tinted = base;
    if (season === 'spring') {
      const swatch = BLOSSOM_SWATCHES.find((s) => s.id === blossom) ?? BLOSSOM_SWATCHES[0];
      tinted = {
        ...base,
        leaf: [...swatch.leaf],
        qrLeaf: [...swatch.qr],
      };
    } else if (season === 'autumn') {
      const swatch = AUTUMN_SWATCHES.find((s) => s.id === autumnTint) ?? AUTUMN_SWATCHES[0];
      tinted = {
        ...base,
        leaf: [...swatch.leaf],
        qrLeaf: [...swatch.qr],
        hedge: [...swatch.leaf.slice(0, 3)],
      };
    }
    if (climate === 'rain') return { ...tinted, ground: '#ebe7df' };
    return tinted;
  }, [season, blossom, autumnTint, climate]);

  const pickSeason = useCallback((next: SeasonId) => {
    setSeason(next);
    setClimate((current) => clampClimateToSeason(next, current));
  }, []);

  // ---- scene lifecycle ---------------------------------------------------

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new GroveQrScene(canvasRef.current, committed, palette, SPECIES[species]);
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener('orientationchange', onResize);
    // Observing the canvas catches every size change, including the ones that
    // never fire a window resize -- a restored background tab, a container
    // relayout, or the canvas coming back from a zero-sized state.
    const ro = new ResizeObserver(onResize);
    ro.observe(canvasRef.current);

    return () => {
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // Built once; text and palette are pushed through imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    sceneRef.current?.setText(committed);
  }, [committed]);

  useEffect(() => {
    sceneRef.current?.setSpecies(species);
  }, [species]);

  useEffect(() => {
    sceneRef.current?.setClimate(climate);
  }, [climate]);

  // Report the dock's real height so the code is never framed underneath it.
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
    ambienceRef.current = new Ambience();
    return () => ambienceRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- interactions ------------------------------------------------------

  const toggleSound = useCallback(() => {
    const on = ambienceRef.current?.toggle() ?? false;
    setMuted(!on);
  }, []);

  const share = useCallback(async () => {
    const url = committed;
    const payload = {
      title: 'GroveQR',
      text: 'A little grove that is also a scannable QR code.',
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch (err) {
      // A cancelled share sheet is not a failure worth surfacing.
      if ((err as Error)?.name !== 'AbortError') setToast('Could not share');
    }
  }, [committed]);

  const hint = finePointer
    ? 'Drag to orbit · look straight down to scan'
    : 'Drag to orbit · top-down hides the tree so the QR can scan';

  return (
    <div className="stage stage--tree" style={{ background: palette.ground }}>
      <div className="section-badge" aria-hidden="true">
        GroveQR
      </div>

      <div className="info">
        <button
          className="info__btn"
          type="button"
          aria-expanded={showInfo}
          aria-label="About this project"
          onClick={() => setShowInfo((v) => !v)}
        >
          <InfoIcon />
        </button>
        {showInfo && (
          <div className="info__card" role="dialog" aria-label="About GroveQR">
            <p>
              Leaves sit on the data modules; the three finder corners are grass
              at the plot edge. Together they are the QR from above — nothing
              rearranges when you look down.
            </p>
            <p>
              Encoded at error-correction level H so the canopy can sit on the
              code and the result still scans.
            </p>
            <p>
              GroveQR — an original, open-source take on the isometric QR-tree
              idea. Built with React and three.js.
            </p>
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="stage__canvas"
        aria-label={hint}
      />

      <div className="dock" ref={dockRef}>
        <div className="dock__toast-anchor">
          {toast && <div className="toast">{toast}</div>}
          <div className="hint" role="status">
            {hint}
          </div>
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
            aria-label="Share this tree"
          >
            <ShareIcon />
          </button>
        </div>

        <div className="climates" role="radiogroup" aria-label="Climate">
          {availableClimates.map((id) => {
            const Icon = CLIMATE_ICONS[id];
            return (
              <button
                key={id}
                className="climate"
                type="button"
                role="radio"
                title={CLIMATES[id].label}
                aria-checked={climate === id}
                aria-pressed={climate === id}
                onClick={() => setClimate(id)}
              >
                <Icon />
                <span className="climate__label">{CLIMATES[id].label}</span>
              </button>
            );
          })}
        </div>

        <div className="trees">
          {SPECIES_ORDER.map((id) => {
            const Icon = SPECIES_ICONS[id];
            return (
              <button
                key={id}
                className="tree"
                type="button"
                title={SPECIES[id].label}
                aria-pressed={species === id}
                onClick={() => setSpecies(id)}
              >
                <Icon />
                <span className="tree__label">{SPECIES[id].label}</span>
              </button>
            );
          })}
        </div>

        <div className="seasons">
          {SEASON_ORDER.map((id) => {
            const Icon = SEASON_ICONS[id];
            return (
              <button
                key={id}
                className="season"
                type="button"
                aria-pressed={season === id}
                onClick={() => pickSeason(id)}
              >
                <Icon />
                <span className="season__label">{SEASONS[id].label}</span>
              </button>
            );
          })}
          <button
            className="mute"
            type="button"
            aria-pressed={!muted}
            aria-label={muted ? 'Turn ambience on' : 'Turn ambience off'}
            onClick={toggleSound}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        </div>

        <div className="blossoms">
          {season === 'spring' &&
            BLOSSOM_SWATCHES.map((s) => (
              <button
                key={s.id}
                className="blossom"
                type="button"
                aria-pressed={blossom === s.id}
                aria-label={`${s.label} blossom`}
                style={{ background: s.leaf[0] }}
                onClick={() => setBlossom(s.id)}
              />
            ))}
          {season === 'autumn' &&
            AUTUMN_SWATCHES.map((s) => (
              <button
                key={s.id}
                className="blossom"
                type="button"
                aria-pressed={autumnTint === s.id}
                aria-label={`${s.label} foliage`}
                title={s.label}
                style={{ background: s.leaf[0] }}
                onClick={() => setAutumnTint(s.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
