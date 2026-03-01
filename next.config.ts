import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "sanitize-html", // uses native bindings; must not be bundled by webpack
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.examtopics.com" },
      { protocol: "https", hostname: "examtopics.com" },
    ],
  },
};

export default nextConfig;
