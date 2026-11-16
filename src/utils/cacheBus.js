import crypto from "crypto";
import redisClient from "./redis";

/**
 * Cross-instance cache invalidation over Redis pub/sub.
 *
 * Several caches live in each process's memory (the Wrike credentials map in
 * src/utils/wrikeCredentials.js, the L1 tier of src/utils/environmentAccessCache.js
 * and src/utils/matrixCache.js). Invalidating them used to reach only the
 * instance that performed the write; every other instance kept serving the
 * old answer until its own TTL ran out — or, for the credentials map, until
 * it was restarted. This bus carries the invalidation to every instance.
 *
 * Contract:
 *   broadcast(topic, data)  fire-and-forget; never throws, never awaits Redis
 *                           longer than one PUBLISH.
 *   subscribe(topic, fn)    fn(data) runs on every OTHER instance that
 *                           receives `topic`. The sender has already applied
 *                           the change locally, so its own messages are
 *                           ignored — which also makes loops impossible.
 *
 * Best effort by design: if Redis is down a broadcast is simply lost. Every
 * cache on the bus therefore keeps its own bound on staleness (short L1 TTLs,
 * the periodic credentials resync), and the bus only makes the common case
 * immediate.
 */

export const CHANNEL = process.env.CACHE_BUS_CHANNEL || "xpi:cache-bus";

// Identifies this process so it can skip its own messages.
export const INSTANCE_ID = crypto.randomUUID();

const handlers = new Map(); // topic -> Set<fn>
let subscriber = null;

const dispatch = (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || msg.from === INSTANCE_ID || typeof msg.topic !== "string") return;

  const fns = handlers.get(msg.topic);
  if (!fns) return;
  for (const fn of fns) {
    Promise.resolve()
      .then(() => fn(msg.data))
      .catch((err) =>
        console.warn(
          new Date().toISOString(),
          `[cache-bus] handler for "${msg.topic}" failed: ${err?.message || err}`,
        ),
      );
  }
};

// One subscriber connection per process, opened on first subscribe().
const ensureSubscriber = () => {
  if (subscriber || process.env.CACHE_BUS_DISABLED === "true") return;
  if (typeof redisClient?.createSubscriber !== "function") return;
  subscriber = redisClient.createSubscriber();
  if (!subscriber) return;
  // The subscriber has its offline queue enabled (see createSubscriber), so
  // this is queued until it connects, and node-redis re-subscribes after
  // every reconnect.
  subscriber.subscribe(CHANNEL, dispatch).catch((err) =>
    console.warn(
      new Date().toISOString(),
      `[cache-bus] subscribe failed: ${err?.message || err}`,
    ),
  );
};

export const subscribe = (topic, fn) => {
  if (!handlers.has(topic)) handlers.set(topic, new Set());
  handlers.get(topic).add(fn);
  ensureSubscriber();
};

export const broadcast = (topic, data = null) => {
  if (process.env.CACHE_BUS_DISABLED === "true") return;
  if (typeof redisClient?.publish !== "function") return;
  try {
    const message = JSON.stringify({ from: INSTANCE_ID, topic, data });
    Promise.resolve(redisClient.publish(CHANNEL, message)).catch(() => {});
  } catch {
    // A broadcast must never fail the write that triggered it.
  }
};

/** Test hook: feed a raw message through the dispatcher. */
export const __dispatchForTest = dispatch;
