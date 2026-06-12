import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Serve image URLs directly instead of writing to Vercel's Image Optimization cache.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
}

export default nextConfig
