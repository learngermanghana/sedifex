import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'

/** Protect edits when closing the tab or following a navigation link. */
function useUnloadProtection(dirty: boolean, captureLinks: boolean) {
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const beforeNavigate = (event: MouseEvent) => {
      if (!captureLinks) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = target as HTMLAnchorElement
      if (link.target === '_blank' || link.hasAttribute('download') || link.href === window.location.href) return
      if (!window.confirm('You have unsaved changes. Leave without saving?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', beforeNavigate, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', beforeNavigate, true)
    }
  }, [dirty, captureLinks])
}

function NavigationBlocker({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  return null
}

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  useUnloadProtection(dirty, !dataRouter)
  return dataRouter ? <NavigationBlocker dirty={dirty} /> : null
}
