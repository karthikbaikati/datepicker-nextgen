/**
 * Every picture on this page is drawn here.
 *
 * No photographs, no external assets, no licences: the hero coast is layered
 * inline SVG and the listing "photo" is a shape stack. That keeps the demo
 * entirely self-contained — it renders identically offline, on a locked-down
 * network, and inside a GitHub Pages build with no asset pipeline.
 *
 * Colour never appears as an attribute. Every shape carries a class and takes
 * its fill from a `--vy-*` token, so the whole scene swaps from late afternoon
 * to moonlight when the page's appearance changes, with no second copy of the
 * markup.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*                              Small geometry                                */
/* -------------------------------------------------------------------------- */

interface Point {
  readonly x: number;
  readonly y: number;
}

/** One decimal is plenty for a background at this scale, and it halves the markup. */
function r(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/*                                Palm fronds                                 */
/* -------------------------------------------------------------------------- */

/*
 * The frond is generated rather than hand-drawn: leaflets hung off a curve at
 * even parameter steps stay coherent under any rotation or scale, which a
 * hand-placed set does not. The whole thing is evaluated once, at module load,
 * and then reused under different transforms.
 */

const FROND_P0: Point = { x: 0, y: 0 };
const FROND_P1: Point = { x: 182, y: -14 };
const FROND_P2: Point = { x: 322, y: 128 };

function frondPoint(t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * FROND_P0.x + 2 * u * t * FROND_P1.x + t * t * FROND_P2.x,
    y: u * u * FROND_P0.y + 2 * u * t * FROND_P1.y + t * t * FROND_P2.y,
  };
}

