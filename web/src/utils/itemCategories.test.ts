import { describe, expect, it } from 'vitest'
import { getCategorySubcategories, ITEM_CATEGORIES } from './itemCategories'

describe('item categories', () => {
  it('includes the reusable common business categories', () => {
    expect(ITEM_CATEGORIES).toContain('Clothing & Fashion')
    expect(ITEM_CATEGORIES).toContain('Services')
    expect(ITEM_CATEGORIES).toContain('Courses & Training')
    expect(ITEM_CATEGORIES).toContain('Digital Products')
    expect(ITEM_CATEGORIES).toContain('Other')
  })

  it('returns category-specific subcategories and safely handles custom categories', () => {
    expect(getCategorySubcategories('Food & Groceries')).toContain('Fresh Food')
    expect(getCategorySubcategories('My legacy custom category')).toEqual([])
  })
})
