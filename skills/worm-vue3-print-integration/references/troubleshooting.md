# 常见问题排查

先区分安装方式：NPM 包、`file:` 构建产物、Vite 源码别名。三种方式的问题定位完全不同。

## 组件渲染为空白或样式异常

1. 确认已导入一次样式。
   - NPM/`file:`：`import '@worm-vue3-print/canvas/style.css'`
   - Vite 源码别名：`import '@worm-vue3-print/canvas/native-controls.css'`
2. 检查导入顺序：全局 CSS 应在页面私有样式之前加载。
3. 检查宿主容器高度；`PrintDesigner` 使用 `height: 100%` 的布局，父级没有高度时画布会塌陷。

## TypeScript 找不到组件或类型

1. 确认从 `@worm-vue3-print/canvas` 导入，而不是深层 `.vue` 文件。
2. 确认 `package.json` 的 `types`/`exports` 能被解析。
3. 清理构建缓存后重新运行 `vue-tsc --noEmit`。
4. `file:`/源码方式必须先在仓库根执行 `npm run build`，确保 `dist` 与当前源码一致。

## NPM 安装后模块或依赖解析失败

1. 检查 Vue：

```bash
npm ls vue
```

   `canvas` 要求 `vue@^3.5.0`。
2. 检查包版本：

```bash
npm ls @worm-vue3-print/core @worm-vue3-print/canvas
```

   同一项目中不应混用不同版本的 `core`。
3. 不要在 NPM 安装中导入 `@worm-vue3-print/canvas/native-controls.css`；该路径只在源码别名模式可用。

## 源码别名不生效

1. 检查 `resolve.alias` 中更具体的 CSS 路径是否写在包名路径之前。
2. 确认路径指向：
   - `packages/print-canvas/src/index.ts`
   - `packages/print-core/src/index.ts`
   - `packages/print-canvas/src/styles/native-controls.css`
3. 确认 Vite 的 `server.fs.allow` 允许读取 monorepo 目录。
4. 确认宿主安装并启用了 `@vitejs/plugin-vue`。
5. 源码别名模式下，宿主需要声明 `dompurify`、`jsbarcode`、`qrcode`。

## `file:` 源码修改没有生效

`file:` 安装消费的是 `packages/*/dist`。回到仓库根执行：

```bash
npm run build
```

然后刷新宿主依赖缓存；必要时重新安装本地包。

## 表格没有数据

1. 检查表格元素的 `options.dataSource` 是否等于字段列表容器 `fieldKey`，例如 `goods`。
2. 检查 `printData.goods` 是否为数组。
3. 明细列表达式必须是完整路径，例如 `{goods.name}`。
4. 表格分页由 `options.tablePagination.enabled` 控制。

## 图片不显示

1. 相对路径需要通过 `base-url` 拼接；检查浏览器 Network 请求。
2. 图片上传必须由宿主实现 `upload-image`，返回可直接访问的 URL。
3. 服务端渲染时确认 `baseUrl` 对渲染进程可访问，且图片服务允许被读取。

## 水印在预览/PDF 里正常，但打印到纸上被放大/错位/平铺错乱

