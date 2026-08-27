/**
 * Every picture on this page is drawn here.
 *
 * No photographs, no external assets, no licences: the hero coast is layered
 * inline SVG and the listing "photo" is a shape stack. That keeps the demo
 * entirely self-contained — it renders identically offline, on a locked-down
 * network, and inside a GitHub Pages build with no asset pipeline.
 *
 * The goal is a photograph, not an illustration, and the difference is almost
 * entirely high-frequency detail:
 *
 *  - Nothing is a flat fill. Every large area is a multi-stop gradient that
 *    shifts hue as well as lightness, because real water goes blue → teal →
 *    green as the bottom rises, and a real sky goes blue → cyan → warm haze.
 *  - Nothing is a clean arc. Wave crests, the waterline and the foam edge are
 *    sums of four incommensurate sines, so no curve ever repeats itself.
 *  - Atmospheric perspective is applied literally: the farthest water is
 *    lighter, flatter, desaturated and blurred; contrast climbs as things get
 *    nearer.
 *  - Surfaces carry `feTurbulence` grain at low opacity, anisotropic on the
 *    water (perspective stretches texture horizontally) and isotropic on sand.
 *  - The sun's reflection is 60-odd separate jittered slivers, narrow and dense
 *    at the horizon and wide and scattered near the shore. In a sea photograph
 *    this single detail does more than everything else combined.
 *
 * Every scattered element comes from a seeded PRNG evaluated once at module
 * load, so the scene is byte-identical on every render and every build. There
 * is no `Math.random()` here.
 *
 * Colour never appears as an attribute. Every shape carries a class and takes
 * its fill from a `--vy-*` token, so the whole scene swaps from late afternoon
 * to moonlight when the page's appearance changes, with no second copy of the
 * markup.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*                          Deterministic randomness                          */
/* -------------------------------------------------------------------------- */

/**
 * mulberry32. Small, fast, and good enough for scatter — and, crucially,
 * seeded, so the coast that ships is the coast that was art-directed.
 */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One decimal is plenty for a background at this scale, and it halves the markup. */
