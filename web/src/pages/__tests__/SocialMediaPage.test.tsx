import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SocialMediaPage from '../SocialMediaPage'

const mockPublish = vi.fn()
const mockRequestSocialPost = vi.fn()

vi.mock('../../hooks/useActiveStore', () => ({
  useActiveStore: () => ({ storeId: 'store-1', isLoading: false, error: null }),
}))

vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ publish: mockPublish }),
}))

vi.mock('../../api/socialPost', () => ({
  requestSocialPost: (...args: Parameters<typeof mockRequestSocialPost>) => mockRequestSocialPost(...args),
}))

vi.mock('../../firebase', () => ({
  db: {},
}))

const collectionMock = vi.fn((_db: unknown, path: string) => ({ kind: 'collection', path }))
const queryMock = vi.fn((collectionRef: { path: string }, ...clauses: unknown[]) => ({ kind: 'query', path: collectionRef.path, clauses }))
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
const docMock = vi.fn((_db: unknown, path: string, id: string) => ({ kind: 'doc', path: `${path}/${id}` }))
const onSnapshotMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (...args: Parameters<typeof collectionMock>) => collectionMock(...args),
  query: (...args: Parameters<typeof queryMock>) => queryMock(...args),
  where: (...args: Parameters<typeof whereMock>) => whereMock(...args),
  doc: (...args: Parameters<typeof docMock>) => docMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

describe('SocialMediaPage', () => {
  beforeEach(() => {
    mockPublish.mockReset()
    mockRequestSocialPost.mockReset()
    onSnapshotMock.mockReset()

    onSnapshotMock.mockImplementation((ref, onNext) => {
      if (ref.kind === 'query' && ref.path === 'products') {
        queueMicrotask(() => {
          onNext({
            docs: [
              {
                id: 'product-1',
                data: () => ({
                  name: 'Starter Package',
                  category: 'Service',
                  description: 'Great package',
                  imageUrl: null,
                  itemType: 'service',
                }),
              },
            ],
          })
        })
      }

      if (ref.kind === 'doc' && ref.path === 'stores/store-1') {
        queueMicrotask(() => {
          onNext({
            data: () => ({
              phone: '+23350000111',
              email: 'hello@sedifex.com',
              promoWebsiteUrl: 'https://sedifex.com',
            }),
          })
        })
      }

      return () => {}
    })

    mockRequestSocialPost.mockResolvedValue({
      storeId: 'store-1',
      productId: 'product-1',
      product: {
        id: 'product-1',
        name: 'Starter Package',
        imageUrl: null,
        itemType: 'service',
      },
      post: {
        platform: 'instagram',
        caption: 'New offer available now',
        hashtags: ['#sale', '#ghana'],
        cta: 'Send us a DM today!',
        imagePrompt: '',
        designSpec: {
          aspectRatio: '4:5',
          visualStyle: 'clean',
          safeTextZones: [],
        },
        disclaimer: null,
      },
    })
  })

  it('renders CTA from store contact details and not generated CTA', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(await screen.findByRole('button', { name: /generate social post/i }))

    await waitFor(() => {
      expect(screen.getByText(/Call now: \+23350000111 • Email: hello@sedifex.com • Visit: https:\/\/sedifex.com/i)).toBeInTheDocument()
    })
  })

  it('hides image prompt and design spec rows when prompt is empty and safe zones missing', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(await screen.findByRole('button', { name: /generate social post/i }))

    await waitFor(() => {
      expect(screen.queryByText(/^Image prompt:/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/^Design spec:/i)).not.toBeInTheDocument()
    })
  })

  it('disables Download image button when image URL is missing', async () => {
    const user = userEvent.setup()
    render(<SocialMediaPage />)

    await user.click(await screen.findByRole('button', { name: /generate social post/i }))

    const button = await screen.findByRole('button', { name: /download image/i })
    expect(button).toBeDisabled()
  })
})
