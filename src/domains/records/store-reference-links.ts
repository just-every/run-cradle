import type { StoreReference } from '../../contracts/primitives';
export const storeProviders = ['google-drive', 'onedrive', 'dropbox', 'box', 'chest'] as const;
export type StoreProvider = StoreReference['provider'];
const suffix = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);
/** The store's own link must open in that store; Cradle never renders or follows anything else. */
const linkHosts: Record<Exclude<StoreProvider, 'chest'>, (host: string) => boolean> = {
  'google-drive': host => ['drive.google.com', 'docs.google.com'].includes(host),
  onedrive: host => ['onedrive.live.com', '1drv.ms'].includes(host) || suffix(host, 'sharepoint.com'),
  dropbox: host => host === 'www.dropbox.com' || host === 'dropbox.com',
  box: host => suffix(host, 'box.com'),
};
export function storeLinkAllowed(provider: StoreProvider, link: string): boolean {
  let url: URL;
  try { url = new URL(link); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  return provider === 'chest' ? true : linkHosts[provider](url.hostname.toLowerCase());
}