/** Unit tangent of the midrib at `t` — the leaflets are hung normal to it. */
function frondTangent(t: number): Point {
  const x = 2 * (1 - t) * (FROND_P1.x - FROND_P0.x) + 2 * t * (FROND_P2.x - FROND_P1.x);
  const y = 2 * (1 - t) * (FROND_P1.y - FROND_P0.y) + 2 * t * (FROND_P2.y - FROND_P1.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

const FROND_MIDRIB = `M0 0 Q${FROND_P1.x} ${FROND_P1.y} ${FROND_P2.x} ${FROND_P2.y}`;

function buildFrondLeaflets(): readonly string[] {
  const paths: string[] = [];
  const count = 21;
  for (let index = 0; index < count; index += 1) {
    const t = 0.06 + (index / (count - 1)) * 0.9;
    const base = frondPoint(t);
    const tangent = frondTangent(t);
    // Longest at the middle of the rib, tapering to nothing at both ends.
    const span = 104 * Math.pow(Math.sin(Math.PI * t), 0.58);
    for (const side of [1, -1]) {
      const nx = -tangent.y * side;
      const ny = tangent.x * side;
      // A leaflet is a needle, not a leaf: about an eighth as wide as it is
      // long, and swept back toward the tip of the frond.
      const tip = {
        x: base.x + nx * span + tangent.x * span * 0.48,
        y: base.y + ny * span + tangent.y * span * 0.48,
      };
      const outer = {
        x: base.x + nx * span * 0.58 + tangent.x * span * 0.09,
        y: base.y + ny * span * 0.58 + tangent.y * span * 0.09,
      };
      const inner = {
        x: base.x + nx * span * 0.5 + tangent.x * span * 0.24,
        y: base.y + ny * span * 0.5 + tangent.y * span * 0.24,
      };
      paths.push(
        `M${r(base.x)} ${r(base.y)} Q${r(outer.x)} ${r(outer.y)} ${r(tip.x)} ${r(tip.y)} ` +
          `Q${r(inner.x)} ${r(inner.y)} ${r(base.x)} ${r(base.y)}Z`,
      );
    }
  }
  return paths;
}

const FROND_LEAFLETS = buildFrondLeaflets();

/** One palm frond, placed by its transform. Purely decorative framing. */
function PalmFrond({ transform }: { transform: string }): ReactNode {
  return (
    <g className="vy-frond" transform={transform}>
      <path className="vy-frond__rib" d={FROND_MIDRIB} fill="none" />
      {FROND_LEAFLETS.map((d, index) => (
        <path className="vy-frond__leaf" key={index} d={d} />
      ))}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/*                              The hero scenery                              */
/* -------------------------------------------------------------------------- */

/*
 * Four bands of water, drawn far to near. Each is stored as its open top edge
 * so the same string can be a filled body and a stroked wave crest — the crest
 * is what stops a band from reading as a flat rectangle of colour.
 */

const BAND_A_TOP =
  'M0 512 C 190 496, 372 526, 566 514 C 762 502, 944 530, 1142 518 C 1292 508, 1372 520, 1440 514';
const BAND_B_TOP =
  'M0 588 C 206 566, 392 604, 606 588 C 824 572, 1016 608, 1224 592 C 1332 584, 1392 594, 1440 589';
const BAND_C_TOP =
  'M0 670 C 226 642, 442 688, 688 668 C 906 650, 1108 694, 1306 674 C 1372 667, 1412 674, 1440 670';
const BAND_D_TOP = 'M0 756 C 246 722, 482 780, 748 754 C 990 730, 1192 782, 1408 757 L1440 754';

/** Close a wave crest into a body that fills everything below it. */
function band(top: string): string {
  return `${top} L1440 900 L0 900 Z`;
}

const SHORE_TOP =
  'M0 812 C 214 786, 408 828, 648 816 C 888 804, 1096 842, 1298 826 C 1372 820, 1412 824, 1440 820';
const SHORE_LACE =
  'M0 801 C 214 775, 408 817, 648 805 C 888 793, 1096 831, 1298 815 C 1372 809, 1412 813, 1440 809';
const DRY_TOP = 'M0 866 C 268 848, 528 878, 792 866 C 1050 854, 1256 880, 1440 870';

/**
 * The sun's path on the water: bright and narrow at the horizon, breaking into
 * wider, more scattered slivers as the swell picks it up nearer the shore.
 */
const SUN_TRACK: readonly { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 1044, cy: 484, rx: 22, ry: 3.4 },
  { cx: 1039, cy: 500, rx: 35, ry: 3.6 },
  { cx: 1051, cy: 517, rx: 25, ry: 3.4 },
  { cx: 1036, cy: 536, rx: 53, ry: 4 },
  { cx: 1053, cy: 557, rx: 37, ry: 3.6 },
  { cx: 1032, cy: 580, rx: 71, ry: 4.2 },
  { cx: 1057, cy: 603, rx: 45, ry: 3.8 },
  { cx: 1028, cy: 630, rx: 89, ry: 4.4 },
  { cx: 1059, cy: 657, rx: 56, ry: 4 },
  { cx: 1024, cy: 686, rx: 105, ry: 4.6 },
  { cx: 1061, cy: 716, rx: 67, ry: 4.2 },
  { cx: 1020, cy: 748, rx: 126, ry: 4.8 },
  { cx: 1052, cy: 782, rx: 83, ry: 4.4 },
];

/** Shells and pebbles left on the dry sand. Placed, not random. */
const BEACH_MARKS: readonly { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 148, cy: 884, rx: 7, ry: 3.4 },
  { cx: 196, cy: 872, rx: 4, ry: 2.2 },
  { cx: 372, cy: 890, rx: 5.5, ry: 2.8 },
  { cx: 566, cy: 878, rx: 8, ry: 3.6 },
  { cx: 742, cy: 892, rx: 4.5, ry: 2.4 },
  { cx: 930, cy: 880, rx: 6.5, ry: 3.2 },
  { cx: 1186, cy: 890, rx: 5, ry: 2.6 },
  { cx: 1332, cy: 878, rx: 7.5, ry: 3.4 },
];

/** One soft cloud, drawn from overlapping ellipses so it never looks like a blob. */
function Cloud({ x, y, scale }: { x: number; y: number; scale: number }): ReactNode {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse className="vy-scene__cloud" cx="0" cy="0" rx="104" ry="11" />
      <ellipse className="vy-scene__cloud" cx="-46" cy="5" rx="58" ry="7" />
      <ellipse className="vy-scene__cloud" cx="54" cy="6" rx="66" ry="6" />
      <ellipse className="vy-scene__cloud" cx="10" cy="-8" rx="48" ry="8" />
    </g>
  );
}

/** A gull, at the size a gull is when it is far away: two strokes. */
function Gull({ x, y, scale }: { x: number; y: number; scale: number }): ReactNode {
  return (
    <path
      className="vy-scene__gull"
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M-11 0 q5.5 -6 11 0 q5.5 -6 11 0"
      fill="none"
    />
  );
}

/**
 * The coast behind the hero: a low afternoon sun, its reflection breaking up
 * across four bands of water, a wet-sand foam edge, and palm fronds arcing in
 * from the top corners.
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
        <linearGradient id="vy-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-sky-1" />
          <stop offset="0.44" className="vy-stop-sky-2" />
          <stop offset="0.8" className="vy-stop-sky-3" />
          <stop offset="1" className="vy-stop-sky-4" />
        </linearGradient>

        <radialGradient id="vy-sunglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vy-stop-glow-1" />
          <stop offset="0.5" className="vy-stop-glow-2" />
          <stop offset="1" className="vy-stop-glow-3" />
        </radialGradient>

        <linearGradient id="vy-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-water-1" />
          <stop offset="0.55" className="vy-stop-water-2" />
          <stop offset="1" className="vy-stop-water-3" />
        </linearGradient>

        {/* Spans the whole wet-sand body, so foam is opaque along the
            waterline and spent within about forty units of it. */}
        <linearGradient id="vy-foam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-foam-1" />
          <stop offset="0.4" className="vy-stop-foam-2" />
        </linearGradient>
      </defs>

      {/* sky ---------------------------------------------------------------- */}
      <rect x="0" y="0" width="1440" height="472" fill="url(#vy-sky)" />

      {/* stars, only visible in the night palette --------------------------- */}
      <g className="vy-scene__stars">
        <circle cx="172" cy="118" r="1.8" />
        <circle cx="318" cy="206" r="1.3" />
        <circle cx="504" cy="92" r="1.6" />
        <circle cx="672" cy="170" r="1.2" />
        <circle cx="736" cy="60" r="1.9" />
        <circle cx="892" cy="142" r="1.4" />
        <circle cx="1118" cy="84" r="1.7" />
        <circle cx="1274" cy="188" r="1.3" />
        <circle cx="1388" cy="108" r="1.6" />
        <circle cx="238" cy="272" r="1.2" />
        <circle cx="1032" cy="244" r="1.2" />
        <circle cx="584" cy="288" r="1.4" />
      </g>

      <g className="vy-scene__layer vy-scene__layer--sun">
        <circle cx="1044" cy="452" r="286" fill="url(#vy-sunglow)" />
        <circle className="vy-scene__sun" cx="1044" cy="452" r="50" />
      </g>

      {/* clouds — long and flat, the way they sit over an evening sea ------- */}
      <g className="vy-scene__layer vy-scene__layer--clouds">
        <g className="vy-scene__drift vy-scene__drift--a">
          <Cloud x={330} y={214} scale={1.05} />
          <Cloud x={1204} y={162} scale={0.7} />
        </g>
        <g className="vy-scene__drift vy-scene__drift--b">
          <Cloud x={806} y={318} scale={0.86} />
          <Cloud x={196} y={386} scale={0.58} />
        </g>
      </g>

      {/* gulls -------------------------------------------------------------- */}
      <g className="vy-scene__layer vy-scene__layer--gulls">
        <Gull x={676} y={168} scale={1.15} />
        <Gull x={744} y={198} scale={0.85} />
        <Gull x={612} y={214} scale={0.65} />
      </g>

      {/* flight path -------------------------------------------------------- */}
      <g className="vy-scene__layer vy-scene__layer--path">
        <path className="vy-scene__arc" d="M104 336 C 428 150, 986 128, 1358 244" fill="none" />
        <g className="vy-scene__plane" transform="translate(1358 244) rotate(20)">
          <path d="M0 0 L-22 -8 L-16 0 L-22 8 Z" />
        </g>
        <circle className="vy-scene__pin" cx="104" cy="336" r="4.5" />
      </g>

      {/* water -------------------------------------------------------------- */}
      <rect x="0" y="470" width="1440" height="430" fill="url(#vy-water)" />

      {/* the sun's broken path across it ------------------------------------ */}
      <g className="vy-scene__glints">
        {SUN_TRACK.map((sliver) => (
          <ellipse
            key={`${sliver.cx}-${sliver.cy}`}
            cx={sliver.cx}
            cy={sliver.cy}
            rx={sliver.rx}
            ry={sliver.ry}
          />
        ))}
      </g>

      {/* a sail, far out ---------------------------------------------------- */}
      <g className="vy-scene__boat" transform="translate(378 470) scale(1.15)">
        <path d="M-13 0 L13 0 L8 6 L-9 6 Z" />
        <path d="M0.5 -2 L0.5 -28 L12 -2 Z" />
        <path d="M-1.5 -2 L-1.5 -23 L-10 -2 Z" />
      </g>

      {/* four bands, each with its own crest and its own parallax rate ------ */}
      <g className="vy-scene__layer vy-scene__layer--band-a">
        <path className="vy-scene__band vy-scene__band--a" d={band(BAND_A_TOP)} />
        <path className="vy-scene__crest" d={BAND_A_TOP} fill="none" />
      </g>
      <g className="vy-scene__layer vy-scene__layer--band-b">
        <path className="vy-scene__band vy-scene__band--b" d={band(BAND_B_TOP)} />
        <path className="vy-scene__crest" d={BAND_B_TOP} fill="none" />
      </g>
      <g className="vy-scene__layer vy-scene__layer--band-c">
        <path className="vy-scene__band vy-scene__band--c" d={band(BAND_C_TOP)} />
        <path className="vy-scene__crest" d={BAND_C_TOP} fill="none" />
      </g>
      <g className="vy-scene__layer vy-scene__layer--band-d">
        <path className="vy-scene__band vy-scene__band--d" d={band(BAND_D_TOP)} />
        <path className="vy-scene__crest vy-scene__crest--near" d={BAND_D_TOP} fill="none" />
      </g>

      {/* the shore: wet sand, dry sand, then the foam sitting on top of both -- */}
      <g className="vy-scene__layer vy-scene__layer--shore">
        <path className="vy-scene__wet" d={band(SHORE_TOP)} />
        <path className="vy-scene__dry" d={band(DRY_TOP)} />
        <path className="vy-scene__foam" d={band(SHORE_TOP)} fill="url(#vy-foam)" />
        <path className="vy-scene__lace" d={SHORE_LACE} fill="none" />
        <g className="vy-scene__marks">
          {BEACH_MARKS.map((mark) => (
            <ellipse
              key={`${mark.cx}-${mark.cy}`}
              cx={mark.cx}
              cy={mark.cy}
              rx={mark.rx}
              ry={mark.ry}
            />
          ))}
        </g>
      </g>

      {/* framing: fronds in from both top corners ---------------------------- */}
      <g className="vy-scene__layer vy-scene__layer--fronds">
        <PalmFrond transform="translate(1452 -48) rotate(128) scale(1.14)" />
        <PalmFrond transform="translate(1336 -104) rotate(76) scale(0.78)" />
        <PalmFrond transform="translate(-58 -38) rotate(32) scale(0.7)" />
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

