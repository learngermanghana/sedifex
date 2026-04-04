import React from 'react'
import { Link } from 'react-router-dom'
import './DocsPageLayout.css'

type DocsPageLayoutProps = {
  title: string
  subtitle: string
  children: React.ReactNode
}

export default function DocsPageLayout({ title, subtitle, children }: DocsPageLayoutProps) {
  return (
    <main className="docs-page">
      <div className="docs-page__container">
        <nav aria-label="Documentation navigation" className="docs-page__nav">
          <Link to="/account">← Back to account</Link>
          <span>·</span>
          <Link to="/docs/integration-quickstart">Integration quickstart</Link>
          <span>·</span>
          <Link to="/docs/wordpress-install-guide">WordPress install guide</Link>
        </nav>

        <header className="docs-page__header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>

        <div className="docs-page__content">{children}</div>
      </div>
    </main>
  )
}
