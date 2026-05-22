(() => {
  const templates = [
    {
      id: 'shop-classic',
      name: 'Shop Classic',
      type: 'Shop website',
      theme: 'Modern',
      tone: 'shop',
      description: 'Homepage, product grid, categories, checkout, and Quick Pay for retail stores.',
      pages: ['Home', 'Products', 'Categories', 'Cart / Checkout', 'Quick Pay', 'Contact'],
      tags: ['Products', 'Checkout', 'Quick Pay'],
      sample: {
        brand: 'Prime Urban Store',
        eyebrow: 'Online shop',
        headline: 'Fresh products customers can buy in minutes.',
        subcopy: 'Display best-selling products, categories, payment options, and contact details from one modern storefront.',
        cta: 'Shop now',
        stats: ['120+ products', 'Secure checkout', 'Quick Pay ready'],
        cards: ['Wireless Headset', 'Smart Watch', 'Beauty Kit'],
        sectionTitle: 'Featured products',
      },
    },
    {
      id: 'travel-consultancy',
      name: 'Travel & Visa Consultancy',
      type: 'Travel / booking website',
      theme: 'Modern',
      tone: 'travel',
      description: 'Packages, visa services, consultation bookings, programs, client stories, Quick Pay, and contact.',
      pages: ['Home', 'Travel packages', 'Visa services', 'Bookings', 'Programs', 'Gallery', 'Client reviews', 'Quick Pay', 'Contact'],
      tags: ['Visa', 'Bookings', 'Packages'],
      sample: {
        brand: 'Pirus Travel Consult',
        eyebrow: 'Travel & relocation',
        headline: 'Plan your visa, admission, or relocation journey with confidence.',
        subcopy: 'Show travel packages, visa readiness services, consultation booking, upcoming programs, testimonials, and payment options.',
        cta: 'Book consultation',
        stats: ['Visa support', 'Program updates', 'Online booking'],
        cards: ['Visa Readiness', 'Admission Review', 'Relocation Session'],
        sectionTitle: 'Popular services',
      },
    },
    {
      id: 'beauty-booking',
      name: 'Beauty Booking',
      type: 'Beauty / salon website',
      theme: 'Luxury',
      tone: 'beauty',
      description: 'Hero, services, bookings, gallery, reviews, and payment-focused salon layout.',
      pages: ['Home', 'Services', 'Bookings', 'Gallery', 'Client reviews', 'Quick Pay', 'Contact'],
      tags: ['Bookings', 'Gallery', 'Reviews'],
      sample: {
        brand: 'Glittering Med Spa',
        eyebrow: 'Beauty & wellness',
        headline: 'Premium beauty services with simple online booking.',
        subcopy: 'Promote treatments, service packages, gallery results, client reviews, bookings, and Quick Pay from one elegant website.',
        cta: 'Book appointment',
        stats: ['18 services', 'Gallery ready', 'Client reviews'],
        cards: ['Facial Treatment', 'Massage Therapy', 'Bridal Makeup'],
        sectionTitle: 'Signature services',
      },
    },
    {
      id: 'ngo-impact',
      name: 'NGO Impact',
      type: 'NGO website',
      theme: 'Clean',
      tone: 'ngo',
      description: 'Programs, donations, volunteers, stories, blog, gallery, and contact sections.',
      pages: ['Home', 'About', 'Programs', 'Donate', 'Volunteers', 'Gallery', 'Blog', 'Contact'],
      tags: ['Donate', 'Volunteers', 'Impact'],
      sample: {
        brand: 'Wesoamo Foundation',
        eyebrow: 'Community impact',
        headline: 'Support programs that change lives in local communities.',
        subcopy: 'Share your mission, programs, donation routes, volunteer opportunities, impact stories, and gallery highlights.',
        cta: 'Support now',
        stats: ['4 programs', 'Donor ready', 'Volunteer forms'],
        cards: ['Education Support', 'Community Outreach', 'Health Campaign'],
        sectionTitle: 'Impact programs',
      },
    },
    {
      id: 'school-courses',
      name: 'School Courses',
      type: 'School website',
      theme: 'Clean',
      tone: 'school',
      description: 'Courses, registration, classes, student payments, and school contact layout.',
      pages: ['Home', 'Courses', 'Registration', 'Classes', 'Student payments', 'Contact'],
      tags: ['Courses', 'Registration', 'Payments'],
      sample: {
        brand: 'Learn Language Academy',
        eyebrow: 'School & courses',
        headline: 'Register students and promote classes from one school website.',
        subcopy: 'Show courses, class schedules, registration forms, student payments, announcements, and school contact information.',
        cta: 'Register now',
        stats: ['A1–C1 courses', 'Student payments', 'Class updates'],
        cards: ['German A1', 'German A2', 'Exam Prep'],
        sectionTitle: 'Available courses',
      },
    },
    {
      id: 'premium-service',
      name: 'Premium Service',
      type: 'Service business website',
      theme: 'Bold',
      tone: 'service',
      description: 'Service packages, bookings, invoices, testimonials, and Quick Pay actions.',
      pages: ['Home', 'Services', 'Bookings', 'Invoices', 'Testimonials', 'Quick Pay', 'Contact'],
      tags: ['Services', 'Invoices', 'Bookings'],
      sample: {
        brand: 'Atlas Business Services',
        eyebrow: 'Professional services',
        headline: 'Turn enquiries into bookings, invoices, and paid work.',
        subcopy: 'Present service packages, consultation booking, testimonials, invoice payment, and contact actions in one focused website.',
        cta: 'Request service',
        stats: ['Service packages', 'Invoice ready', 'Bookings'],
        cards: ['Consultation', 'Monthly Support', 'Business Setup'],
        sectionTitle: 'Service packages',
      },
    },
    {
      id: 'restaurant-menu',
      name: 'Restaurant Menu',
      type: 'Restaurant website',
      theme: 'Bold',
      tone: 'restaurant',
      description: 'Menu, online ordering, table QR, reservations, gallery, and contact structure.',
      pages: ['Home', 'Menu', 'Online ordering', 'Table QR', 'Reservations', 'Gallery', 'Contact'],
      tags: ['Menu', 'Ordering', 'QR'],
      sample: {
        brand: 'Chill & Serve',
        eyebrow: 'Restaurant & food',
        headline: 'Let customers view the menu, order, and pay faster.',
        subcopy: 'Show dishes, menu categories, table QR, online ordering, reservations, food gallery, and location details.',
        cta: 'View menu',
        stats: ['Menu ready', 'Table QR', 'Online orders'],
        cards: ['Jollof Combo', 'Grilled Chicken', 'Fresh Juice'],
        sectionTitle: 'Popular menu items',
      },
    },
  ]

  const storeKey = 'sedifex.websiteBuilder.selectedTemplate'

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
  }

  function onWebsiteBuilder() {
    return window.location.pathname.includes('/website-builder')
  }

  function findTextElement(text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').trim() === text) return node.parentElement
    }
    return null
  }

  function findSectionByHeading(text) {
    const heading = findTextElement(text)
    return heading ? heading.closest('section') || heading.closest('div') : null
  }

  function clickStep(label) {
    const buttons = Array.from(document.querySelectorAll('button'))
    const button = buttons.find(item => (item.textContent || '').includes(label))
    if (button) button.click()
  }

  function clickButtonContaining(text) {
    const buttons = Array.from(document.querySelectorAll('button'))
    const button = buttons.find(item => (item.textContent || '').includes(text))
    if (button) {
      button.click()
      return true
    }
    return false
  }

  function setPages(template) {
    clickStep('Pages')
    window.setTimeout(() => {
      const labels = Array.from(document.querySelectorAll('label'))
      labels.forEach(label => {
        const text = label.textContent || ''
        const checkbox = label.querySelector('input[type="checkbox"]')
        if (!checkbox) return
        const shouldBeChecked = template.pages.some(page => text.includes(page))
        if (shouldBeChecked !== checkbox.checked) checkbox.click()
      })
    }, 140)
  }

  function applyTemplate(template) {
    try {
      localStorage.setItem(storeKey, template.id)
    } catch {}
    document.querySelectorAll('.sedifex-template-card').forEach(card => {
      card.classList.toggle('is-selected', card.getAttribute('data-template-id') === template.id)
    })
    const status = document.querySelector('.sedifex-template-library__status')
    if (status) status.textContent = `${template.name} selected. Structure, pages, and theme have been applied.`

    clickStep('Website type')
    window.setTimeout(() => {
      clickButtonContaining(template.type)
      window.setTimeout(() => {
        setPages(template)
        window.setTimeout(() => {
          clickStep('Theme')
          window.setTimeout(() => clickButtonContaining(template.theme), 120)
        }, 280)
      }, 180)
    }, 120)
  }

  function closeTemplatePreview() {
    const modal = document.querySelector('.sedifex-template-preview-modal')
    if (modal) modal.remove()
    document.body.classList.remove('sedifex-template-preview-open')
  }

  function renderSampleSite(template) {
    const sample = template.sample
    return `
      <article class="sedifex-template-sample" data-template-tone="${escapeHtml(template.tone)}">
        <header class="sedifex-template-sample__nav">
          <strong>${escapeHtml(sample.brand)}</strong>
          <nav>${template.pages.slice(0, 5).map(page => `<span>${escapeHtml(page)}</span>`).join('')}</nav>
        </header>
        <section class="sedifex-template-sample__hero">
          <div>
            <p class="sedifex-template-sample__eyebrow">${escapeHtml(sample.eyebrow)}</p>
            <h1>${escapeHtml(sample.headline)}</h1>
            <p>${escapeHtml(sample.subcopy)}</p>
            <div class="sedifex-template-sample__actions"><span>${escapeHtml(sample.cta)}</span><span>Contact us</span></div>
          </div>
          <aside class="sedifex-template-sample__phone">
            <div class="sedifex-template-sample__phone-top"></div>
            <div class="sedifex-template-sample__phone-card"></div>
            <div class="sedifex-template-sample__phone-lines"><span></span><span></span><span></span></div>
          </aside>
        </section>
        <section class="sedifex-template-sample__stats">
          ${sample.stats.map(item => `<div><strong>${escapeHtml(item)}</strong><span>Included section</span></div>`).join('')}
        </section>
        <section class="sedifex-template-sample__content">
          <div class="sedifex-template-sample__section-title"><span>Preview</span><h2>${escapeHtml(sample.sectionTitle)}</h2></div>
          <div class="sedifex-template-sample__cards">
            ${sample.cards.map((item, index) => `<article><div class="sedifex-template-sample__thumb sedifex-template-sample__thumb--${index + 1}"></div><strong>${escapeHtml(item)}</strong><p>Sample description, price, booking, or call-to-action appears here.</p></article>`).join('')}
          </div>
        </section>
        <footer class="sedifex-template-sample__footer">Demo preview only. Real client data will replace this after setup.</footer>
      </article>
    `
  }

  function showTemplatePreview(template) {
    closeTemplatePreview()
    const modal = document.createElement('div')
    modal.className = 'sedifex-template-preview-modal'
    modal.innerHTML = `
      <div class="sedifex-template-preview-modal__backdrop" data-preview-close="true"></div>
      <div class="sedifex-template-preview-modal__panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(template.name)} website template preview">
        <div class="sedifex-template-preview-modal__header">
          <div>
            <p class="sedifex-template-library__eyebrow">Template preview</p>
            <h2>${escapeHtml(template.name)}</h2>
            <p>This uses hardcoded sample content, so customers can see the design before finishing their website.</p>
          </div>
          <button type="button" class="sedifex-template-preview-modal__close" data-preview-close="true" aria-label="Close preview">×</button>
        </div>
        <div class="sedifex-template-preview-modal__toolbar">
          <span>Desktop preview</span>
          <span>Mobile-ready layout</span>
          <span>${escapeHtml(template.theme)} theme</span>
        </div>
        <div class="sedifex-template-preview-modal__viewport">
          ${renderSampleSite(template)}
        </div>
        <div class="sedifex-template-preview-modal__footer">
          <button type="button" class="sedifex-template-preview-modal__secondary" data-preview-close="true">Close</button>
          <button type="button" class="sedifex-template-preview-modal__primary" data-preview-use="${escapeHtml(template.id)}">Use this template</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    document.body.classList.add('sedifex-template-preview-open')
    modal.querySelectorAll('[data-preview-close]').forEach(button => button.addEventListener('click', closeTemplatePreview))
    const useButton = modal.querySelector('[data-preview-use]')
    if (useButton) useButton.addEventListener('click', () => { applyTemplate(template); closeTemplatePreview() })
  }

  function renderTemplateCard(template, selectedId) {
    return `
      <article class="sedifex-template-card ${selectedId === template.id ? 'is-selected' : ''}" data-template-id="${escapeHtml(template.id)}" data-template-tone="${escapeHtml(template.tone)}">
        <button type="button" class="sedifex-template-card__preview" data-template-preview="${escapeHtml(template.id)}" aria-label="Preview ${escapeHtml(template.name)} template">
          <span class="sedifex-template-card__preview-label">Preview sample</span>
          <div class="sedifex-template-card__browser" aria-hidden="true">
            <div class="sedifex-template-card__topbar"><span class="sedifex-template-card__dot"></span><span class="sedifex-template-card__dot"></span><span class="sedifex-template-card__dot"></span></div>
            <div class="sedifex-template-card__mini-site">
              <div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__button"></div></div>
              <div class="sedifex-template-card__media"></div>
            </div>
            <div class="sedifex-template-card__blocks"><div class="sedifex-template-card__block"></div><div class="sedifex-template-card__block"></div><div class="sedifex-template-card__block"></div></div>
          </div>
        </button>
        <div class="sedifex-template-card__meta">
          <span class="sedifex-template-card__name">${escapeHtml(template.name)}</span>
          <span class="sedifex-template-card__description">${escapeHtml(template.description)}</span>
          <span class="sedifex-template-card__tags">${template.tags.map(tag => `<span class="sedifex-template-card__tag">${escapeHtml(tag)}</span>`).join('')}</span>
          <span class="sedifex-template-card__actions"><button type="button" data-template-preview="${escapeHtml(template.id)}">Preview</button><button type="button" data-template-use="${escapeHtml(template.id)}">Use template</button></span>
        </div>
      </article>
    `
  }

  function injectLibrary() {
    if (!onWebsiteBuilder()) return
    if (document.querySelector('.sedifex-template-library')) return
    const themeSection = findSectionByHeading('Pick the design style') || findSectionByHeading('Theme')
    const host = themeSection && themeSection.parentElement ? themeSection : document.querySelector('.page[data-page-title="Website Builder"] .card')
    if (!host || !host.parentElement) return

    let selectedId = ''
    try { selectedId = localStorage.getItem(storeKey) || '' } catch {}

    const section = document.createElement('section')
    section.className = 'sedifex-template-library'
    section.innerHTML = `
      <div class="sedifex-template-library__header">
        <div>
          <p class="sedifex-template-library__eyebrow">Website templates</p>
          <h2 class="sedifex-template-library__title">Choose a WordPress-style website template</h2>
          <p class="sedifex-template-library__copy">Click Preview to see a full sample site with demo content. Click Use template only when you want to apply the structure, pages, and theme.</p>
        </div>
        <span class="sedifex-template-library__badge">Live sample previews</span>
      </div>
      <div class="sedifex-template-library__grid">${templates.map(template => renderTemplateCard(template, selectedId)).join('')}</div>
      <p class="sedifex-template-library__status">${selectedId ? 'Template selected. You can preview or choose another template anytime.' : 'Preview any template before selecting one.'}</p>
    `

    host.parentElement.insertBefore(section, host)
    section.querySelectorAll('[data-template-preview]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        const template = templates.find(item => item.id === button.getAttribute('data-template-preview'))
        if (template) showTemplatePreview(template)
      })
    })
    section.querySelectorAll('[data-template-use]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        const template = templates.find(item => item.id === button.getAttribute('data-template-use'))
        if (template) applyTemplate(template)
      })
    })
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeTemplatePreview()
  })
  const observer = new MutationObserver(() => injectLibrary())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('popstate', () => window.setTimeout(injectLibrary, 300))
  window.addEventListener('hashchange', () => window.setTimeout(injectLibrary, 300))
  window.setInterval(injectLibrary, 1200)
  document.addEventListener('DOMContentLoaded', injectLibrary)
  window.setTimeout(injectLibrary, 600)
})()
