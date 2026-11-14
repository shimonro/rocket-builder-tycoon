import { Application, Container, Graphics } from 'pixi.js';
import { createRng } from '../../core/rng';
import type { FlightStats } from '../../engines/journey/config';
import type { JourneyEvent, JourneyState } from '../../engines/journey/journey';
import type { Obstacle } from '../../engines/journey/spawner';

export interface RendererOptions {
  rocketSvg: string;
  skyColor: string;
  worldWidth: number;
  rocketRadius: number;
  hoopHalfWidth: number;
  targetDistance: number;
  /** Seeds the decorative planet and nebula colors. */
  levelId: number;
}

const PLANET_COLORS = [0x60a5fa, 0xf472b6, 0xa78bfa, 0xfbbf24, 0x34d399, 0xf87171, 0x22d3ee, 0xfb923c, 0xc084fc, 0x94a3b8];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: number;
}

interface Star {
  x: number;
  y: number;
  depth: number;
  size: number;
}

const ROCKET_WIDTH_M = 5;
const ROCKET_SCREEN_Y = 0.7;

function drawObstacle(o: Obstacle): Graphics {
  const g = new Graphics();
  const rng = createRng(o.id * 7919);
  const r = o.r;
  const line = { width: 0.14, color: 0x0f172a };
  switch (o.kind) {
    case 'debris': {
      const pts: number[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rng() * 0.6;
        const d = r * (0.55 + rng() * 0.45);
        pts.push(Math.cos(a) * d, Math.sin(a) * d);
      }
      g.poly(pts).fill(0x94a3b8).stroke(line);
      g.moveTo(-r * 0.3, 0).lineTo(r * 0.3, r * 0.1).stroke({ width: 0.1, color: 0x475569 });
      break;
    }
    case 'satellite':
      g.rect(-r * 1.0, -r * 0.28, r * 0.65, r * 0.56).fill(0x2563eb).stroke(line);
      g.rect(r * 0.35, -r * 0.28, r * 0.65, r * 0.56).fill(0x2563eb).stroke(line);
      g.rect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7).fill(0xe2e8f0).stroke(line);
      g.circle(0, 0, r * 0.15).fill(0xf59e0b);
      break;
    case 'mine':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5)
          .lineTo(Math.cos(a) * r, Math.sin(a) * r)
          .stroke({ width: 0.25, color: 0x7f1d1d });
      }
      g.circle(0, 0, r * 0.65).fill(0xdc2626).stroke(line);
      g.circle(0, 0, r * 0.22).fill(0xfde047);
      break;
    case 'ufo':
      g.ellipse(0, -r * 0.2, r * 0.45, r * 0.4).fill(0xa7f3d0).stroke(line);
      g.ellipse(0, r * 0.05, r, r * 0.35).fill(0x8b5cf6).stroke(line);
      for (const x of [-0.6, 0, 0.6]) g.circle(x * r, r * 0.1, r * 0.09).fill(0xfde047);
      break;
    default: {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = r * (0.82 + rng() * 0.2);
        pts.push(Math.cos(a) * d, Math.sin(a) * d);
      }
      g.poly(pts).fill(0x8b7355).stroke(line);
      for (let i = 0; i < 3; i++) {
        g.circle((rng() - 0.5) * r, (rng() - 0.5) * r, r * (0.12 + rng() * 0.12)).fill(0x6b5a45);
      }
    }
  }
  return g;
}

function drawHoop(halfWidth: number): Graphics {
  const g = new Graphics();
  g.ellipse(0, 0, halfWidth, 1.1).stroke({ width: 1.1, color: 0xfacc15, alpha: 0.25 });
  g.ellipse(0, 0, halfWidth, 1.1).stroke({ width: 0.45, color: 0xfde047 });
  return g;
}

