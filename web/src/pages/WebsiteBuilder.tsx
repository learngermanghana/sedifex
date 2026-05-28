import React, { Suspense, useState } from 'react'
import { Link } from 'react-router-dom'

const WebsiteBuilderAssistantPanel = React.lazy(() => import('./WebsiteBuilderAssistantPanel'))

export default function WebsiteBuilder() {
  const [showAssistant, setShowAssistant] = useState(false)

  return (
    <main className="workspace-page">
      <section className="workspace-card space-y-4">
        <header className="space-y-2">
          <h1 className="workspace-title">Website Builder</h1>
          <p className="workspace-muted">
            Core website builder stays lightweight so this page opens fast. Use Preview to review and publish output.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <Link to="/website-builder/preview" className="workspace-button">Open preview</Link>
          <button type="button" onClick={() => setShowAssistant(true)} className="workspace-button workspace-button--secondary">
            Open AI / Templates
          </button>
        </div>

        {showAssistant ? (
          <Suspense fallback={<p>Loading AI tools…</p>}>
            <WebsiteBuilderAssistantPanel />
          </Suspense>
        ) : null}
      </section>
    </main>
  )
}
