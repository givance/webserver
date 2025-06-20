import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude winston from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };

      config.externals = config.externals || [];
      config.externals.push("winston");
    }

    // Exclude worktrees directory from webpack compilation
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /worktrees/,
      loader: "ignore-loader",
    });

    // Exclude test files from the build
    config.module.rules.push({
      test: /\.(test|spec)\.(js|jsx|ts|tsx)$/,
      loader: "ignore-loader",
    });

    // Exclude __tests__ directories
    config.module.rules.push({
      test: /\/__tests__\//,
      loader: "ignore-loader",
    });

    // Exclude setup files
    config.module.rules.push({
      test: /\.setup\.(js|jsx|ts|tsx)$/,
      loader: "ignore-loader",
    });

    return config;
  },
};

export default nextConfig;
