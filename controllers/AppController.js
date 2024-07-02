import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static getStatus(req, resp) {
    resp.status(200).json({ redis: redisClient.isAlive(), db: dbClient.isAlive() });
  }

  static async getStats(req, resp) {
    const nUser = await dbClient.nbUsers();
    const nFile = await dbClient.nbFiles();
    resp.status(200).json({ users: nUser, files: nFile });
  }
}

module.exports = AppController;
