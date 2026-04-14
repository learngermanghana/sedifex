import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SocialMediaPage from '../SocialMediaPage'

const mockUseActiveStore = vi.fn()
vi.mock('../../hooks/useActiveStore', () => ({
  useActiveStore: () => mockUseActiveStore(),
}))

const mockPublish = vi.fn()
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ publish: mockPublish }),
}))

const mockRequestSocialPost = vi.fn()
vi.mock('../../api/socialPost', () => ({
  requestSocialPost: (...args: Parameters<typeof mockRequestSocialPost>) => mockRequestSocialPost(...args),
}))

const mockCollection = vi.fn()
const mockWhere = vi.fn()
const mockQuery = vi.fn()
const mockOnSnapshot = vi.fn()
const mockDoc = vi.fn()
const mockGetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (...args: Parameters<typeof mockCollection>) => mockCollection(...args),
  where: (...args: Parameters<typeof mockWhere>) => mockWhere(...args),
  query: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
  onSnapshot: (...args: Parameters<typeof mockOnSnapshot>) => mockOnSnapshot(...args),
  doc: (...args: Parameters<typeof mockDoc>) => mockDoc(...args),
  getDoc: (...args: Parameters<typeof mockGetDoc>) => mockGetDoc(...args),
}))

vi.mock('../../firebase', () => ({
  db: { __name: 'test-db' },
}))

describe('SocialMediaPage manual flow', () => {
  beforeEach(() => {
    mockUseActiveStore.mockReset()
    mockPublish.mockReset()
    mockRequestSocialPost.mockReset()
    mockCollection.mockReset()
    mockWhere.mockReset()
    mockQuery.mockReset()
    mockOnSnapshot.mockReset()
    mockDoc.mockReset()
    mockGetDoc.mockReset()

    mockUseActiveStore.mockReturnValue({ storeId: 'store-1' })
    mockCollection.mockImplementation((_db, name) => ({ name }))
    mockWhere.mockImplementation((...args) => ({ args }))
    mockQuery.mockImplementation((...parts) => ({ parts }))
    mockDoc.mockImplementation((_db, collectionName, id) => ({ collectionName, id }))

    mockOnSnapshot.mockImplementation((_query, onNext) => {
      onNext({
        docs: [
          {
            id: 'product-1',
            data: () => ({
              name: 'Zobo Mix',
              category: 'Drinks',
              description: 'Fresh and ready',
              price: 15,
              imageUrl: null,
              itemType: 'product',
            }),
          },
        ],
      })
      return vi.fn()
    })

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        phone: '+233201234567',
        email: 'hello@example.com',
        website: 'https://example.com',
      }),
    })

    mockRequestSocialPost.mockResolvedValue({
      storeId: 'store-1',
      productId: 'product-1',
      product: {
        id: 'product-1',
        name: 'Zobo Mix',
        category: 'Drinks',
        description: 'Fresh and ready',
        price: 15,
        imageUrl: null,
        itemType: 'product',
      },
      post: {
        platform: 'instagram',
        caption: 'Try our Zobo Mix today',
        cta: 'Order now!',
        hashtags: ['#zobo', '#ghana'],
        disclaimer: null,
      },
    })
  })

  it('renders CTA from store contact details in the draft area', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(screen.getByRole('button', { name: /generate social post/i }))

    expect(await screen.findByText(/CTA:/i)).toHaveTextContent(
      'CTA: Call now: +233201234567 • Email: hello@example.com • Visit: https://example.com',
    )
  })

  it('does not render image prompt or design spec fields in manual flow output', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(screen.getByRole('button', { name: /generate social post/i }))

    await screen.findByText(/Caption:/i)
    expect(screen.queryByText(/image prompt/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/design spec/i)).not.toBeInTheDocument()
  })

  it('disables download image button when image URL is missing', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(screen.getByRole('button', { name: /generate social post/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download image/i })).toBeDisabled()
    })
  })
})
