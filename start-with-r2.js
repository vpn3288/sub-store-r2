#!/usr/bin/env node

/**
 * Sub-Store 启动脚本（R2 存储版本）
 * 在启动前注入 R2 文件系统适配器
 */

const Module = require('module');
const R2FileSystemAdapter = require('./r2-fs-adapter');

// R2 配置
const r2Config = {
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'sub-store-data',
  basePath: process.env.SUB_STORE_DATA_BASE_PATH || '/data',
};

// 创建 R2 适配器实例
const r2Adapter = new R2FileSystemAdapter(r2Config);

// 拦截 fs 模块
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'fs' || id === 'node:fs') {
    const originalFs = originalRequire.apply(this, arguments);
    
    // 创建代理对象，混合原生 fs 和 R2 适配器
    return new Proxy(originalFs, {
      get(target, prop) {
        // 如果 R2 适配器有这个方法，优先使用
        if (typeof r2Adapter[prop] === 'function') {
          return r2Adapter[prop].bind(r2Adapter);
        }
        
        // 否则使用原生 fs
        return target[prop];
      }
    });
  }
  
  return originalRequire.apply(this, arguments);
};

console.log('[Sub-Store-R2] R2 文件系统适配器已注入');
console.log(`[Sub-Store-R2] Bucket: ${r2Config.bucketName}`);
console.log(`[Sub-Store-R2] BasePath: ${r2Config.basePath}`);

// 启动 Sub-Store
require('/opt/app/sub-store.bundle.js');
