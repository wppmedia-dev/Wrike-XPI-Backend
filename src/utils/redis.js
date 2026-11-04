import { createClient } from "redis";
require("dotenv").config();

/**
 * Shared Redis client (L2 cache + cross-instance cache bus).
 *
 * Redis is an accelerator here, never a dependency: every caller treats a
 * null/false answer as a cache miss and falls through to Postgres or Wrike.
 * Two properties make that safe:
 *
 *   - Fail fast. While Redis is down, commands are NOT queued
 *     (disableOfflineQueue) and callers are answered from `isConnected`
 *     without touching the socket, so a request never waits on a dead Redis.
 *   - Self-heal. The client reconnects on its own with capped exponential
 *     backoff, forever. The previous implementation gave up after the first
 *     error and stayed on the slow path until the process was restarted.
 *
 * State changes (down / back up) are logged once each, plus a reminder every
 * REDIS_DOWN_LOG_INTERVAL_MS while it stays down, so an outage is visible in
 * the logs without one line per retry. `status()` exposes the same state to
 * the readiness probe (GET /ready).
 */
const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS =
  parseInt(process.env.REDIS_RECONNECT_MAX_MS, 10) > 0
    ? parseInt(process.env.REDIS_RECONNECT_MAX_MS, 10)
    : 30000;
const DOWN_LOG_INTERVAL_MS =
  parseInt(process.env.REDIS_DOWN_LOG_INTERVAL_MS, 10) > 0
    ? parseInt(process.env.REDIS_DOWN_LOG_INTERVAL_MS, 10)
    : 5 * 60 * 1000;

// Exponential backoff with jitter, capped. Never returns false/Error, so the
// client never gives up — Redis coming back must not require a restart.
export const reconnectDelay = (retries) => {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** retries);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
};

