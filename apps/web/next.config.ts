import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/__test/session', destination: '/visual-test/session' }];
  },
};

export default nextConfig;
