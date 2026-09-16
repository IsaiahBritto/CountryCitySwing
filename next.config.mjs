/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/team", destination: "/about#team", permanent: true },
      { source: "/test/event-page", destination: "/events", permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "drive.google.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
  },
};

export default nextConfig;
