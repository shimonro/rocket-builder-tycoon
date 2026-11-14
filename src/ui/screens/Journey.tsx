import { Application } from 'pixi.js';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { rocketParts, rocketStats } from '../../core/rocket/rocket';
import { catalog, cosmetics, journeyConfig } from '../../data';
import { deriveFlightStats } from '../../engines/journey/config';
import {
  abortJourney,
  createJourney,
  FIXED_STEP,
  journeyDistance,
  stepJourney,
  type JourneyContext,
  type JourneyEvent,
  type JourneyInput,
  type JourneyState,
} from '../../engines/journey/journey';
import { appendInput, decodeInput, encodeInput } from '../../engines/journey/replay';
import { TUTORIAL_MESSAGES } from '../../engines/tutorial/tutorial';
import { setEngineSound, setMusicMode, stopEngineSound } from '../../services/audio/audio';
import { GHOST_INTERVAL } from '../../services/persistence/ghosts';
import { gameEvents, useGame } from '../../state/game';
import { levelById, tutorialDone } from '../../state/selectors';
import { ghosts } from '../../state/session';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { FlightRenderer } from '../canvas/FlightRenderer';
import { Bar, cx } from '../components/common';

const timescale = Math.min(20, Math.max(0.1, Number(new URLSearchParams(window.location.search).get('timescale')) || 1));

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  forward: ['ArrowUp', 'KeyW'],
  backward: ['ArrowDown', 'KeyS'],
  turbo: ['Space', 'ShiftLeft', 'ShiftRight'],
  fire: ['KeyF', 'KeyX', 'Enter'],
};

interface Hud {
  distance: number;
  speed: number;
  fuel: number;
  hull: number;
  shield: number;
  ammo: number;
  turboReady: number;
  targetReached: boolean;
  gliding: boolean;
  ended: boolean;
  hoops: number;
  coins: number;
  wind: number;
}

function hudOf(s: JourneyState, turboTotal: number): Hud {
  return {
    distance: journeyDistance(s),
    speed: Math.round(s.vy),
    fuel: s.fuel,
    hull: s.hull,
    shield: s.shield,
    ammo: s.ammo,
    turboReady: s.turboCooldown <= 0 ? 1 : 1 - s.turboCooldown / turboTotal,
    targetReached: s.targetReached,
    gliding: s.status === 'gliding',
    ended: s.status === 'ended',
    hoops: s.hoopsCollected,
    coins: s.coins,
    wind: s.winds.find((w) => s.y >= w.y0 - 40 && s.y <= w.y1)?.force ?? 0,
  };
}

function emit(events: JourneyEvent[]) {
  for (const e of events) {
    if (e.type === 'hit') gameEvents.emit({ type: 'hit', damage: e.damage });
    else if (e.type === 'ended') gameEvents.emit({ type: 'flightEnded', reason: e.reason });
    else if (e.type !== 'fuelEmpty') gameEvents.emit({ type: e.type });
  }
}

const cosmeticColor = (id: string | undefined) => cosmetics.find((c) => c.id === id)?.color;

