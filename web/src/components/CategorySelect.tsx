import { useId, useMemo } from "react";
import {
  getCategorySubcategories,
  ITEM_CATEGORIES,
} from "../utils/itemCategories";

type CategorySelectProps = {
  category: string;
  onCategoryChange: (category: string) => void;
  subcategory: string;
  onSubcategoryChange: (subcategory: string) => void;
  existingCategories?: readonly string[];
  idPrefix?: string;
};

export function CategorySelect({
  category,
  onCategoryChange,
  subcategory,
  onSubcategoryChange,
  existingCategories = [],
  idPrefix,
}: CategorySelectProps) {
  const generatedId = useId().replace(/:/g, "");
  const baseId = idPrefix ?? `item-category-${generatedId}`;
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...ITEM_CATEGORIES, ...existingCategories.filter(Boolean)]),
      ),
    [existingCategories],
  );
  const subcategoryOptions = getCategorySubcategories(category);

  return (
    <div className="category-select">
      <div className="field">
        <label className="field__label" htmlFor={`${baseId}-category`}>
          Category
        </label>
        <input
          id={`${baseId}-category`}
          type="search"
          list={`${baseId}-category-options`}
          value={category}
          onChange={(event) => {
            onCategoryChange(event.target.value);
            onSubcategoryChange("");
          }}
          placeholder="Search or choose a category"
        />
        <datalist id={`${baseId}-category-options`}>
          {categoryOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <p className="field__hint">
          Search the list or enter a custom category if yours is not shown.
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${baseId}-subcategory`}>
          Subcategory <span className="field__optional">(optional)</span>
        </label>
        <input
          id={`${baseId}-subcategory`}
          type="search"
          list={`${baseId}-subcategory-options`}
          value={subcategory}
          onChange={(event) => onSubcategoryChange(event.target.value)}
          placeholder={
            subcategoryOptions.length
              ? "Search or choose a subcategory"
              : "Enter an optional subcategory"
          }
        />
        <datalist id={`${baseId}-subcategory-options`}>
          {subcategoryOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <p className="field__hint">
          {subcategoryOptions.length
            ? `Suggestions shown for ${category}. You can also enter your own.`
            : "Choose a listed category to see suggestions, or enter your own subcategory."}
        </p>
      </div>
    </div>
  );
}