1. 现象：设计器画布、浏览器预览、服务端 PDF 文件都正常；只有**打印出纸**后水印异常——被放大约 3 倍、位置偏移、倾斜方向看起来不对、只铺出零星几块、每页一样。
2. 根因：水印若用 CSS 平铺背景实现（`background-image` + `background-repeat`），Chromium 打印/PDF 后端会把它编译成 **PDF 平铺图案（tiling pattern, PatternType 1）**；PDF 查看器会正确解释图案矩阵，所以文件看起来正常，但打印出纸链路的 RIP（CUPS 过滤器 / 驱动光栅化）按设备空间平铺，忽略图案矩阵——实测放大倍数正是其所在 form 的 CTM 3.125（300dpi ÷ 96px）。
3. 修复规则：水印必须写成**显式矢量瓦片**——core 的 `resolveWatermarkLayout` 按纸张尺寸算出网格，`renderWatermarkLayerHtml` 逐块输出 `<svg class="watermark-tile">`；禁止改回 `background-repeat` / `background-image:url(data:image/svg+xml,...)` 的平铺背景方案。
4. 排查口径：直接 `printToPDF` 产物正常、经打印机出纸异常 = 表达方式问题（平铺图案），不是渲染或纸张尺寸问题；换浏览器打印/服务端渲染都救不了，因为三条链路共用同一份 core HTML。
5. 验证方法（无需真机）：`pdftoppm -r 100` 把出纸产物转 PNG，用自相关量测瓦片周期，应等于设计值（A4 默认密度 68.8mm × 47.6mm），而不是 15mm / 240mm 这类被缩放的值。
6. 回归拦截：单测断言水印层 HTML **不含** `background-repeat`/`background-image`/`data:image/svg`，并断言瓦片数量与坐标（`packages/print-core/src/render/watermark.test.ts`）。

> 历史坑（该实现已废弃，仅作考古）：早期用内联 SVG data-URL 背景时，`url("data:...")` 的裸双引号会截断 `style="..."` 属性，导致预览/打印水印整体消失；改用显式瓦片后此坑不复存在。

## 静默打印报 BUSY / 日志出现「PDF 生成超过 30s」

1. 现象：宿主提交打印后长时间无响应，重试全部返回 `[BUSY] 客户端正在处理其他打印任务，请稍后重试`；客户端日志随后出现 PDF 生成超时。
2. 根因（打印客户端 PDF 通道，Electron 40+）：`webContents.printToPDF` 已移除回调重载，只剩 Promise 形式。旧写法 `printToPDF(options, callback)` 的回调永不触发，返回的 Promise 拒绝又无人接收（错误被静默吞掉），任务只能等超时——串行锁在等待期间不释放，期间所有新任务都被 `BUSY` 拒绝。
3. 第二处根因：`PrintToPDFOptions.pageSize` 的单位是**英寸**（`webContents.print` 的 pageSize 才是微米）。直接把协议里的微米值传进去会得到 210000×297000 英寸的荒诞纸张：Electron 44 直接失败（`Failed to generate PDF: Printing failed`，print compositor 报 `Page reading failed`），Electron 40 则产出 5 万倍尺寸的 PDF。正确写法是 `pageSize = 微米 / 25400`。
4. 修复要求：① 只走 Promise 形式并 `Promise.race` 超时（core `print/errors.ts` 的 `withTimeout` 与 `print/pdf-spec.ts` 已封装）；② 纸张换算为英寸、`margins` 用 `{top,bottom,left,right}`（英寸，零边距）、`printBackground: true`、`preferCSSPageSize: false` 由 core 统一给出，宿主只做透传；③ 任务失败/超时必须释放串行锁，`BUSY` 只应在任务真正进行中返回。
5. 验证方法（无需打印机）：隐藏窗口加载待打印 HTML → `printToPDF` 生成 PDF → `pdfinfo` 看页面尺寸是否为 A4/目标纸张 → `pdftoppm` 转 PNG 后统计水印色（如 `#e60000` 35%）像素占比，应明显大于 0。

## 出纸方向与浏览器/服务端预览不一致（横向被打成纵向）

