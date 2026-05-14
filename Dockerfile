FROM xream/sub-store:latest

# 安装 AWS SDK for S3 (R2)
RUN npm install -g @aws-sdk/client-s3

# 复制 R2 适配器和启动脚本
COPY r2-fs-adapter.js /opt/app/
COPY start-with-r2.js /opt/app/

# 设置启动命令
CMD ["node", "/opt/app/start-with-r2.js"]