/** The lagoon under the bungalow, drawn once and reused for the reflection. */
const STAY_SWELL_A = 'M0 202 C 96 192, 178 210, 276 202 C 364 195, 424 207, 480 201';
const STAY_SWELL_B = 'M0 252 C 118 239, 222 261, 334 251 C 410 244, 448 254, 480 249';
const STAY_SWELL_C = 'M0 296 C 128 283, 240 305, 358 295 C 424 289, 456 297, 480 293';

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
        <linearGradient id="vy-stay-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-sky-1" />
          <stop offset="1" className="vy-stop-stay-sky-2" />
        </linearGradient>
        <linearGradient id="vy-stay-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="vy-stop-stay-sea-1" />
          <stop offset="1" className="vy-stop-stay-sea-2" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="480" height="320" fill="url(#vy-stay-sky)" />
      <circle className="vy-stayart__sun" cx="96" cy="104" r="30" />

      {/* a headland, far back */}
      <path
        className="vy-stayart__far"
        d="M0 154 C 44 140, 84 130, 126 142 C 158 151, 190 152, 224 148 L224 168 L0 168 Z"
      />

      {/* the lagoon */}
      <rect x="0" y="164" width="480" height="156" fill="url(#vy-stay-sea)" />
      <path className="vy-stayart__swell" d={`${STAY_SWELL_A} L480 320 L0 320 Z`} />
      <path className="vy-stayart__swell" d={`${STAY_SWELL_B} L480 320 L0 320 Z`} />

      {/* the bungalow */}
      <g>
        <g className="vy-stayart__posts">
          <path d="M262 236 v42 M302 236 v42 M362 236 v42 M424 236 v42 M446 236 v40" />
        </g>

        {/* ladder into the water */}
        <g className="vy-stayart__ladder">
          <path d="M254 236 v50 M272 236 v50" />
          <path d="M254 248 h18 M254 260 h18 M254 272 h18 M254 284 h18" />
        </g>

        <rect className="vy-stayart__deck" x="244" y="226" width="212" height="10" />
        <rect className="vy-stayart__deckedge" x="244" y="236" width="212" height="4" />

        {/* the railing on the open half of the deck */}
        <g className="vy-stayart__rail">
          <path d="M248 208 h40" />
          <path d="M250 208 v18 M264 208 v18 M278 208 v18 M287 208 v18" />
        </g>

        {/* thatch */}
        <path className="vy-stayart__roof" d="M258 172 L352 108 L446 172 L446 180 L258 180 Z" />
        <g className="vy-stayart__thatch">
          <path d="M286 172 L352 126 M318 172 L352 148 M386 172 L352 148 M418 172 L352 126" />
        </g>

        <rect className="vy-stayart__wall" x="288" y="180" width="130" height="46" />
        <rect className="vy-stayart__door" x="340" y="192" width="26" height="34" />
        <path className="vy-stayart__line" d="M353 192 v34" />
        <rect className="vy-stayart__window" x="298" y="190" width="32" height="24" />
        <path className="vy-stayart__line" d="M308.5 190 v24 M319 190 v24" />
        <circle className="vy-stayart__lamp" cx="382" cy="188" r="4.5" />
      </g>

      {/* the bungalow on the water, in slivers */}
      <g className="vy-stayart__reflect">
        <ellipse cx="352" cy="248" rx="52" ry="3" />
        <ellipse cx="344" cy="258" rx="66" ry="2.6" />
        <ellipse cx="358" cy="268" rx="40" ry="2.4" />
        <ellipse cx="340" cy="280" rx="74" ry="2.2" />
        <ellipse cx="362" cy="292" rx="46" ry="2" />
      </g>

      {/* the sun on the water, on the other side */}
      <g className="vy-stayart__glints">
        <ellipse cx="96" cy="188" rx="20" ry="2.6" />
        <ellipse cx="90" cy="204" rx="34" ry="2.4" />
        <ellipse cx="102" cy="222" rx="24" ry="2.2" />
        <ellipse cx="86" cy="244" rx="46" ry="2" />
      </g>

      <path className="vy-stayart__swell" d={`${STAY_SWELL_C} L480 320 L0 320 Z`} />
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
