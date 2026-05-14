#!/usr/bin/env node

/**
 * Sub-Store 启动脚本（R2 存储版本 - 支持同步方法）
 */

console.log('='.repeat(60));
console.log('[DEBUG] Sub-Store R2 启动脚本开始执行');
console.log('='.repeat(60));

// 1. 打印所有环境变量
console.log('\n[DEBUG] 检查环境变量:');
console.log('  R2_ENDPOINT:', process.env.R2_ENDPOINT ? '✅ 已设置' : '❌ 未设置');
console.log('  R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID ? '✅ 已设置' : '❌ 未设置');
console.log('  R2_SECRET_ACCESS_KEY:', process.env.R2_SECRET_ACCESS_KEY ? '✅ 已设置' : '❌ 未设置');
console.log('  R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME || '❌ 未设置');
console.log('  SUB_STORE_DATA_BASE_PATH:', process.env.SUB_STORE_DATA_BASE_PATH || '/data');

// 2. 验证配置
const r2Config = {
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'sub-store-data',
  basePath: process.env.SUB_STORE_DATA_BASE_PATH || '/data',
};

if (!r2Config.endpoint || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
  console.error('\n[ERROR] R2 配置不完整！');
  console.error('缺少的环境变量:');
  if (!r2Config.endpoint) console.error('  - R2_ENDPOINT');
  if (!r2Config.accessKeyId) console.error('  - R2_ACCESS_KEY_ID');
  if (!r2Config.secretAccessKey) console.error('  - R2_SECRET_ACCESS_KEY');
  console.error('\n请在 Render Dashboard 设置这些环境变量');
  process.exit(1);
}

console.log('\n[DEBUG] R2 配置验证通过');
console.log('  Endpoint:', r2Config.endpoint);
console.log('  Bucket:', r2Config.bucketName);
console.log('  BasePath:', r2Config.basePath);

// 3. 加载 R2 适配器
console.log('\n[DEBUG] 加载 R2 文件系统适配器...');

const Module = require('module');
const R2FileSystemAdapter = require('./r2-fs-adapter');

// 创建 R2 适配器实例
let r2Adapter;
try {
  r2Adapter = new R2FileSystemAdapter(r2Config);
  console.log('[DEBUG] ✅ R2 适配器创建成功');
} catch (error) {
  console.error('[ERROR] R2 适配器创建失败:', error.message);
  process.exit(1);
}

// 4. 拦截 fs 模块
console.log('[DEBUG] 注入 fs 模块拦截器...');

const originalRequire = Module.prototype.require;
let interceptCount = 0;

Module.prototype.require = function(id) {
  if (id === 'fs' || id === 'node:fs') {
    const originalFs = originalRequire.apply(this, arguments);
    
    console.log('[DEBUG] ✅ fs 模块被拦截');
    
    return new Proxy(originalFs, {
      get(target, prop) {
        const asyncMethods = ['readFile', 'writeFile', 'unlink', 'readdir', 'mkdir', 'stat'];
        const syncMethods = ['readFileSync', 'writeFileSync', 'unlinkSync', 'readdirSync', 'mkdirSync', 'statSync', 'existsSync'];
        
        // 拦截异步方法
        if (asyncMethods.includes(prop) && typeof r2Adapter[prop] === 'function') {
          return function(...args) {
            const filePath = args[0];
            
            if (typeof filePath === 'string' && filePath.startsWith(r2Config.basePath)) {
              interceptCount++;
              console.log(`[R2] 拦截 ${prop}(${filePath}) [#${interceptCount}]`);
              
              return r2Adapter[prop].apply(r2Adapter, args)
                .then(result => {
                  console.log(`[R2] ✅ ${prop} 成功`);
                  return result;
                })
                .catch(error => {
                  console.error(`[R2] ❌ ${prop} 失败:`, error.message);
                  throw error;
                });
            }
            
            return target[prop].apply(target, args);
          };
        }
        
        // 拦截同步方法 - 转换为同步调用
        if (syncMethods.includes(prop)) {
          const asyncMethod = prop.replace('Sync', '');
          
          if (typeof r2Adapter[asyncMethod] === 'function') {
            return function(...args) {
              const filePath = args[0];
              
              if (typeof filePath === 'string' && filePath.startsWith(r2Config.basePath)) {
                interceptCount++;
                console.log(`[R2] 拦截同步方法 ${prop}(${filePath}) [#${interceptCount}]`);
                
                // 使用 deasync 将异步转同步
                const deasync = require('deasync');
                let result;
                let error;
                let done = false;
                
                r2Adapter[asyncMethod].apply(r2Adapter, args)
                  .then(res => {
                    result = res;
                    done = true;
                    console.log(`[R2] ✅ ${prop} 成功`);
                  })
                  .catch(err => {
                    error = err;
                    done = true;
                    console.error(`[R2] ❌ ${prop} 失败:`, err.message);
                  });
                
                // 等待异步完成
                while (!done) {
                  deasync.sleep(10);
                }
                
                if (error) throw error;
                return result;
              }
              
              return target[prop].apply(target, args);
            };
          }
        }
        
        return target[prop];
      }
    });
  }
  
  return originalRequire.apply(this, arguments);
};

console.log('[DEBUG] ✅ fs 拦截器已注入（支持同步方法）');

// 5. 启动 Sub-Store
console.log('\n[DEBUG] 启动 Sub-Store...');
console.log('='.repeat(60));

try {
  require('/opt/app/sub-store.bundle.js');
} catch (error) {
  console.error('[ERROR] Sub-Store 启动失败:', error);
  process.exit(1);
}
