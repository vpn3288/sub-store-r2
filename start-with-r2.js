#!/usr/bin/env node

/**
 * Sub-Store 启动脚本（R2 存储版本）
 * 在启动前注入 R2 文件系统适配器
 */

const Module = require('module');
const R2FileSystemAdapter = require('./r2-fs-adapter');

console.log('[Sub-Store-R2] 正在初始化 R2 文件系统适配器...');

// R2 配置
const r2Config = {
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'sub-store-data',
  basePath: process.env.SUB_STORE_DATA_BASE_PATH || '/data',
};

// 验证配置
if (!r2Config.endpoint || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
  console.error('[Sub-Store-R2] 错误: R2 配置不完整');
  console.error('需要设置环境变量: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

// 创建 R2 适配器实例
const r2Adapter = new R2FileSystemAdapter(r2Config);

// 拦截 fs 模块 - 只拦截数据目录的操作
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'fs' || id === 'node:fs') {
    const originalFs = originalRequire.apply(this, arguments);
    
    // 创建代理对象
    return new Proxy(originalFs, {
      get(target, prop) {
        // 只拦截异步方法，同步方法使用原生 fs
        const asyncMethods = ['readFile', 'writeFile', 'unlink', 'readdir', 'mkdir', 'stat', 'exists'];
        
        if (asyncMethods.includes(prop) && typeof r2Adapter[prop] === 'function') {
          // 返回包装函数，检查路径是否在数据目录
          return function(...args) {
            const filePath = args[0];
            
            // 只有数据目录的操作才使用 R2
            if (typeof filePath === 'string' && filePath.startsWith(r2Config.basePath)) {
              return r2Adapter[prop].apply(r2Adapter, args);
            }
            
            // 其他路径使用原生 fs
            return target[prop].apply(target, args);
          };
        }
        
        // 其他方法使用原生 fs
        return target[prop];
      }
    });
  }
  
  return originalRequire.apply(this, arguments);
};

console.log('[Sub-Store-R2] R2 文件系统适配器已注入');
console.log(`[Sub-Store-R2] Bucket: ${r2Config.bucketName}`);
console.log(`[Sub-Store-R2] BasePath: ${r2Config.basePath}`);
console.log('[Sub-Store-R2] 只有数据目录操作会使用 R2 存储');
console.log('[Sub-Store-R2] 前端文件仍使用本地文件系统');

// 启动 Sub-Store（包括前端和后端）
console.log('[Sub-Store-R2] 启动 Sub-Store...');
require('/opt/app/sub-store.bundle.js');
