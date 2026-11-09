/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@kerala-tourism/constants',
    '@kerala-tourism/shared-types',
    '@kerala-tourism/api-client',
    '@kerala-tourism/validation',
  ],
  reactStrictMode: true,
};

module.exports = nextConfig;
