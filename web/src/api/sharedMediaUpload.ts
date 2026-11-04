import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { uploadProductImage } from './productImageUpload'
import { mediaFileExtension, mediaSha256, optimizeMediaFile, uploadWithRetry } from '../utils/mediaLibrary'

export type LibraryUploadResult = { url: string; alreadyThere: boolean }

/**
 * The one upload path for reusable public website pictures.
 * Each optimized image is content-addressed per store so item/service/blog
 * uploads and the Media Manager share one copy and one mediaAssets record.
 */
export async function uploadToSharedMediaLibrary(
  file: File,
  storeId: string,
  source: 'device' | 'drive' = 'device',
  sourceId: string | null = null,
): Promise<LibraryUploadResult> {
  if (!storeId) throw new Error('Select a store before uploading pictures.')
  const optimized = await optimizeMediaFile(file)
  const hash = await mediaSha256(optimized)
  const ref = doc(db, 'stores', storeId, 'mediaAssets', hash)
  const previous = await getDoc(ref)
  const previousUrl = previous.exists() ? previous.data().url : null
  if (typeof previousUrl === 'string' && previousUrl.startsWith('https://')) {
    return { url: previousUrl, alreadyThere: true }
  }

  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in to Sedifex before importing pictures.')
  const storagePath = 'stores/' + storeId + '/media/' + hash + mediaFileExtension(optimized)
  const url = await uploadWithRetry(() => uploadProductImage(optimized, { storagePath, authToken: token }))
  await setDoc(ref, {
    url,
    name: file.name.slice(0, 220),
    source,
    sourceId: source === 'drive' ? sourceId : null,
    sha256: hash,
    size: optimized.size,
    mimeType: optimized.type,
    createdAt: serverTimestamp(),
  })
  return { url, alreadyThere: false }
}
