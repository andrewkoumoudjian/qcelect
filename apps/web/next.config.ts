import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.QCELECT_REPLAY_FILE ? ".next-replay" : ".next",
};

export default config;
