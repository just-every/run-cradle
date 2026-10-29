import {StoreKeepCopy} from './store-keep-copy'
import {StoreReferenceResolution} from './store-reference-resolution'
import { useEffect, useState } from 'react'
import type { Ref, StoreReference } from '../../contracts/primitives'
import { StoreConnect } from './store-connect'
import { sessionFetch } from '../shared/session-fetch'

export const storeLabels: Record<StoreReference['provider'], string> = { 'google-drive': 'Google Drive', onedrive: 'OneDrive', dropbox: 'Dropbox', box: 'Box', chest: 'Chest' }
const typeLabel = (mediaType: string) => mediaType.startsWith('image/') ? 'Image' : mediaType === 'application/pdf' ? 'PDF' : mediaType.startsWith('video/') ? 'Video' : mediaType.startsWith('audio/') ? 'Audio' : mediaType.startsWith('text/') ? 'Text' : mediaType.includes('word') || mediaType.includes('document') ? 'Document' : mediaType.includes('sheet') || mediaType.includes('excel') ? 'Spreadsheet' : mediaType.includes('presentation') || mediaType.includes('powerpoint') ? 'Presentation' : 'File'
type Preview = 'loading' | 'image' | 'reconnect' | 'none'
/** A file that stays in the person's store: name, type and the store's own link; the preview is fetched now and never kept. */
export function StoreReferenceView({ reference, record }: { reference: StoreReference; record?: Ref & { fieldId: string } }) {
  const [preview, setPreview] = useState<Preview>(record && reference.connectionId ? 'loading' : 'none')
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!record || !reference.connectionId || reference.resolution==='unresolved') return
    let live = true, made = ''
    const query = new URLSearchParams({ appId: record.appId, entityId: record.entityId, recordId: record.recordId, fieldId: record.fieldId, itemId: reference.itemId })
    void (async () => {
      try {
        const response = await sessionFetch(`/api/v1/records/file-stores/thumbnail?${query}`)
        if (response.ok) { made = URL.createObjectURL(await response.blob()); if (live) { setUrl(made); setPreview('image') } return }
        const body = await response.json().catch(() => ({})) as { state?: string }
        if (live) setPreview(body.state === 'reconnect' ? 'reconnect' : 'none')
      } catch { if (live) setPreview('none') }
    })()
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [record?.appId, record?.entityId, record?.recordId, record?.fieldId, reference.itemId, reference.connectionId])
  return <span className="cr-store-reference">
    {preview === 'image' && <img className="cr-store-thumb" src={url} alt="" width={48} height={48} />}
    {reference.resolution==='unresolved'&&<><strong className="cr-badge cr-tag cr-tag--warn">Unresolved</strong>{' '}</>}
    <a className="cr-link" href={reference.link||undefined} target="_blank" rel="noopener noreferrer">{reference.name}<span className="cr-sr-only"> (opens in {storeLabels[reference.provider]})</span></a>
    <small className="cr-muted"> {typeLabel(reference.mediaType)} · {storeLabels[reference.provider]}{reference.size!==null?` · ${reference.size.toLocaleString()} bytes`:''}</small>
    {record&&reference.resolution==='unresolved'&&reference.provider!=='chest'&&<StoreReferenceResolution reference={reference} record={record}/>}
    {record&&reference.connectionId&&reference.resolution!=='unresolved'&&reference.provider!=='chest'&&<StoreKeepCopy record={record} reference={reference}/>}
    {reference.resolution==='unverified'&&<>{' '}<span className="cr-tag cr-tag--warn">Unverified</span></>}
    {reference.resolution!=='unresolved'&&record&&reference.provider!=='chest'&&preview!=='loading'&&preview!=='image'&&<StoreConnect appId={record.appId} provider={reference.provider} preview/>}
  </span>
}
