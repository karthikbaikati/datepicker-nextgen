/**
 * The shell every travel section shares: a kicker, one `h2`, a lede, and a
 * footnote listing the props actually in use.
 *
 * That footnote is the point of the page. A pretty screenshot proves nothing;
 * a pretty section with `minNights={2}` written underneath, on a calendar you
 * can immediately fail to break, proves the feature.
 */

import type { ReactNode } from 'react';

import { Reveal } from './motion';

export type SectionTone = 'sand' | 'shell' | 'dusk';

export interface TravelSectionProps {
  id: string;
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  tone?: SectionTone;
  children: ReactNode;
}

export function TravelSection({
  id,
  kicker,
  title,
  lede,
  tone = 'sand',
  children,
}: TravelSectionProps): ReactNode {
  return (
    <section className={`vy-section vy-section--${tone}`} id={id} aria-labelledby={`${id}-heading`}>
      <div className="vy-shell">
        <Reveal className="vy-sectionhead">
          <p className="vy-kicker">{kicker}</p>
          <h2 className="vy-sectiontitle" id={`${id}-heading`}>
            {title}
          </h2>
          <p className="vy-lede">{lede}</p>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

export interface PropNoteProps {
  /** The props this section is actually passing, verbatim. */
  props: readonly string[];
  children?: ReactNode;
}

/** The honest caption: what the picker above was configured with. */
export function PropNote({ props, children }: PropNoteProps): ReactNode {
  return (
    <p className="vy-propnote">
      <span className="vy-propnote__label">On this picker</span>
      <span className="vy-propnote__list">
        {props.map((prop) => (
          <code key={prop}>{prop}</code>
        ))}
      </span>
      {children ? <span className="vy-propnote__aside">{children}</span> : null}
    </p>
  );
}