const buildConfig = () => {
  const config = {
    socket: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT) || 6379,
      connectTimeout: 5000,
      reconnectStrategy: reconnectDelay,
    },
    // Reject commands immediately while disconnected instead of buffering
    // them until reconnect — a buffered cache read is a hung request.
    disableOfflineQueue: true,
  };
  if (process.env.REDIS_PASSWORD) config.password = process.env.REDIS_PASSWORD;
  return config;
};

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    // Kept for compatibility with anything reading it: true while Redis is
    // unreachable. It no longer means "given up" — reconnects keep going.
    this.connectionFailed = false;
    this.connecting = null;
    this.downSince = null;
    this.lastDownLogAt = 0;
    this.lastError = null;
    this.closing = false;
    this.subscribers = [];
  }

  _markDown(error) {
    this.isConnected = false;
    this.connectionFailed = true;
    this.lastError = error?.message || String(error || "unknown error");

    const now = Date.now();
    if (!this.downSince) {
      this.downSince = now;
      this.lastDownLogAt = now;
      console.warn(
        new Date().toISOString(),
        `[redis] unavailable (${this.lastError}); caches fall back to the source and the client keeps reconnecting`,
      );
    } else if (now - this.lastDownLogAt >= DOWN_LOG_INTERVAL_MS) {
      this.lastDownLogAt = now;
      console.warn(
        new Date().toISOString(),
        `[redis] still unavailable after ${Math.round((now - this.downSince) / 1000)}s (${this.lastError})`,
      );
    }
  }

  _markUp() {
    if (this.downSince) {
      console.log(
        new Date().toISOString(),
        `[redis] reconnected after ${Math.round((Date.now() - this.downSince) / 1000)}s`,
      );
    }
    this.isConnected = true;
    this.connectionFailed = false;
    this.downSince = null;
    this.lastError = null;
  }

  /** Create the client once and start connecting; never blocks. */
  _start() {
    if (this.client || this.closing) return;

    const client = createClient(buildConfig());

    // An 'error' listener is mandatory (otherwise the process crashes);
    // the reconnect strategy, not this handler, drives recovery.
    client.on("error", (error) => this._markDown(error));
    client.on("ready", () => this._markUp());
    client.on("reconnecting", () => {
      this.isConnected = false;
    });
    client.on("end", () => {
      this.isConnected = false;
    });

    this.client = client;
    this.connecting = client.connect().catch((error) => {
      // Only reached if the client is closed while connecting; ordinary
      // failures are retried by reconnectStrategy.
      this._markDown(error);
    });
  }

  /**
   * Resolve to the client once it is ready, or null if it is not ready
   * within `waitMs`. Hot paths never call this with a wait — see _ready().
   */
  async connect(waitMs = 5000) {
    this._start();
    if (this.client?.isReady) return this.client;
    if (!waitMs) return null;

    await Promise.race([
      this.connecting,
      new Promise((resolve) => setTimeout(resolve, waitMs).unref?.()),
    ]);
    return this.client?.isReady ? this.client : null;
  }

  /** Synchronous: the live client, or null if Redis is not usable right now. */
  _ready() {
    this._start();
    return this.client?.isReady ? this.client : null;
  }

  /** Snapshot for health/readiness reporting. */
  status() {
    return {
      ready: !!this.client?.isReady,
      downSince: this.downSince ? new Date(this.downSince).toISOString() : null,
      lastError: this.lastError,
    };
  }

  /**
   * A second connection for SUBSCRIBE (a subscribed connection cannot run
   * other commands). Same config and reconnect strategy; node-redis
   * re-subscribes automatically after a reconnect. Returns null on failure.
   */
  createSubscriber() {
    try {
      this._start();
      if (!this.client) return null;
      // Offline queue ON for the subscriber (unlike the main client): it is
      // never on a request path, and SUBSCRIBE issued before the first
      // connect must be queued rather than rejected.
      const sub = this.client.duplicate({ disableOfflineQueue: false });
      sub.on("error", () => {}); // state/logging is owned by the main client
      sub.connect().catch(() => {});
      this.subscribers.push(sub);
      return sub;
    } catch {
      return null;
    }
  }

  async publish(channel, message) {
    try {
      const client = this._ready();
      if (!client) return false;
      await client.publish(channel, message);
      return true;
    } catch {
      return false;
    }
  }

  async get(key) {
    try {
      const client = this._ready();
      if (!client) return null;

      const result = await client.json.get(key);
      return result;
    } catch (error) {
      return null;
    }
  }

  async set(
    key,
    value,
    ttlSeconds = parseInt(process.env.REDIS_DEFAULT_TTL) || 3600,
  ) {
    try {
      const client = this._ready();
      if (!client) return false;

      await client.json.set(key, "$", value);
      if (ttlSeconds) {
        await client.expire(key, ttlSeconds);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async del(key) {
    try {
      const client = this._ready();
      if (!client) return null;

      await client.del(key);
      return true;
    } catch (error) {
      return null;
    }
  }

  async delMany(keys = []) {
    try {
      if (!Array.isArray(keys) || keys.length === 0) {
        return 0;
      }

      const client = this._ready();
      if (!client) return 0;

      return await client.del(keys);
    } catch (error) {
      return 0;
    }
  }

  async keys(pattern) {
    try {
      const client = this._ready();
      if (!client) return [];

      return await client.keys(pattern);
    } catch (error) {
      return [];
    }
  }

  async ttl(key) {
    try {
      const client = this._ready();
      if (!client) return null;

      return await client.ttl(key);
    } catch (error) {
      return null;
    }
  }

  async type(key) {
    try {
      const client = this._ready();
      if (!client) return null;

      return await client.type(key);
    } catch (error) {
      return null;
    }
  }

  async getString(key) {
    try {
      const client = this._ready();
      if (!client) return null;

      return await client.get(key);
    } catch (error) {
      return null;
    }
  }

  async setString(
    key,
    value,
    ttlSeconds = parseInt(process.env.REDIS_DEFAULT_TTL) || 3600,
  ) {
    try {
      const client = this._ready();
      if (!client) return false;

      await client.set(key, value);
      if (ttlSeconds) {
        await client.expire(key, ttlSeconds);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close every connection (main + subscribers) and stop reconnecting. Used
   * by graceful shutdown. close() lets in-flight commands finish; destroy()
   * is the fallback for a socket that is not connected.
   */
  async disconnect() {
    this.closing = true;
    const clients = [this.client, ...this.subscribers].filter(Boolean);
    this.subscribers = [];
    await Promise.all(
      clients.map(async (c) => {
        try {
          if (c.isOpen && typeof c.close === "function") await c.close();
          else if (typeof c.destroy === "function") c.destroy();
          else if (typeof c.disconnect === "function") await c.disconnect();
        } catch (error) {
          console.error("Redis disconnect error:", error?.message || error);
        }
      }),
    );
    this.isConnected = false;
  }

  generateKey(prefix, ...params) {
    if (params.length === 0) {
      return prefix;
    }

    const sanitizedParams = params.map((param) =>
      String(param).replace(/[^a-zA-Z0-9-_]/g, "_"),
    );
    return `${prefix}:${sanitizedParams.join(":")}`;
  }
}

// Create a singleton instance
const redisClient = new RedisClient();

// Auto-connect on module load so the connection status is visible at startup
redisClient.connect().then((client) => {
  if (client) {
    console.log("Redis connected successfully");
  } else {
    console.log(
      "Redis unavailable — check REDIS_HOST / REDIS_PORT / REDIS_PASSWORD",
    );
  }
});

export default redisClient;