1. 现象：模板是横向（或宽幅自定义纸），浏览器预览、服务端 PDF 都正常，但桌面客户端静默出纸后纸张方向不对、内容被旋转。
2. 先归类：core 的出纸旋转（`outputRotation`）是烤进内容流并交换 `@page`/`.print-page` 长宽的真旋转，不靠 PDF 的 `/Rotate` 标记，所以产物 PDF 永远是对的——方向不一致只可能出在出纸参数或驱动侧。
3. **先确认接线**：客户端出纸已固定走 Chromium 原生打印（`webContents.print`，界面无开关），下面第 4 节是 **PDF 通路**（`printToPDF` → `lp`）的口径——实现仍保留（仅 macOS / Linux），但要生效必须把 `src/main/print-engine.ts` 的 `ACTIVE_PRINT_ROUTE` 改回 `'pdf'`；Windows 的命令行出纸通路已随外部 SumatraPDF 一并移除。当前通路的排障入口是日志行 `Chromium 原生打印参数`（记录了声明的 `deviceName/pageSize/copies/landscape`）。
4. macOS / Linux（`lp` + CUPS，回退通路）——判据与 Windows 同源：**生效介质的朝向与页面朝向不一致，滤镜就补 90°**。
   - 根因：出纸命令未声明纸张时，CUPS 按队列默认纸张（多为纵向 A4/Letter）处理，宽 > 高的页面被 `pdftops` 自动转向去贴纵向介质。
   - 规则一（纸张，两端通用）：显式下发 `-o media=…`，优先级「宿主指定驱动纸型（`print.paperName`）→ 标准纸型名（A3/A4/A5/Letter/Legal）→ `Custom.<宽>x<高>`（单位：点，`mm × 72 / 25.4`，实测可带小数）」，封装在 `src/main/pdf-printer.ts` 的 `resolveMediaOption`。**标准纸型名只在「页面为纵向序」或「macOS」时使用**——纸型名本身就是纵向介质，Linux 的横向页改按页面真实朝向走 `Custom.`（实测自定义尺寸队列上 MediaBox 由 595×842 变 841.89×595.28 且不写 `/Rotate`）。
   - 规则二（方向，**仅 macOS 且仅当纸张命中标准纸型名**）：`media=A4` 这类标准纸型名**本身就是纵向介质**，横向页只声明它仍被转 90°。macOS 侧再补 `-o orientation-requested=4`，滤镜的实现是「**按声明介质的朝向，把内容转过去贴它**」——实测 297×210 页面配 `media=A4` 时落盘介质为 595×842（纵向 A4）且内容带 `0 1 -1 0 595.14 0.055 cm`，即在一张纵向纸上正立出横向，物理结果正确。封装在 `buildCupsArgs`，只对「宽 > 高、未指定驱动纸型、且纸张走纸型名而非 `Custom.`」的页面下发——纵向页/正方页发了会把介质翻成横向、正立内容反被转 90°（早先「实测该选项会反向旋转」的结论就是这么来的：当时是对纵向页发了 landscape）。
   - 规则三（`Custom.` **三端一律按页面真实朝向声明，不得按纵向序**）：旧口径「macOS 的 `Custom.` 也按短边×长边给出、翻一次才落回真实尺寸」**已被实测推翻**（当时读的是 `pdftops`/PS 路径的 `do_rotate` 日志，与 PDF 出纸路径不同构）。实测 macOS 15.7.8 + CUPS 2.3.4（Apple `cgpdftopdf`，PPD 支持 `CustomPageSize`）：100×75 标签按 `Custom.212.6x283.46` + `orientation-requested=4` 声明时，落盘介质就是 212×283pt 的**纵向页**、内容被补 90°——等于要求打印机换成一张并不存在的纵向纸；改按 `Custom.283.46x212.6` 真序声明则介质=100×75mm、内容正立、产物字节与输入一致（直通）。标签/卷纸/小票这类物理横向的自定义纸张因此必须报真实宽×高。
   - Linux 不发方向请求：cups-filters（1.28.17 实测）把 `orientation-requested=4` 实现为**给页面写 `/Rotate 270` 并交换 MediaBox**，标签机反被打歪；Linux 只靠 `media` 声明，`Custom.<页面真实尺寸>` 在支持自定义尺寸的队列上直接命中且内容正立。
   - 边界：队列 PPD 不支持自定义尺寸时 `Custom.` 会被**静默忽略**并回落队列默认纸张（macOS 的 AirPrint/driverless PPD、Linux 的 `Generic PostScript Printer`、以及 Apple 自带的 `drv:///sample.drv/dymo.ppd` 皆如此——实测 `cupsfilter -p dymo.ppd -m application/vnd.cups-postscript -o media=Custom.283.46x226.77` 出的 `%%PageBoundingBox` 仍是驱动默认 `0 0 81 252`），此时 `media=A4`、`media=Custom.…`、`orientation-requested=4` 三种下发的旋转结果完全一样（实测同一份横向 A4 均被转），**只有驱动里已定义的纸型名能救**——标签场景请让宿主传 `paperName`（如驱动内的 `100x75mm` 定义）。判据只在「队列 PPD 支持自定义尺寸」上成立，接单前先验：`grep -m1 CustomPageSize /etc/cups/ppd/<队列>.ppd`（该文件 0644、无需 sudo）——有 `*CustomPageSize True` 才认 `Custom.`，无匹配（如 `dymo.ppd`）就是会被静默打回默认纸型的那类队列。
   - 附带坑：`printPdfFile` 曾按字段逐个转发分支参数、漏掉 `paper`，导致 `media` 声明实际从未下发。新增平台参数时必须原样透传整个 `options`（`pdf-printer.test.ts` 有转发与分平台方向的回归用例）。
