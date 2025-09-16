
// services/upstashRedis.ts
import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client
export const redis = new Redis({
  url: import.meta.env.VITE_PUBLIC_UPSTASH_REDIS_REST_URL!,
  token: import.meta.env.VITE_PUBLIC_UPSTASH_REDIS_REST_TOKEN!,
});

// Alternative: Initialize with direct URLs (if not using env vars)
// export const redis = Redis.fromEnv();