function r(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Opacities need two, since the eye reads the low end of the range. */
function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* -------------------------------------------------------------------------- */
/*                       Water surfaces as sums of sines                      */
/* -------------------------------------------------------------------------- */

/*
 * A crest drawn as one hand-authored bezier always reads as drawn: the eye
 * finds the repeated arc. Four sines at incommensurate wavelengths do not
 * repeat inside 1440 units, and — unlike a polyline — the curve has an
 * analytic derivative, so the path can be emitted as exact cubic segments with
 * Hermite tangents. Twenty-four segments per crest, perfectly smooth, never
 * self-similar.
 *
 * It also gives a `y` for any `x`, which is what lets the foam bubbles, the
 * sand ripples and the shell scatter sit on the waterline rather than near it.
 */

interface WaveTerm {
  readonly a: number;
  readonly k: number;
  readonly p: number;
}

interface Wave {
  readonly base: number;
  readonly terms: readonly WaveTerm[];
}

/** Share of the amplitude, minimum wavelength, wavelength spread. */
const OCTAVES: readonly (readonly [number, number, number])[] = [
  [0.52, 360, 470],
  [0.29, 165, 195],
  [0.14, 74, 78],
  [0.07, 31, 30],
];

function makeWave(rand: () => number, base: number, amp: number, roughness = 1): Wave {
  const terms: WaveTerm[] = [];
  let index = 0;
  for (const [share, minLambda, spread] of OCTAVES) {
    const weight = index === 0 ? share : share * roughness;
    terms.push({
      a: amp * weight * (0.7 + rand() * 0.6),
      k: (Math.PI * 2) / (minLambda + rand() * spread),
      p: rand() * Math.PI * 2,
    });
    index += 1;
  }
  return { base, terms };
}

function waveY(wave: Wave, x: number): number {
  let y = wave.base;
  for (const term of wave.terms) y += term.a * Math.sin(term.k * x + term.p);
  return y;
}

function waveSlope(wave: Wave, x: number): number {
  let d = 0;
  for (const term of wave.terms) d += term.a * term.k * Math.cos(term.k * x + term.p);
  return d;
}

/** Cubic segments with Hermite tangents — exact enough to be indistinguishable. */
function waveCurve(wave: Wave, from: number, to: number, step = 60): string {
  const direction = to >= from ? 1 : -1;
  const stride = Math.abs(step) * direction;
  const parts: string[] = [];
  let x = from;
  while (direction > 0 ? x < to - 0.01 : x > to + 0.01) {
    const next = direction > 0 ? Math.min(x + stride, to) : Math.max(x + stride, to);
    const h = (next - x) / 3;
    parts.push(
      `C${r(x + h)} ${r(waveY(wave, x) + waveSlope(wave, x) * h)} ` +
        `${r(next - h)} ${r(waveY(wave, next) - waveSlope(wave, next) * h)} ` +
        `${r(next)} ${r(waveY(wave, next))}`,
    );
    x = next;
  }
  return parts.join(' ');
}

const SCENE_W = 1440;
const SCENE_H = 900;
/** Bodies close well below the frame, so the parallax lift never opens a gap. */
const FLOOR = 1010;

/** The open crest line, left to right. */
function crest(wave: Wave, step = 60): string {
  return `M0 ${r(waveY(wave, 0))} ${waveCurve(wave, 0, SCENE_W, step)}`;
}

/**
 * That crest closed downward into a body — one string, two jobs.
 *
 * `floor` matters for anything filtered: a filter region is derived from the
 * bounding box, so a body that closes 110 units below the frame quietly makes
 * its turbulence twice as expensive as it needs to be.
 */
function below(wave: Wave, step = 60, floor = FLOOR): string {
  return `${crest(wave, step)} L${SCENE_W} ${floor} L0 ${floor} Z`;
}

/** The strip between two crests: a reef, a sandbar, the wet sand. */
function ribbon(top: Wave, bottom: Wave, step = 60): string {
  return (
    `M0 ${r(waveY(top, 0))} ${waveCurve(top, 0, SCENE_W, step)} ` +
    `L${SCENE_W} ${r(waveY(bottom, SCENE_W))} ${waveCurve(bottom, SCENE_W, 0, step)} Z`
  );
}

/* -------------------------------------------------------------------------- */
/*                            The coast, generated                            */
/* -------------------------------------------------------------------------- */

const HORIZON = 470;
const SUN_X = 1044;
const SUN_Y = 428;

const waveRand = prng(0x0c0a57);

/* Amplitude climbs and roughness climbs as the swell comes in: far water is a
   near-flat plane seen almost edge-on, near water has real form. */
const CREST_A = makeWave(waveRand, 516, 9, 0.85);
const CREST_B = makeWave(waveRand, 590, 13, 1);
const CREST_C = makeWave(waveRand, 672, 11, 1);
const CREST_D = makeWave(waveRand, 758, 16, 1.25);
const REEF_TOP = makeWave(waveRand, 606, 13, 1.4);
const REEF_BOTTOM = makeWave(waveRand, 664, 15, 1.4);
const SHOAL_TOP = makeWave(waveRand, 726, 12, 1.2);
const SHOAL_BOTTOM = makeWave(waveRand, 772, 13, 1.2);
/** The waterline itself, and the furthest reach of the last swash up the sand. */
const WATERLINE = makeWave(waveRand, 812, 13, 1.7);
const SWASH = makeWave(waveRand, 829, 15, 2.1);
const DRYLINE = makeWave(waveRand, 866, 9, 1.1);
const RIPPLES: readonly Wave[] = [
  makeWave(waveRand, 826, 9, 1.5),
  makeWave(waveRand, 838, 8, 1.4),
  makeWave(waveRand, 849, 7, 1.3),
  makeWave(waveRand, 858, 6, 1.2),
];

/* -------------------------------- the reef -------------------------------- */

interface Patch {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly o: number;
}

/**
 * Coral heads on the reef line and dark patches in the shallows. A reef seen
 * from a beach is never an even stripe of darker water — it is a broken run
 * of blotches with clear sand showing between them, and that mottling is what
 * makes the tone change read as a bottom rather than as a printed band.
 */
function buildPatches(
  seed: number,
  count: number,
  top: Wave,
  bottom: Wave,
  scale: number,
): readonly Patch[] {
  const rand = prng(seed);
  const out: Patch[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = rand() * SCENE_W;
    const t = rand();
    const rx = scale * (0.4 + rand() * rand() * 2.2);
    out.push({
      cx: r(x),
      cy: r(mix(waveY(top, x), waveY(bottom, x), 0.12 + t * 0.76)),
      rx: r(rx),
      ry: r(rx * (0.18 + rand() * 0.2)),
      o: r2(0.2 + rand() * 0.8),
    });
  }
  return out;
}

const REEF_HEADS = buildPatches(0x2ee4, 26, REEF_TOP, REEF_BOTTOM, 34);
const SHOAL_PATCHES = buildPatches(0x7a13, 16, SHOAL_TOP, SHOAL_BOTTOM, 40);

/* ------------------------------ foam streaks ------------------------------ */

interface Streak {
  readonly d: string;
  readonly o: number;
  readonly w: number;
}

/**
 * What a crest actually looks like.
 *
 * A single continuous white line ruled across the frame is the loudest
 * remaining tell of a drawing: no photograph of a sea contains one. What is
 * really there is a scatter of short foam streaks lying along the swell, each
 * a different length and brightness, with gaps between them longer than the
 * streaks. So the crest line stays, at almost no opacity, to carry the tonal
 * edge — and these do the work of looking like water.
 */
function buildStreaks(
  wave: Wave,
  seed: number,
  count: number,
  minLen: number,
  maxLen: number,
  weight: number,
  spread: number,
): readonly Streak[] {
  const rand = prng(seed);
  const out: Streak[] = [];
  for (let index = 0; index < count; index += 1) {
    const x0 = rand() * SCENE_W;
    const x1 = Math.min(x0 + minLen + rand() * (maxLen - minLen), SCENE_W);
    if (x1 - x0 < 5) continue;
    // Offset off the crest line itself: foam sits on the face of the swell,
    // never exactly on its edge.
    const offset = (rand() - 0.5) * spread;
    const shifted: Wave = { base: wave.base + offset, terms: wave.terms };
    out.push({
      d: `M${r(x0)} ${r(waveY(shifted, x0))} ${waveCurve(shifted, x0, x1, Math.max(14, (x1 - x0) / 2))}`,
      o: r2(0.14 + rand() * rand() * 0.86),
      w: r2(0.45 + rand() * weight),
    });
  }
  return out;
}

/* Short and faint far out, long and bright near in — the same aerial
   perspective the crest opacities carry, stated in geometry. */
const STREAK_A = buildStreaks(CREST_A, 0xa11, 34, 8, 34, 0.5, 5);
const STREAK_B = buildStreaks(CREST_B, 0xb22, 40, 12, 52, 0.7, 9);
const STREAK_C = buildStreaks(CREST_C, 0xc33, 44, 18, 76, 1, 15);
const STREAK_D = buildStreaks(CREST_D, 0xd44, 40, 24, 112, 1.5, 22);

/* ---------------------------- the glitter path ---------------------------- */

interface Sliver {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly o: number;
}

/**
 * The sun's path on the water.
 *
 * The physics that matters: each sliver is one wave facet catching the sun, so
 * the column is as wide as the swell's slope allows. Near the horizon the
 * facets are foreshortened to nothing — the reflection is a narrow, almost
 * continuous blaze. As the water comes toward the viewer the facets open up,
 * the column widens roughly as a power of distance, and the blaze breaks into
 * separate, wider, more scattered flecks with far more variation between them.
 */
function buildGlitter(): { readonly far: readonly Sliver[]; readonly near: readonly Sliver[] } {
  const rand = prng(0x5eab17);
  const far: Sliver[] = [];
  const near: Sliver[] = [];
  const top = 476;
  const bottom = 850;

  let y = top;
  while (y < bottom) {
    const d = (y - top) / (bottom - top);
    const half = 14 + 208 * Math.pow(d, 1.5);
    const count = Math.max(1, Math.round(0.5 + 4 * Math.pow(d, 0.9)));

    for (let index = 0; index < count; index += 1) {
      // Biased toward the centre of the column: a reflection is brightest on
      // its axis and thins out at the edges.
      const u = rand() * 2 - 1;
      const offset = u * Math.pow(Math.abs(u), 0.4) * half;
      // A quarter of the facets are barely-there specks. Without them the
      // column reads as a ladder of equal dashes, which is the one way this
      // detail can end up looking more drawn than the line it replaced.
      const speck = rand() < 0.28;
      const width =
        (4.5 + 24 * Math.pow(d, 1.1)) * (speck ? 0.12 + rand() * 0.28 : 0.4 + rand() * 1.6);
      const sliver: Sliver = {
        cx: r(SUN_X + offset),
        // Rows are only a suggestion: each facet wanders far enough off its
        // own row to break the horizontal rhythm.
        cy: r(y + (rand() - 0.5) * (3 + 9 * d)),
        rx: r(Math.min(width, half * 0.92)),
        ry: r2((0.5 + 2.9 * Math.pow(d, 1.05)) * (speck ? 0.4 + rand() * 0.4 : 0.5 + rand() * 1.1)),
        // The blaze at the horizon is near-solid; further in it is a scatter of
        // very unequal flecks, and the unevenness is the whole effect.
        o: r2(d < 0.18 ? 0.6 + rand() * 0.4 : (speck ? 0.12 : 0.2) + rand() * 0.72),
      };
      (d < 0.16 ? far : near).push(sliver);
    }

    // Rows crowd together at the horizon and open out toward the shore: 68
    // facets in all, ten of them in the unresolvable blaze at the top.
    y += 5.4 + 21 * Math.pow(d, 1.3);
  }

  return { far, near };
}

const GLITTER = buildGlitter();

/* ------------------------------ foam and lace ----------------------------- */

interface Bubble {
  readonly cx: number;
  readonly cy: number;
  readonly rr: number;
  readonly o: number;
}

/**
 * The lace of spent foam. Bubbles crowd the waterline and thin out up the
 * beach, with a long tail of stragglers — which is what a real swash edge
 * leaves behind, and what a smooth white ribbon never looks like.
 */
function buildBubbles(): readonly Bubble[] {
  const rand = prng(0x1de77a);
  const out: Bubble[] = [];
  for (let index = 0; index < 108; index += 1) {
    const x = rand() * SCENE_W;
    // Squared falloff: dense at the edge, sparse a few units up the sand.
    const t = Math.pow(rand(), 2.1);
    const y = waveY(WATERLINE, x) + mix(-4, 34, t) + (rand() - 0.5) * 3;
    out.push({
      cx: r(x),
      cy: r(y),
      rr: r2(0.6 + rand() * rand() * 3.1),
      o: r2(mix(0.85, 0.16, t) * (0.5 + rand() * 0.5)),
    });
  }
  return out;
}

const BUBBLES = buildBubbles();

/* ------------------------------ shells, pebbles --------------------------- */

interface Mark {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly o: number;
  readonly tilt: number;
}

function buildMarks(): readonly Mark[] {
  const rand = prng(0x3a11e5);
  const out: Mark[] = [];
  for (let index = 0; index < 26; index += 1) {
    const x = rand() * SCENE_W;
    const y = waveY(DRYLINE, x) + 6 + rand() * 30;
    if (y > SCENE_H - 4) continue;
    const rx = 1.6 + rand() * rand() * 7;
    out.push({
      cx: r(x),
      cy: r(y),
      rx: r(rx),
      ry: r(rx * (0.34 + rand() * 0.24)),
      o: r2(0.3 + rand() * 0.7),
      tilt: Math.round(rand() * 180 - 90),
    });
  }
  return out;
}

const MARKS = buildMarks();

/* ---------------------------------- stars --------------------------------- */

interface Star {
  readonly cx: number;
  readonly cy: number;
  readonly rr: number;
  readonly o: number;
}

/**
 * Only visible in the night palette — `--vy-star` is fully transparent by day,
 * so one copy of the markup covers both. Brightness is heavily skewed: a real
 * sky is mostly faint stars with a handful of bright ones, and an even scatter
 * of equal dots is the giveaway of a drawn night.
 */
function buildStars(): readonly Star[] {
  const rand = prng(0x9e3779);
  const out: Star[] = [];
  for (let index = 0; index < 74; index += 1) {
    const y = Math.pow(rand(), 0.72) * 430;
    const brightness = Math.pow(rand(), 2.6);
    out.push({
      cx: r(rand() * SCENE_W),
      cy: r(y),
      rr: r2(0.5 + brightness * 1.7),
      // Stars extinguish toward the horizon: haze, and more air to look through.
      o: r2((0.24 + brightness * 0.76) * mix(1, 0.28, y / 430)),
    });
  }
  return out;
}

const STARS = buildStars();

/* ---------------------------------- clouds -------------------------------- */

/**
 * A cloud silhouette built from arcs of unequal radius along a sagging base.
 * The turbulence filter then chews the outline up, which is what stops it
 * being a row of bumps.
 */
function buildCloud(seed: number, span: number, lift: number): string {
  const rand = prng(seed);
  const parts: string[] = [`M${r(-span / 2)} 0`];
  let x = -span / 2;
  const lobes = 5 + Math.floor(rand() * 4);
  for (let index = 0; index < lobes; index += 1) {
    const width = (span / lobes) * (0.6 + rand() * 0.85);
    const next = Math.min(x + width, span / 2);
    const height =
      lift * (0.35 + rand() * 0.95) * Math.sin((Math.PI * (index + 0.5)) / lobes) ** 0.4;
    parts.push(`A${r(width / 2)} ${r(height)} 0 0 1 ${r(next)} ${r((rand() - 0.5) * lift * 0.2)}`);
    x = next;
    if (x >= span / 2) break;
  }
  parts.push(`L${r(span / 2)} 0`);
  // The base sags slightly rather than ruling straight across.
  parts.push(`Q0 ${r(lift * 0.34)} ${r(-span / 2)} 0 Z`);
  return parts.join(' ');
}

interface CloudDef {
  readonly d: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly o: number;
}

/* Cumulus flatten and shrink toward the horizon because they are further
   away and seen more edge-on — the same handful of clouds at the same
   altitude, not five different kinds of weather. */
const CLOUDS: readonly CloudDef[] = [
  { d: buildCloud(0x11, 284, 52), x: 340, y: 210, scale: 1, o: 0.8 },
  { d: buildCloud(0x27, 206, 38), x: 1204, y: 176, scale: 0.94, o: 0.66 },
  { d: buildCloud(0x43, 248, 26), x: 820, y: 318, scale: 0.9, o: 0.52 },
  { d: buildCloud(0x59, 168, 20), x: 218, y: 384, scale: 0.86, o: 0.4 },
  { d: buildCloud(0x6d, 224, 15), x: 1006, y: 412, scale: 0.9, o: 0.3 },
];

/* -------------------------------------------------------------------------- */
/*                                Palm fronds                                 */
/* -------------------------------------------------------------------------- */

/*
 * The most cartoon-prone element in the frame, so it gets the most work: 46
 * separate leaflets per frond, each with its own length, sweep and curvature,
 * a few of them torn short the way a real frond in trade winds always is, and
 * a fill gradient that runs dark at the rib to backlit-translucent at the tip.
 * Leaflets on the sunward side take a lighter token — a frond against a bright
 * sky is a silhouette with the near side glowing through.
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Leaflet {
  readonly d: string;
  readonly lit: boolean;
  readonly o: number;
}

interface Frond {
  readonly rib: string;
  readonly leaves: readonly Leaflet[];
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function quadTangent(p0: Point, p1: Point, p2: Point, t: number): Point {
  const x = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const y = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function buildFrond(seed: number): Frond {
  const rand = prng(seed);
  const p0: Point = { x: 0, y: 0 };
  const p1: Point = { x: 168 + rand() * 34, y: -22 + rand() * 14 };
  const p2: Point = { x: 296 + rand() * 52, y: 112 + rand() * 42 };

  const leaves: Leaflet[] = [];
  const count = 23;

  for (let index = 0; index < count; index += 1) {
    const t = 0.05 + (index / (count - 1)) * 0.92 + (rand() - 0.5) * 0.014;
    const base = quadPoint(p0, p1, p2, t);
    const tangent = quadTangent(p0, p1, p2, t);

    for (const side of [1, -1] as const) {
      // Longest around the middle of the rib, tapering at both ends, with the
      // two sides deliberately unequal.
      let span = (92 + rand() * 30) * Math.pow(Math.sin(Math.PI * t), 0.55);
      if (side === -1) span *= 0.86;
      // Trade-wind damage: the odd leaflet snapped short.
      if (rand() < 0.08) span *= 0.42 + rand() * 0.2;

      const nx = -tangent.y * side;
      const ny = tangent.x * side;
      const sweep = 0.4 + rand() * 0.26;
      // Every leaflet droops a little under its own weight, more the longer
      // it is, which is what turns a needle into a blade.
      const droop = span * (0.08 + rand() * 0.13);
      const bow = 0.5 + rand() * 0.16;

      const tip: Point = {
        x: base.x + nx * span + tangent.x * span * sweep,
        y: base.y + ny * span + tangent.y * span * sweep + droop,
      };
      const outer: Point = {
        x: base.x + nx * span * bow + tangent.x * span * 0.08,
        y: base.y + ny * span * bow + tangent.y * span * 0.08 + droop * 0.3,
      };
      const inner: Point = {
        x: base.x + nx * span * (bow - 0.08) + tangent.x * span * (sweep * 0.55),
        y: base.y + ny * span * (bow - 0.08) + tangent.y * span * (sweep * 0.55) + droop * 0.72,
      };

      leaves.push({
        d:
          `M${r(base.x)} ${r(base.y)} Q${r(outer.x)} ${r(outer.y)} ${r(tip.x)} ${r(tip.y)} ` +
          `Q${r(inner.x)} ${r(inner.y)} ${r(base.x)} ${r(base.y)}Z`,
        lit: side === 1 && rand() > 0.28,
        o: r2(0.74 + rand() * 0.26),
      });
    }
  }

  return { rib: `M0 0 Q${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)}`, leaves };
}

/* Three separate seeds, so no two fronds in frame are the same plant. */
const FROND_NEAR = buildFrond(0xf1a5);
const FROND_BACK = buildFrond(0xb2c7);
const FROND_LEFT = buildFrond(0x74d9);

/** One palm frond, placed by its transform. Purely decorative framing. */
function PalmFrond({ frond, transform }: { frond: Frond; transform: string }): ReactNode {
  return (
    <g transform={transform}>
      <path className="vy-frond__rib" d={frond.rib} fill="none" />
      {frond.leaves.map((leaf, index) => (
        <path
          className={leaf.lit ? 'vy-frond__leaf vy-frond__leaf--lit' : 'vy-frond__leaf'}
          key={index}
          d={leaf.d}
          opacity={leaf.o}
        />
      ))}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*                              The hero scenery                              */
/* -------------------------------------------------------------------------- */

/** A gull, at the size a gull is when it is far away: two strokes. */
function Gull({
  x,
  y,
  scale,
  opacity,
  spread,
}: {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  spread: number;
}): ReactNode {
  // The wing angle is what makes three gulls read as three birds instead of
  // three copies: they are never on the same beat.
  return (
    <path
      className="vy-scene__gull"
      transform={`translate(${x} ${y}) scale(${scale})`}
      opacity={opacity}
      d={`M-11 0 q5.5 ${r(-6 * spread)} 11 ${r(-1.4 * spread + 1.4)} q5.5 ${r(-4.6 * spread - 1.4)} 11 ${r(1.4 * spread - 1.4)}`}
      fill="none"
    />
  );
}

/**
 * The coast behind the hero: a low afternoon sun over a reef lagoon, its
 * reflection broken into sixty-odd facets down the water, a reef and a sandbar
 * showing through as tone changes, a swash edge of foam on wet sand, and palm
 * fronds arcing in from the top corners.
 *
 * The crop is anchored to `xMax`. A `slice` fit only bites horizontally on a
 * phone, and the right third is where the sun, its reflection path and the
 * fronds live — so a narrow viewport keeps the composition instead of landing
 * on an empty stretch of sea. Wide viewports show the full width either way.
 *
 * Purely decorative, so it is hidden from assistive technology and the hero's
 * text carries the whole meaning.
 */
export function CoastScene(): ReactNode {
  return (
    <svg
      className="vy-scene"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* ---------------------------- gradients ---------------------------- */}

        {/* Six stops, and the hue walks blue → cyan → warm as it descends. A
            two-stop sky is the single loudest "vector illustration" tell. */}
        <linearGradient id="vy-g-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-sky-1" />
          <stop offset="0.22" className="vy-stop-sky-2" />
          <stop offset="0.44" className="vy-stop-sky-3" />
          <stop offset="0.66" className="vy-stop-sky-4" />
          <stop offset="0.86" className="vy-stop-sky-5" />
          <stop offset="1" className="vy-stop-sky-6" />
        </linearGradient>

        {/* Horizon haze. Sits *over* the sun, because a low sun is always
            filtered through the thickest air in the frame. */}
        <linearGradient id="vy-g-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-haze-3" />
          <stop offset="0.55" className="vy-stop-haze-2" />
          <stop offset="1" className="vy-stop-haze-1" />
        </linearGradient>

        <radialGradient id="vy-g-bloom" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vy-stop-glow-1" />
          <stop offset="0.09" className="vy-stop-glow-2" />
          <stop offset="0.22" className="vy-stop-glow-3" />
          <stop offset="0.48" className="vy-stop-glow-4" />
          <stop offset="1" className="vy-stop-glow-5" />
        </radialGradient>

        {/* The disc: a hot core, a warm rim, and a last few percent that fades
            out rather than stopping. A hard-edged circle reads as a sticker. */}
        <radialGradient id="vy-g-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vy-stop-sun-1" />
          <stop offset="0.52" className="vy-stop-sun-1" />
          <stop offset="0.79" className="vy-stop-sun-2" />
          <stop offset="0.93" className="vy-stop-sun-3" />
          <stop offset="1" className="vy-stop-sun-4" />
        </radialGradient>

        {/* Low sun smears sideways through haze; this is that smear. */}
        <linearGradient id="vy-g-flare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="vy-stop-glow-5" />
          <stop offset="0.3" className="vy-stop-glow-4" />
          <stop offset="0.5" className="vy-stop-glow-3" />
          <stop offset="0.7" className="vy-stop-glow-4" />
          <stop offset="1" className="vy-stop-glow-5" />
        </linearGradient>

        {/* Eight stops from deep offshore navy-teal to pale aquamarine over
            white sand, with a hazy strip at the very horizon where the water
            is seen through the most air. Real tropical water is never one
            teal, and the hue turn from blue to green is where the bottom
            comes up. */}
        <linearGradient id="vy-g-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-water-1" />
          <stop offset="0.08" className="vy-stop-water-2" />
          <stop offset="0.22" className="vy-stop-water-3" />
          <stop offset="0.4" className="vy-stop-water-4" />
          <stop offset="0.58" className="vy-stop-water-5" />
          <stop offset="0.75" className="vy-stop-water-6" />
          <stop offset="0.89" className="vy-stop-water-7" />
          <stop offset="1" className="vy-stop-water-8" />
        </linearGradient>

        {/* Haze on the far water. Weaker than the sky's, and short: pushed any
            harder it stops being atmosphere and becomes a flat plateau of
            tone below the horizon with an edge of its own. */}
        <linearGradient id="vy-g-seahaze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-haze-2" />
          <stop offset="0.7" className="vy-stop-haze-3" />
        </linearGradient>

        {/* The diffuse column under the glitter: the light the facets scatter
            that never resolves into a fleck. */}
        <linearGradient id="vy-g-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-sheen-1" />
          <stop offset="0.4" className="vy-stop-sheen-2" />
          <stop offset="1" className="vy-stop-sheen-3" />
        </linearGradient>

        {/* Alpha ramps. The grain filters composite their noise *into* these,
            so the texture strengthens toward the viewer with no mask. */}
        <linearGradient id="vy-g-grainramp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-grain-far" />
          <stop offset="1" className="vy-stop-grain-near" />
        </linearGradient>
        <linearGradient id="vy-g-causticramp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-caustic-2" />
          <stop offset="0.45" className="vy-stop-caustic-1" />
          <stop offset="1" className="vy-stop-caustic-2" />
        </linearGradient>

        {/* User space, not bounding box: the foam body closes below the frame
            so parallax cannot open a gap under it, and a bbox-relative ramp
            would then spread the foam halfway down the beach. */}
        <linearGradient
          id="vy-g-foam"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="798"
          x2="0"
          y2="900"
        >
          <stop offset="0" className="vy-stop-foam-1" />
          <stop offset="0.44" className="vy-stop-foam-2" />
        </linearGradient>

        {/* Wet sand mirrors the sky; that is most of why it looks wet. */}
        <linearGradient id="vy-g-wetsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-wetsky-1" />
          <stop offset="1" className="vy-stop-wetsky-2" />
        </linearGradient>

        {/* Dark at the rib, translucent at the tip: backlit chlorophyll. Two
            of them, because the leaflets on the sunward side of the rib glow
            through and the ones behind it do not. Object-bounding-box space,
            so each leaflet orients its own gradient — which is free variation
            across all forty-six of them. */}
        <linearGradient id="vy-g-frond" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" className="vy-stop-frond-1" />
          <stop offset="0.55" className="vy-stop-frond-2" />
          <stop offset="1" className="vy-stop-frond-3" />
        </linearGradient>
        <linearGradient id="vy-g-frondlit" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" className="vy-stop-frond-4" />
          <stop offset="0.55" className="vy-stop-frond-5" />
          <stop offset="1" className="vy-stop-frond-6" />
        </linearGradient>

        <linearGradient id="vy-g-contrail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="vy-stop-trail-2" />
          <stop offset="0.55" className="vy-stop-trail-1" />
          <stop offset="1" className="vy-stop-trail-1" />
        </linearGradient>

        {/* ----------------------------- clips ------------------------------ */}

        {/* Everything painted on the sea is clipped to the sea, so glitter and
            caustics stop dead at the waterline instead of crawling up sand. */}
        <clipPath id="vy-clip-sea">
          <path
            d={`M0 ${HORIZON} L${SCENE_W} ${HORIZON} L${SCENE_W} ${r(waveY(WATERLINE, SCENE_W))} ${waveCurve(WATERLINE, SCENE_W, 0)} Z`}
          />
        </clipPath>
        <clipPath id="vy-clip-wet">
          <path d={ribbon(WATERLINE, DRYLINE)} />
        </clipPath>
        <clipPath id="vy-clip-dry">
          <path d={below(DRYLINE)} />
        </clipPath>

        {/* ---------------------------- filters ----------------------------- */}
        {/* Each is declared once and reused; none is applied to a full-viewport
            rect, and no turbulence goes above three octaves. */}

        {/* Atmospheric perspective: the far crests are simply not in focus. */}
        <filter id="vy-f-far" x="-1%" y="-300%" width="102%" height="700%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        {/* Wide enough that the sheen wedge stops having edges at all — a
            visible straight edge on a column of light is a drawn cone. */}
        <filter id="vy-f-soft" x="-24%" y="-16%" width="148%" height="132%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <filter id="vy-f-trail" x="-4%" y="-60%" width="108%" height="220%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        {/* The nearest frond is closer than the plane of focus, so it is soft.
            Nothing says "photograph" faster than something being out of focus. */}
        <filter id="vy-f-dof" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>

        {/* Cloud edges: displaced by noise, then softened. Applied per cloud,
            so each filter region is a few hundred units wide. Low frequency
            and a modest scale on purpose — high-frequency displacement
            shreds a cloud instead of billowing it. */}
        <filter id="vy-f-cloud" x="-16%" y="-140%" width="132%" height="380%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.024"
            numOctaves="3"
            seed="7"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dm"
          />
          <feGaussianBlur in="dm" stdDeviation="3.4" />
        </filter>

        {/* The foam edge, chewed up so it is never a smooth white ribbon. */}
        <filter id="vy-f-foam" x="-2%" y="-25%" width="104%" height="150%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.022 0.06"
            numOctaves="2"
            seed="19"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="11"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dm"
          />
          <feGaussianBlur in="dm" stdDeviation="1.2" />
        </filter>

        {/* Water grain. Anisotropic on purpose: perspective stretches surface
            texture horizontally, and isotropic noise on water looks like paper.

            The colour matrix copies one turbulence channel into all three
            rather than averaging them — averaging three independent noises
            regresses to flat mid-grey, which an `overlay` blend then leaves
            almost untouched. The transfer then expands what is left around
            0.5 so the blend has something to work with, and pins alpha at 1
            so the `in` composite takes its ramp from the source gradient
            alone. That is the whole reason this texture is visible. */}
        <filter id="vy-f-grain" x="0%" y="0%" width="100%" height="100%">
          {/* Coarse across, fine down. That is what stretches the noise into
              horizontal ripple texture; the other way round it comes out as
              vertical corduroy, which is not a thing water does. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06 0.5"
            numOctaves="2"
            seed="3"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
            result="g"
          />
          <feComponentTransfer in="g" result="t">
            <feFuncR type="linear" slope="3" intercept="-1" />
            <feFuncG type="linear" slope="3" intercept="-1" />
            <feFuncB type="linear" slope="3" intercept="-1" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Caustics over the shallows: the light the ripples focus onto the
            sand. White, with alpha driven by one noise channel through a
            gamma of four — which leaves only the brightest tenth of the noise
            visible, so it reads as veins rather than as fog. */}
        <filter id="vy-f-caustic" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.055 0.15"
            numOctaves="3"
            seed="11"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0"
            result="lum"
          />
          <feComponentTransfer in="lum" result="veins">
            <feFuncA type="gamma" amplitude="1" exponent="4" offset="0" />
          </feComponentTransfer>
          <feComposite in="veins" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Sand grain: isotropic, fine, and only over the strip of dry sand. */}
        <filter id="vy-f-sand" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="29"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
            result="g"
          />
          <feComponentTransfer in="g" result="t">
            <feFuncR type="linear" slope="3.4" intercept="-1.2" />
            <feFuncG type="linear" slope="3.4" intercept="-1.2" />
            <feFuncB type="linear" slope="3.4" intercept="-1.2" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* sky ---------------------------------------------------------------- */}
      <rect x="0" y="0" width="1440" height="474" fill="url(#vy-g-sky)" />

      {/* stars, only visible in the night palette --------------------------- */}
      <g className="vy-scene__stars">
        {STARS.map((star, index) => (
          <circle key={index} cx={star.cx} cy={star.cy} r={star.rr} opacity={star.o} />
        ))}
      </g>

      <g className="vy-scene__layer vy-scene__layer--sun">
        <circle cx={SUN_X} cy={SUN_Y + 6} r="400" fill="url(#vy-g-bloom)" />
        <ellipse cx={SUN_X} cy={SUN_Y + 22} rx="330" ry="17" fill="url(#vy-g-flare)" />
        <circle cx={SUN_X} cy={SUN_Y} r="46" fill="url(#vy-g-sun)" />
      </g>

      {/* the haze the low sun is seen through ------------------------------- */}
      <rect x="0" y="286" width="1440" height="188" fill="url(#vy-g-haze)" />

      {/* a jet, high up, and the trail it left ------------------------------ */}
      <g className="vy-scene__layer vy-scene__layer--path">
        <g filter="url(#vy-f-trail)">
          <path
            className="vy-scene__arc"
            d="M132 342 C 452 168, 966 140, 1348 246"
            fill="none"
            stroke="url(#vy-g-contrail)"
          />
        </g>
        <path
          className="vy-scene__jet"
          d="M0 0 L-13 -4.5 L-9 0 L-13 4.5 Z"
          transform="translate(1350 247) rotate(19)"
        />
      </g>

      {/* clouds — long and flat, the way they sit over an evening sea ------- */}
      <g className="vy-scene__layer vy-scene__layer--clouds">
        <g className="vy-scene__drift vy-scene__drift--a">
          {CLOUDS.slice(0, 2).map((cloud, index) => (
            <g
              key={index}
              transform={`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`}
              filter="url(#vy-f-cloud)"
              opacity={cloud.o}
            >
              {/* Shaded body, then the same silhouette lifted a little: what
                  shows past the top of the copy is the sunlit crown, what
                  shows below it is the shaded base. */}
              <path className="vy-scene__cloud" d={cloud.d} />
              <path
                className="vy-scene__cloud vy-scene__cloud--lit"
                d={cloud.d}
                transform="translate(0 -7)"
              />
            </g>
          ))}
        </g>
        <g className="vy-scene__drift vy-scene__drift--b">
          {CLOUDS.slice(2).map((cloud, index) => (
            <g
              key={index}
              transform={`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`}
              filter="url(#vy-f-cloud)"
              opacity={cloud.o}
            >
              <path className="vy-scene__cloud" d={cloud.d} />
            </g>
          ))}
        </g>
      </g>

      {/* gulls -------------------------------------------------------------- */}
      <g className="vy-scene__layer vy-scene__layer--gulls">
        <Gull x={676} y={166} scale={1.1} opacity={0.85} spread={1} />
        <Gull x={748} y={200} scale={0.78} opacity={0.62} spread={0.55} />
        <Gull x={608} y={218} scale={0.6} opacity={0.44} spread={0.8} />
        <Gull x={860} y={148} scale={0.5} opacity={0.34} spread={0.35} />
      </g>

      {/* the sea ------------------------------------------------------------ */}
      <g className="vy-scene__sea">
        {/* Starts exactly on the clip's top edge. Two units of water above it
            would sit outside the clip, miss the haze, and paint a hard dark
            rule along the horizon — which is precisely the drawn look this
            whole rebuild is about. */}
        <rect x="0" y={HORIZON} width="1440" height={SCENE_H - HORIZON} fill="url(#vy-g-water)" />

        <g clipPath="url(#vy-clip-sea)">
          {/* reef and sandbar: tone changes where the bottom rises, with
              irregular edges and mottling rather than a printed stripe */}
          <g filter="url(#vy-f-far)">
            <path className="vy-scene__reef" d={ribbon(REEF_TOP, REEF_BOTTOM)} />
            <g className="vy-scene__reefheads">
              {REEF_HEADS.map((patch, index) => (
                <ellipse
                  key={index}
                  cx={patch.cx}
                  cy={patch.cy}
                  rx={patch.rx}
                  ry={patch.ry}
                  opacity={patch.o}
                />
              ))}
            </g>
          </g>
          <path className="vy-scene__shoal" d={ribbon(SHOAL_TOP, SHOAL_BOTTOM)} />
          <g className="vy-scene__shoalpatches">
            {SHOAL_PATCHES.map((patch, index) => (
              <ellipse
                key={index}
                cx={patch.cx}
                cy={patch.cy}
                rx={patch.rx}
                ry={patch.ry}
                opacity={patch.o}
              />
            ))}
          </g>

          {/* Water texture, stronger as it comes toward the viewer. It starts
              below the haze band rather than at the horizon: surface texture
              that far out is below the resolving power of the eye anyway, and
              not computing it halves the turbulence region. */}
          <rect
            className="vy-scene__grain"
            x="0"
            y="556"
            width="1440"
            height="266"
            fill="url(#vy-g-grainramp)"
            filter="url(#vy-f-grain)"
          />

          {/* caustics over the shallows */}
          <rect
            className="vy-scene__caustic"
            x="0"
            y="676"
            width="1440"
            height="150"
            fill="url(#vy-g-causticramp)"
            filter="url(#vy-f-caustic)"
          />

          {/* the diffuse column of scattered light, then the facets in it */}
          <path
            className="vy-scene__sheen"
            d={`M${SUN_X - 22} 472 L${SUN_X + 22} 472 L${SUN_X + 236} 856 L${SUN_X - 236} 856 Z`}
            fill="url(#vy-g-sheen)"
            filter="url(#vy-f-soft)"
          />

          <g className="vy-scene__glints">
            {/* Far facets are below the resolving power of the eye at that
                distance, so they blur into one continuous blaze. */}
            <g filter="url(#vy-f-far)">
              {GLITTER.far.map((sliver, index) => (
                <ellipse
                  key={index}
                  cx={sliver.cx}
                  cy={sliver.cy}
                  rx={sliver.rx}
                  ry={sliver.ry}
                  opacity={sliver.o}
                />
              ))}
            </g>
            {GLITTER.near.map((sliver, index) => (
              <ellipse
                key={index}
                cx={sliver.cx}
                cy={sliver.cy}
                rx={sliver.rx}
                ry={sliver.ry}
                opacity={sliver.o}
              />
            ))}
          </g>

          {/* Four swells, far to near. Each is a tone change with a near
              invisible edge on it and a scatter of foam streaks lying along
              that edge — never one ruled white line. The two farthest are
              blurred outright: at that range the eye cannot resolve a crest. */}
          <g className="vy-scene__layer vy-scene__layer--band-a">
            <path className="vy-scene__band vy-scene__band--a" d={below(CREST_A)} />
            <g filter="url(#vy-f-far)">
              <path
                className="vy-scene__crest vy-scene__crest--far"
                d={crest(CREST_A)}
                fill="none"
              />
              <g className="vy-scene__streaks vy-scene__streaks--far">
                {STREAK_A.map((streak, index) => (
                  <path key={index} d={streak.d} opacity={streak.o} strokeWidth={streak.w} />
                ))}
              </g>
            </g>
          </g>
          <g className="vy-scene__layer vy-scene__layer--band-b">
            <path className="vy-scene__band vy-scene__band--b" d={below(CREST_B)} />
            <g filter="url(#vy-f-far)">
              <path
                className="vy-scene__crest vy-scene__crest--mid"
                d={crest(CREST_B)}
                fill="none"
              />
              <g className="vy-scene__streaks vy-scene__streaks--mid">
                {STREAK_B.map((streak, index) => (
                  <path key={index} d={streak.d} opacity={streak.o} strokeWidth={streak.w} />
                ))}
              </g>
            </g>
          </g>
          <g className="vy-scene__layer vy-scene__layer--band-c">
            <path className="vy-scene__band vy-scene__band--c" d={below(CREST_C)} />
            <path className="vy-scene__crest" d={crest(CREST_C, 40)} fill="none" />
            <g className="vy-scene__streaks">
              {STREAK_C.map((streak, index) => (
                <path key={index} d={streak.d} opacity={streak.o} strokeWidth={streak.w} />
              ))}
            </g>
          </g>
          <g className="vy-scene__layer vy-scene__layer--band-d">
            <path className="vy-scene__band vy-scene__band--d" d={below(CREST_D)} />
            <path
              className="vy-scene__crest vy-scene__crest--near"
              d={crest(CREST_D, 30)}
              fill="none"
            />
            <g className="vy-scene__streaks vy-scene__streaks--near">
              {STREAK_D.map((streak, index) => (
                <path key={index} d={streak.d} opacity={streak.o} strokeWidth={streak.w} />
              ))}
            </g>
          </g>

          {/* a sail, far out. Drawn before the haze so the haze washes it, the
              way the same air washes everything else at that range. */}
          <g
            className="vy-scene__boat"
            transform="translate(392 504) scale(0.74)"
            filter="url(#vy-f-far)"
          >
            <path className="vy-scene__hull" d="M-11 0 L11 0 L7 5 L-8 5 Z" />
            <path className="vy-scene__sail" d="M0.5 -1.5 L0.5 -25 L10.5 -1.5 Z" />
            <path className="vy-scene__sail" d="M-1.5 -1.5 L-1.5 -20 L-9 -1.5 Z" />
          </g>

          {/* the far water, seen through the most air: lighter, flatter, softer */}
          <rect x="0" y={HORIZON} width="1440" height="96" fill="url(#vy-g-seahaze)" />
        </g>
      </g>

      {/* the shore: wet sand, dry sand, then the swash sitting on top of both -- */}
      <g className="vy-scene__layer vy-scene__layer--shore">
        <path className="vy-scene__wet" d={below(WATERLINE)} />
        <path className="vy-scene__dry" d={below(DRYLINE)} />

        <g clipPath="url(#vy-clip-wet)">
          {/* wet sand mirrors the sky, and holds a specular sheen at the edge */}
          <rect x="0" y="790" width="1440" height="96" fill="url(#vy-g-wetsky)" />
          {RIPPLES.map((ripple, index) => (
            <path
              className="vy-scene__ripple"
              key={index}
              d={crest(ripple, 50)}
              fill="none"
              opacity={r2(0.5 - index * 0.09)}
            />
          ))}
        </g>

        <g clipPath="url(#vy-clip-dry)">
          <rect
            className="vy-scene__sandgrain"
            x="0"
            y="856"
            width="1440"
            height="44"
            fill="url(#vy-g-grainramp)"
            filter="url(#vy-f-sand)"
          />
        </g>

        {/* the swash: a translucent sheet with a chewed-up leading edge. The
            body stops at 880 rather than below the frame — it is fully
            transparent by 843, and a taller box would only make the
            turbulence region larger for nothing. */}
        <g filter="url(#vy-f-foam)">
          <path className="vy-scene__foam" d={below(WATERLINE, 40, 880)} fill="url(#vy-g-foam)" />
          <path className="vy-scene__lace" d={crest(SWASH, 26)} fill="none" />
        </g>
        <path className="vy-scene__sheenline" d={crest(WATERLINE, 34)} fill="none" />

        {/* the lace of spent bubbles the swash leaves behind */}
        <g className="vy-scene__bubbles">
          {BUBBLES.map((bubble, index) => (
            <circle key={index} cx={bubble.cx} cy={bubble.cy} r={bubble.rr} opacity={bubble.o} />
          ))}
        </g>

        {/* shells and pebbles, each with its own contact shadow */}
        <g className="vy-scene__marks">
          {MARKS.map((mark, index) => (
            <g key={index} transform={`translate(${mark.cx} ${mark.cy}) rotate(${mark.tilt})`}>
              <ellipse
                className="vy-scene__markshadow"
                cx={r(mark.rx * 0.35)}
                cy={r(mark.ry * 0.5)}
                rx={mark.rx}
                ry={mark.ry}
                opacity={r2(mark.o * 0.55)}
              />
              <ellipse cx="0" cy="0" rx={mark.rx} ry={mark.ry} opacity={mark.o} />
            </g>
          ))}
        </g>
      </g>

      {/* framing: fronds in from both top corners ---------------------------- */}
      <g className="vy-scene__layer vy-scene__layer--fronds">
        {/* The nearest frond is in front of the plane of focus and so is soft. */}
        <g className="vy-frond" filter="url(#vy-f-dof)">
          <PalmFrond frond={FROND_NEAR} transform="translate(1466 -56) rotate(128) scale(1.2)" />
        </g>
        <g className="vy-frond">
          <PalmFrond frond={FROND_BACK} transform="translate(1342 -112) rotate(74) scale(0.82)" />
        </g>
        <g className="vy-frond vy-frond--dim">
          <PalmFrond frond={FROND_LEFT} transform="translate(-64 -42) rotate(31) scale(0.72)" />
        </g>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Marks                                    */
/* -------------------------------------------------------------------------- */

/** The Voyanta wordmark glyph: a low sun setting into two lines of swell. */
export function VoyantaMark(): ReactNode {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r="13" className="vy-mark__disc" />
      <circle cx="14" cy="12.4" r="5.2" className="vy-mark__sun" />
      <path d="M4.4 19.4 q2.9 -2.1 5.8 0 t5.8 0 t5.8 0" className="vy-mark__line" fill="none" />
      <path
        d="M7.4 22.7 q2.2 -1.6 4.4 0 t4.4 0 t4.4 0"
        className="vy-mark__line vy-mark__line--soft"
        fill="none"
      />
    </svg>
  );
}

