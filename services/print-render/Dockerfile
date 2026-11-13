# 渲染服务镜像：构建上下文为 monorepo 仓库根目录。
#   构建命令（在仓库根执行）：
#   docker build -f services/print-render/Dockerfile -t worm-vue3-print-render .
# core 经 npm workspace 本地软链，无需从 npm registry 安装。
FROM mcr.microsoft.com/playwright:v1.60.0-noble

ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
ENV PORT=3001

# 安装中文字体（基础镜像已内置与 playwright 匹配的 Chromium）
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    fontconfig \
  && fc-cache -f \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 根清单与 lock（.npmrc 禁用 playwright 自动下载浏览器，镜像内使用基础镜像内置 Chromium）
COPY package.json package-lock.json .npmrc ./
# 全部 workspace（print-core / print-canvas / print-echarts / print-render）源码；
# node_modules 与 dist 由 .dockerignore 排除；scripts/ 是各包构建脚本（注入版权头）的依赖
COPY packages ./packages
COPY services ./services
COPY scripts ./scripts

# 安装 workspace 依赖，构建 core → canvas → echarts → render：
# - render 依赖 core 与 @worm-vue3-print/echarts（图表执行器 IIFE）；
# - echarts 包的类型声明构建（vue-tsc）需要 canvas 的 dist 类型，故先构建 canvas；
# - 镜像里 NODE_ENV=production，构建期必须显式装 devDependencies（tsup/vite/vue-tsc），构建完再 prune。
RUN npm ci --include=dev \
  && npm run build -w @worm-vue3-print/core \
  && npm run build -w @worm-vue3-print/canvas \
  && npm run build -w @worm-vue3-print/echarts \
  && npm run build -w @worm-vue3-print/render \
  && npm prune --omit=dev

EXPOSE 3001

CMD ["node", "services/print-render/dist/server.js"]
