/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    // allow external image hosts
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "drive.google.com" },
    ],

    // modern formats for sharper results
    formats: ["image/avif", "image/webp"],

    // cache remote images for 1 minute
    minimumCacheTTL: 60,
  },

  // use Webpack dev server (no Turbopack)
  compiler: { turbo: false },
};

export default nextConfig;
