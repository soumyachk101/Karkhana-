/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon; Next must require() it at runtime rather
  // than trying to bundle it into the server build.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