/** Draws the flight with PixiJS. The simulation lives in the journey engine; this only renders its state. */
export class FlightRenderer {
  private readonly backdrop = new Graphics();
  private readonly stars = new Graphics();
  private readonly world = new Container();
  private readonly track = new Graphics();
  private readonly hoopLayer = new Container();
  private readonly obstacleLayer = new Container();
  private readonly fx = new Graphics();
  private readonly rocket = new Container();
  private readonly flame = new Graphics();
  private readonly shieldBubble = new Graphics();
  private readonly obstacleViews = new Map<number, Graphics>();
  private readonly hoopViews = new Map<number, Graphics>();
  private readonly starField: Star[] = [];
  private particles: Particle[] = [];
  private ppm = 10;
  private shake = 0;
  private time = 0;
  private exploded = false;
  private lastState: JourneyState | null = null;

  constructor(
    private readonly app: Application,
    private readonly opts: RendererOptions,
  ) {
    app.renderer.background.color = opts.skyColor;
    const rng = createRng(1234);
    for (let i = 0; i < 160; i++) {
      this.starField.push({ x: rng(), y: rng(), depth: 0.15 + rng() * 0.85, size: 0.6 + rng() * 1.4 });
    }
    const art = new Graphics().svg(opts.rocketSvg);
    art.pivot.set(50, 80);
    art.scale.set(ROCKET_WIDTH_M / 100);
    this.rocket.addChild(this.flame, art, this.shieldBubble);
    this.world.addChild(this.track, this.hoopLayer, this.obstacleLayer, this.fx, this.rocket);
    app.stage.addChild(this.backdrop, this.stars, this.world);
  }

