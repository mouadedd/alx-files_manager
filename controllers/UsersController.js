import sha1 from 'sha1';
import { ObjectID } from 'mongodb';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:5000');

class UsersController {
  static postNew(req, rep) {
    const { email } = req.body;
    const { password } = req.body;

    if (!email) {
      rep.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      rep.status(400).json({ error: 'Missing password' });
      return;
    }

    const users = dbClient.db.collection('users');
    users.findOne({ email }, (err, user) => {
      if (user) {
        rep.status(400).json({ error: 'Already exist' });
      } else {
        const hashPass = sha1(password);
        users.insertOne(
          {
            email,
            password: hashPass,
          },
        ).then((result) => {
          rep.status(201).json({ id: result.insertedId, email });
          userQueue.add({ userId: result.insertedId });
        }).catch((error) => console.log(error));
      }
    });
  }

  static async getMe(req, rep) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (userId) {
      const users = dbClient.db.collection('users');
      const idOb = new ObjectID(userId);
      users.findOne({ _id: idOb }, (err, user) => {
        if (user) {
          rep.status(200).json({ id: userId, email: user.email });
        } else {
          rep.status(401).json({ error: 'Unauthorized' });
        }
      });
    } else {
      rep.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = UsersController;
