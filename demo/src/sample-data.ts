/**
 * Deterministic mock data for the showcase.
 *
 * Everything here is generated once, at module load, from a fixed seed. The
 * demo must look identical on every render and every reload — a `Math.random()`
 * call inside a `dayMeta` callback would repaint prices on every hover, which
 * reads as a bug in the library rather than in the demo.
 *
 * The horizon is anchored to the first of the current month so the page never
 * goes stale, but the *shape* of the data (which nights are expensive, which
 * are already booked) is a pure function of the seed and the day index.
 */

import { addDays, diffInDays, startOfMonth, toISODate, today } from 'datepicker-nextgen';
import { getWeekday } from 'datepicker-nextgen/core';
import type { CompleteDateRange, DateRange, DayMeta, PlainDate } from 'datepicker-nextgen';

/** Days of mock inventory generated ahead of the current month. */
const HORIZON_DAYS = 420;

const SEED = 0x5eed_1c3a;

/**
 * Mulberry32 — 32 bits of state, uniform output, and short enough to read.
 * A seeded generator is what makes the whole dataset reproducible.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First day of the current month — the anchor every mock series is indexed from. */
export const seasonStart: PlainDate = startOfMonth(today());

export interface NightInfo {
  /** Nightly rate in whole dollars. */
  readonly price: number;
  /** Below the trailing median — surfaced as a badge in the hotel example. */
  readonly deal: boolean;
  /** Part of a booked span; unselectable in the availability example. */
  readonly soldOut: boolean;
  /** Remaining inventory, 0-4. */
  readonly unitsLeft: number;
  /** Sessions for the analytics example, roughly 400-4000. */
  readonly sessions: number;
}

/* -------------------------------------------------------------------------- */
/*                                 Generation                                 */
/* -------------------------------------------------------------------------- */

const random = mulberry32(SEED);

/**
 * Contiguous booked spans. Generated first so nightly rates can react to them:
 * a sold-out night has no price to show.
 */
const bookedSpans: CompleteDateRange[] = [];
for (let cursor = 5; cursor < HORIZON_DAYS - 6;) {
  cursor += 8 + Math.floor(random() * 17);
  const length = 2 + Math.floor(random() * 4);
  if (cursor + length >= HORIZON_DAYS) break;
  bookedSpans.push({
    start: addDays(seasonStart, cursor),
    end: addDays(seasonStart, cursor + length - 1),
  });
  cursor += length;
}

/** Already-booked nights, ready to hand to `blockedRanges`. */
export const bookedRanges: readonly CompleteDateRange[] = bookedSpans;

const soldOutKeys = new Set<string>();
for (const span of bookedSpans) {
  for (let offset = 0; offset <= diffInDays(span.start, span.end); offset += 1) {
    soldOutKeys.add(toISODate(addDays(span.start, offset)));
  }
}

const nights = new Map<string, NightInfo>();

