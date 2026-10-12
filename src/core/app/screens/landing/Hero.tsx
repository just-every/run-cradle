import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { HeroScreen } from './HeroScreen'
import { HeroArt } from './hero/HeroArt'
import { useHeroMotion } from './hero/motion/useHeroMotion'

/** The approved hero: the headline, the owner's `landingMessage` from `src/ext/config.ts`, a plain line naming what Cradle replaces, one button, and ribbons of data streaming into one calm Projects screen, with cards floating on them that are drawn into it one by one, each bringing something into the screen as it lands. The art is inline SVG; its motion starts on the client from exactly the server's still and never hides anything before it does. */
export function Hero({ landingMessage }: { landingMessage: string }) {
  const root = useRef<HTMLElement>(null)
  const live = useHeroMotion(root)
  return <section className="lp-hero" id="top" aria-labelledby="hero-title" ref={root}>
    <HeroArt live={live} />
    <div className="lp-hero-copy">
      <h1 id="hero-title">Everything comes together in one place.</h1>
      <p>{landingMessage}</p>
      <p className="lp-alt">100% free, open source alternative to <strong>Airtable</strong> and <strong>Smartsheet</strong></p>
      <Link className="lp-open" to="/signin">Open your workspace</Link>
    </div>
    <HeroScreen live={live} />
  </section>
}
