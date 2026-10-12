import { useEffect, useState } from 'react'
export function LocalPhoto({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value) }, [file])
  return url ? <figure className="cr-local-photo"><img src={url} alt="Selected problem photo" /><figcaption>{file.name}</figcaption></figure> : null
}
