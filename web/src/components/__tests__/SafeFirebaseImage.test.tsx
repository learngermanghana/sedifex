import { fireEvent, render, screen } from '@testing-library/react'
import SafeFirebaseImage from '../SafeFirebaseImage'

describe('SafeFirebaseImage', () => {
  it('renders Firebase Storage URLs directly with native lazy loading', () => {
    const src = 'https://firebasestorage.googleapis.com/v0/b/test/o/product.jpg?alt=media'

    render(<SafeFirebaseImage src={src} alt="Product" className="object-cover" width={240} height={180} />)

    const image = screen.getByRole('img', { name: 'Product' })
    expect(image).toHaveAttribute('src', src)
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveClass('object-cover')
    expect(image).toHaveAttribute('width', '240')
    expect(image).toHaveAttribute('height', '180')
  })

  it('uses a placeholder when the source is missing or fails to load', () => {
    const { rerender } = render(<SafeFirebaseImage src={null} alt="Missing product" />)
    const image = screen.getByRole('img', { name: 'Missing product' })

    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)

    const firebaseSrc = 'https://storage.googleapis.com/test-bucket/product.jpg'
    rerender(<SafeFirebaseImage src={firebaseSrc} alt="Missing product" />)
    expect(image).toHaveAttribute('src', firebaseSrc)

    fireEvent.error(image)
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })
})
