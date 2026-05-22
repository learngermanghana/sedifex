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
    },
  ]

  const storeKey = 'sedifex.websiteBuilder.selectedTemplate'

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

  function renderTemplateCard(template, selectedId) {
    return `
      <button type="button" class="sedifex-template-card ${selectedId === template.id ? 'is-selected' : ''}" data-template-id="${template.id}" data-template-tone="${template.tone}">
        <div class="sedifex-template-card__preview" aria-hidden="true">
          <div class="sedifex-template-card__browser">
            <div class="sedifex-template-card__topbar"><span class="sedifex-template-card__dot"></span><span class="sedifex-template-card__dot"></span><span class="sedifex-template-card__dot"></span></div>
            <div class="sedifex-template-card__mini-site">
              <div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__hero-line"></div><div class="sedifex-template-card__button"></div></div>
              <div class="sedifex-template-card__media"></div>
            </div>
            <div class="sedifex-template-card__blocks"><div class="sedifex-template-card__block"></div><div class="sedifex-template-card__block"></div><div class="sedifex-template-card__block"></div></div>
          </div>
        </div>
        <span class="sedifex-template-card__meta">
          <span class="sedifex-template-card__name">${template.name}</span>
          <span class="sedifex-template-card__description">${template.description}</span>
          <span class="sedifex-template-card__tags">${template.tags.map(tag => `<span class="sedifex-template-card__tag">${tag}</span>`).join('')}</span>
        </span>
      </button>
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
          <p class="sedifex-template-library__copy">Templates change more than colors. They apply the website type, recommended pages, and visual style together. Theme still controls the color mood after the template is selected.</p>
        </div>
        <span class="sedifex-template-library__badge">Preview samples</span>
      </div>
      <div class="sedifex-template-library__grid">${templates.map(template => renderTemplateCard(template, selectedId)).join('')}</div>
      <p class="sedifex-template-library__status">${selectedId ? 'Template selected. You can choose another template anytime.' : 'No template selected yet.'}</p>
    `

    host.parentElement.insertBefore(section, host)
    section.querySelectorAll('.sedifex-template-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-template-id')
        const template = templates.find(item => item.id === id)
        if (template) applyTemplate(template)
      })
    })
  }

  const observer = new MutationObserver(() => injectLibrary())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('popstate', () => window.setTimeout(injectLibrary, 300))
  window.addEventListener('hashchange', () => window.setTimeout(injectLibrary, 300))
  window.setInterval(injectLibrary, 1200)
  document.addEventListener('DOMContentLoaded', injectLibrary)
  window.setTimeout(injectLibrary, 600)
})()