5. Windows（已无命令行出纸通路）：
   - 出纸只有一条：Chromium 原生打印按 core 算出的 `paperMm` 声明自定义纸张（**微米**）后交驱动校验。曾用于命令行出纸的外部 SumatraPDF，连同「启动/握手探测 + 缺失提示 + 一键安装」在 2026-10-17 整体移除（`print-backend.ts`、`sumatra-installer.ts` 已删除，`printPdfFile` 在 win32 直接报错），不要再为它加回任何外部依赖。
   - 判据与其他系统同源，但 Windows 的处置全在驱动层且**不报错**：驱动不接受自定义纸型时自行改判——实测 `Microsoft Print to PDF` 回滚 A4、标签机 Peweglow SU7 夹回驱动表单 273（80×60）、`Adobe PDF` 接受 60×40。所以「方向对、尺寸落到 A4、退出码正常、客户端记 success」是驱动改判的表现，不是渲染错了；正解是在驱动/队列首选项里定纸型（`paperName` 在当前通路不被消费）。取证手段见下一节第 3、5 点（DEVMODE 偏移与每用户默认 vs 机器默认）。
   - 虚拟打印机（`Microsoft Print to PDF`、「导出为 WPS PDF」等要人工给输出文件名的队列）在静默链路下行为不确定：本机同一队列出现过一次成功落盘、一次非零码退出回 `PRINT_FAILED`。排查方向/颜色问题时别拿它当对照机；要拿尺寸正确的产物，用「保留生成的 PDF」那份参考件更可靠。
