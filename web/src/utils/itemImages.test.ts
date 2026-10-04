import { describe, expect, it } from 'vitest'
import {
  MAX_ITEM_IMAGES,
  moveItemImage,
  normalizeItemImages,
  removeItemImage,
  setItemCoverImage,
} from './itemImages'

describe('itemImages', () => {
  it('keeps the cover first and removes duplicate or empty image URLs', () => {
    expect(normalizeItemImages(' cover.jpg ', ['other.jpg', 'cover.jpg', '', 'third.jpg'])).toEqual([
      'cover.jpg',
      'other.jpg',
      'third.jpg',
    ])
  })

  it('promotes a gallery image to cover without duplicating it', () => {
    expect(setItemCoverImage(['one.jpg', 'two.jpg', 'three.jpg'], 'three.jpg')).toEqual([
      'three.jpg',
      'one.jpg',
      'two.jpg',
    ])
  })

  it('removes an image and preserves the remaining order', () => {
    expect(removeItemImage(['one.jpg', 'two.jpg', 'three.jpg'], 'two.jpg')).toEqual([
      'one.jpg',
      'three.jpg',
    ])
  })

  it('moves images one position at a time and keeps boundaries stable', () => {
    expect(moveItemImage(['one.jpg', 'two.jpg', 'three.jpg'], 'two.jpg', -1)).toEqual([
      'two.jpg',
      'one.jpg',
      'three.jpg',
    ])
    expect(moveItemImage(['one.jpg', 'two.jpg', 'three.jpg'], 'three.jpg', 1)).toEqual([
      'one.jpg',
      'two.jpg',
      'three.jpg',
    ])
  })

  it('limits saved galleries to the supported maximum', () => {
    const images = Array.from({ length: MAX_ITEM_IMAGES + 4 }, (_, index) => `image-${index}.jpg`)
    expect(normalizeItemImages('', images)).toHaveLength(MAX_ITEM_IMAGES)
  })
})