/** A paper plane, used on the fare strip and the flight header. */
export function PlaneGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M2.6 11.3 21 4.2a.5.5 0 0 1 .64.64L14.5 23.2a.5.5 0 0 1-.94-.05l-2.2-7.1-7.1-2.2a.5.5 0 0 1-.05-.94Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

/** A compass rose for the "when to go" section. */
export function CompassGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.4 8.6 10.7 10.7 8.6 15.4 13.3 13.3Z" fill="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             The listing "photo"                            */
/* -------------------------------------------------------------------------- */

/*
 * The overwater bungalow gets the same treatment at a sixth of the scale: a
 * graded sky, a lagoon that walks from offshore blue to sand-pale, thatch with
 * directional grain and a ragged eave, posts lit down one edge, glass that
 * reflects the sky instead of being a swatch, a soft contact shadow, and a
 * reflection broken up by the water rather than mirrored.
 */

const STAY_W = 480;
const STAY_H = 320;

function stayCurve(wave: Wave, from: number, to: number, step = 40): string {
  const direction = to >= from ? 1 : -1;
  const stride = Math.abs(step) * direction;
  const parts: string[] = [];
  let x = from;
  while (direction > 0 ? x < to - 0.01 : x > to + 0.01) {
    const next = direction > 0 ? Math.min(x + stride, to) : Math.max(x + stride, to);
    const h = (next - x) / 3;
    parts.push(
      `C${r(x + h)} ${r(waveY(wave, x) + waveSlope(wave, x) * h)} ` +
        `${r(next - h)} ${r(waveY(wave, next) - waveSlope(wave, next) * h)} ` +
        `${r(next)} ${r(waveY(wave, next))}`,
    );
    x = next;
  }
  return parts.join(' ');
}

