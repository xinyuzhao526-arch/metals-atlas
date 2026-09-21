import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const projectPagesBase = repositoryName && !repositoryName.endsWith(".github.io") ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : "standalone",
  trailingSlash: staticExport,
  images: { unoptimized: staticExport },
  basePath: staticExport ? projectPagesBase : "",
  assetPrefix: staticExport ? projectPagesBase : "",
};

export default nextConfig;
