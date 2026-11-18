/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // modules/ není ve výchozím seznamu složek, které `next lint` kontroluje
    dirs: ["app", "components", "lib", "modules", "types"],
  },
  // Stránky, jejichž adresa obsahuje tajný token registrace: bez cache a bez posílání adresy dál (Referer)
  async headers() {
    const secret = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/akce/:slug/hotovo", headers: secret },
      { source: "/akce/:slug/r/:path*", headers: secret },
    ];
  },
};

export default nextConfig;