function stayCrest(wave: Wave): string {
  return `M0 ${r(waveY(wave, 0))} ${stayCurve(wave, 0, STAY_W)}`;
}

function stayBelow(wave: Wave): string {
  return `${stayCrest(wave)} L${STAY_W} ${STAY_H} L0 ${STAY_H} Z`;
}

const stayRand = prng(0x2b17d3);

/* Wavelengths are scaled down with the canvas so the swell reads at 480 wide. */
const STAY_SWELLS: readonly Wave[] = [
  { base: 202, terms: makeWave(stayRand, 0, 4, 0.9).terms.map((t) => ({ ...t, k: t.k * 3 })) },
  { base: 248, terms: makeWave(stayRand, 0, 5, 1.1).terms.map((t) => ({ ...t, k: t.k * 3 })) },
  { base: 292, terms: makeWave(stayRand, 0, 6, 1.3).terms.map((t) => ({ ...t, k: t.k * 3 })) },
];

const STAY_SANDBAR: readonly [Wave, Wave] = [
  { base: 222, terms: makeWave(stayRand, 0, 5, 1.2).terms.map((t) => ({ ...t, k: t.k * 3.4 })) },
  { base: 246, terms: makeWave(stayRand, 0, 6, 1.2).terms.map((t) => ({ ...t, k: t.k * 3.4 })) },
];

