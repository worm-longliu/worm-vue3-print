# demo 托管的测试字体

联调用三款公开字体（**OFL-1.1，可自由再分发**），字型与宋体/黑体差异极大，出图或预览里只要没换上，肉眼立刻能发现：

| 字体 | 族名（`family`） | 文件 | 视觉特征 |
|---|---|---|---|
| 马善政毛笔楷书 | `Ma Shan Zheng` | `MaShanZheng-Regular.ttf` | 毛笔楷书，笔画粗细对比强烈 |
| 站酷快乐体 | `ZCOOL KuaiLe` | `ZCOOLKuaiLe-Regular.ttf` | 圆润卡通，字面饱满 |
| 站酷庆科黄油体 | `ZCOOL QingKe HuangYou` | `ZCOOLQingKeHuangYou-Regular.ttf` | 粗壮压缩，横细竖粗 |

下载（幂等，已存在会跳过；`--force` 覆盖）：

```bash
node scripts/fetch-test-fonts.mjs
```

文件只落在这里，**已在仓库根 `.gitignore` 中忽略**，不会进仓库，也不进 npm 发布产物。

## 各端如何取到这里的文件

| 端 | 解析结果 | 前提 |
|---|---|---|
| 浏览器（设计器画布 / 预览 / 浏览器打印） | `http://localhost:9303/fonts/<file>.woff2` | 同源，直接命中，无 CORS 问题 |
| 服务端（`services/print-render`） | `fontBaseUrl` + `/fonts/<file>.woff2` | demo 传 `FONT_BASE_URL`（默认站点 origin）；容器部署改成容器可达地址，如 `http://host.docker.internal:9303`（Linux 需 `--add-host=host.docker.internal:host-gateway`），或用环境变量 `FONT_BASE_URL` 统一指定 |
| 桌面客户端 | 同上，取 SDK `print(..., { fontBaseUrl })` / `renderInBrowser` 的基址 | 客户端所在机器能访问该地址 |

## 注意

- 只把文件放进目录还不够：**文件名必须与 `DESIGNER_FONTS` 的 `url` 完全一致**，否则 404 后会静默回退到兜底字体（`FontFace` 加载失败不阻断出图）。
- 字体基址与图片基址已解耦：图片用 `RENDER_BASE_URL`，字体用 `FONT_BASE_URL`（`src/App.vue`，默认站点 origin，可用 `VITE_FONT_BASE_URL` 覆盖）；
  浏览器预览不拼基址，相对路径直接按站点同源解析。
- **字体文件必须允许跨源加载**：出图端加载模板 HTML 时的 origin 不是本站点（render 为 `null`、客户端为应用协议），
  缺少 `Access-Control-Allow-Origin` 会让字体静默回退。demo 的 `vite.config.ts` 已为 dev server 加上该响应头；生产需在字体站点/CDN 上配置。
- 字重需要在声明里逐条给出。模板里元素用 `bold` 而声明只有 400 时，Chromium 会合成粗体，字形宽度与真粗体不同，分页会与浏览器不一致。上面三款只有 400 一个字重。
- 生产环境建议换成 woff2（体积约为 ttf 的一半）。本目录为省去构建期工具直接用 ttf，Chromium 三端都支持。
- 商业字体（微软雅黑、黑体、华文仿宋、娃娃体等）不可再分发：要用就由宿主自行提供 `url`，别放进本目录。
