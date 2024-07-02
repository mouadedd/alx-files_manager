import Queue from 'bull';

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:5000');
const userQueue = new Queue('userQueue', 'redis://127.0.0.1:5000');