/** The bungalow's own glitter path, on the sun's side of the frame. */
function buildStayGlitter(): readonly Sliver[] {
  const rand = prng(0x77c10e);
  const out: Sliver[] = [];
  let y = 172;
  while (y < 312) {
    const d = (y - 172) / 140;
    const half = 6 + 62 * Math.pow(d, 1.45);
    const count = Math.max(1, Math.round(0.4 + 3 * Math.pow(d, 0.9)));
    for (let index = 0; index < count; index += 1) {
      const u = rand() * 2 - 1;
      const width = (2.6 + 12 * Math.pow(d, 1.1)) * (0.35 + rand() * 1.5);
      out.push({
        cx: r(96 + u * Math.pow(Math.abs(u), 0.4) * half),
        cy: r(y + (rand() - 0.5) * 1.6),
        rx: r(Math.min(width, half * 0.94)),
        ry: r2(0.42 + 1.5 * Math.pow(d, 1.05) * (0.55 + rand() * 0.9)),
        o: r2(d < 0.2 ? 0.55 + rand() * 0.45 : 0.18 + rand() * 0.7),
      });
    }
    y += 3.4 + 11 * Math.pow(d, 1.25);
  }
  return out;
}

const STAY_GLITTER = buildStayGlitter();

/* ------------------------------ the structure ----------------------------- */

