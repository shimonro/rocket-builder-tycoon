import { Application } from 'pixi.js';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { rocketParts, rocketStats } from '../../core/rocket/rocket';
import { catalog, cosmetics, journeyConfig } from '../../data';
import { NO_LOCK, nextIntro, tapBackward, tapForward, type ForwardLock, type IntroKind, type IntroTarget } from '../../engines/journey/assist';
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
import { celebrate } from '../components/Confetti';
import './journey.css';

const timescale = Math.min(20, Math.max(0.1, Number(new URLSearchParams(window.location.search).get('timescale')) || 1));

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  forward: ['ArrowUp', 'KeyW'],
  backward: ['ArrowDown', 'KeyS'],
  turbo: ['Space', 'ShiftLeft', 'ShiftRight'],
  fire: ['KeyF', 'KeyX', 'Enter'],
};

/** Playback speeds of the replay screen, cycled by its speed button. */
const REPLAY_SPEEDS = [1, 2, 4];

/** Tutorial flight intros: the first time each kind of thing comes into view, the flight pauses on it. */
const INTRO_TEXT: Record<IntroKind, { title: string; text: string }> = {
  hoop: { title: '◎ Boost ring', text: 'Fly through rings for a free speed boost' },
  obstacle: { title: '☄️ Asteroid', text: 'Asteroids damage your hull — steer around them' },
  coin: { title: '🪙 Coin', text: 'Coins add to your payout' },
  fuel: { title: '⛽ Fuel can', text: 'Fuel cans refill 20% of your tank' },
  gem: { title: '💎 Gem', text: 'Rare gem! Gems buy cosmetics' },
};
/** Other obstacle kinds, for intros replayed on later levels: title and what they do. */
const OBSTACLE_TEXT: Record<string, [string, string]> = {
  debris: ['🔩 Space debris', 'Debris damages your hull — steer around it'],
  satellite: ['🛰️ Satellite', 'Satellites damage your hull — steer around them'],
  mine: ['💣 Space mine', 'Mines hit hard — steer well clear'],
  meteor: ['☄️ Meteor', 'Meteors damage your hull — steer around them'],
  ufo: ['🛸 UFO', 'UFOs wobble and damage your hull — keep your distance'],
  guardian: ['👾 Guardian', 'The Guardian guards the finish — dodge it or shoot it down'],
};

function introCopy(t: IntroTarget) {
  const other = t.kind === 'obstacle' ? OBSTACLE_TEXT[t.name] : undefined;
  return other ? { title: other[0], text: other[1] } : INTRO_TEXT[t.kind];
}

interface Intro {
  target: IntroTarget;
  /** Screen position (px) and ring radius (px) of the highlighted thing. */
  sx: number;
  sy: number;
  r: number;
}

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
  gems: number;
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
    gems: s.gems,
    wind: s.winds.find((w) => s.y >= w.y0 - 40 && s.y <= w.y1)?.force ?? 0,
  };
}

/** Forwards flight events to the game bus by type (hoop, coin, gem, fuelCan, …). */
function emit(events: JourneyEvent[]) {
  for (const e of events) {
    if (e.type === 'hit') gameEvents.emit({ type: 'hit', damage: e.damage });
    else if (e.type === 'ended') gameEvents.emit({ type: 'flightEnded', reason: e.reason });
    else if (e.type !== 'fuelEmpty') gameEvents.emit({ type: e.type });
  }
}

const cosmeticColor = (id: string | undefined) => cosmetics.find((c) => c.id === id)?.color;

/**
 * The flight screen. With `replay`, it plays back the last flight's recorded inputs step by step instead
 * of reading the player's input (no payout, no ghost recording).
 */
