import { createClient } from "redis";
require("dotenv").config();

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionFailed = false;
  }

  async connect() {
    try {
      if (this.client && this.isConnected) {
        return this.client;
      }

      if (this.connectionFailed) {
        return null;
      }

      const redisConfig = {
        socket: {
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.REDIS_PORT) || 6379,
          connectTimeout: 5000,
        },
      };

      // Add password if provided
      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }

      this.client = createClient(redisConfig);

      this.client.on("error", (error) => {
        // Only set connectionFailed on first error to prevent spam
        if (!this.connectionFailed) {
          console.log("Redis connection error:", error.message);
          this.isConnected = false;
          this.connectionFailed = true;
          this.client.disconnect().catch(() => {}); // Ignore disconnect errors
          this.client = null;
        }
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        this.connectionFailed = false;
      });

      this.client.on("ready", () => {
        this.isConnected = true;
        this.connectionFailed = false;
      });

      this.client.on("end", () => {
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      this.isConnected = false;
      this.connectionFailed = true;

      this.client.disconnect().catch(() => {}); // Ignore disconnect errors
      this.client = null;

      return null;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return null;
      }

      const result = await this.client.json.get(key);
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
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return false;
      }

      await this.client.json.set(key, "$", value);
      if (ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return null;
      }

      await this.client.del(key);
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

      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return 0;
      }

      return await this.client.del(keys);
    } catch (error) {
      return 0;
    }
  }

  async keys(pattern) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return [];
      }

      return await this.client.keys(pattern);
    } catch (error) {
      return [];
    }
  }

  async ttl(key) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return null;
      }

      return await this.client.ttl(key);
    } catch (error) {
      return null;
    }
  }

  async type(key) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return null;
      }

      return await this.client.type(key);
    } catch (error) {
      return null;
    }
  }

  async getString(key) {
    try {
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return null;
      }

      return await this.client.get(key);
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
      if (!this.isConnected && !this.connectionFailed) {
        await this.connect();
      }

      if (!this.client || !this.isConnected) {
        return false;
      }

      await this.client.set(key, value);
      if (ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        this.isConnected = false;
      }
    } catch (error) {
      console.error("Redis disconnect error:", error);
    }
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
