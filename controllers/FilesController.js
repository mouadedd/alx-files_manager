import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { ObjectID } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:5000');

class FilesController {
  static async getUser(req) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (userId) {
      const users = dbClient.db.collection('users');
      const idObj = new ObjectID(userId);
      const user = await users.findOne({ _id: idObj });
      if (!user) {
        return null;
      }
      return user;
    }
    return null;
  }

  static async postUpload(req, resp) {
    const user = await FilesController.getUser(req);
    if (!user) {
      return resp.status(401).json({ error: 'Unauthorized' });
    }
    const { name } = req.body;
    const { type } = req.body;
    const { parentId } = req.body;
    const isPublic = req.body.isPublic || false;
    const { data } = req.body;
    if (!name) {
      return resp.status(400).json({ error: 'Missing name' });
    }
    if (!type) {
      return resp.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return resp.status(400).json({ error: 'Missing data' });
    }

    const files = dbClient.db.collection('files');
    if (parentId) {
      const idObj = new ObjectID(parentId);
      const file = await files.findOne({ _id: idObj, userId: user._id });
      if (!file) {
        return resp.status(400).json({ error: 'Parent not found' });
      }
      if (file.type !== 'folder') {
        return resp.status(400).json({ error: 'Parent is not a folder' });
      }
    }
    if (type === 'folder') {
      files.insertOne(
        {userId: user._id, name, type, parentId: parentId || 0, isPublic},
      ).then((result) => resp.status(201).json({
        id: result.insertedId,
        userId: user._id,
        name,
        type,
        isPublic,
        parentId: parentId || 0,
      })).catch((error) => {
        console.log(error);
      });
    } else {
      const fPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fName = `${fPath}/${uuidv4()}`;
      const buf = Buffer.from(data, 'base64');
      try {
        try {
          await fs.mkdir(fPath);
        } catch (error) {
        }
        await fs.writeFile(fName, buf, 'utf-8');
      } catch (error) {
        console.log(error);
      }
      files.insertOne(
        {
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
          localPath: fName,
        },
      ).then((result) => {
        resp.status(201).json(
          {
            id: result.insertedId,
            userId: user._id,
            name,
            type,
            isPublic,
            parentId: parentId || 0,
          },
        );
        if (type === 'image') {
          fileQueue.add(
            {
              userId: user._id,
              fileId: result.insertedId,
            },
          );
        }
      }).catch((error) => console.log(error));
    }
    return null;
  }

  static async getShow(req, resp) {
    const user = await FilesController.getUser(req);
    if (!user) {
      return resp.status(401).json({ error: 'Unauthorized' });
    }
    const fileId = req.params.id;
    const files = dbClient.db.collection('files');
    const idObj = new ObjectID(fileId);
    const file = await files.findOne({ _id: idObj, userId: user._id });
    if (!file) {
      return resp.status(404).json({ error: 'Not found' });
    }
    return resp.status(200).json(file);
  }

  static async getIndex(req, resp) {
    const user = await FilesController.getUser(req);
    if (!user) {
      return resp.status(401).json({ error: 'Unauthorized' });
    }
    const {
      parentId,
      page,
    } = req.query;
    const numPage = page || 0;
    const files = dbClient.db.collection('files');
    let query;
    if (!parentId) {
      query = { userId: user._id };
    } else {
      query = { userId: user._id, parentId: ObjectID(parentId) };
    }
    files.aggregate(
      [
        { $match: query },
        { $sort: { _id: -1 } },
        {
          $facet: {
            metadata: [{ $count: 'total' }, { $addFields: { page: parseInt(numPage, 10) } }],
            data: [{ $skip: 20 * parseInt(numPage, 10) }, { $limit: 20 }],
          },
        },
      ],
    ).toArray((err, result) => {
      if (result) {
        const final = result[0].data.map((file) => {
          const tmpFile = {
            ...file,
            id: file._id,
          };
          delete tmpFile._id;
          delete tmpFile.localPath;
          return tmpFile;
        });
        return resp.status(200).json(final);
      }
      console.log('Error occured');
      return resp.status(404).json({ error: 'Not found' });
    });
    return null;
  }

  static async putPublish(req, resp) {
    const user = await FilesController.getUser(req);
    if (!user) {
      return resp.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const idObj = new ObjectID(id);
    const newVal = { $set: { isPublic: true } };
    const choices = { returnOriginal: false };
    files.findOneAndUpdate({ _id: idObj, userId: user._id }, newVal, choices, (err, file) => {
      if (!file.lastErrorObject.updatedExisting) {
        return resp.status(404).json({ error: 'Not found' });
      }
      return resp.status(200).json(file.value);
    });
    return null;
  }

  static async putUnpublish(req, resp) {
    const user = await FilesController.getUser(req);
    if (!user) {
      return resp.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const idObj = new ObjectID(id);
    const newVal = { $set: { isPublic: false } };
    const choices = { returnOriginal: false };
    files.findOneAndUpdate({ _id: idObj, userId: user._id }, newVal, choices, (err, file) => {
      if (!file.lastErrorObject.updatedExisting) {
        return resp.status(404).json({ error: 'Not found' });
      }
      return resp.status(200).json(file.value);
    });
    return null;
  }

  static async getFile(req, resp) {
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const idObj = new ObjectID(id);
    files.findOne({ _id: idObj }, async (err, file) => {
      if (!file) {
        return resp.status(404).json({ error: 'Not found' });
      }
      console.log(file.localPath);
      if (file.isPublic) {
        if (file.type === 'folder') {
          return resp.status(400).json({ error: "A folder doesn't have content" });
        }
        try {
          let fName = file.localPath;
          const size = req.param('size');
          if (size) {
            fName = `${file.localPath}_${size}`;
          }
          const data = await fs.readFile(fName);
          const contentType = mime.contentType(file.name);
          return resp.header('Content-Type', contentType).status(200).send(data);
        } catch (error) {
          console.log(error);
          return resp.status(404).json({ error: 'Not found' });
        }
      } else {
        const user = await FilesController.getUser(req);
        if (!user) {
          return resp.status(404).json({ error: 'Not found' });
        }
        if (file.userId.toString() === user._id.toString()) {
          if (file.type === 'folder') {
            return resp.status(400).json({ error: "A folder doesn't have content" });
          }
          try {
            let fName = file.localPath;
            const size = req.param('size');
            if (size) {
              fName = `${file.localPath}_${size}`;
            }
            const contentType = mime.contentType(file.name);
            return resp.header('Content-Type', contentType).status(200).sendFile(fName);
          } catch (error) {
            console.log(error);
            return resp.status(404).json({ error: 'Not found' });
          }
        } else {
          console.log(`Wrong user: file.userId=${file.userId}; userId=${user._id}`);
          return resp.status(404).json({ error: 'Not found' });
        }
      }
    });
  }
}

module.exports = FilesController;