6. 验证方法（无需真机）：
   - CUPS 离线判据（不提交作业、不出纸）：macOS 用 `cupsfilter -d <队列> -m application/vnd.cups-postscript -o media=… <页>.pdf > /dev/null`，看 stderr 的 `preferredRotation=90`/`do_rotate=90`（`do_rotate=0` 即正立）与 `mediaBox.size`（介质朝向）。**注意这条只反映 PS 路径（`cgpdftops`）**：走 PDF 出纸的队列（driverless/`_ib`、以及下面的 PDFwriter）由 `cgpdftopdf` 处理，实测同一组参数两者的介质结论可以相反，必须量落盘产物本身。Linux 可把队列指向 `file:///tmp/out.ps`（需 `cups-files.conf` 里 `FileDevice Yes`）提交真实作业，取回产物核对：**除了 `pdfinfo` 的 Page size，必须看页面是否被写了 `/Rotate`**——cups-filters 是用 `/Rotate` 实现方向请求的，光看 Page size 会误判。
   - macOS 免真机虚拟队列（本仓库标签矩阵就是这么测的）：装开源 RWTS-PDFwriter（GPL-2.0，`brew install --cask rwts-pdfwriter`；`github.com` 不可达时改用 `gh api -H "Accept: application/octet-stream" "repos/rodyager/RWTS-PDFwriter/releases/assets/<assetId>" > RWTS-PDFwriter.pkg` 取包，sha256 必须等于 cask 登记值，再 `sudo installer -pkg … -target /`）。它装的是 `pdfwriter` 后端（symlink 进 `/usr/libexec/cups/backend`，`setuid(0)`，只收 `%PDF` 魔数）+ 一张 `*cupsFilter: "application/vnd.cups-pdf 0 -"` 且支持 `CustomPageSize`（上限 5m）的 PPD；因 `/usr/share/cups/mime/apple.convs` 有 `application/pdf → application/vnd.cups-pdf 25 cgpdftopdf`，**直通不等于跳过判定**，介质/方向决策与真机 PDF 队列同源。产物落 `/var/spool/pdfwriter/<用户>/<作业标题>.pdf`（0600、属主为打印者），故用 `lp -d PDFwriter -t <用例id> -o media=… 页.pdf` 投递即可按标题取件。判据两件套：逐页量 `/MediaBox` 与 `/Rotate`（PDFKit：`swift pdfmetrics.swift`），再解内容流查有无 `0 1 -1 0 … cm` 的 90° 矩阵——`strings -n 6 产物.pdf | grep ' cm'`；介质等于请求的 mm 且无该矩阵，才算「正立出在正确纸张上」。装完注意 postinstall 会重启 cupsd（真机队列短暂中断、作业只排队不丢），默认打印机不变；卸载 `/Library/Printers/RWTS/PDFwriter/uninstall`。
   - 真机：`lp -d <队列> -o media=<纸型> out.pdf` 打印后用 `pdfinfo`/`pypdf` 检查 `/Rotate` 是否为 0，`pdftoppm` 转 PNG 确认宽高比（如 A4 横向应为 1169×827）。
   - Windows（当前通路无需外部工具）：直接看日志 `Chromium 原生打印参数` 里声明的 `pageSize`（微米）是否等于模板配置，再取「保留生成的 PDF」量 `MediaBox`（SumatraPDF 打开 PDF 按 `Ctrl+D` 看 Page size 的用法随该依赖一起作废）。
   - 通用前提：先确认产物 PDF 自身的页面尺寸/方向正确（客户端配置勾「保留生成的 PDF」，任务记录页可取绝对路径）。

## 浏览器里纸张大小正确、客户端静默打印纸型不对

1. 先认清差异的位置：两条链路的**版面几何同源**（都是 core 产出的最终 HTML，`@page` 与元素 mm 定位一致），区别只在「谁向驱动声明纸张」：
   - 浏览器 `window.print()`：Chromium 把 `@page` 尺寸折进打印参数并走驱动校验，纸型跟着页面走；
   - 客户端当前出纸：**与浏览器同一条管线**（同一份 HTML、同一套 `pageSize` 声明），所以这条差异在客户端侧已经消除；历史上的 `printRoute: 'pdf'`（HTML → `printToPDF` → 系统命令，Windows 不声明任何纸张、纸型由队列默认表单接走）只在回退接线后才遇到。若两者现在仍不一致，来源只剩三处：三端字体/数据/模板不同、宿主显式传了不同的纸张覆盖、驱动对同一份声明的处置不同（见第 3 点）。
2. 实现位置 `src/main/html-printer.ts`：每任务一个隐藏窗口载入 HTML，等待字体/图片就绪（兜底 5s）后 `webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' }, pageSize })`。**`pageSize` 单位是微米**（协议与 `print.paperSize` 同口径；注意 `printToPDF` 用英寸，两处不能混），值取自 core 的 `paperMm`；`margins`/`paperName` 覆盖项在这条通路不被消费（边距由 HTML 自控）。
3. 边界换了位置，没有消失：声明自定义纸张后由**驱动**裁决，不接受就夹回。本机对 `DocumentProperties` 的驱动级实测（DEVMODEW 偏移 `dmSize=68 / dmFields=72 / dmOrientation=76 / dmPaperSize=78 / dmPaperLength=80 / dmPaperWidth=82`，尺寸单位 0.1mm，`DMPAPER_USER=256`）：
   - `Adobe PDF`：接受 60×40（回执 `dmPaperSize` 保持 256、尺寸原样保留）；其队列默认是 Acrobat 的伪值 `32767` + 210×297；
   - `Microsoft Print to PDF`：**拒绝并回滚 A4**——这正是「方向对、尺寸错落到 A4」的驱动级根因；
   - 「导出为WPS PDF」：吃纸型号不吃尺寸；标签机 `Peweglow SU7`：把自定义夹回驱动表单 273（80×60）。
   判据：`DeviceCapabilities(DC_PAPERS)` 里有没有 256，决定该队列能否接自定义纸型。
