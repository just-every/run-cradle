import { Clip, EASE, EASE_IN, EASE_OUT } from './clip'
import { EMPTY_BRIEF, EMPTY_LINE } from './opening'

/** The side panel's part of the hero. It opens with the detail card, the field and the AI brief empty (opening.ts), and the first card to bring each fills it in. From then on each arrival there plays out and settles back to the still's panel, so the panel repeats with the rest of the hero: a detail field is filled in afresh, an automation lights while it runs, a new AI brief replaces the last. */
export type SideAction = { at: number; what: 'detail' | 'field' | 'automation' | 'brief' }

export type SideClips = {
  detailLines: Clip[]
  fieldLine: Clip
  auto: Clip
  autoRing: Clip
  aiBody: Clip
  aiSpark: Clip
  flash: Record<'detail' | 'field' | 'automation' | 'brief', Clip>
}

const DETAIL_LINES = 4

/** Lines of a field write themselves in (again), left to right, one after another. */
function retype(lines: Clip[], t: number) {
  lines.forEach((line, i) => line
    .to(t, 0.14, { transform: 'scaleX(0)' }, EASE_IN)
    .to(t + 0.2 + i * 0.1, 0.34, { transform: 'scaleX(1)' }, EASE_OUT))
}

const flash = (clip: Clip, t: number, peak = 0.36) => clip.to(t, 0.14, { opacity: peak }, EASE_OUT).to(t + 0.14, 1.5, { opacity: 0 }, EASE)

export function planSide(actions: readonly SideAction[]): SideClips {
  const clips: SideClips = {
    detailLines: Array.from({ length: DETAIL_LINES }, (_, i) => new Clip(`detail line ${i}`, EMPTY_LINE)),
    fieldLine: new Clip('field line', EMPTY_LINE),
    auto: new Clip('automation chip', { opacity: 0, transform: 'scale(0.5)' }),
    autoRing: new Clip('automation ring', { opacity: 0, transform: 'scale(1)' }),
    aiBody: new Clip('AI brief', EMPTY_BRIEF),
    aiSpark: new Clip('AI spark', { transform: 'rotate(0deg) scale(1)' }),
    flash: {
      detail: new Clip('detail flash', { opacity: 0 }),
      field: new Clip('field flash', { opacity: 0 }),
      automation: new Clip('automation flash', { opacity: 0 }),
      brief: new Clip('brief flash', { opacity: 0 }),
    },
  }
  for (const { at: t, what } of [...actions].sort((a, b) => a.at - b.at)) {
    flash(clips.flash[what], t, what === 'brief' ? 0.3 : 0.36)
    if (what === 'detail') retype(clips.detailLines, t)
    if (what === 'field') retype([clips.fieldLine], t)
    if (what === 'automation') {
      // The automation's chip lights with one soft pulse, stays lit while it runs, then dims.
      clips.auto.to(t, 0.2, { opacity: 1, transform: 'scale(1.15)' }, EASE_OUT).to(t + 0.2, 0.25, { transform: 'scale(1)' }, EASE).to(t + 3.4, 0.6, { opacity: 0, transform: 'scale(0.9)' }, EASE_IN).set(t + 4.05, { transform: 'scale(0.5)' })
      clips.autoRing.to(t + 0.05, 0.06, { opacity: 0.6, transform: 'scale(1)' }, EASE_OUT).to(t + 0.11, 0.7, { opacity: 0, transform: 'scale(1.9)' }, EASE_OUT).set(t + 0.83, { transform: 'scale(1)' })
    }
    if (what === 'brief') {
      // The last brief, if any, lifts away; the new one rises into its place as the spark turns.
      clips.aiBody.to(t, 0.18, { opacity: 0, transform: 'translateY(-10px)' }, EASE_IN).set(t + 0.2, { transform: 'translateY(14px)' }).to(t + 0.24, 0.5, { opacity: 1, transform: 'translateY(0px)' }, EASE_OUT)
      clips.aiSpark.to(t + 0.3, 0.5, { transform: 'rotate(90deg) scale(1.2)' }, EASE_OUT).to(t + 0.8, 0.4, { transform: 'rotate(90deg) scale(1)' }, EASE).set(t + 1.25, { transform: 'rotate(0deg) scale(1)' })
    }
  }
  return clips
}
