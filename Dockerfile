FROM xream/sub-store:latest

# 切换到工作目录
WORKDIR /opt/app

# 复制 package.json 并安装依赖
COPY package.json ./
RUN npm install --production

# 复制 R2 适配器和启动脚本
COPY r2-fs-adapter.js ./
COPY start-with-r2.js ./

# 设置环境变量
ENV NODE_ENV=production

# 暴露端口
EXPOSE 10000

# 启动命令
CMD ["node", "start-with-r2.js"]
