import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import './SupportTicketLauncher.css'

export default function SupportTicketLauncher() {
  const location = useLocation()

  const supportHref = useMemo(() => {
    const path = location.pathname || '/'
    const hash = location.hash || ''
    const screen = `${path}${hash}`
    const subject = encodeURIComponent('Sedifex help request')
    const body = encodeURIComponent(`Hi Sedifex team,\n\nI need help with: \n\nScreen: ${screen}`)

    return `mailto:info@sedifex.com?subject=${subject}&body=${body}`
  }, [location.hash, location.pathname])

  return (
    <div className="support-launcher">
      <a
        className="button button--outline button--small support-launcher__toggle"
        href={supportHref}
      >
        Need help?
      </a>
    </div>
  )
}