for (let index = 0; index < HORIZON_DAYS; index += 1) {
  const date = addDays(seasonStart, index);
  const key = toISODate(date);
  const weekday = getWeekday(date);

  // Friday and Saturday carry the weekend premium; Sunday a smaller one.
  const weekendPremium = weekday === 5 || weekday === 6 ? 74 : weekday === 0 ? 26 : 0;
  // One slow, full-year swing so the strip of months reads as a real season.
  const seasonal = Math.round(52 * Math.sin((index / 365) * Math.PI * 2 - 1.15));
  const jitter = Math.round(random() * 36) - 14;
  const price = Math.max(96, 182 + weekendPremium + seasonal + jitter);

  const soldOut = soldOutKeys.has(key);
  const unitsLeft = soldOut ? 0 : 1 + Math.floor(random() * 4);
  const sessions = Math.round(
    430 + random() * 3200 + (weekday === 0 || weekday === 6 ? -260 : 420),
  );

  nights.set(key, {
    price,
    deal: !soldOut && price < 190 && weekday !== 5 && weekday !== 6,
    soldOut,
    unitsLeft,
    sessions,
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Lookups                                   */
/* -------------------------------------------------------------------------- */

/** The generated inventory row for a date, or `null` outside the horizon. */
export function nightInfo(date: PlainDate): NightInfo | null {
  return nights.get(toISODate(date)) ?? null;
}

let currency: Intl.NumberFormat | null = null;
try {
  currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
} catch {
  currency = null;
}

/** `$248` — falls back to a plain string when `Intl.NumberFormat` is unavailable. */
export function formatPrice(amount: number): string {
  return currency ? currency.format(amount) : `$${amount}`;
}

/** Fixed public holidays, used to show the `holiday` decoration. */
const HOLIDAY_NAMES: Readonly<Record<string, string>> = {
  '01-01': "New Year's Day",
  '02-14': "Valentine's Day",
  '07-04': 'Independence Day',
  '10-31': 'Halloween',
  '12-24': 'Christmas Eve',
  '12-25': 'Christmas Day',
  '12-31': "New Year's Eve",
};

/** Holiday name for a date, or `null`. Month/day only — no year table to maintain. */
export function holidayName(date: PlainDate): string | null {
  const key = `${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  return HOLIDAY_NAMES[key] ?? null;
}

/* -------------------------------------------------------------------------- */
/*                              dayMeta providers                             */
/* -------------------------------------------------------------------------- */

/** Nightly price under every day, plus a badge on the cheap nights. */
export function hotelDayMeta(date: PlainDate): DayMeta | null {
  const night = nightInfo(date);
  if (!night) return null;
  if (night.soldOut) return { note: '—', tooltip: 'Sold out' };
  return {
    note: formatPrice(night.price),
    badge: night.deal ? '%' : undefined,
    tooltip: night.deal
      ? `${formatPrice(night.price)} per night — below average`
      : `${formatPrice(night.price)} per night`,
  };
}

/** Remaining inventory, with a holiday flag where one applies. */
export function availabilityDayMeta(date: PlainDate): DayMeta | null {
  const night = nightInfo(date);
  if (!night) return null;
  const holiday = holidayName(date);
  if (night.soldOut) {
    return { note: 'Booked', tooltip: 'No rooms left', ...(holiday ? { holiday } : {}) };
  }
  return {
    note: `${night.unitsLeft} left`,
    tooltip: `${night.unitsLeft} of 4 rooms available`,
    ...(holiday ? { holiday } : {}),
  };
}

const TRAFFIC_COLOURS = ['#93c5fd', '#60a5fa', '#2563eb'] as const;

/** One to three dots per day, scaled by session volume. */
export function analyticsDayMeta(date: PlainDate): DayMeta | null {
  const night = nightInfo(date);
  if (!night) return null;
  const intensity = night.sessions > 3000 ? 3 : night.sessions > 1900 ? 2 : 1;
  return {
    dots: TRAFFIC_COLOURS.slice(0, intensity).map((color) => ({
      color,
      label: `${night.sessions.toLocaleString('en-US')} sessions`,
    })),
    tooltip: `${night.sessions.toLocaleString('en-US')} sessions`,
  };
}

/** Just the holiday decoration — used by the scheduling examples. */
export function holidayDayMeta(date: PlainDate): DayMeta | null {
  const holiday = holidayName(date);
  return holiday ? { holiday, tooltip: holiday } : null;
}

/* ========================================================================== */
/*                                                                            */
/*                     Voyanta — the travel page's dataset                    */
/*                                                                            */
/*  Same contract as everything above: nothing here calls `Math.random()` at   */
/*  render time. Series that need one value per date are derived from an       */
/*  FNV-1a hash of the ISO date plus a salt, which is deterministic, stable    */
/*  across reloads, and cheap enough to call from inside a `dayMeta` callback. */
/* ========================================================================== */

/** FNV-1a, 32-bit. Fast, dependency-free, and stable across engines. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A deterministic 0-1 value for a salt + date pair. */
function unitFor(salt: string, date: PlainDate): number {
  return hashString(`${salt} ${toISODate(date)}`) / 4294967296;
}

/** A deterministic 0-1 value for an arbitrary key. */
function unitForKey(key: string): number {
  return hashString(key) / 4294967296;
}

/* -------------------------------------------------------------------------- */
/*                                Destinations                                */
/* -------------------------------------------------------------------------- */

export interface Destination {
  readonly id: string;
  readonly city: string;
  readonly country: string;
  /** Nearest international airport, used in the flight header. */
  readonly airport: string;
  readonly tagline: string;
  /** Typical round-trip fare in the low season, before the seasonal curve. */
  readonly baseFare: number;
  readonly flightHours: number;
  /** Drives the seasonality curve — the southern half peaks in January. */
  readonly hemisphere: 'north' | 'south';
  /** Suggested trip length in nights. */
  readonly idealNights: number;
}

/**
 * Invented itineraries to real coastlines. Voyanta is fictional; the beaches
 * are not, which is what makes the page read as a product rather than a mock.
 */
export const destinations: readonly Destination[] = [
  {
    id: 'tulum',
    city: 'Tulum',
    country: 'Mexico',
    airport: 'CUN',
    tagline: 'Caribbean shallows behind a limestone shore',
    baseFare: 470,
    flightHours: 5.5,
    hemisphere: 'north',
    idealNights: 6,
  },
  {
    id: 'amalfi',
    city: 'Amalfi',
    country: 'Italy',
    airport: 'NAP',
    tagline: 'Lemon terraces falling into a very blue bay',
    baseFare: 690,
    flightHours: 12,
    hemisphere: 'north',
    idealNights: 7,
  },
  {
    id: 'santorini',
    city: 'Santorini',
    country: 'Greece',
    airport: 'JTR',
    tagline: 'Black sand under a whitewashed rim',
    baseFare: 760,
    flightHours: 13.5,
    hemisphere: 'north',
    idealNights: 6,
  },
  {
    id: 'marinha',
    city: 'Praia da Marinha',
    country: 'Portugal',
    airport: 'FAO',
    tagline: 'Gold cliffs over an arched cove',
    baseFare: 560,
    flightHours: 9.5,
    hemisphere: 'north',
    idealNights: 5,
  },
  {
    id: 'zanzibar',
    city: 'Zanzibar',
    country: 'Tanzania',
    airport: 'ZNZ',
    tagline: 'Dhow sails, a mile of low tide, and shade',
    baseFare: 1180,
    flightHours: 21,
    hemisphere: 'south',
    idealNights: 9,
  },
  {
    id: 'bali',
    city: 'Uluwatu',
    country: 'Bali',
    airport: 'DPS',
    tagline: 'Reef breaks under a cliff you climb down',
    baseFare: 1090,
    flightHours: 20,
    hemisphere: 'south',
    idealNights: 10,
  },
];

const destinationIndex = new Map(destinations.map((entry) => [entry.id, entry]));

/** Look a destination up by id, falling back to the first one. */
export function destinationById(id: string): Destination {
  return destinationIndex.get(id) ?? (destinations[0] as Destination);
}

/* -------------------------------------------------------------------------- */
/*                                Seasonality                                 */
/* -------------------------------------------------------------------------- */

export type SeasonVerdict = 'quiet' | 'shoulder' | 'sweet spot' | 'peak';

export interface SeasonMonth {
  /** 1-12. */
  readonly month: number;
  /** `Jan` */
  readonly label: string;
  /** Typical round-trip fare that month. */
  readonly fare: number;
  /** How busy it gets, 0-100. */
  readonly crowd: number;
  /** Daily sunshine hours, one decimal. */
  readonly sun: number;
  /** Average daytime high in degrees Celsius. */
  readonly high: number;
  /** Sea surface temperature in degrees Celsius — the number swimmers plan on. */
  readonly sea: number;
  /** Rainless days out of thirty: the dry-season signal. */
  readonly dry: number;
  readonly verdict: SeasonVerdict;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `Jan` through `Dec` for a 1-12 month number. */
export function monthLabel(month: number): string {
  return MONTH_LABELS[Math.min(12, Math.max(1, Math.round(month))) - 1] as string;
}

function buildSeasonality(destination: Destination): readonly SeasonMonth[] {
  const shift = destination.hemisphere === 'south' ? 6 : 0;
  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    // Peaks in July for the north, January for the south.
    const warmth = Math.cos(((month - 7 + shift) / 12) * Math.PI * 2);
    const jitter = unitForKey(`${destination.id}:season:${month}`);
    const crowd = Math.round(Math.min(98, Math.max(8, 52 + warmth * 38 + (jitter - 0.5) * 14)));
    const fare = Math.round((destination.baseFare * (0.82 + (crowd / 100) * 0.5)) / 5) * 5;
    const sun = Math.round((5.4 + warmth * 3.4 + jitter * 1.2) * 10) / 10;
    // Warm-coast numbers, not temperate ones: every destination on this page
    // is somewhere you would get in the water.
    const high = Math.round(26 + warmth * 6 + (jitter - 0.5) * 3);
    // The sea lags the air by roughly six weeks — half a month of phase — and
    // swings less. That lag is the whole reason September beats June.
    const seaWarmth = Math.cos(((month - 8.5 + shift) / 12) * Math.PI * 2);
    const sea = Math.round((25.4 + seaWarmth * 3.6 + (jitter - 0.5) * 0.8) * 10) / 10;
    const dry = Math.round(Math.min(30, Math.max(9, 21 + warmth * 7 + (jitter - 0.5) * 4)));
    const verdict: SeasonVerdict =
      crowd >= 82
        ? 'peak'
        : crowd <= 26
          ? 'quiet'
          : sea >= 26 && dry >= 22
            ? 'sweet spot'
            : 'shoulder';
    return { month, label, fare, crowd, sun, high, sea, dry, verdict };
  });
}

const seasonalityCache = new Map<string, readonly SeasonMonth[]>();

/** The twelve-month picture for a destination. Computed once per destination. */
export function seasonalityFor(destinationId: string): readonly SeasonMonth[] {
  const cached = seasonalityCache.get(destinationId);
  if (cached) return cached;
  const built = buildSeasonality(destinationById(destinationId));
  seasonalityCache.set(destinationId, built);
  return built;
}

/** The month row for a 1-12 month number. */
export function seasonMonth(destinationId: string, month: number): SeasonMonth {
  const rows = seasonalityFor(destinationId);
  return (rows[Math.min(12, Math.max(1, month)) - 1] ?? rows[0]) as SeasonMonth;
}

/* -------------------------------------------------------------------------- */
/*                                   Fares                                    */
/* -------------------------------------------------------------------------- */

/** Weekday multipliers: midweek is cheap, Friday and Sunday are not. */
const FARE_BY_WEEKDAY = [1.08, 0.94, 0.9, 0.91, 0.99, 1.12, 1.02] as const;

/**
 * One leg's fare for a destination on a date. A pure function of the
 * destination, the month's seasonal curve, the weekday and a hashed jitter —
 * so the same day always shows the same number.
 */
export function legFare(destinationId: string, date: PlainDate): number {
  const season = seasonMonth(destinationId, date.month);
  const weekday = FARE_BY_WEEKDAY[getWeekday(date)] ?? 1;
  const jitter = 0.9 + unitFor(`${destinationId}:leg`, date) * 0.24;
  const fare = (season.fare / 2) * weekday * jitter;
  return Math.max(70, Math.round(fare / 5) * 5);
}

/** Both legs, with the small return-trip discount every airline pretends to give. */
export function roundTripFare(destinationId: string, depart: PlainDate, back: PlainDate): number {
  return Math.round((legFare(destinationId, depart) + legFare(destinationId, back)) * 0.94);
}

const fareMetaCache = new Map<string, (date: PlainDate) => DayMeta | null>();

/**
 * A `dayMeta` provider that prints one leg's fare under every day.
 *
 * Memoized per destination: the engine compares `dayMeta` by identity, so a
 * fresh closure on every render would resync it on every unrelated keystroke.
 */
export function fareDayMeta(destinationId: string): (date: PlainDate) => DayMeta | null {
  const cached = fareMetaCache.get(destinationId);
  if (cached) return cached;
  const provider = (date: PlainDate): DayMeta | null => {
    const fare = legFare(destinationId, date);
    const season = seasonMonth(destinationId, date.month);
    const cheap = fare <= season.fare / 2.25;
    return {
      note: formatPrice(fare),
      tooltip: cheap
        ? `${formatPrice(fare)} one way — one of the cheaper days this month`
        : `${formatPrice(fare)} one way`,
      ...(cheap ? { dots: [{ color: '#0a7570', label: 'Below the monthly average' }] } : {}),
    };
  };
  fareMetaCache.set(destinationId, provider);
  return provider;
}

/* -------------------------------------------------------------------------- */
/*                                  The stay                                  */
/* -------------------------------------------------------------------------- */

export interface StayListing {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly host: string;
  readonly neighbourhood: string;
  readonly city: string;
  readonly rating: number;
  readonly reviews: number;
  readonly guests: number;
  readonly bedrooms: number;
  readonly beds: number;
  readonly baths: number;
  readonly cleaningFee: number;
  /** Service fee as a fraction of the nightly subtotal. */
  readonly serviceRate: number;
  readonly blurb: string;
  readonly highlights: readonly string[];
}

/** The listing the Stay section books. Invented, like everything on this page. */
export const featuredStay: StayListing = {
  id: 'frangipani-deck',
  name: 'The Frangipani Deck',
  kind: 'Entire overwater bungalow',
  host: 'Hosted by Amara',
  neighbourhood: 'Paje lagoon',
  city: 'Zanzibar',
  rating: 4.91,
  reviews: 184,
  guests: 4,
  bedrooms: 2,
  beds: 3,
  baths: 1.5,
  cleaningFee: 74,
  serviceRate: 0.11,
  blurb:
    'A thatched deck house on stilts over the lagoon, with shutters that fold all the way back and a ladder straight into the water. The tide comes in underneath the floor twice a day and goes out a mile.',
  highlights: [
    'Ladder into the lagoon',
    'Outdoor rain shower',
    'Snorkel kit included',
    'Self check-in',
  ],
};

export interface StayQuote {
  readonly nights: number;
  readonly nightly: number;
  readonly subtotal: number;
  readonly cleaningFee: number;
  readonly serviceFee: number;
  readonly total: number;
}

/**
 * Price a stay from the generated nightly rates. Checkout night is not charged
 * — the range is measured in nights, so the last day never appears in the sum.
 */
export function stayQuote(range: DateRange, listing: StayListing = featuredStay): StayQuote | null {
  const { start, end } = range;
  if (!start || !end) return null;
  const nights = diffInDays(start, end);
  if (nights <= 0) return null;

  let subtotal = 0;
  for (let offset = 0; offset < nights; offset += 1) {
    subtotal += nightInfo(addDays(start, offset))?.price ?? 0;
  }
  const serviceFee = Math.round(subtotal * listing.serviceRate);
  return {
    nights,
    nightly: Math.round(subtotal / nights),
    subtotal,
    cleaningFee: listing.cleaningFee,
    serviceFee,
    total: subtotal + listing.cleaningFee + serviceFee,
  };
}

/* -------------------------------------------------------------------------- */
/*                                Experiences                                 */
/* -------------------------------------------------------------------------- */

export type ExperienceArt = 'snorkel' | 'catamaran' | 'reef';

export interface ExperienceSlot {
  readonly id: string;
  readonly label: string;
  /** 24-hour start, used to sort and to describe the slot. */
  readonly hour: number;
}

export interface Experience {
  readonly id: string;
  readonly title: string;
  readonly place: string;
  readonly duration: string;
  readonly price: number;
  readonly blurb: string;
  readonly art: ExperienceArt;
  readonly slots: readonly ExperienceSlot[];
}

/** Three invented half-day experiences, each with its own slot pattern. */
export const experiences: readonly Experience[] = [
  {
    id: 'sunrise-snorkel',
    title: 'Sunrise snorkel over the shallow reef',
    place: 'Zanzibar, meeting at the dive shack',
    duration: '2 hours',
    price: 58,
    blurb:
      'Out on flat water before the wind gets up, over a reef shelf you can stand on, back before breakfast is cleared away. Eight masks, no more.',
    art: 'snorkel',
    slots: [
      { id: 'first', label: '6:00 AM', hour: 6 },
      { id: 'second', label: '7:30 AM', hour: 7 },
      { id: 'third', label: '9:00 AM', hour: 9 },
    ],
  },
  {
    id: 'catamaran-sunset',
    title: 'Catamaran out to the sandbar at sunset',
    place: 'Zanzibar, departing from the north jetty',
    duration: '3 hours',
    price: 96,
    blurb:
      'A slow reach out to the bar that only exists at low water, anchored with cold drinks while the sun goes down, home under the running lights.',
    art: 'catamaran',
    slots: [
      { id: 'golden', label: '4:00 PM', hour: 16 },
      { id: 'sunset', label: '5:30 PM', hour: 17 },
    ],
  },
  {
    id: 'reef-wall-dive',
    title: 'Guided drop onto the outer reef wall',
    place: 'Zanzibar, boat out through the lagoon channel',
    duration: '4 hours',
    price: 128,
    blurb:
      'Two tanks on the wall where the shelf falls away, with a guide who has been counting the same turtles for nine years.',
    art: 'reef',
    slots: [
      { id: 'morning', label: '8:00 AM', hour: 8 },
      { id: 'midday', label: '11:00 AM', hour: 11 },
      { id: 'afternoon', label: '2:00 PM', hour: 14 },
    ],
  },
];

const experienceIndex = new Map(experiences.map((entry) => [entry.id, entry]));

/** Look an experience up by id, falling back to the first one. */
export function experienceById(id: string): Experience {
  return experienceIndex.get(id) ?? (experiences[0] as Experience);
}

/** Seats left for one slot on one date, 0-8. Deterministic. */
export function seatsLeft(experienceId: string, date: PlainDate, slotId: string): number {
  const unit = unitFor(`${experienceId}:${slotId}`, date);
  const weekday = getWeekday(date);
  const weekend = weekday === 0 || weekday === 6;
  const seats = Math.floor(unit * (weekend ? 6 : 9));
  return Math.max(0, Math.min(8, seats));
}

/** Total seats left across every slot on a date. */
export function seatsOnDate(experienceId: string, date: PlainDate): number {
  const experience = experienceById(experienceId);
  let total = 0;
  for (const slot of experience.slots) total += seatsLeft(experienceId, date, slot.id);
  return total;
}

const experienceMetaCache = new Map<string, (date: PlainDate) => DayMeta | null>();

/**
 * Seats left under every day, with a dot on the weekend sessions — the ones
 * that sell out first.
 */
export function experienceDayMeta(experienceId: string): (date: PlainDate) => DayMeta | null {
  const cached = experienceMetaCache.get(experienceId);
  if (cached) return cached;
  const provider = (date: PlainDate): DayMeta | null => {
    const seats = seatsOnDate(experienceId, date);
    const weekday = getWeekday(date);
    const weekend = weekday === 0 || weekday === 6;
    if (seats === 0) return { note: 'full', tooltip: 'Every session is booked' };
    return {
      note: `${seats}`,
      tooltip: `${seats} seat${seats === 1 ? '' : 's'} left${weekend ? ' — weekend session' : ''}`,
      ...(weekend ? { dots: [{ color: '#b14828', label: 'Weekend session' }] } : {}),
    };
  };
  experienceMetaCache.set(experienceId, provider);
  return provider;
}

/* -------------------------------------------------------------------------- */
/*                             The group trip poll                            */
/* -------------------------------------------------------------------------- */

export interface Traveller {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly city: string;
}

/** The six invented people the Together section polls. */
export const crew: readonly Traveller[] = [
  { id: 'mara', name: 'Mara', initials: 'MA', city: 'Lisbon' },
  { id: 'ines', name: 'Ines', initials: 'IN', city: 'Mexico City' },
  { id: 'tobi', name: 'Tobi', initials: 'TO', city: 'Berlin' },
  { id: 'ravi', name: 'Ravi', initials: 'RA', city: 'Bengaluru' },
  { id: 'noor', name: 'Noor', initials: 'NO', city: 'Amman' },
  { id: 'sam', name: 'Sam', initials: 'SA', city: 'Toronto' },
];

/**
 * Who is free on a date. Weekends skew free, midweek does not, and every
 * person's answer is a hash — so the poll never changes between reloads.
 */
export function availableCrew(date: PlainDate): readonly Traveller[] {
  const weekday = getWeekday(date);
  const weekendBonus = weekday === 5 || weekday === 6 || weekday === 0 ? 0.24 : 0;
  return crew.filter((person) => unitFor(`crew:${person.id}`, date) + weekendBonus > 0.42);
}

/** `4/6` under every day, with the names carried in the tooltip. */
export function crewDayMeta(date: PlainDate): DayMeta | null {
  const free = availableCrew(date);
  const names = free.map((person) => person.name).join(', ');
  return {
    note: `${free.length}/${crew.length}`,
    tooltip: free.length === 0 ? 'Nobody is free' : `Free: ${names}`,
    ...(free.length === crew.length ? { badge: '*' } : {}),
  };
}

/** The dates with the widest overlap in the next `days` days. */
export function bestCrewDates(from: PlainDate, days: number, count: number): readonly PlainDate[] {
  const scored: { date: PlainDate; free: number }[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    scored.push({ date, free: availableCrew(date).length });
  }
  scored.sort((a, b) => b.free - a.free || diffInDays(b.date, a.date));
  return scored.slice(0, count).map((entry) => entry.date);
}