const ROOF_APEX: Point = { x: 352, y: 98 };
const ROOF_LEFT = 246;
const ROOF_RIGHT = 458;
const ROOF_EAVE = 180;

/** Thatch is bundles of reed laid down the slope: draw the bundles. */
function buildThatch(): readonly { d: string; o: number; w: number }[] {
  const rand = prng(0x4d17ac);
  const out: { d: string; o: number; w: number }[] = [];
  for (let index = 0; index < 48; index += 1) {
    const t = index / 47;
    const x = mix(ROOF_LEFT + 2, ROOF_RIGHT - 2, t) + (rand() - 0.5) * 3;
    // Bundles start a little below the ridge, never all at the same height.
    const start = 0.06 + rand() * 0.34;
    const sx = mix(ROOF_APEX.x, x, start);
    const sy = mix(ROOF_APEX.y, ROOF_EAVE, start);
    // A slight bow, because reed sags between the battens.
    const bow = (rand() - 0.5) * 5;
    out.push({
      d: `M${r(sx)} ${r(sy)} Q${r((sx + x) / 2 + bow)} ${r((sy + ROOF_EAVE) / 2)} ${r(x)} ${r(ROOF_EAVE + rand() * 3.4)}`,
      o: r2(0.16 + rand() * 0.5),
      w: r2(0.5 + rand() * 1.3),
    });
  }
  return out;
}

