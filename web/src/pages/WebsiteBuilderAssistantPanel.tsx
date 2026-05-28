import React, { useMemo, useState } from 'react'

type WebsiteType = 'shop' | 'beauty' | 'school' | 'travel' | 'ngo' | 'restaurant' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'

type TemplatePreset = {
  id: string
  name: string
  websiteType: WebsiteType
  theme: WebsiteTheme
  pages: string[]
  tagline: string
}

type TemplateSelection = {
  id: string
  name: string
  websiteType: WebsiteType
  theme: WebsiteTheme
  pages: string[]
  tagline: string
}

type Props = {
  selectedTemplateId: string | null
  selectedTemplateName: string | null
  onSelectTemplate: (template: TemplateSelection) => void
  onPreviewWithMyData: () => void
}

const TEMPLATES: TemplatePreset[] = [
  { id: 'beauty-premium', name: 'Beauty Spa Premium', websiteType: 'beauty', theme: 'luxury', pages: ['Home', 'Services', 'Bookings', 'Gallery', 'Client reviews', 'Quick Pay', 'Contact'], tagline: 'Beauty services designed around confidence and care' },
  { id: 'shop-modern', name: 'Modern Storefront', websiteType: 'shop', theme: 'modern', pages: ['Home', 'Products', 'Categories', 'Cart / Checkout', 'Quick Pay', 'Contact'], tagline: 'Shop quality products with easy online payment' },
  { id: 'school-clean', name: 'Academy Clean', websiteType: 'school', theme: 'clean', pages: ['Home', 'Courses', 'Registration', 'Classes', 'Student payments', 'Contact'], tagline: 'Learn, register, and manage classes with ease' },
]

export default function WebsiteBuilderAssistantPanel({ selectedTemplateId, selectedTemplateName, onSelectTemplate, onPreviewWithMyData }: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const activeTemplateLabel = selectedTemplateName ? `Current template: ${selectedTemplateName}` : 'No template selected yet'

  const templateCards = useMemo(() => TEMPLATES.map(template => {
    const isActive = selectedTemplateId === template.id
    return (
      <article key={template.id} className={`rounded-2xl border p-4 ${isActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
        <h4 className='text-base font-semibold text-slate-950'>{template.name}</h4>
        <p className='mt-1 text-sm text-slate-600'>Type: {template.websiteType} • Theme: {template.theme}</p>
        <p className='mt-2 text-xs text-slate-500'>{template.pages.join(' • ')}</p>
        <button
          type='button'
          className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}
          onClick={() => {
            onSelectTemplate(template)
            setStatusMessage(`Now using ${template.name} template.`)
            window.setTimeout(() => setStatusMessage(null), 2500)
          }}
        >
          {isActive ? `Now using ${template.name}` : 'Select'}
        </button>
      </article>
    )
  }), [onSelectTemplate, selectedTemplateId])

  return (
    <section className='mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <p className='text-sm font-semibold text-indigo-800'>{activeTemplateLabel}</p>
        {selectedTemplateName ? <button type='button' className='text-xs font-semibold text-indigo-700 underline' onClick={() => setStatusMessage('Choose another template below.')}>Change template</button> : null}
      </div>
      {statusMessage ? <p className='mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700'>{statusMessage || 'Template applied successfully.'}</p> : null}
      <div className='mt-4 grid gap-3 md:grid-cols-2'>{templateCards}</div>
      {selectedTemplateId ? <button type='button' onClick={onPreviewWithMyData} className='mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white'>Preview with my data</button> : null}
    </section>
  )
}
