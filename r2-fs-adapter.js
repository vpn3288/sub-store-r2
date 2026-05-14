/**
 * Sub-Store R2 文件系统适配器
 * 将文件系统操作转换为 R2 对象存储操作
 */

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

class R2FileSystemAdapter {
  constructor(config) {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
    this.basePath = config.basePath || '/data';
    
    // 内存缓存
    this.cache = new Map();
    this.cacheTimeout = 5000;
    
    console.log(`[R2-FS] 初始化 - Bucket: ${this.bucketName}`);
  }

  _pathToKey(filePath) {
    let key = filePath.replace(this.basePath, '').replace(/^\/+/, '');
    return key || 'root';
  }

  async readFile(filePath, encoding = 'utf8') {
    const key = this._pathToKey(filePath);
    
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString('utf8');
      
      this.cache.set(key, { data, time: Date.now() });
      
      return encoding === 'utf8' ? data : Buffer.from(data);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        err.code = 'ENOENT';
        throw err;
      }
      throw error;
    }
  }

  async writeFile(filePath, data, encoding = 'utf8') {
    const key = this._pathToKey(filePath);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: typeof data === 'string' ? Buffer.from(data, encoding) : data,
      ContentType: 'application/json',
    });

    await this.s3Client.send(command);
    this.cache.set(key, { data, time: Date.now() });
  }

  async exists(filePath) {
    const key = this._pathToKey(filePath);
    
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  async unlink(filePath) {
    const key = this._pathToKey(filePath);
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }));
    this.cache.delete(key);
  }

  async readdir(dirPath) {
    const prefix = this._pathToKey(dirPath);
    
    const response = await this.s3Client.send(new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix ? `${prefix}/` : '',
      Delimiter: '/',
    }));
    
    const files = [];
    
    if (response.Contents) {
      for (const item of response.Contents) {
        const name = item.Key.replace(`${prefix}/`, '').replace(/\/$/, '');
        if (name) files.push(name);
      }
    }
    
    if (response.CommonPrefixes) {
      for (const item of response.CommonPrefixes) {
        const name = item.Prefix.replace(`${prefix}/`, '').replace(/\/$/, '');
        if (name) files.push(name);
      }
    }
    
    return files;
  }

  async mkdir(dirPath, options = {}) {
    return Promise.resolve();
  }

  async stat(filePath) {
    const key = this._pathToKey(filePath);
    
    try {
      const response = await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));
      
      return {
        isFile: () => true,
        isDirectory: () => false,
        size: response.ContentLength,
        mtime: response.LastModified,
      };
    } catch (error) {
      const err = new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
      err.code = 'ENOENT';
      throw err;
    }
  }
}

module.exports = R2FileSystemAdapter;
