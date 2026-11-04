import { Navigate, useLocation } from 'react-router-dom'
import { legacyGalleryHref } from '../utils/mediaManagerTabs'

// Keep old bookmarks and saved store navigation functional, without
// maintaining a second gallery uploader or modifying existing gallery data.
export default function GallerySettings() {
  const { search } = useLocation()
  return <Navigate to={legacyGalleryHref(search)} replace />
}
