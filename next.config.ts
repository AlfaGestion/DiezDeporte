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

const nextConfig: NextConfig = {
  allowedDevOrigins: readAllowedDevOrigins(),
};

export default nextConfig;
