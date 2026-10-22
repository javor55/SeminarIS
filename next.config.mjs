/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // modules/ není ve výchozím seznamu složek, které `next lint` kontroluje
    dirs: ["app", "components", "lib", "modules", "types"],
  },
};

export default nextConfig;
