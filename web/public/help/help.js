const search = document.querySelector('#help-search')
if (search) search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase()
  const cards = [...document.querySelectorAll('[data-guide]')]
  let visible = 0
  cards.forEach(card => { card.hidden = !card.textContent.toLowerCase().includes(query); if (!card.hidden) visible++ })
  document.querySelector('#search-status').textContent = query ? `${visible} ${visible === 1 ? 'guide' : 'guides'} found` : ''
})
const copy = document.querySelector('[data-copy-url]')
if (copy) copy.addEventListener('click', async () => {
  const status = document.querySelector('.copy-status')
  copy.disabled = true
  try {
    const response = await fetch(copy.dataset.copyUrl)
    if (!response.ok) throw new Error('Guide unavailable')
    const text = await response.text()
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(text)
    status.textContent = 'Copied. Paste these instructions into your AI chat.'
  } catch {
    status.textContent = 'Copy is unavailable. Open the plain-text instructions link and copy the text manually.'
  } finally { copy.disabled = false }
})
