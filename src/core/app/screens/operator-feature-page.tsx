import type { PropsWithChildren, ReactNode } from 'react'

import { useOperatorSession } from '../../features/portfolio/ui'
import { OperatorShell, ResourceBoundary } from '../ui/operator'

type OperatorFeaturePageProps = PropsWithChildren<{
  currentPath: string
  title: string
  description?: ReactNode
}>

export const OperatorFeaturePage = ({ children, currentPath, title, description }: OperatorFeaturePageProps) => {
  const session = useOperatorSession()

  if (session.resource.state !== 'ready') {
    return (
      <ResourceBoundary
        error={session.resource.error?.message}
        onRetry={session.retry}
        operation="operator session"
        state={session.resource.state}
      />
    )
  }

  return (
    <OperatorShell
      currentPath={currentPath}
      identity={{
        initials: session.resource.data.operator.initials,
        name: session.resource.data.operator.name,
        unreadNotifications: session.resource.data.unreadNotifications,
        workspaceName: session.resource.data.workspace.name,
      }}
      title={title}
      description={description}
    >
      {children}
    </OperatorShell>
  )
}