4. 验证配对产物：勾选「保留生成的 PDF」时，同一任务会同时产出出纸件与可比对的 PDF 参考件（不勾选则渲染停在准备阶段、不出图）；比对两者与浏览器打印件，可把问题定位到「客户端声明了什么」而不是「渲染错了」。日志行 `Chromium 原生打印参数` 记录本次实际下发参数，任务记录里的 `printRoute` 字段标明该份走的哪条通路（当前恒为 `html`，旧记录无该字段按 `pdf` 理解）。
5. 改队列默认纸型的可用手段（免管理员，仅影响当前用户）：`DocumentPropertiesW(f = DM_UPDATE | DM_IN_BUFFER | DM_OUT_BUFFER)` 写的是 **HKCU\Printers\DevModePerUser** 的每用户默认，实测 Adobe PDF 会落盘 `width=60mm length=40mm`（`dmPaperSize` 被驱动改回它自己的 32767 表达自定义）；而队列的**机器默认**（`Get-PrintConfiguration` 的 `PaperSize`、`DocumentProperties(pInput=NULL)` 的回读）仍是 A4，改它需管理员。因此「调用方读到哪个纸型」取决于它取每用户默认还是机器默认，只能靠真机出纸判定；改前务必备份原 DEVMODE 字节以便还原。

## 先分清「生成 PDF 的问题」还是「打印机/驱动的问题」

1. 在客户端配置窗口勾选**保留生成的 PDF**（`config.json`：`keepGeneratedPdf=true`，可选 `pdfOutputDir`，留空为 `userData/pdf`），「任务记录」页会显示每份 PDF 的绝对路径，配置页可一键打开目录。
2. 用 PDF 阅读器打开保留的 PDF：颜色/方向/分页与浏览器预览一致 → 问题在打印机或驱动（驱动默认单色、队列纸张、RIP 处理等）；PDF 本身就不对 → 问题在渲染或 PDF 生成环节（core HTML、printToPDF 参数）。
3. 该开关默认关闭（打印完即删，不占磁盘）；开启后文件不会自动清理，排查完记得关闭并清理目录。

## 预览页数或分页与最终输出不一致

1. 浏览器和浏览器/服务端必须使用同一份模板 JSON、同一份打印数据和同一个 `baseUrl`。
2. 检查浏览器字体、图片是否加载完成；分页前会等待，但有兜底超时。
3. 比较第一遍测量结果和 `paginate` 输入，不要只看最终 HTML。
4. 服务端 PDF 最终由 monorepo 内的 `services/print-render` 服务负责（经 workspace 软链使用同仓库 core）；先确认 render 服务与浏览器使用一致的 core 代码。

## 调用了组件上不存在的方法/事件

- `PrintDesigner` 只 emit `save`、`preview`，只 expose `getTemplateJson()`。
- 不存在 `back` 事件（返回导航属宿主职责），也不存在 `setTemplateMeta` 方法——若宿主用无类型 `ref` + 可选链调用它，TS 不报错但**静默失效**。模板名称/业务类型/备注等元信息由宿主自行展示和持久化。
- 以包内 `.d.ts`（`dist/components/PrintDesigner.vue.d.ts`）为唯一契约来源，不要信旧文档或 demo README 的过时描述。

## 模板重新进入设计器后是空白模板

1. 回填前先 `JSON.parse(elements)`，并判断 `json.paperSize` 存在才赋给 `initial-template`，否则保留 `createDefaultTemplate()`（损坏/空 elements 会拖垮画布）。
2. 新建模板时 elements 不要留空，服务端应存入 `JSON.stringify(createDefaultTemplate())`。
3. 确认设计器页父容器有确定高度（`height:100%` 链不断）。

