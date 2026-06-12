import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'

const DEFAULT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22 viewBox=%220 0 400 300%22%3E%3Crect width=%22400%22 height=%22300%22 fill=%22%23f3f4f6%22/%3E%3Cpath d=%22M136 204l42-48 35 38 24-27 39 37H136z%22 fill=%22%23d1d5db%22/%3E%3Ccircle cx=%22162%22 cy=%22120%22 r=%2218%22 fill=%22%23d1d5db%22/%3E%3C/svg%3E'

type SafeFirebaseImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
}

export default function SafeFirebaseImage({
  src,
  alt,
  className,
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: SafeFirebaseImageProps) {
  const normalizedSrc = typeof src === 'string' && src.trim() ? src.trim() : DEFAULT_IMAGE_PLACEHOLDER
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const displaySrc = failedSrc === normalizedSrc ? DEFAULT_IMAGE_PLACEHOLDER : normalizedSrc

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (displaySrc !== DEFAULT_IMAGE_PLACEHOLDER) setFailedSrc(normalizedSrc)
    onError?.(event)
  }

  // Native img loading keeps Firebase download URLs direct and avoids Vercel Image Optimization cache writes.
  return (
    <img
      {...props}
      src={displaySrc}
      alt={alt ?? ''}
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  )
}
