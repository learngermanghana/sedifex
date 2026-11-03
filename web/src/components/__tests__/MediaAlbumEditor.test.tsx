import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MediaAlbumEditor from '../MediaAlbumEditor'

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  publish: vi.fn(),
  commit: vi.fn(),
  batchUpdate: vi.fn(),
  batchDelete: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_dbOrCollection: unknown, ...path: string[]) => {
    if (typeof _dbOrCollection === 'string') return [_dbOrCollection, ...path].join('/')
    return path.join('/')
  },
  query: (location: string) => location,
  where: () => 'WHERE',
  serverTimestamp: () => 'server-time',
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  writeBatch: () => ({
    update: mocks.batchUpdate,
    delete: mocks.batchDelete,
    commit: mocks.commit,
  }),
}))

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('../ToastProvider', () => ({ useToast: () => ({ publish: mocks.publish }) }))
vi.mock('../SafeFirebaseImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const album = {
  id: 'album-1',
  title: 'Events',
  description: 'Our events',
  coverImageUrl: 'https://example.com/first.webp',
  isPublished: true,
}

const galleryPhotos = [
  { id: 'img-1', data: () => ({ albumId: 'album-1', url: 'https://example.com/first.webp', alt: 'First', caption: 'First picture', isPublished: true, sortOrder: 1 }) },
  { id: 'img-2', data: () => ({ albumId: 'album-1', url: 'https://example.com/second.webp', alt: 'Second', caption: 'Second picture', isPublished: true, sortOrder: 2 }) },
]

const onUpdate = vi.fn()
const onClose = vi.fn()

function renderEditor() {
  return render(
    <MediaAlbumEditor storeId="store-1" album={album} otherAlbums={[album]} onUpdate={onUpdate} onClose={onClose} />,
  )
}

describe('MediaAlbumEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getDocs.mockResolvedValue({ docs: galleryPhotos })
    mocks.setDoc.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
  })

  it('renames an album, edits description and hides it', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(await screen.findByText('Pictures in this album (2)')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Album name'))
    await user.type(screen.getByLabelText('Album name'), 'New collection')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Latest photos')
    await user.click(screen.getByRole('checkbox', { name: /Publish album/i }))
    await user.click(screen.getByRole('button', { name: 'Save album changes' }))

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1))
    expect(mocks.setDoc.mock.calls[0][0]).toBe('stores/store-1/galleryAlbums/album-1')
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({
      title: 'New collection',
      description: 'Latest photos',
      isPublished: false,
      coverImageUrl: 'https://example.com/first.webp',
    })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'New collection', isPublished: false }))
  })

  it('allows changing the album cover to another published photo', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(await screen.findByRole('combobox', { name: 'Cover picture' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cover picture' }), 'https://example.com/second.webp')
    await user.click(screen.getByRole('button', { name: 'Save album changes' }))
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1))
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ coverImageUrl: 'https://example.com/second.webp' })
  })

  it('reorders pictures without copying or deleting their original media files', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByText('Pictures in this album (2)')
    await user.click(screen.getByRole('button', { name: 'Move picture 2 earlier' }))
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1))
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.batchDelete).not.toHaveBeenCalled()
    expect(mocks.batchUpdate.mock.calls[0][1]).toMatchObject({ sortOrder: 1 })
    expect(mocks.batchUpdate.mock.calls[1][1]).toMatchObject({ sortOrder: 2 })
  })

  it('hides an individual photo and replaces a hidden cover', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByText('Pictures in this album (2)')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('checkbox', { name: /Publish this picture/i }))
    await user.click(screen.getByRole('button', { name: 'Save picture' }))
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1))
    expect(mocks.batchUpdate).toHaveBeenCalledWith(
      'stores/store-1/galleryImages/img-1',
      expect.objectContaining({ isPublished: false }),
    )
    expect(mocks.batchUpdate).toHaveBeenCalledWith(
      'stores/store-1/galleryAlbums/album-1',
      expect.objectContaining({ coverImageUrl: 'https://example.com/second.webp' }),
    )
  })

  it('removes a photo from album records but never deletes the stored original', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderEditor()
    await screen.findByText('Pictures in this album (2)')
    const cards = screen.getAllByRole('article')
    await user.click(within(cards[0]).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1))
    expect(mocks.batchDelete).toHaveBeenCalledWith('stores/store-1/galleryImages/img-1')
    expect(mocks.batchUpdate).toHaveBeenCalledWith('stores/store-1/galleryAlbums/album-1',
      expect.objectContaining({ coverImageUrl: 'https://example.com/second.webp' }))
    expect(screen.getByText('Pictures in this album (1)')).toBeInTheDocument()
  })
})