## render 微服务相关（服务端 PDF）

- **401 UNAUTHORIZED**：请求头 `X-Render-Key` 与服务端 `RENDER_API_KEY` 不一致；确认密钥只在服务端/代理层注入。
- **504 RENDER_TIMEOUT**：超过服务端 30s 上限；复杂模板先排查图片/字体加载，宿主后端读取超时要 ≥30s（建议 40s）。
- **PDF 中文方块/分页错位**：渲染服务器缺中文字体，装 `fonts-noto-cjk`（或对应中文字体）后重试。
- **图片不显示/403**：渲染进程访问不到图片地址；相对路径用正确的对外 `baseUrl`，内网地址/鉴权图片要保证渲染环境可达。
- **浏览器起不来**：确认 `PLAYWRIGHT_CHROME_PATH`、Linux 已装 Chromium 与 `libnss3 libatk-bridge2.0-0 libx11-xcb1`，容器内使用 `--no-sandbox`（已默认）。
- **前端跨域/密钥泄露**：浏览器不要直连 3001；dev 用 Vite proxy 注入密钥，生产用宿主后端反代。参见 `demo/vite.config.ts`。
- 先用 `GET /health` 判断服务与浏览器池状态，再排查业务请求。

## 静默打印客户端相关（链路 C）

- **`CLIENT_NOT_RUNNING`**：SDK 探测不到本机客户端。确认工位电脑已安装并运行客户端、浏览器与客户端同机（客户端仅监听 `127.0.0.1`）；客户端重启期间 SDK 正在指数退避重连，稍后自动恢复。
- **`UNAUTHORIZED`**：客户端「安全开关」开启后未调用 `client.pair(token)` 配对，或浏览器 Origin 不在白名单。token 在客户端配置窗口查看，不明文进日志。
- **`PRINTER_NOT_FOUND`**：`printerName` 不在本机枚举列表；先 `client.listPrinters()` 拿真实名称（中文名保持一致）。
- **`PRINTER_OFFLINE` / `PRINT_FAILED`**：打印机脱机/缺纸/驱动异常，检查打印机状态；任务记录可在客户端配置窗口查看。
- **`BUSY`**：客户端单任务串行，已有任务在打；宿主侧延时重试或自己排队，客户端不排队。
- **`RENDER_TIMEOUT`**：两遍渲染超过客户端默认 30s；排查模板图片/字体加载，大任务可调大 `timeoutMs`。
- **静默出纸结果与浏览器预览分页不一致**：模板字体需在客户端电脑已安装；同一份 `templateJson + printData + baseUrl`、同一 core 版本。
- **连续纸末尾多走纸/裁切**：驱动对自定义纸高有步进/舍入，客户端探针推导公差不满足时，用 `paperSize.height`（微米）显式覆盖；宽度用 `paperSize.width`。
- **macOS 首次打不开客户端**：绿色版未签名，首次右键 → 打开。

## MCP 实时会话

- **MCP 客户端看不到会话工具**：确认桌面客户端已开启 AI 助手、配置地址与 token 来自设置页，并且浏览器页面已完成模板会话签到。
- **列表中没有当前页面**：检查页面 `PrintClient` 是否连接并 `attachTemplate`，页面关闭后会话立即失效。
- **写回报 `REVISION_CONFLICT`**：重新调用读取工具获取最新模板和 revision，协调差异后再写，不强制覆盖。
- **写回后快照不一致**：给 `initial-template` 赋新引用并等待 `nextTick()`，然后从 `designerRef.getTemplateJson()` 重读，不回显请求对象。
- **卸载后仍收到请求**：在 `onUnmounted` 中 detach、取消状态监听并 close。
- **模型密钥疑似暴露**：MCP 配对 token 不是模型密钥；模型调用与密钥只能留在宿主服务端或用户自己的 MCP 客户端。