  handleEvents(events: JourneyEvent[], state: JourneyState) {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.shake = 0.35;
          this.burst(e.x, e.y, 18, [0xf97316, 0xfacc15, 0x94a3b8], 14);
          break;
        case 'obstacleDestroyed':
          this.burst(e.x, e.y, 22, [0xfacc15, 0xf97316, 0xffffff], 16);
          break;
        case 'hoop':
          this.burst(e.x, e.y, 16, [0xfde047, 0xfef9c3], 10);
          break;
        case 'turbo':
          this.burst(state.x, state.y - 2, 12, [0x38bdf8, 0xe0f2fe], 12);
          break;
        case 'ended':
          if (e.reason === 'destroyed') {
            this.exploded = true;
            this.shake = 0.6;
            this.burst(state.x, state.y, 60, [0xf97316, 0xfacc15, 0xef4444, 0xffffff], 22);
          }
          break;
      }
    }
  }

  private burst(x: number, y: number, count: number, colors: number[], speed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + (this.lastState?.vy ?? 0) * 0.6,
        life,
        maxLife: life,
        size: 0.25 + Math.random() * 0.45,
        grow: -0.2,
        color: colors[i % colors.length],
      });
    }
  }

  render(state: JourneyState, stats: FlightStats, dt: number) {
    this.lastState = state;
    this.time += dt;
    const { width: W, height: H } = this.app.screen;
    const { worldWidth } = this.opts;

    // Zoom out with speed so faster rockets see further ahead.
    const visible = 60 + Math.max(0, state.vy) * 0.45;
    const targetPpm = Math.min(W / (worldWidth + 6), H / visible);
    this.ppm += (targetPpm - this.ppm) * Math.min(1, dt * 2.5);
    const ppm = this.ppm;
    const camY = state.y;
    const toY = (y: number) => -(y - camY);

    this.shake = Math.max(0, this.shake - dt);
    const shakePx = this.shake * 18;
    this.world.scale.set(ppm);
    this.world.position.set(
      (W - worldWidth * ppm) / 2 + (Math.random() - 0.5) * shakePx,
      H * ROCKET_SCREEN_Y + (Math.random() - 0.5) * shakePx,
    );

    this.drawBackdrop(W, H, camY);
    this.drawStars(W, H, camY * ppm, state.vy);
    this.drawTrack(camY, H / ppm);

    // Obstacles.
    const live = new Set<number>();
    for (const o of state.obstacles) {
      live.add(o.id);
      let view = this.obstacleViews.get(o.id);
      if (!view) {
        view = drawObstacle(o);
        this.obstacleViews.set(o.id, view);
        this.obstacleLayer.addChild(view);
      }
      view.position.set(o.x, toY(o.y));
      if (o.kind === 'debris' || o.kind === 'satellite') view.rotation = this.time * (o.kind === 'debris' ? 1.6 : 0.4) + o.phase;
      if (o.kind === 'asteroid') view.rotation = this.time * 0.2 + o.phase;
    }
    for (const [id, view] of this.obstacleViews) {
      if (!live.has(id)) {
        view.destroy();
        this.obstacleViews.delete(id);
      }
    }

    // Hoops.
    const liveHoops = new Set<number>();
    for (const h of state.hoops) {
      liveHoops.add(h.id);
      let view = this.hoopViews.get(h.id);
      if (!view) {
        view = drawHoop(this.opts.hoopHalfWidth);
        this.hoopViews.set(h.id, view);
        this.hoopLayer.addChild(view);
      }
      view.position.set(h.x, toY(h.y));
      if (h.collected) {
        view.scale.set(Math.min(2, view.scale.x + dt * 3));
        view.alpha = Math.max(0, view.alpha - dt * 2.5);
      } else if (h.crossed) {
        view.alpha = 0.3;
      }
    }
    for (const [id, view] of this.hoopViews) {
      if (!liveHoops.has(id)) {
        view.destroy();
        this.hoopViews.delete(id);
      }
    }

    // Rocket, flame and shield.
    this.rocket.visible = !this.exploded;
    this.rocket.position.set(state.x, 0);
    this.rocket.rotation = (state.vx / Math.max(1, stats.lateralMax)) * 0.3;
    this.rocket.alpha = state.invulnerable > 0 && Math.floor(this.time * 20) % 2 === 0 ? 0.4 : 1;
    this.flame.clear();
    const thrusting = state.status === 'flying' && state.throttle > 0;
    if (thrusting) {
      const boost = state.turboTime > 0 ? 1.8 : state.hoopTime > 0 ? 1.4 : 1;
      const len = (1.5 + state.throttle * 2) * boost * (0.85 + Math.random() * 0.3);
      this.flame.poly([-0.8, 2.9, 0.8, 2.9, 0, 2.9 + len]).fill(state.turboTime > 0 ? 0x38bdf8 : 0xf97316);
      this.flame.poly([-0.45, 2.9, 0.45, 2.9, 0, 2.9 + len * 0.6]).fill(0xfde68a);
      if (Math.random() < 0.8) {
        this.particles.push({
          x: state.x + (Math.random() - 0.5) * 0.8,
          y: state.y - 4.5,
          vx: (Math.random() - 0.5) * 2,
          vy: state.vy * 0.35,
          life: 0.7,
          maxLife: 0.7,
          size: 0.35,
          grow: 1.4,
          color: 0x94a3b8,
        });
      }
    }
    this.shieldBubble.clear();
    if (stats.shield > 0 && state.shield > 0) {
      const strength = state.shield / stats.shield;
      this.shieldBubble.circle(0, 0, 4.2).stroke({ width: 0.25, color: 0x67e8f9, alpha: 0.25 + 0.55 * strength });
      this.shieldBubble.circle(0, 0, 4.2).fill({ color: 0x67e8f9, alpha: 0.06 * strength });
    }

    this.drawFx(state, dt, toY);
  }

  private drawBackdrop(W: number, H: number, camY: number) {
    const g = this.backdrop;
    const color = PLANET_COLORS[(this.opts.levelId - 1) % PLANET_COLORS.length];
    const accent = PLANET_COLORS[(this.opts.levelId + 3) % PLANET_COLORS.length];
    const unit = Math.min(W, H);
    g.clear();
    g.circle(W * 0.12, H * 0.35, unit * 0.45).fill({ color: accent, alpha: 0.05 });
    g.circle(W * 0.2, H * 0.55, unit * 0.3).fill({ color, alpha: 0.05 });
    const px = W * 0.86;
    const py = H * 0.28 + camY * 0.04;
    const r = unit * 0.13;
    if (py - r < H) {
      g.circle(px, py, r * 1.25).fill({ color, alpha: 0.08 });
      g.circle(px, py, r).fill({ color, alpha: 0.85 });
      g.circle(px - r * 0.3, py - r * 0.3, r * 0.75).fill({ color: 0xffffff, alpha: 0.12 });
      g.circle(px + r * 0.25, py + r * 0.2, r * 0.18).fill({ color: 0x000000, alpha: 0.15 });
      g.ellipse(px, py, r * 1.7, r * 0.35).stroke({ width: Math.max(2, r * 0.08), color: 0xffffff, alpha: 0.35 });
    }
  }

  private drawStars(W: number, H: number, scroll: number, vy: number) {
    this.stars.clear();
    const streak = Math.min(30, Math.max(0, vy) * 0.12);
    for (const s of this.starField) {
      const y = (((s.y * H + scroll * s.depth * 0.25) % H) + H) % H;
      const x = s.x * W;
      const alpha = 0.3 + s.depth * 0.6;
      if (streak > 2) {
        this.stars.rect(x, y - streak * s.depth, s.size * 0.8, streak * s.depth + s.size).fill({ color: 0xffffff, alpha: alpha * 0.7 });
      } else {
        this.stars.circle(x, y, s.size).fill({ color: 0xffffff, alpha });
      }
    }
  }

  private drawTrack(camY: number, visibleMeters: number) {
    const g = this.track;
    const W = this.opts.worldWidth;
    g.clear();
    g.rect(-0.3, -visibleMeters, 0.3, visibleMeters * 2).fill({ color: 0x38bdf8, alpha: 0.35 });
    g.rect(W, -visibleMeters, 0.3, visibleMeters * 2).fill({ color: 0x38bdf8, alpha: 0.35 });
    // Altitude ticks every 50 m.
    const start = Math.floor((camY - visibleMeters) / 50) * 50;
    for (let y = Math.max(0, start); y < camY + visibleMeters; y += 50) {
      const sy = -(y - camY);
      const major = y % 500 === 0;
      g.rect(-0.3, sy - 0.1, major ? 2.2 : 1, 0.2).fill({ color: 0x7dd3fc, alpha: major ? 0.8 : 0.4 });
      g.rect(W + 0.3 - (major ? 2.2 : 1), sy - 0.1, major ? 2.2 : 1, 0.2).fill({ color: 0x7dd3fc, alpha: major ? 0.8 : 0.4 });
    }
    // Finish line at the level target.
    const ty = -(this.opts.targetDistance - camY);
    if (Math.abs(ty) < visibleMeters) {
      for (let i = 0; i < W; i += 2) {
        g.rect(i, ty - 1, 1, 1).fill(i % 4 === 0 ? 0xffffff : 0x0f172a);
        g.rect(i + 1, ty - 1, 1, 1).fill(i % 4 === 0 ? 0x0f172a : 0xffffff);
      }
    }
    // Launch pad.
    if (camY < visibleMeters) {
      g.rect(-5, 3.4 + camY, W + 10, 6).fill(0x1e293b);
      g.rect(W / 2 - 4, 3 + camY, 8, 0.6).fill(0xf59e0b);
    }
  }

  private drawFx(state: JourneyState, dt: number, toY: (y: number) => number) {
    const g = this.fx;
    g.clear();
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.05, p.size + p.grow * dt);
      g.circle(p.x, toY(p.y), p.size).fill({ color: p.color, alpha: p.life / p.maxLife });
    }
    for (const p of state.projectiles) {
      g.rect(p.x - 0.18, toY(p.y) - 1.2, 0.36, 2.4).fill(0x67e8f9);
      g.rect(p.x - 0.08, toY(p.y) - 1, 0.16, 2).fill(0xffffff);
    }
    for (const o of state.obstacles) {
      if (o.hp < o.maxHp) {
        const w = o.r * 1.6;
        g.rect(o.x - w / 2, toY(o.y) - o.r - 1.2, w, 0.4).fill({ color: 0x0f172a, alpha: 0.7 });
        g.rect(o.x - w / 2, toY(o.y) - o.r - 1.2, (w * Math.max(0, o.hp)) / o.maxHp, 0.4).fill(0xef4444);
      }
    }
  }

  destroy() {
    this.obstacleViews.clear();
    this.hoopViews.clear();
  }
}