const THATCH = buildThatch();

/** The eave, cut ragged: individual reed ends, not a ruled line. */
function buildEave(): string {
  const rand = prng(0x91b40c);
  const parts: string[] = [`M${ROOF_LEFT} ${ROOF_EAVE}`];
  let x = ROOF_LEFT;
  while (x < ROOF_RIGHT) {
    const step = 3 + rand() * 6;
    x = Math.min(x + step, ROOF_RIGHT);
    parts.push(`L${r(x)} ${r(ROOF_EAVE + 1.5 + rand() * 5)}`);
  }
  parts.push(`L${ROOF_RIGHT} ${ROOF_EAVE} Z`);
  return parts.join(' ');
}

const EAVE = buildEave();

const POST_X: readonly number[] = [264, 302, 344, 386, 424, 448];

interface ReflectSliver {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly o: number;
}

/** The waterline the posts stand in — everything below this is lagoon. */
const STAY_WATERLINE = 279;

/**
 * The structure's reflection. A mirror image would be wrong: moving water
 * chops a reflection into horizontal slivers whose ends wander, and the
 * further down the frame the more they wander and the fainter they get.
 *
 * It also has to start *at* the waterline. Painted any higher it stops being
 * a reflection and becomes a wash lying over the posts.
 */
function buildStayReflection(): readonly ReflectSliver[] {
  const rand = prng(0x6f21be);
  const out: ReflectSliver[] = [];
  const bottom = 320;
  let y = STAY_WATERLINE;
  while (y < bottom) {
    const d = (y - STAY_WATERLINE) / (bottom - STAY_WATERLINE);
    // Widths vary enough that the slivers never stack into a solid block —
    // the gaps between them are what read as water.
    const width = mix(58, 122, d) * (0.3 + rand() * rand() * 1.5);
    const centre = 352 + (rand() - 0.5) * mix(14, 62, d);
    out.push({
      x: r(centre - width / 2),
      y: r(y),
      w: r(width),
      h: r2(0.8 + rand() * 2.6),
      o: r2(mix(0.9, 0.1, d) * (0.25 + rand() * 0.75)),
    });
    y += 1.6 + rand() * rand() * 7;
  }
  return out;
}

const STAY_REFLECTION = buildStayReflection();

/**
 * A drawn overwater bungalow for the featured stay: thatch roof, a deck on
 * stilts, a ladder into the lagoon and a low sun on the horizon. Sized by its
 * container, not by pixels.
 */
