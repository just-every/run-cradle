import React from 'react'
import { createRoot } from 'react-dom/client'
import { useCommand, useResource } from '../src/ui/shared/api'
function Harness() {
  const command = useCommand<{ saved: boolean }>('isolated-double-submit')
  const resource = useResource<{ name: string }>('/api/v1/test-resource', { refreshMs: 300 })
  return <><input aria-label="Preserved draft" /><button onClick={command.reconcile}>Check original</button><button onClick={command.retryOriginal}>Retry original</button><button onClick={resource.refresh}>Refresh resource</button><span data-resource={resource.resource.state}>{resource.resource.state === 'ready' ? resource.resource.data.name : resource.resource.state}</span><button onClick={() => { void command.submit('/api/v1/commands/test.submit', {}, []); void command.submit('/api/v1/commands/test.submit', {}, []) }}>Submit twice</button><output data-state={command.result.state}>{JSON.stringify(command.result)}</output></>
}
createRoot(document.getElementById('root')!).render(<Harness />)