export function Journey({ replay = false }: { replay?: boolean } = {}) {
  const save = useGame((s) => s.save);
  const flightNumber = useGame((s) => s.flightNumber);
  const flightSeed = useGame((s) => s.flightSeed);
  const finishFlight = useGame((s) => s.finishFlight);
  const flightIntros = useGame((s) => s.flightIntros);
  const lastResult = useGame((s) => s.lastResult);
  const endReplay = useGame((s) => s.endReplay);
  const recorded = replay ? lastResult : null;
  const tutorial = recorded ? recorded.tutorial : !tutorialDone(save);
  const level = levelById(recorded ? recorded.levelId : save.selectedLevel);
  /** Bumped by "Watch again" to restart the replay from the beginning. */
  const [run, setRun] = useState(0);

  // Everything about this flight is fixed at launch.
  const setup = useMemo(() => {
    const ctx: JourneyContext = recorded?.context ?? {
      stats: deriveFlightStats(rocketStats(rocketParts(save.rocket, catalog), save.upgrades), journeyConfig, !tutorial),
      level,
      cfg: journeyConfig,
      seed: flightSeed,
      densityFactor: tutorial ? journeyConfig.tutorialDensityFactor : 1,
    };
    const { equipped } = save.cosmetics;
    const look = { ...rocketLook(save.rocket, catalog), paint: cosmeticColor(equipped.paint), decal: equipped.decal };
    return {
      ctx,
      svg: rocketSvg(look),
      flameColor: cosmeticColor(equipped.flame),
      trail: cosmeticColor(equipped.trail),
      ghost: !replay && !tutorial && save.settings.ghost ? ghosts.get(level.id) : null,
      intros: !replay && (tutorial || flightIntros),
      previousBest: recorded ? recorded.previousBest : tutorial ? 0 : (save.progress.best[level.id] ?? 0),
      // A replay without a recording just ends straight away.
      playback: replay ? (recorded?.replay ?? { log: [], aborted: true }) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber, run]);
  const { stats } = setup.ctx;
  const turboTotal = journeyConfig.turbo.duration + journeyConfig.turbo.cooldown;

  const hostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FlightRenderer | null>(null);
  const stateRef = useRef<JourneyState>(createJourney(setup.ctx));
  const keys = useRef(new Set<string>());
  /** Keys pressed during an intro pause; ignored until released so they don't leak into the flight. */
  const swallowed = useRef(new Set<string>());
  const touch = useRef({ steer: 0, forward: false, backward: false, turbo: false, fire: false, dragX: null as number | null });
  const lockRef = useRef<ForwardLock>(NO_LOCK);
  const pausedRef = useRef(false);
  const introRef = useRef<{ at: number } | null>(null);
  const speedRef = useRef(1);
  const [paused, setPaused] = useState(false);
  const [intro, setIntro] = useState<Intro | null>(null);
  const [fast, setFast] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [replayDone, setReplayDone] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>(() => hudOf(stateRef.current, turboTotal));
  const [showHint, setShowHint] = useState(tutorial && !replay);
  const [warning, setWarning] = useState<string | null>(null);
  const touchMode = save.settings.touchControls;
  const showTouch = !replay && (touchMode === 'on' || (touchMode === 'auto' && window.matchMedia('(pointer: coarse)').matches));

  function togglePause(next = !pausedRef.current) {
    if (replay || introRef.current || stateRef.current.status === 'ended') return;
    pausedRef.current = next;
    setPaused(next);
  }

  function endFlight() {
    stateRef.current = abortJourney(stateRef.current);
    pausedRef.current = false;
    setPaused(false);
  }

  function tap(direction: 'forward' | 'backward') {
    lockRef.current = direction === 'forward' ? tapForward(lockRef.current, performance.now() / 1000) : tapBackward();
    setFast(lockRef.current.on);
  }

  function continueIntro() {
    if (!introRef.current) return;
    introRef.current = null;
    rendererRef.current?.setHighlight(null);
    setIntro(null);
  }

  function watchAgain() {
    setReplayDone(false);
    setCheer(null);
    setRun((r) => r + 1);
  }

  function cycleSpeed() {
    const next = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(speedRef.current) + 1) % REPLAY_SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
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
    let cheerTimer: ReturnType<typeof setTimeout> | undefined;
    let bestCheered = false;
    const seen: IntroKind[] = [];
    const log: number[] = [];
    const track: number[] = [];
    stateRef.current = createJourney(setup.ctx);
    const warn = (text: string) => {
      setWarning(text);
      clearTimeout(warnTimer);
      warnTimer = setTimeout(() => setWarning(null), 2500);
    };
    const cheerFor = (text: string) => {
      setCheer(text);
      celebrate();
      clearTimeout(cheerTimer);
      cheerTimer = setTimeout(() => setCheer(null), 2800);
    };
    setMusicMode('flight');

    // Replay playback: a cursor into the run-length log, one code per fixed step.
    const playLog = setup.playback?.log ?? [];
    let cursor = -2;
    let left = 0;
    const nextCode = (): number | null => {
      while (left === 0) {
        cursor += 2;
        if (cursor >= playLog.length) return null;
        left = playLog[cursor + 1];
      }
      left -= 1;
      return playLog[cursor];
    };

    const readInput = (): JourneyInput => {
      const k = keys.current;
      const has = (codes: string[]) => codes.some((c) => k.has(c));
      const t = touch.current;
      const keySteer = (has(KEYS.right) ? 1 : 0) - (has(KEYS.left) ? 1 : 0);
      return {
        steer: keySteer !== 0 ? keySteer : t.steer,
        forward: has(KEYS.forward) || t.forward || lockRef.current.on,
        backward: has(KEYS.backward) || t.backward,
        turbo: has(KEYS.turbo) || t.turbo,
        fire: has(KEYS.fire) || t.fire,
      };
    };

    const step = (code: number) => {
      const prevTime = stateRef.current.time;
      const { state, events } = stepJourney(stateRef.current, decodeInput(code), FIXED_STEP, setup.ctx);
      if (!setup.playback) {
        appendInput(log, code);
        if (Math.floor(state.time / GHOST_INTERVAL) > Math.floor(prevTime / GHOST_INTERVAL) || prevTime === 0) {
          track.push(Math.round(state.x * 10) / 10, Math.round(state.y * 10) / 10);
        }
      }
      stateRef.current = state;
      if (events.length) {
        renderer!.handleEvents(events, state);
        emit(events);
        for (const e of events) {
          if (e.type === 'meteorShower') warn('☄️ Meteor shower ahead!');
          if (e.type === 'guardianDefeated') warn(`🏆 Guardian destroyed! +${journeyConfig.guardian.coinReward} coins`);
          if (e.type === 'fuelCan') warn('⛽ Fuel can! Tank refilled');
          if (e.type === 'targetReached') cheerFor('🏁 Target reached!');
        }
      }
      if (!bestCheered && setup.previousBest > 0 && journeyDistance(state) > setup.previousBest) {
        bestCheered = true;
        cheerFor('🎉 New personal best!');
      }
    };

    // Tutorial intros: stop on the first hoop, obstacle, coin, fuel can and gem that comes into view.
    const checkIntro = () => {
      const s = stateRef.current;
      const hudBottom = hudRef.current?.offsetHeight ?? 120;
      const target = nextIntro(s, seen, Math.min(70, renderer!.metersAhead(hudBottom + 30)));
      if (!target) return;
      seen.push(target.kind);
      const r =
        target.kind === 'hoop'
          ? journeyConfig.hoop.halfWidth
          : target.kind === 'obstacle'
            ? (s.obstacles.find((o) => o.x === target.x && o.y === target.y)?.r ?? 4)
            : 2.4;
      renderer!.setHighlight({ x: target.x, y: target.y, r });
      const pos = renderer!.worldToScreen(target.x, target.y);
      keys.current.clear();
      Object.assign(touch.current, { steer: 0, forward: false, backward: false, turbo: false, fire: false, dragX: null });
      introRef.current = { at: performance.now() };
      const pxPerMeter = renderer!.worldToScreen(1, 0).x - renderer!.worldToScreen(0, 0).x;
      setIntro({ target, sx: pos.x, sy: pos.y, r: r * pxPerMeter });
      setShowHint(false);
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
        rendererRef.current = renderer;
        app.ticker.add((ticker) => {
          const frame = Math.min(ticker.deltaMS / 1000, 0.1);
          if (setup.intros && !pausedRef.current && !introRef.current && stateRef.current.status !== 'ended') checkIntro();
          const halted = pausedRef.current || introRef.current !== null;
          if (!halted) {
            // Fixed steps with recorded input, so the leaderboard server (and the replay screen) can re-run the flight exactly.
            acc += frame * timescale * (setup.playback ? speedRef.current : 1);
            if (setup.playback) {
              while (acc >= FIXED_STEP && stateRef.current.status !== 'ended') {
                acc -= FIXED_STEP;
                const code = nextCode();
                // The log ends where the flight ended; a run ended from the pause menu is aborted there.
                if (code === null) stateRef.current = abortJourney(stateRef.current);
                else step(code);
              }
            } else {
              const code = encodeInput(readInput());
              while (acc >= FIXED_STEP && stateRef.current.status !== 'ended') {
                acc -= FIXED_STEP;
                step(code);
              }
            }
            if (stateRef.current.status === 'ended' && !finished) {
              endTimer += frame;
              if (endTimer > 1.4) {
                finished = true;
                stopEngineSound();
                const s = stateRef.current;
                if (setup.playback) setReplayDone(true);
                else
                  finishFlight({
                    distance: journeyDistance(s),
                    targetReached: s.targetReached,
                    endReason: s.endReason ?? 'aborted',
                    hoops: s.hoopsCollected,
                    destroyed: s.obstaclesDestroyed,
                    coins: s.coins,
                    fuelCans: s.fuelCans,
                    gems: s.gems,
                    guardianDefeated: s.guardianDefeated,
                    context: setup.ctx,
                    replay: { seed: setup.ctx.seed, log, aborted: s.endReason === 'aborted' },
                    track,
                  });
              }
            }
          }
          renderer!.render(stateRef.current, stats, halted ? 0 : frame);
          hudTimer += frame;
          if (hudTimer > 0.08) {
            hudTimer = 0;
            const s = stateRef.current;
            setHud(hudOf(s, turboTotal));
            if (s.status === 'flying' && !halted) setEngineSound(s.throttle, s.turboTime > 0 || s.hoopTime > 0);
            else stopEngineSound();
          }
        });
      });

    return () => {
      disposed = true;
      clearTimeout(warnTimer);
      clearTimeout(cheerTimer);
      stopEngineSound();
      setMusicMode('menu');
      renderer?.destroy();
      rendererRef.current = null;
      if (ready) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  useEffect(() => {
    if (replay) return;
    const all = Object.values(KEYS).flat();
    const down = (e: KeyboardEvent) => {
      if (introRef.current) {
        // Space or Enter dismisses the intro (after a moment, so a held key doesn't skip it); nothing reaches the flight.
        if (all.includes(e.code) || e.code === 'Escape') e.preventDefault();
        if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && performance.now() - introRef.current.at > 300) continueIntro();
        swallowed.current.add(e.code);
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        togglePause();
        return;
      }
      if (all.includes(e.code)) {
        e.preventDefault();
        if (swallowed.current.has(e.code)) return;
        keys.current.add(e.code);
        setShowHint(false);
        if (!e.repeat && KEYS.forward.includes(e.code)) tap('forward');
        if (!e.repeat && KEYS.backward.includes(e.code)) tap('backward');
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      swallowed.current.delete(e.code);
    };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (replay) return;
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
      if (key === 'forward' || key === 'backward') tap(key);
    },
    onPointerUp: () => (touch.current[key] = false),
    onPointerLeave: () => (touch.current[key] = false),
    onPointerCancel: () => (touch.current[key] = false),
  });

  const target = level.targetDistance;
  const percent = Math.min(100, Math.floor((hud.distance / target) * 100));
  const introCallout = intro && introCopy(intro.target);
  // The callout sits below the highlighted thing when it is high on screen, above it otherwise,
  // kept on screen horizontally with its arrow pointing at the thing.
  const hostW = hostRef.current?.clientWidth ?? 800;
  const calloutW = Math.min(300, hostW - 24);
  const calloutLeft = intro ? Math.max(12, Math.min(hostW - calloutW - 12, intro.sx - calloutW / 2)) : 0;
  const calloutBelow = intro ? intro.sy < (hostRef.current?.clientHeight ?? 800) * 0.45 : false;
  return (
    <div className={cx('screen journey', replay && 'replaying')} data-testid={replay ? 'replay' : 'journey'}>
      <div
        className="flight-host"
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="hud" data-testid="hud" ref={hudRef}>
        <div className="hud-row">
          <div className="hud-stat distance">
            <span>Distance</span>
            <strong>
              <span data-testid="hud-distance">{hud.distance.toLocaleString()} m</span>
              <span className="hud-percent" data-testid="hud-percent">
                {' '}
                · {percent}%
              </span>
            </strong>
            <Bar value={hud.distance} max={target} color={hud.targetReached ? '#4ade80' : '#38bdf8'} label="Progress to target" />
            <small>
              {hud.targetReached ? 'Target reached! Keep going for extra pay' : `Target ${target.toLocaleString()} m`}
            </small>
          </div>
          <div className="hud-stat">
            <span>Speed</span>
            <strong>{hud.speed} m/s</strong>
          </div>
          {!replay && (
            <button type="button" className="btn small ghost pause-btn" onClick={() => togglePause()} aria-label="Pause" data-testid="pause">
              ⏸
            </button>
          )}
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
          <span className="gems" data-testid="hud-gems">💎 {hud.gems}</span>
        </div>
      </div>
      {fast && !hud.ended && !replay && (
        <div className="fast-mode" data-testid="fast-mode" role="status">
          ⏩ FAST MODE <small>{showTouch ? 'tap ▼ to stop' : '↓ to stop'}</small>
        </div>
      )}
      {hud.wind !== 0 && !hud.ended && (
        <div className="wind-indicator" data-testid="wind">
          {hud.wind > 0 ? 'Wind ➡️➡️' : '⬅️⬅️ Wind'}
        </div>
      )}
      {warning && !hud.ended && <div className="banner warning">{warning}</div>}
      {cheer && (
        <div className="banner cheer" data-testid="flight-cheer" role="status">
          {cheer}
        </div>
      )}
      {hud.gliding && !hud.ended && <div className="banner">Out of fuel — gliding…</div>}
      {hud.ended && !replayDone && <div className="banner big">{stateRef.current.endReason === 'destroyed' ? '💥 Rocket destroyed' : 'Flight over'}</div>}
      {showHint && !intro && (
        <div className="flight-hint" data-testid="flight-hint">
          {TUTORIAL_MESSAGES.flight}
          <small className="fast-hint">⏩ Triple-tap {showTouch ? '▲' : '↑'} for fast mode, {showTouch ? '▼' : '↓'} to stop.</small>
        </div>
      )}
      {showTouch && (
        <div className="touch-controls" data-testid="touch-controls">
          <div className="touch-left">
            <button type="button" className={cx('touch-btn', fast && 'locked')} {...hold('forward')} aria-label="Forward">
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
      {intro && introCallout && (
        <div
          className="intro-overlay"
          style={
            {
              '--x': `${intro.sx}px`,
              '--y': `${intro.sy}px`,
              '--r': `${intro.r + 18}px`,
              '--left': `${calloutLeft}px`,
              '--w': `${calloutW}px`,
              '--arrow': `${Math.max(18, Math.min(calloutW - 18, intro.sx - calloutLeft))}px`,
            } as CSSProperties
          }
          onClick={() => introRef.current && performance.now() - introRef.current.at > 400 && continueIntro()}
          data-testid="intro-overlay"
        >
          <div className={cx('intro-callout', calloutBelow ? 'below' : 'above')} role="dialog" aria-label={introCallout.title} data-testid="flight-intro">
            <strong>{introCallout.title}</strong>
            <p>{introCallout.text}</p>
            <button
              type="button"
              className="btn primary small"
              onClick={(e) => {
                e.stopPropagation();
                continueIntro();
              }}
              data-testid="intro-continue"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {replay && (
        <div className="replay-bar" data-testid="replay-controls">
          <span className="replay-badge" data-testid="replay-badge">
            ▶ REPLAY
          </span>
          <button type="button" className="btn small" onClick={cycleSpeed} data-testid="replay-speed" aria-label={`Playback speed ${speed}×`}>
            {speed}×
          </button>
          <button type="button" className="btn small ghost" onClick={endReplay} data-testid="replay-close">
            ✕ Close replay
          </button>
        </div>
      )}
      {replay && replayDone && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label="Replay finished" data-testid="replay-finished">
            <h2>Replay finished</h2>
            <p className="muted">Distance: {hud.distance.toLocaleString()} m</p>
            <button type="button" className="btn primary" onClick={watchAgain} data-testid="replay-again">
              Watch again
            </button>
            <button type="button" className="btn ghost" onClick={endReplay} data-testid="replay-back">
              Back to results
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
