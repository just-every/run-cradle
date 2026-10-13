import { createContext, useContext } from 'react'

/**
 * Where the public pages render: `instance` inside the installed app's router, or `site` on the static run site
 * (run-cradle.com), which has no router, links with plain anchors and leaves out every instance-only route.
 */
export type SiteVariant = 'instance' | 'site'

const Variant = createContext<SiteVariant>('instance')

export const SiteVariantProvider = Variant.Provider
export const useSiteVariant = () => useContext(Variant)