export function Journey() {
  const save = useGame((s) => s.save);
  const flightNumber = useGame((s) => s.flightNumber);
  const flightSeed = useGame((s) => s.flightSeed);
  const finishFlight = useGame((s) => s.finishFlight);
  const tutorial = !tutorialDone(save);
  const level = levelById(save.selectedLevel);

  // Everything about this flight is fixed at launch.
  const setup = useMemo(() => {
    const stats = deriveFlightStats(rocketStats(rocketParts(save.rocket, catalog), save.upgrades), journeyConfig, !tutorial);
    const ctx: JourneyContext = {
      stats,
      level,
      cfg: journeyConfig,
      seed: flightSeed,
      densityFactor: tutorial ? journeyConfig.tutorialDensityFactor : 1,
    };
    const { equipped } = save.cosmetics;
    const look = { ...rocketLook(save.rocket, catalog), paint: cosmeticColor(equipped.paint) };
    return {
      ctx,
      svg: rocketSvg(look),
      flameColor: cosmeticColor(equipped.flame),
      trail: cosmeticColor(equipped.trail),
      ghost: !tutorial && save.settings.ghost ? ghosts.get(level.id) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber]);
  const { stats } = setup.ctx;
  const turboTotal = journeyConfig.turbo.duration + journeyConfig.turbo.cooldown;

  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<JourneyState>(createJourney(setup.ctx));
  const keys = useRef(new Set<string>());
  const touch = useRef({ steer: 0, forward: false, backward: false, turbo: false, fire: false, dragX: null as number | null });
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud>(() => hudOf(stateRef.current, turboTotal));
  const [showHint, setShowHint] = useState(tutorial);
  const [warning, setWarning] = useState<string | null>(null);
  const touchMode = save.settings.touchControls;
  const showTouch = touchMode === 'on' || (touchMode === 'auto' && window.matchMedia('(pointer: coarse)').matches);

  function togglePause(next = !pausedRef.current) {
    if (stateRef.current.status === 'ended') return;
    pausedRef.current = next;
    setPaused(next);
  }

  function endFlight() {
    stateRef.current = abortJourney(stateRef.current);
    pausedRef.current = false;
    setPaused(false);
  }

  useEffect(() => {
    const host = hostRef.current!;
    const app = new Application();
    let ready = false;
    let disposed = false;
    let renderer: FlightRenderer | null = null;
    let hudTimer = 0;
    let endTimer = 0;
    let finished = false;
    let acc = 0;
    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    const log: number[] = [];
    const track: number[] = [];
    const warn = (text: string) => {
      setWarning(text);
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => setWarning(null), 2500);
    };
    setMusicMode('flight');

    const readInput = (): JourneyInput => {
      const k = keys.current;
      const has = (codes: string[]) => codes.some((c) => k.has(c));
      const t = touch.current;
      const keySteer = (has(KEYS.right) ? 1 : 0) - (has(KEYS.left) ? 1 : 0);
      return {
        steer: keySteer !== 0 ? keySteer : t.steer,
        forward: has(KEYS.forward) || t.forward,
        backward: has(KEYS.backward) || t.backward,
        turbo: has(KEYS.turbo) || t.turbo,
        fire: has(KEYS.fire) || t.fire,
      };
    };

    app
      .init({ resizeTo: host, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, background: level.skyColor })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        ready = true;
        host.prepend(app.canvas);
        renderer = new FlightRenderer(app, {
          rocketSvg: setup.svg,
          skyColor: level.skyColor,
          worldWidth: journeyConfig.worldWidth,
          rocketRadius: journeyConfig.rocketRadius,
          hoopHalfWidth: journeyConfig.hoop.halfWidth,
          targetDistance: level.targetDistance,
          levelId: level.id,
          flameColor: setup.flameColor,
          trail: setup.trail,
          ghost: setup.ghost,
        });
        app.ticker.add((ticker) => {
          const frame = Math.min(ticker.deltaMS / 1000, 0.1);
          if (!pausedRef.current) {
            // Fixed steps with recorded input, so the leaderboard server can replay the flight exactly.
            acc += frame * timescale;
            const code = encodeInput(readInput());
            const input = decodeInput(code);
            while (acc >= FIXED_STEP && stateRef.current.status !== 'ended') {
              acc -= FIXED_STEP;
              const prevTime = stateRef.current.time;
              const { state, events } = stepJourney(stateRef.current, input, FIXED_STEP, setup.ctx);
              appendInput(log, code);
              if (Math.floor(state.time / GHOST_INTERVAL) > Math.floor(prevTime / GHOST_INTERVAL) || prevTime === 0) {
                track.push(Math.round(state.x * 10) / 10, Math.round(state.y * 10) / 10);
              }
              stateRef.current = state;
              if (events.length) {
                renderer!.handleEvents(events, state);
                emit(events);
                for (const e of events) {
                  if (e.type === 'meteorShower') warn('☄️ Meteor shower ahead!');
                  if (e.type === 'guardianDefeated') warn(`🏆 Guardian destroyed! +${journeyConfig.guardian.coinReward} coins`);
                  if (e.type === 'fuelCan') warn('⛽ Fuel can! Tank refilled');
                }
              }
            }
            if (stateRef.current.status === 'ended' && !finished) {
              endTimer += frame;
              if (endTimer > 1.4) {
                finished = true;
                stopEngineSound();
                const s = stateRef.current;
                finishFlight({
                  distance: journeyDistance(s),
                  targetReached: s.targetReached,
                  endReason: s.endReason ?? 'aborted',
                  hoops: s.hoopsCollected,
                  destroyed: s.obstaclesDestroyed,
                  coins: s.coins,
                  fuelCans: s.fuelCans,
                  guardianDefeated: s.guardianDefeated,
                  replay: { seed: setup.ctx.seed, log, aborted: s.endReason === 'aborted' },
                  track,
                });
              }
            }
          }
          renderer!.render(stateRef.current, stats, pausedRef.current ? 0 : frame);
          hudTimer += frame;
          if (hudTimer > 0.08) {
            hudTimer = 0;
            const s = stateRef.current;
            setHud(hudOf(s, turboTotal));
            if (s.status === 'flying' && !pausedRef.current) setEngineSound(s.throttle, s.turboTime > 0 || s.hoopTime > 0);
            else stopEngineSound();
          }
        });
      });

    return () => {
      disposed = true;
      clearTimeout(warnTimer);
      stopEngineSound();
      setMusicMode('menu');
      renderer?.destroy();
      if (ready) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  useEffect(() => {
    const all = Object.values(KEYS).flat();
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        togglePause();
        return;
      }
      if (all.includes(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
        setShowHint(false);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    touch.current.dragX = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setShowHint(false);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const start = touch.current.dragX;
    if (start === null) return;
    touch.current.steer = Math.max(-1, Math.min(1, (e.clientX - start) / 40));
  };
  const onPointerUp = () => {
    touch.current.dragX = null;
    touch.current.steer = 0;
  };
  const hold = (key: 'forward' | 'backward' | 'turbo' | 'fire') => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      touch.current[key] = true;
    },
    onPointerUp: () => (touch.current[key] = false),
    onPointerLeave: () => (touch.current[key] = false),
    onPointerCancel: () => (touch.current[key] = false),
  });

  const target = level.targetDistance;
  return (
    <div className="screen journey" data-testid="journey">
      <div
        className="flight-host"
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="hud" data-testid="hud">
        <div className="hud-row">
          <div className="hud-stat distance">
            <span>Distance</span>
            <strong data-testid="hud-distance">{hud.distance.toLocaleString()} m</strong>
            <Bar value={hud.distance} max={target} color={hud.targetReached ? '#4ade80' : '#38bdf8'} label="Progress to target" />
            <small>
              {hud.targetReached ? 'Target reached! Keep going for extra pay' : `Target ${target.toLocaleString()} m`}
            </small>
          </div>
          <div className="hud-stat">
            <span>Speed</span>
            <strong>{hud.speed} m/s</strong>
          </div>
          <button type="button" className="btn small ghost pause-btn" onClick={() => togglePause()} aria-label="Pause" data-testid="pause">
            ⏸
          </button>
        </div>
        <div className="hud-bars">
          <label>
            ⛽ Fuel <Bar value={hud.fuel} max={stats.fuelCapacity} color={hud.fuel / stats.fuelCapacity < 0.2 ? '#f87171' : '#facc15'} label="Fuel" />
          </label>
          <label>
            🛡️ Hull <Bar value={hud.hull} max={stats.hull} color="#4ade80" label="Hull" />
          </label>
          {stats.shield > 0 && (
            <label>
              ✨ Shield <Bar value={hud.shield} max={stats.shield} color="#67e8f9" label="Shield" />
            </label>
          )}
          <label>
            ⚡ Turbo <Bar value={hud.turboReady} max={1} color={hud.turboReady >= 1 ? '#38bdf8' : '#475569'} label="Turbo" />
          </label>
          {stats.ammo > 0 && <span className="ammo">🔫 {hud.ammo}</span>}
          <span className="hoops">◎ {hud.hoops}</span>
          <span className="coins" data-testid="hud-coins">🪙 {hud.coins}</span>
        </div>
      </div>
      {hud.wind !== 0 && !hud.ended && (
        <div className="wind-indicator" data-testid="wind">
          {hud.wind > 0 ? 'Wind ➡️➡️' : '⬅️⬅️ Wind'}
        </div>
      )}
      {warning && !hud.ended && <div className="banner warning">{warning}</div>}
      {hud.gliding && !hud.ended && <div className="banner">Out of fuel — gliding…</div>}
      {hud.ended && <div className="banner big">{stateRef.current.endReason === 'destroyed' ? '💥 Rocket destroyed' : 'Flight over'}</div>}
      {showHint && (
        <div className="flight-hint" data-testid="flight-hint">
          {TUTORIAL_MESSAGES.flight}
        </div>
      )}
      {showTouch && (
        <div className="touch-controls" data-testid="touch-controls">
          <div className="touch-left">
            <button type="button" className="touch-btn" {...hold('forward')} aria-label="Forward">
              ▲
            </button>
            <button type="button" className="touch-btn" {...hold('backward')} aria-label="Backward">
              ▼
            </button>
          </div>
          <div className="touch-hint">drag to steer</div>
          <div className="touch-right">
            {stats.ammo > 0 && (
              <button type="button" className="touch-btn fire" {...hold('fire')} aria-label="Fire">
                🔫
              </button>
            )}
            <button type="button" className={cx('touch-btn turbo', hud.turboReady >= 1 && 'ready')} {...hold('turbo')} aria-label="Turbo">
              ⚡
            </button>
          </div>
        </div>
      )}
      {paused && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label="Paused">
            <h2>Paused</h2>
            <p className="muted">Distance so far: {hud.distance.toLocaleString()} m</p>
            <button type="button" className="btn primary" onClick={() => togglePause(false)}>
              Resume
            </button>
            <button type="button" className="btn ghost" onClick={endFlight} data-testid="end-flight">
              End flight &amp; collect payout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
