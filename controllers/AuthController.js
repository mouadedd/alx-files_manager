import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, resp) {
    const authData = req.header('Authorization');
    let userMail = authData.split(' ')[1];
    const buff = Buffer.from(userMail, 'base64');
    userMail = buff.toString('ascii');
    const data = userMail.split(':');
    if (data.length !== 2) {
      resp.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const hashPass = sha1(data[1]);
    const users = dbClient.db.collection('users');
    users.findOne({ email: data[0], password: hashPass }, async (err, user) => {
      if (user) {
        const token = uuidv4();
        const key = `auth_${token}`;
        await redisClient.set(key, user._id.toString(), 60 * 60 * 24);
        resp.status(200).json({ token });
      } else {
        resp.status(401).json({ error: 'Unauthorized' });
      }
    });
  }

  static async getDisconnect(req, resp) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const id = await redisClient.get(key);
    if (id) {
      await redisClient.del(key);
      resp.status(204).json({});
    } else {
      resp.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = AuthController;