export function StayArt(): ReactNode {
  return (
    <svg
      className="vy-stayart"
      viewBox="0 0 480 320"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustration of a thatched bungalow standing on stilts over a lagoon, with a railed deck, a ladder down into the water and a low sun on the horizon."
    >
      <defs>
        <linearGradient id="vy-gs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-sky-1" />
          <stop offset="0.34" className="vy-stop-stay-sky-2" />
          <stop offset="0.64" className="vy-stop-stay-sky-3" />
          <stop offset="0.86" className="vy-stop-stay-sky-4" />
          <stop offset="1" className="vy-stop-stay-sky-5" />
        </linearGradient>

        <radialGradient id="vy-gs-bloom" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vy-stop-stay-glow-1" />
          <stop offset="0.24" className="vy-stop-stay-glow-2" />
          <stop offset="1" className="vy-stop-stay-glow-3" />
        </radialGradient>

        <radialGradient id="vy-gs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vy-stop-stay-sun-1" />
          <stop offset="0.6" className="vy-stop-stay-sun-1" />
          <stop offset="0.9" className="vy-stop-stay-sun-2" />
          <stop offset="1" className="vy-stop-stay-sun-3" />
        </radialGradient>

        <linearGradient id="vy-gs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-sea-1" />
          <stop offset="0.05" className="vy-stop-stay-sea-2" />
          <stop offset="0.3" className="vy-stop-stay-sea-3" />
          <stop offset="0.58" className="vy-stop-stay-sea-4" />
          <stop offset="0.8" className="vy-stop-stay-sea-5" />
          <stop offset="1" className="vy-stop-stay-sea-6" />
        </linearGradient>

        <linearGradient id="vy-gs-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-haze-1" />
          <stop offset="1" className="vy-stop-stay-haze-2" />
        </linearGradient>
        {/* The same haze, running the other way: strongest on the horizon and
            spent a few units into the water. */}
        <linearGradient id="vy-gs-seahaze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-haze-2" />
          <stop offset="1" className="vy-stop-stay-haze-1" />
        </linearGradient>

        {/* The sun-facing slope, and the slope turning away from it. */}
        <linearGradient id="vy-gs-roof" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" className="vy-stop-stay-roof-1" />
          <stop offset="0.58" className="vy-stop-stay-roof-2" />
          <stop offset="1" className="vy-stop-stay-roof-3" />
        </linearGradient>

        {/* A round post is lit on one side, dark on the other, with a rim of
            bounce off the water on the far edge. */}
        <linearGradient id="vy-gs-post" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="vy-stop-stay-post-2" />
          <stop offset="0.28" className="vy-stop-stay-post-1" />
          <stop offset="0.78" className="vy-stop-stay-post-3" />
          <stop offset="1" className="vy-stop-stay-post-2" />
        </linearGradient>

        <linearGradient id="vy-gs-wall" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" className="vy-stop-stay-wall-1" />
          <stop offset="1" className="vy-stop-stay-wall-2" />
        </linearGradient>

        {/* Glass is not a colour, it is whatever it is pointed at — here, the
            sky, upside down, with the room going dark at the bottom. */}
        <linearGradient id="vy-gs-glass" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" className="vy-stop-stay-glass-1" />
          <stop offset="0.42" className="vy-stop-stay-glass-2" />
          <stop offset="1" className="vy-stop-stay-glass-3" />
        </linearGradient>

        <linearGradient id="vy-gs-grainramp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-grain-far" />
          <stop offset="1" className="vy-stop-grain-near" />
        </linearGradient>

        <clipPath id="vy-clips-sea">
          <rect x="0" y="164" width="480" height="156" />
        </clipPath>

        <filter id="vy-fs-far" x="-4%" y="-60%" width="108%" height="220%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <filter id="vy-fs-soft" x="-30%" y="-120%" width="160%" height="340%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="vy-fs-grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9 0.4"
            numOctaves="2"
            seed="5"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
            result="g"
          />
          <feComponentTransfer in="g" result="t">
            <feFuncR type="linear" slope="3" intercept="-1" />
            <feFuncG type="linear" slope="3" intercept="-1" />
            <feFuncB type="linear" slope="3" intercept="-1" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceGraphic" operator="in" />
        </filter>
        {/* Chops the reflection up the way a moving surface does. */}
        <filter id="vy-fs-reflect" x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045 0.2"
            numOctaves="2"
            seed="23"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="13"
            xChannelSelector="R"
            yChannelSelector="G"
            result="dm"
          />
          <feGaussianBlur in="dm" stdDeviation="0.5" />
        </filter>
      </defs>

      {/* sky and sun -------------------------------------------------------- */}
      <rect x="0" y="0" width="480" height="168" fill="url(#vy-gs-sky)" />
      <circle cx="96" cy="112" r="120" fill="url(#vy-gs-bloom)" />
      <circle cx="96" cy="112" r="27" fill="url(#vy-gs-sun)" />
      <rect x="0" y="96" width="480" height="72" fill="url(#vy-gs-haze)" />

      {/* a headland far back — lighter, flatter and out of focus ------------- */}
      <path
        className="vy-stayart__far"
        d="M0 152 C 38 139, 72 128, 118 140 C 150 149, 186 151, 224 147 C 252 144, 276 148, 300 152 L300 172 L0 172 Z"
        filter="url(#vy-fs-far)"
      />

      {/* the lagoon --------------------------------------------------------- */}
      <g className="vy-stayart__sea">
        <rect x="0" y="164" width="480" height="156" fill="url(#vy-gs-sea)" />

        <g clipPath="url(#vy-clips-sea)">
          {/* The same haze that softens the sky carries a little way onto the
              water, so the horizon is a line rather than a step. */}
          <rect x="0" y="164" width="480" height="26" fill="url(#vy-gs-seahaze)" />

          <path
            className="vy-stayart__sandbar"
            d={`M0 ${r(waveY(STAY_SANDBAR[0], 0))} ${stayCurve(STAY_SANDBAR[0], 0, STAY_W)} L${STAY_W} ${r(waveY(STAY_SANDBAR[1], STAY_W))} ${stayCurve(STAY_SANDBAR[1], STAY_W, 0)} Z`}
          />

          <rect
            className="vy-stayart__grain"
            x="0"
            y="168"
            width="480"
            height="152"
            fill="url(#vy-gs-grainramp)"
            filter="url(#vy-fs-grain)"
          />

          {/* the sun on the water */}
          <g className="vy-stayart__glints">
            {STAY_GLITTER.map((sliver, index) => (
              <ellipse
                key={index}
                cx={sliver.cx}
                cy={sliver.cy}
                rx={sliver.rx}
                ry={sliver.ry}
                opacity={sliver.o}
              />
            ))}
          </g>

          {STAY_SWELLS.map((swell, index) => (
            <g key={index}>
              <path className="vy-stayart__swell" d={stayBelow(swell)} />
              <path className="vy-stayart__swellcrest" d={stayCrest(swell)} fill="none" />
            </g>
          ))}
        </g>
      </g>

      {/* The shadow the whole structure drops on the water, sitting on the
          waterline rather than floating above it. */}
      <ellipse
        className="vy-stayart__shadow"
        cx="352"
        cy={STAY_WATERLINE + 2}
        rx="104"
        ry="11"
        filter="url(#vy-fs-soft)"
      />

      {/* the bungalow ------------------------------------------------------- */}
      <g className="vy-stayart__build">
        {/* posts, each lit down one edge and darker where the water wets it */}
        {POST_X.map((x) => (
          <g key={x}>
            <rect x={x - 2.6} y="232" width="5.2" height="50" fill="url(#vy-gs-post)" />
            <rect
              className="vy-stayart__wetpost"
              x={x - 2.6}
              y={STAY_WATERLINE - 10}
              width="5.2"
              height="13"
            />
            <ellipse
              className="vy-stayart__ring"
              cx={x}
              cy={STAY_WATERLINE}
              rx="7.5"
              ry="2"
              fill="none"
            />
          </g>
        ))}

        {/* ladder into the water */}
        <g className="vy-stayart__ladder">
          <path d="M252 234 v54 M270 234 v54" />
          <path d="M252 246 h18 M252 258 h18 M252 270 h18 M252 282 h18" />
        </g>

        {/* deck: planks, then the shaded fascia under them */}
        <rect className="vy-stayart__deck" x="242" y="224" width="216" height="9" />
        <g className="vy-stayart__planks">
          {Array.from({ length: 15 }, (_, index) => {
            const x = 246 + index * 14.2;
            return <path key={index} d={`M${r(x)} 224 v9`} />;
          })}
        </g>
        <rect className="vy-stayart__fascia" x="242" y="233" width="216" height="4" />

        {/* the railing on the open half of the deck */}
        <g className="vy-stayart__rail">
          <path d="M246 206 h44" />
          <path d="M248 206 v18 M262 206 v18 M276 206 v18 M288 206 v18" />
        </g>

        {/* walls, glass, and the room going dark behind it */}
        <rect
          className="vy-stayart__wall"
          x="286"
          y="178"
          width="134"
          height="46"
          fill="url(#vy-gs-wall)"
        />
        {/* The overhang darkens the top of the wall it hangs over. */}
        <rect className="vy-stayart__eaveshadow" x="286" y="178" width="134" height="8" />
        <rect className="vy-stayart__walldark" x="410" y="178" width="10" height="46" />
        <rect
          className="vy-stayart__glass"
          x="296"
          y="186"
          width="36"
          height="28"
          fill="url(#vy-gs-glass)"
        />
        <rect
          className="vy-stayart__glass"
          x="340"
          y="186"
          width="26"
          height="38"
          fill="url(#vy-gs-glass)"
        />
        <path className="vy-stayart__spec" d="M300 214 L318 186 L325 186 L307 214 Z" />
        <path className="vy-stayart__mullion" d="M314 186 v28 M353 186 v38 M296 200 h36" />
        <circle className="vy-stayart__lamp" cx="384" cy="188" r="3.4" />
        <circle
          className="vy-stayart__lampglow"
          cx="384"
          cy="188"
          r="9"
          filter="url(#vy-fs-soft)"
        />

        {/* thatch: two graded faces, forty-eight reed bundles, a ragged eave */}
        <path
          className="vy-stayart__roof"
          d={`M${ROOF_APEX.x} ${ROOF_APEX.y} L${ROOF_LEFT} ${ROOF_EAVE} L${ROOF_RIGHT} ${ROOF_EAVE} Z`}
          fill="url(#vy-gs-roof)"
        />
        <path
          className="vy-stayart__roofturn"
          d={`M${ROOF_APEX.x} ${ROOF_APEX.y} L406 ${ROOF_EAVE} L${ROOF_RIGHT} ${ROOF_EAVE} Z`}
        />
        <g className="vy-stayart__thatch">
          {THATCH.map((reed, index) => (
            <path key={index} d={reed.d} opacity={reed.o} strokeWidth={reed.w} fill="none" />
          ))}
        </g>
        <path className="vy-stayart__eave" d={EAVE} />
        <path className="vy-stayart__ridge" d={`M${ROOF_APEX.x} ${ROOF_APEX.y} v14`} fill="none" />
      </g>

      {/* the bungalow on the water, chopped up by the swell ------------------ */}
      <g className="vy-stayart__reflect" clipPath="url(#vy-clips-sea)" filter="url(#vy-fs-reflect)">
        {STAY_REFLECTION.map((sliver, index) => (
          <rect
            key={index}
            x={sliver.x}
            y={sliver.y}
            width={sliver.w}
            height={sliver.h}
            opacity={sliver.o}
          />
        ))}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Experience artwork                             */
/* -------------------------------------------------------------------------- */

export type ExperienceArtKind = 'snorkel' | 'catamaran' | 'reef';

/** A small drawn badge for each experience card. */
export function ExperienceArt({ kind }: { kind: ExperienceArtKind }): ReactNode {
  return (
    <svg className="vy-expart" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="vy-expart__disc" cx="32" cy="32" r="31" />
      {kind === 'snorkel' ? (
        <g className="vy-expart__ink">
          <path d="M16 22 h32 a4 4 0 0 1 4 4 v9 a11 11 0 0 1 -11 11 h-5 l-4 5 l-4 -5 h-5 a11 11 0 0 1 -11 -11 v-9 a4 4 0 0 1 4 -4 Z" />
          <path d="M32 22 v24" />
          <path d="M12 28 h-5 M52 28 h5" />
          <circle cx="52" cy="15" r="2.6" />
          <circle cx="58" cy="8" r="1.6" />
          <path d="M7 56 q8 -4 16 0 t16 0 t16 0" />
        </g>
      ) : null}
      {kind === 'catamaran' ? (
        <g className="vy-expart__ink">
          <path d="M10 44 h16 l-3 7 h-10 Z" />
          <path d="M38 44 h16 l-3 7 h-10 Z" />
          <path d="M14 42 h36" />
          <path d="M32 42 V12 l14 28 h-14" />
          <path d="M30 20 L18 40 h12" />
          <path d="M7 58 q8 -4 16 0 t16 0 t16 0" />
        </g>
      ) : null}
      {kind === 'reef' ? (
        <g className="vy-expart__ink">
          <path d="M30 54 V34" />
          <path d="M30 44 L20 32 M30 40 L41 27" />
          <path d="M20 32 L14 23 M20 32 L24 20" />
          <path d="M41 27 L48 19 M41 27 L38 16" />
          <path d="M8 54 q9 -4 18 0 t18 0 t12 0" />
          <circle cx="50" cy="38" r="2.4" />
          <circle cx="55" cy="29" r="1.6" />
        </g>
      ) : null}
    </svg>
  );
}
