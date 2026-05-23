import React, { useCallback, useState } from 'react'
import WebsiteBuilder from './WebsiteBuilder'

function findButtonByText(text: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find(button => button.textContent?.toLowerCase().includes(text.toLowerCase())) ?? null
}

export default function WebsiteBuilderWithAiText() {
  const [statusMessage, setStatusMessage] = useState('')

  const generateAiText = useCallback(() => {
    setStatusMessage('Opening content generator…')

    const contentStepButton = findButtonByText('Content')
    contentStepButton?.click()

    window.setTimeout(() => {
      const generateButton = findButtonByText('Generate all content')
      if (!generateButton) {
        setStatusMessage('Open the Content step, then click AI text again.')
        window.setTimeout(() => setStatusMessage(''), 3000)
        return
      }

      generateButton.click()
      setStatusMessage('AI text generated for this website.')
      window.setTimeout(() => setStatusMessage(''), 3000)
    }, 150)
  }, [])

  return (
    <>
      <WebsiteBuilder />
      <div className="fixed bottom-24 right-5 z-50 flex max-w-[260px] flex-col items-end gap-2 md:bottom-8">
        {statusMessage ? (
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
            {statusMessage}
          </div>
        ) : null}
        <button
          type="button"
          onClick={generateAiText}
          className="rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 px-5 py-3 text-sm font-extrabold text-white shadow-2xl transition hover:-translate-y-0.5 hover:shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200"
          aria-label="Generate AI text for this website"
        >
          ✨ AI text
        </button>
      </div>
    </>
  )
}
