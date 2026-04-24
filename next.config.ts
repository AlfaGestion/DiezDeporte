import type { NextConfig } from "next";

function readAllowedDevOrigins() {
  const configured =
    process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) || [];

  return Array.from(
    new Set([
      "*.ngrok-free.dev",
      "*.ngrok.app",
      "*.ngrok.dev",
      "*.loca.lt",
      ...configured,
    ]),
  );
}

function readAllowedServerActionOrigins() {
  const configured =
    process.env.NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) || [];

  return Array.from(new Set(configured));
}

const nextConfig: NextConfig = {
  allowedDevOrigins: readAllowedDevOrigins(),
  experimental: {
    serverActions: {
      allowedOrigins: readAllowedServerActionOrigins(),
    },
  },
};

export default nextConfig;
