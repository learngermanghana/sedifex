(() => {
  const templates = {
    'shop-classic': {
      type: 'Shop website',
      theme: 'Modern',
      pages: ['Home', 'Products', 'Categories', 'Cart / Checkout', 'Quick Pay', 'Contact'],
    },
    'travel-consultancy': {
      type: 'Travel agency website',
      theme: 'Modern',
      pages: ['Home', 'Packages', 'Destinations', 'Consultation / Enquiry', 'Bookings', 'Gallery', 'Blog', 'Contact'],
    },
    'beauty-booking': {
      type: 'Beauty / salon website',
      theme: 'Luxury',
      pages: ['Home', 'Services', 'Bookings', 'Gallery', 'Client reviews', 'Quick Pay', 'Contact'],
    },
    'ngo-impact': {
      type: 'NGO website',
      theme: 'Clean',
      pages: ['Home', 'About', 'Programs', 'Donate', 'Volunteers', 'Gallery', 'Blog', 'Contact'],
    },
    'school-courses': {
      type: 'School website',
      theme: 'Clean',
      pages: ['Home', 'Courses', 'Registration', 'Classes', 'Student payments', 'Contact'],
    },
    'premium-service': {
      type: 'Service business website',
      theme: 'Bold',
      pages: ['Home', 'Services', 'Bookings', 'Invoices', 'Testimonials', 'Quick Pay', 'Contact'],
    },
    'restaurant-menu': {
      type: 'Restaurant website',
      theme: 'Bold',
      pages: ['Home', 'Menu', 'Online ordering', 'Table QR', 'Reservations', 'Gallery', 'Contact'],
    },
  }

  const themeLabels = ['Modern', 'Luxury', 'Clean', 'Bold']
  let applyingTemplate = false
  let autoSaveTimer = 0

  function onWebsiteBuilder() {
    return window.location.pathname.includes('/website-builder')
  }

  function textOf(element) {
    return (element && element.textContent ? element.textContent : '').replace(/\s+/g, ' ').trim()
  }

  function allButtons() {
    return Array.from(document.querySelectorAll('button'))
  }

  function clickButtonExact(label) {
    const button = allButtons().find(item => textOf(item) === label || textOf(item).includes(label))
    if (button) {
      button.click()
      return true
    }
    return false
  }

  function clickStep(label) {
    return clickButtonExact(label)
  }

  function getCheckboxLabelText(label) {
    const clone = label.cloneNode(true)
    const input = clone.querySelector && clone.querySelector('input')
    if (input) input.remove()
    return textOf(clone)
  }

  function setPages(template) {
    const labels = Array.from(document.querySelectorAll('label'))
    labels.forEach(label => {
      const checkbox = label.querySelector('input[type="checkbox"]')
      if (!checkbox) return
      const labelText = getCheckboxLabelText(label)
      const pageName = template.pages.find(page => labelText.includes(page))
      if (!pageName) {
        if (checkbox.checked) checkbox.click()
        return
      }
      if (!checkbox.checked) checkbox.click()
    })
  }

  function showStatus(message) {
    let status = document.querySelector('.sedifex-template-library__status')
    if (!status) return
    status.textContent = message
  }

  function saveDraftSoon(message = 'Template applied and draft saved.') {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = window.setTimeout(() => {
      const saved = clickButtonExact('Save draft')
      if (saved) showStatus(message)
    }, 600)
  }

  function applyTemplateById(templateId) {
    const template = templates[templateId]
    if (!template || !onWebsiteBuilder()) return
    applyingTemplate = true
    showStatus(`Applying ${template.type}…`)

    clickStep('Website type')
    window.setTimeout(() => {
      clickButtonExact(template.type)
      window.setTimeout(() => {
        clickStep('Pages')
        window.setTimeout(() => {
          setPages(template)
          window.setTimeout(() => {
            clickStep('Theme')
            window.setTimeout(() => {
              clickButtonExact(template.theme)
              document.querySelectorAll('.sedifex-template-card').forEach(card => {
                card.classList.toggle('is-selected', card.getAttribute('data-template-id') === templateId)
              })
              try { localStorage.setItem('sedifex.websiteBuilder.selectedTemplate', templateId) } catch {}
              saveDraftSoon(`${template.type} template applied and draft saved.`)
              window.setTimeout(() => { applyingTemplate = false }, 900)
            }, 180)
          }, 220)
        }, 220)
      }, 220)
    }, 180)
  }

  document.addEventListener('click', event => {
    if (!onWebsiteBuilder()) return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const templateButton = target.closest('[data-template-use]')
    if (templateButton) {
      const templateId = templateButton.getAttribute('data-template-use')
      window.setTimeout(() => applyTemplateById(templateId), 80)
      return
    }

    const previewUseButton = target.closest('[data-preview-use]')
    if (previewUseButton) {
      const templateId = previewUseButton.getAttribute('data-preview-use')
      window.setTimeout(() => applyTemplateById(templateId), 80)
      return
    }

    const button = target.closest('button')
    if (!button || applyingTemplate) return
    const label = textOf(button)
    if (themeLabels.some(theme => label.includes(theme)) && document.body.textContent.includes('Pick the design style')) {
      saveDraftSoon('Theme applied and draft saved.')
    }
  }, true)
})()
