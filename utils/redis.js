import { createClient } from 'redis';
import { promisify } from 'util';

/**
 * Redis utils
 */
class RedisClient {
  /**
   * create a redisClient instance.
   */
  constructor() {
    this.client = createClient();
    this.client.on('error', (error) => {
      console.log(`Redis client not connected to server: ${error}`);
    });
  }

  // check connection status
  isAlive() {
    if (this.client.connected) {
      return true;
    }
    return false;
  }

  // returns the Redis value stored for this key
  async get(key) {
    const getKey = promisify(this.client.get).bind(this.client);
    const value = await getKey(key);
    return value;
  }

  // Redis (with an expiration set by the duration argument)
  async set(key, value, duration) {
    const setKey = promisify(this.client.set).bind(this.client);
    await setKey(key, value);
    await this.client.expire(key, duration);
  }

  // remove the value in Redis for this key
  async del(key) {
    const delKey = promisify(this.client.del).bind(this.client);
    await delKey(key);
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
