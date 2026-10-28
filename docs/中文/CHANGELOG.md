# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## V1.3.12(2026-10-27)

### 新增

- **拼版打印支持内容旋转角度**。模板级 `outputRotation` 此前在拼版启用时被**强制归零**（`getOutputPaperDimensions` / `getOutputRotationAngle` / `shouldApplyOutputRotation` 三处都写着「拼版无出纸旋转概念」），属性台也把该行整行隐藏，于是「横版设计、竖版出纸」在拼版下无处设置。现按**每格内容**生效：0°/180° 格位几何不变（仅内容旋转/翻转）；90°/270° 时每格占位宽高互换（70×40 标签变成 40×70 的格），列数上限、行数、每张格数一并按互换后重算，内容整页旋转且不缩放不裁切。实现上拼版几何改取 `getOutputPaperDimensions`（旋转后的出纸尺寸）作为每格占位，格内复用既有转子层；`COLUMNS_OVERFLOW` / `LABEL_TOO_TALL` 文案在 90°/270° 时追加「内容旋转 N°，每格 W×Hmm」，避免把旋转后的尺寸误当设计稿尺寸。两宿主属性台在拼版启用时仍显示「内容旋转角度」（提示改讲每格口径），拼版摘要追加「每格 W×Hmm」。切换旋转档位（0/180 ↔ 90/270）时拼版**列数自动铺满新档位的列数上限**（切回原档位同样回排；同档位内切换不重排，作者手动改小的列数得以保留）。连续纸仍无旋转概念。
  **真实 Chromium 落纸实测**（A4 目标纸 / 70×40 标签 / 2mm 间距）：90° 4 列 → 每格 40×70、4×3=12 格、格位 left 10/52/94/136、次行 top 82，PDF 文本变换矩阵转 90°；90° 2 列 → 每张 6 格、12 条分 2 张；180° 格位与 0° 一致、文本翻转 180°；270° 与 90° 同样互换占位。**存量模板零变化**：未设 `outputRotation` 的拼版模板产物逐字不变（缺省 0°）。
- **元素级任意角度旋转**。元素新增 `options.rotate`（度，绕元素自身中心，归一到 0~359，缺省不旋转）：出纸按旋转后的**外接盒**分页与结算，底部放不下自动移页并按外接盒顶修正落点，连续纸推导高度天然计入外接盒。表格、流式列表与**表格下方跟随区的元素** v1 不支持旋转——属性台不出「旋转 (°)」行、画布也不转（所见即所打）；条码与二维码的任意角度需 385dpi 以上打印头，低分辨率打印机按 90° 步进出纸，且模板未声明打印头分辨率时属性台把自由角度输入置灰、只留 ↺/↻ 两个 90° 步进按钮。渲染走 CSS 独立属性 `rotate`，不占用 `transform`（设计器拖拽与出纸互不覆盖），旧模板残留的 `transform` 键被忽略、出纸与升级前逐字一致。属性台该行接入「恢复默认值」。**实测**：100×20mm 元素 45° 外接盒 84.85×84.85、顶越界 22.43mm 给出提示、换页落点 renderTop=32.43；连续纸 30°/45° 出纸高 128.46/134.03mm；90° 出纸 PDF 文本矩阵 `[0,-9.9975,9.9975,0]` 仍是矢量；条码 203dpi 30° 被吸附为水平、600dpi 放行。
- **出纸裁切提示（旋转与越界）**。分页引擎按页产出 `PageLayout.warnings`：元素旋转后顶越页首、或元素（含旋转外接盒）超出纸面左右缘时给出「打印将被裁切」专条文案。**只提示不阻断**——不改 `overflow` 语义与出纸产物，未越界模板的 `warnings` 为空、HTML 逐字不变。core 另出两个同源入口：`collectFollowMemberIds()`（表格跟随区归属单点，两宿主属性台与画布共用，杜绝「画布会转、出纸不转」的分叉）与 `collectPrintWarnings()`（编辑期预估，无需浏览器实测高）。展示面已接：Vue3 宿主预览层顶部常驻「出纸提示」条，两宿主点保存时给一次不阻断的提示，并各自暴露 `getGeometryWarnings()` 供导出/另存旁路自取；零框架宿主的 `renderInBrowser()` 返回值新增 `warnings` 字段（四宿主同步）。**已知口径差**：保存闸门用设计盒估算高度，长文本/自适应行高的提示可能偏保守，以预览层的实测分页提示为准。

### 修复

- **拼版整页旋转与元素旋转叠加时二维码不受打印头分辨率约束**。`resolveElementRotation()` 的斜角吸附档原本只对 `barcode` 生效——渲染、分页、两宿主画布四处调用都写着「仅条码传 `printerDpi`」，于是 203dpi 工位机上二维码的斜角照样出纸（点阵被阶梯化，扫码风险高），而字段提示语承诺「条码/二维码自动吸附」。现由 `resolveElementRotation()` 自取元素的 `printerDpi`（显式传入的分辨率优先，供出纸端覆盖），四处调用不再各写一份判据；提示语同步改为与实测一致的表述（未声明分辨率时按声明角出纸，故属性台置灰）。

## V1.3.11(2026-10-26)

### 新增

- 文本与长文本元素新增**「保留换行符」**档（`keepLineBreaks`，缺省关）。起因是 Gitee #IKPXQL 的需求2「文本有缩进和换行，打印的时候都会在一行里面」：V1.3.10 把**表格单元格**的断行修好了（`pre-wrap` 三端同源），但**元素级这一路从来没支持过**——`text`/`longText` 的缺省档不输出任何 `white-space`，落回浏览器默认 `normal`，内容里手打的 `\n`、行首空格与连续空格一律折叠成一行；而属性台的表达式预览区是 `white-space: pre-wrap`，于是「面板里看得见分行、画布和纸面都没有」，这正是报告人观感的来源。打开该档后出纸带 `white-space:pre-wrap`：`\n` 各占一行、行首与连续空格原样保留，同时仍按框宽自动换行；与「自动换行」冲突时**单行优先**（`wordWrap === false` 时本档不出声明）。
  判据单点在 core `resolveElementWhiteSpace`（`render/text-fit.ts`，随 `/designer` 导出），出纸 `html-generator`、画布 `TextElement`/`LongTextElement`、print-common `textLikeStyle` 三处消费同一份。刻意**不放进 `elementFitStyle`**：`longText` 的缺省显示形式是 `autoHeight`，而那个函数在 autoHeight 分支提前 `return`，声明放进去会被整条吞掉——用例已把这条坑钉住（把声明移进 `elementFitStyle` 后，`text` 仍绿、两条 `longText` 断言必红，已实测验证）。属性台在「自动换行」下方各加一行，画布与 common 同位置同文案，**开关行沿用既有口径两侧都不挂说明气泡**（避免注册表里出现没人消费的死文案）；「恢复默认值」按派生出厂值判脏，出厂未设即灰态。注册表新 key `ap-keep-line-breaks`，可按「保留换行符 / 换行符 / 手动换行 / 保留空格 / 连续空格 / 行首空格」检索，与「自动换行 / 不换行」互不串台（用例配了双向反面对照）。
  **存量模板与三条出纸链路零变化**：该字段缺省不写键、也不进 `createDefaultOptions`，未打开时不产出任何声明。判据不是推理——用真实两趟管线（Chromium 测量 → 分页 → 最终 HTML）对 **27 份**产物（demo 示例库 11 份可出纸示例 + 15 组元素档位组合 + 1 份单元格矩阵）做改前/改后逐字比对，字节级一致；另有两份拼版示例（`asset-tag`、`roll-label`）在该离线 harness 下出不了纸，属取证局限，不计入比对集。行为变更只在用户显式打开后发生（行数增加会撑高元素并可能牵动分页），故按 **minor** 计。文档已同步 `docs/中文/指南/使用指南.md` 与技能 `print-template-json/references/template-schema.md`——后者原先那句「`wordWrap` 缺省 `true` 时 `\n` 也生效」只对单元格成立，已按实测更正。
- **示例库新增「文本换行与跟随示例」**（示例数 13 → **14**）：一份 A4 模板同时演示本版四条出纸口径——「保留换行符」的多行正文、关自动换行的单行溢出、长文本缺省 1.5 倍行高，以及表格旁侧一栏不会被跟随区拖走。此前 13 份示例对这些组合是**零覆盖**，新能力在 demo 里看不到、`verify-demo` 也断言不到；现补齐并在四宿主加了 9 条断言（画布 `white-space`/`line-height` 三端同值、纸面行数与行高实测，外加静态表格 4 行、`flow-follow` 跟随区、旁侧一栏不进跟随区三条结构断言），`verify-demo` 由 42 项增至 **51 项**。四宿主 `templates.js` 已由 `npm run samples:demo-common` 重新生成。示例落地时实测撞出两处资产缺陷并当场修掉：模板缺 `unit: 'mm'` 会被按 pt 换算而列宽/行高不换算，表格设计底盖住下方元素、跟随区判定失效；表格未设 `tableMode: 'static'` 又无数据，纸面只剩表头一行——三条结构断言在修复前全红、修复后四宿主 51/51。

### 修复

- **表格跟随区里的竖线出纸高度为 0（整条消失）**（Gitee #IKPXQL 同源的台账 T-11 C1）。跟随区（`flow-follow`）的跟随元素只由 `html-generator` 的 `needsHeight` 决定要不要把设计高度写进行内样式，此前只认 `rect`/`oval`/`image`；而 `case 'vline'` 只输出 `border-left` + `width:0`，长度全靠传入的 `height`——于是放在跟随区的竖线在设计器里看得见、纸上 0 高。现把 `vline` 补进该判据。**`hline` 刻意没一起改**：它的 `height:0` 是有意为之（长度走 `width`），已用负面对照用例钉住「跟随区横线仍不出 `height`」。正对照同时钉住 `rect`/`oval`/`image` 照旧出 `height`，防止改 vline 时挪走既有档。真实 Chromium 落纸实测（跟随区同一容器内放 vline 14mm + hline 80mm 做对照）：改前 vline 实际绘制高度 **0px**（整条在纸上不存在）、hline 1px×302.36px 正常；改后 vline **52.91px = 14mm** 精确命中，hline 逐值不变（80mm×1px）——既证实缺陷，也证实「横线不该动」这条边界。**存量影响**：仅影响「表格下方有竖线且该竖线被吸进跟随区」的模板，从整条不印变为按设计长度印出。
- **长文本关掉「自动换行」在出纸端不生效**（台账 T-27，本轮实测撞出的存量分叉）。`text` 关自动换行会出 `white-space:nowrap;text-overflow:ellipsis;`，`longText` 却只出 `overflow:visible;`——根因是 `elementFitStyle()` 在 `fit === 'autoHeight'` 分支提前 `return`，而 `longText` 的缺省显示形式正是 `autoHeight`，那句 nowrap 永远走不到；画布与 print-common 两端都在 `wordWrap === false` 时挂 `nowrap` + 省略号，所以**设计器里单行省略、纸面上照样多行折**。现把两值拼接（`overflow:visible;` 与 `nowrap` 并存，与画布/Common 逐字同形），三端同源。**存量影响（可见行为变更，按 minor 计）**：凡「关了自动换行、又没显式设溢出形式」的文本/长文本，出纸从多行折行变单行；`autoHeight` 的实测高度随之从 N 行收缩为 1 行。**分页落点不因此改变**（此处撤回上一稿「可能牵动分页落点」的说法，已用真实两趟管线实测推翻）：把长文本放到内容底边越出内容区 3mm 的形态，关与不关两档都留在同一页——独立元素按 `top` 归页，`flow-follow` 容器高度取设计几何而非实测值。逐字比对给出范围：31 份产物（demo 示例库 13 份 + 15 组元素档位组合 + 4 种跟随区线型/形状）中 **25 份字节级一致**，差异只多出这一条声明，且仅落在 `wordWrap:false` + `autoHeight` 那 5 组组合上；示例库 13 份全部一致（没有示例用该组合）。发版时需在文档写明触发条件。真实 Chromium 行盒取证（同一段 60mm 宽、78 字长文，`lineHeight:5pt`）：改前 `white-space:normal` → **4 行**、元素高 26.69px；改后 `white-space:nowrap` → **1 行**、元素高 6.67px、内容 `scrollWidth` 816px 横向溢出框宽 226.77px。**如实记一条限制**：`autoHeight` 档保留 `overflow:visible`，而省略号只在裁剪容器里才画得出，所以这一组合的落纸形态是**单行溢出**（不折行、也不截断成「…」），与画布同一形态；需要省略号请把溢出形式显式设为「截断」。文档回写：`docs/中文/指南/模板设计器.md` 的 `textFit` 三档一节与技能 `print-template-json/references/template-schema.md` 的 `wordWrap` 行都补了这条边界（含「V1.3.10 及更早不生效」的版本口径与判据命令）。**与「保留换行符」不冲突**：两档同时打开时单行优先（判据仍返回 `undefined`），用例已配对照。
- **`@worm-vue3-print/common` 的 `latest` 被 npm 自动打在预览版上**（台账 T-15）。`npm publish --tag next` 只约束本次发布写入的 tag，挡不住 npm 给新包首次发布自动打 `latest`，实测官方 registry `latest` 与 `next` 同指 `1.3.7-beta.0` ⇒ 宿主裸写 `npm i @worm-vue3-print/common`（不带 `@next`）不会报错，而是**静默装到实验包**，与该包「实验性、不建议用于生产」的定位相反；此前 README / 包内 README / 集成技能三处都写成「`latest` 尚不存在，省略 `@next` 会报 `No matching version found`」，与实况不符，已按实测更正。新增退出码分级的自检脚本 `scripts/check-common-dist-tag.mjs`（0 健康 / 1 红灯并给出修复命令 / 2 读不到），已串进 `publish:common:beta`（发布后自动 `--fix` 摘除 `latest`）与 `publish:common:dry-run`（`--dry-run` 只报不改），单独复查走 `npm run publish:common:check`。**registry 上的实际摘除需维护者本机执行**（要 npm 登录态），仓库侧已把判据与通路固化。

- **长文本缺省行高与设计器对齐**（台账 T-28）。`longText` 未设 `lineHeight` 时，画布与 print-common 一直按 **1.5 倍**排版，出纸却落回浏览器默认（约 1.2 倍）→ 同一段多行文字，纸面比设计器矮约 9%，四周（实测 60mm 宽 12pt：每行 24px vs 22px）。现出纸补 `line-height:1.5`（无单位倍率，不覆盖用户显式填的 pt 值）。**存量影响（可见行为变更，按 minor 计）**：凡未设 `lineHeight` 的**长文本**，出纸行距变松——`autoHeight` 档元素变高、`clip`/`shrink` 档同一个框能少显示一行。逐字比对 29 份产物：**25 份一致**，差异只有那 4 组「longText + 未设 lineHeight」的档位，各多一条声明；**仓库 13 份示例 + 8 份技能模板全部未变**（其中 longText 未设行高的元素数为 0，85 个未设行高的元素全是 `text`，而 `text` 三端本来就是 normal，不受影响）。真实 Chromium 复核：纸面每行 22px → 24px，与画布同值。

- **表格旁侧的元素不再被「跟随」误拖走**（台账 T-11 C2，Gitee #IKOUJI 同源）。跟随区原先只看 `top >= 表格设计底部`、**完全不看 X 轴**：表格右边另一栏的元素、乃至横向离得很远的元素都会被吸进跟随区，随表格实际底部一起漂移（历史实测偏 78.53mm）。现改为**只有与表格横向相交的元素才跟随**，左/右零交集的元素保持原地绝对定位；同列正下方的元素照旧跟随。**存量影响**：仓库 13 份示例 + 8 份技能模板共 **20 份产物逐字比对全部一致**（这些模板的跟随成员都与表格相交，实测资产级零交集成员为 0），只有外部用户模板里「表格旁另放一栏」的版式会变。

## V1.3.10(2026-10-24)

### 新增

- 新增**流式列表元素 `flowList`**（起因：GitHub issue #5「中药处方单药材排列」——一张处方 7~11 味药，要按「药名 剂量」横着密排、排满换行；表格画不出这种没有格线的栏位，长文本又只会按字符把「当归尾」切两半）。版式口径：每行列数、行高、单元横向间距**都由作者用数字框指定**（列数不自动算）；单元内容是一条**完整表达式模板**（`{drugs.name} {drugs.spec}`），**列表路径写在模板里**——属性台不再有「列表数据源」这一行，列表源由表达式中出现的数组字段检出（core `detectFlowListKey`），检不出来时按数据里第一个数组兜底，与表格同一口径；手工写模板仍可用 `dataSource` 显式覆盖（优先于检出）。新增两项能力：**内容过长时跨列**（缺省关；打开后比一列宽的单元吃掉 2 个及以上列位，当前行列位不够就把**整单元**挪到下一行行首，绝不切词）与「最多跨几列」上限——上限**钳到每行列数**，是全案唯一会改用户填值的行为。**列数挤不下只提示不写值**（照抄条码「推荐条宽倍率」口径，给「可放约 N 列」建议行、不回写用户的数）。**一框一页**：数据多过框高按既有 `textFit` 三档处理（缺省截断），不接分页引擎、不续页，要续排请用表格。**跨列只在出纸生效**：画布设计态既不跑测量也不跑分页，所以设计台永远一列一格，以预览 / 出纸为准。落点：core 新增 `render/flow-list.ts`（缺省与钳制、宽度估算、占位排布，纯逻辑无 DOM，三端与两套外壳同源）、`data-binder` 让非表格元素也能消费数组、`html-generator` 输出 CSS Grid（`grid-auto-rows:minmax(行高,auto)` 落「最小高」语义，跨列写 `grid-column:span`）、`element-factory` / `binding-registry` / `property-search`（含 tip 文案）补齐；画布新增 `FlowListElement.vue` 与「流式列表」分组，print-common 同名类名与同序工具箱一并接入。**存量模板零变化**：不用新元素就不产出任何声明。**demo 示例库新增「中药处方笺」**（A5 纵向、11 味药其中两味带炮制备注）：实测出纸 4 行、两味长单元各占 2 列位、每行都排满 4/4 列位、4 行 × 8mm 恰好等于框高 32mm、单页不断链；示例已同步进 demo-common 四宿主 `templates.js`（示例数 12 → **13**）。

- 属性台里**凡是有出厂默认值的属性行**，标签行最右侧统一新增「恢复默认值」图标（`RotateCcw`，与顶部工具栏同一 lucide 来源，画布与 print-common 两套外壳同形同图标）。点一下把该行写回**该层的出厂值**：元素项回 `createDefaultOptions(元素类型)`、表格级默认回新建表格的出厂值、单元格项清空自身值交还给表格默认、水印/拼版/页面背景回各自常量。图标常驻，但**只在当前值 ≠ 出厂值时点亮**，已是默认值时呈灰且点击不产生历史条目。悬浮提示直接报目标值（如「恢复默认值（12 pt）」，单元格行报「跟随表格默认」）。**只有逐项、没有批量**：分组与整个元素都不提供一键重置。顺带把页面背景色的文字按钮「默认」收进同一图标位。落点：canvas 新增 `property/ResetButton.vue`、common 侧 `controls.ts` 出同构原语，**两套外壳各 75 行**（外观 14、裁剪锚点与放大比例 2、条码 11、高级 3、表格设置 4、单元格 24、边框与背景 3、水印 5、拼版 8 含目标纸页边距 4、页面背景 1），common 侧 `controls.ts` 的 `field`/`fieldHelp` 增第 4 参与 `resetButton` 原语，样式与图标由画布构建产物重新派生。

  **默认值没有新增存储**：重置目标按「从该层出厂值派生」现算，`PROPERTY_REGISTRY` 为此新增的 `default`/`defaultUnit` 两个字段**只用于拼提示文案、不参与任何行为判定**——所以注册表与渲染常量即便漂移，最多是说错一句话，不会重置出错值。渲染侧真值以常量引用而非抄写（`DEFAULT_SHRINK_MIN_FONT_SIZE_PT` / `CROP_SCALE_MIN` / `BARCODE_QUIET_ZONE_MODULES` / `BARCODE_BAR_HEIGHT_MODULES` / `BARCODE_TEXT_FONT_SIZE_MODULES` / `QR_DEFAULT_QUIET_MODULES`，后者从 `browser/` 上收到同构的 `render/barcode-dot.ts`，设计器侧不得依赖带 jsbarcode 的浏览器层）。一致性由 core 的 `reset-default-parity.test.ts` 守：恢复出厂值后的属性与新建元素逐键相等，且每条正向断言都配一个反面对照（首版 13 条里有 3 条靠它才暴露成假绿）。barcode / qrcode / table 三类在 `generateHtml` 层无鉴别力（无 `codeRenderer` 走 fallback、无数据不出 `<td>`），改在 options 与结算函数层断言，真实落纸另由渲染服务回归覆盖。**存量模板与三条出纸链路零变化**：不点图标就不写任何值。

- demo 示例库新增两份**电池模块出货标签**（95×75mm 单枚，四列栅格做整版）：「电池模块标签（含 SN 条码）」——「SN」文字格占第 1 列、条码格跨 3 列；「电池模块标签（无 SN 标签格）」——保留条码、取消「SN」文字格并把条码格合并到整行（跨 4 列），两份只差 SN 那一行的格划分，便于 A/B 对照。版式取自业务侧导出的真实模板，三处按要求调整：字体不写（原模板统一黑体，现按「取消字体预置」撤掉，落纸交还系统默认字体）、SN 条码改为**条宽倍率 3 + 条高 7mm + 203dpi**（原模板是倍率 2、无条高、600dpi）、表格元素高按行高和校正（示例库的硬规则：列宽和=元素宽、行高和=元素高、每行格数=列数）。示例内容由 10 份增至 **12 份**，demo-common 四宿主的 `templates.js` 已同步重生成。内容全为静态文本（不含 `{字段}` 占位），故这两份示例的字段树与打印数据为空。

- 属性台在**选择了打印机分辨率后**，于「条宽（倍率）」下方输出**推荐档与当前折算**，只给参考、**不回写 `barWidth`**。推荐规则：取「吸附到整数打印点后、每模块宽 ≥ 0.254mm（业界常引的 10mil 下限）」的最小倍率——**203dpi 推荐 3**（3 点 / 0.375mm），**300 与 600dpi 推荐 2**（吸附后即 0.254mm）；未填分辨率时不给推荐（没有点阵可吸附）。文案同时报当前档：倍率缺省 2 在 203dpi 下只有 2 点 / 0.250mm，会明确提示「低于下限」。半档常被吸成同一点数（203dpi 下 2 与 2.5 都是 2 点），所以推荐只会落在真正更粗的那一档。计算与文案单一来源在 core 的 `recommendBarcodeBarWidth` / `barcodeBarWidthRecommendText`，画布元素台、单元格台与 print-common 两处共用同一条，四台所见一致。**存量模板与出纸零变化**（该字段只出现在提示里）。

- 表格单元格边框新增一条操作提示：线型 / 宽度 / 颜色只是**待应用草稿**，必须点「全部 / 外侧 / 内部」预设或勾选上、下、左、右某条边才会写入选中单元格（「无」为清除）。画布与 print-common 两套属性台都在边框预设与单边之下常驻这一行，文案单点存 core 的 `CELL_BORDER_APPLY_HINT`（与 `applyBorderPreset` 同文件），两侧同源不再各写一份。**纯提示、不改行为**：草稿语义、画布与三条出纸链路零变化。

- 元素台「边框与背景」补齐到与表格单元格同一形态（起因：分边边框此前只有顶部工具栏能设，属性台连「线型」都没有，`borderStyle` 只能由工具栏或单元格预设写进模板）。新增**线型**下拉（实线 / 虚线 / 点线 / 双线，未设时显示实线、用户不动就不写入），以及按 `acceptsElementBorder` 给出的「**全部 / 外侧 / 内部 / 无**」预设行与上、右、下、左**单边勾选**（rect / oval / hline / vline / table 用 border 画自身本体，写分边不出效果，故这两行不给）。**「内部」对元素恒置灰**——元素只有一圈边，没有相邻格共用的内部线，与工具栏既有禁用口径一致，原因写在常驻提示行里而不是靠悬停找。**元素台没有照抄单元格的「草稿 → 点预设才应用」**：元素自带整圈三字段，它本身就是规格来源，所以线型 / 宽度 / 颜色改了立即生效，预设与单边只是把当前规格铺到指定边位，不会再出现「改了没反应」那类坑；宽度为 0 时点「全部 / 外侧」兜到缺省 `0.75pt`（按钮不空转），「无」只把宽度归零、线型与颜色留着便于改回。落盘逻辑收编进 core 的 `applyElementBorderPreset` / `setElementBorderEdge` / `resolveElementBorderSpec` / `elementBorderEdgeVisible`（原先 canvas 的 `useFormatToolbar` 与 common 的 `core/format.ts` 各写一份，现在工具栏与属性台共用），`ElementBorderSpec` 类型同步归 core。**存量模板与三条出纸链路零变化**：没有新字段，`borders` / `borderStyle` 早已进 schema 并被出纸消费；属性搜索新增「线型 / 边框线型 / 实线 / 虚线 / 点线 / 双线」关键词。

- **预览查看缩放的判据下沉 core，四个 Common 宿主 demo 补上缩放档位条**（起因：预览缩放档位起初只做在 canvas 的 `PrintHtmlPreview` 里，而 `demo-common` 四宿主自行复刻预览层，至今没有档位条——热敏标签在屏幕上仍表现为条粘连）。core 新增 `designer/utils/preview-zoom.ts`：`MM_TO_PX` / `ZOOM_MIN` / `ZOOM_MAX` / `resolvePrinterDpi` / `paperWidthPx`（纸宽走 `getPaperDimensions`，不再有第二份纸型表）/ `fitZoom` / `zoomPresets` / `defaultZoomKey`，另把守卫写入与档位回退抽成 `PREVIEW_ZOOM_GUARD_ID` / `applyPreviewViewZoom`（写 `html{zoom:N}@media print{html{zoom:1 !important}}` 进预览文档）/ `resolveZoomKey` / `zoomValueOf`，一并由 `/designer` 导出。画布 `PrintHtmlPreview.vue` 改为直接消费 core（组件行为不变），四宿主各出一个 `createPreviewZoom({getTemplate, measureContainer})` 小封装并渲染与 canvas 同类名的档位条 `.print-html-preview-zoom` / `-btn(.active)` / `-note`；直挂（jQuery）形态所需的函数由 `packages/print-common/src/browser-bundle.ts` 挂进全局 `WormPrintCommon`（与既有 `getPaperDimensions` 同列）。实测五张页面（9303/9331/9332/9335/9334）载入同一份 203dpi 电池标签示例：五档齐、默认落「点阵 203dpi」、iframe `zoom=2.11458`、切 100% 回到 1、`@media print` 复位在位、预览产物 12716 字符逐页一致。

- **core 的字体目录纯函数补为公共导出**：`print/fonts.ts` 新增 `findFontOption` / `fontOptionLabel` / `normalizeFontQuery` / `filterFontOptions`（族名与展示名取更优档：相等 > 前缀 > 子串 > 子序列，同档保持宿主声明顺序）。此前这套分档在画布与 print-common 各存一份，现两处共用同一实现。

- **技能 `print-template-json` 补上流式列表**：`references/template-schema.md` 此前已登记 `flowList`，但 `scripts/build_template.py` 的元素类型表没有它，脚本编不出这种元素。现补入类型中文名、简写映射（`cols/rowHeight/gapX/autoSpan/maxSpan/source` → `flowColumns/flowRowHeight/flowGapX/flowAutoSpan/flowMaxSpan/dataSource`）与编译期出厂值（4/8/4/false/2，与设计器 `createDefaultOptions('flowList')` 同值），并把「跨列上限钳到每行列数」这条全案唯一改用户值的规则实现进脚本（`cols: 4` + `maxSpan: 9` 编译成 4）；单元模板缺失时报编译失败而非静默出空元素。实测脚本产物在 print-common 宿主 `loadTemplate` 后画布出 4 列网格、属性台四行显 4/8/4 且跨列开关点亮。

- 打印预览新增**缩放档位**（点阵 / 适配 / 100% / 200% / 400%）：模板填了 `printerDpi` 时默认落在「点阵」档＝1 屏幕像素 = 1 打印点（203dpi ≈ 2.11 倍）。起因是预览里条码「竖线连在一起」——按 CSS 真实尺寸显示时 `95mm` 纸只有 359 屏幕像素，`74.32mm` 的 297 模块码面压在 281 像素上＝每模块 0.945 像素，纸面 2 个打印点塞不进 1 个屏幕像素，窄条被取整成 1 或 2 像素、空隙只剩 1 像素（实测只能分辨 73 根条，纸面是 76 根），**与抗锯齿无关**（`crispEdges` 下灰像素本就是 0.0%）；锁到点阵档后条宽逐位为 2/4/6/8 像素、与纸面逐点一致。缩放写在预览 iframe 的守卫样式里并带 `@media print{zoom:1}` 复位，不进渲染产物、不改分页（实测 print 媒介下条码宽度回到 281px），模板契约零改动（`printerDpi` 只读）

- **新建元素默认字体一度改为黑体，字体下拉一度补「本机系统字体」档**（⚠️ **本条已被同版「取消字体预置」撤销**，最终形态以「变更」与「移除（破坏性）」两段的对应条目为准；此处保留实现过程，因为其中「画布裸族名补兜底栈」「单元格继承序」两处仍是本版生效的形态。起因：热敏机反馈「同一模板存成 PDF 再打比浏览器直印清晰」；两条链路共用同一份 core HTML、同一 `@page` 与 `paperMm`，排除缩放与字体加载后定性为 Chrome 打印后端提交字形时不做设备网格对齐，属外部管线，故改在设计侧补偿）。单点全在 core 的 `print/fonts.ts`：`DEFAULT_PRINT_FONT_FAMILY = 'SimHei'`、`SYSTEM_FONT_OPTIONS`（免字体文件的本机已装字体，含 `SimHei`/`Heiti SC`/`Hiragino Sans GB`/`Noto Sans CJK SC`/`Microsoft YaHei`/`PingFang SC`/`SimSun`/`KaiTi`/`FangSong`，label 直接标注「热敏推荐 / 屏幕体 / 热敏慎用」，宋楷仿按用户要求收进来但不替用户藏坑）、`withSystemFontOptions`（宿主声明的 @font-face 字体在前、系统档在后，同族名以宿主为准）。落地面：`createDefaultOptions` 给**所有新元素**写默认族名，表格另带新字段 `tableDefaultFontFamily`，单元格继承序为「单元格自身 → 表格默认 → 交还 CSS 继承」，出图端 `matrixCellStyle` 与画布/外壳两侧同序；两套宿主（canvas 的 `TableSettingsGroup` 与 print-common 的 `tableSettingsGroup`）都新增「默认字体」下拉。**字重仍留 `normal`**：写 `bold` 而模板没挂对应字重的字体文件会触发 Chromium 合成粗体，度量漂移会静默改分页（`print/fonts.ts` 早有的警告），黑体本身笔画就比雅黑粗，不需要假粗。**存量模板逐字不变**——未设 `fontFamily` 时出图依旧不输出该声明，只有新建元素吃到新默认。顺带修掉一处真实错版：画布此前写裸族名（`fontFamily || 'inherit'`），本机缺该字体时退到 UA 默认字、而出纸走兜底栈，两端看到的是两套字；现画布与出图共用 core 新增的 `resolveCanvasFontFamily` 同口径补兜底栈。**跨端注意**：系统字体三端解析不同（画布/浏览器直印/桌面客户端用用户机的字体，服务端 PDF 用渲染容器里的，镜像内中文只有 `fonts-noto-cjk`），缺名时按兜底栈逐级回落不会出豆腐块，但字宽变化可能引起换行与分页差异；要三端字面完全一致仍应走模板字体声明，且**黑体/微软雅黑是微软授权字体，不允许随镜像或安装包再分发**（Noto/思源系为 OFL 可自由分发）。技能 `print-template-json` 同步：`build_template.py` 编译期补同值默认（表格的 `family` 简写映射到 `tableDefaultFontFamily`），`references/template-schema.md` 新增「字体档位」小节。**上述字体预置与技能编译期默认均已随「取消字体预置」撤掉。**

- 条形码**条高** `barHeight`（属性台「条码设置」→「条高 (mm)」）：条形码**元素**与**表格单元格**都能设，画布与 print-common 两套宿主的元素台/单元格台四处同口径。单位 mm，**只量黑白条本体，不含下方文字**。「条宽优先」是这条字段的硬规则：折算粒度就是每模块物理宽，所以实际落纸只能精确到它的整数倍（`barWidth=4` 时步进 0.5mm），可用框高装不下时期望条高让位、**绝不反过来挤窄条宽**（条宽一旦被压成非整数打印点就回到「条宽忽宽忽窄」）。为什么要生成两趟：每模块宽 = 框宽 ÷ 模块数，而模块数只有出图后才知道，条高又要用它来折算——于是先按缺省 30 模块探一趟拿模块数与文字区实测占用，必要时按目标条高重出第二趟；**未填条高、或折算结果恰好是缺省档时仍只走一趟，存量模板逐毫米不变**。实测基准（元素框 56.4×14.1mm、8 位数字走 CODE128C 共 99 模块、`barWidth=2` 即每模块 0.25mm）：填 20mm 后期望 80 模块条区超出框高，条区收敛到 66 模块、整图 80 模块恰好 20mm，条宽仍 0.25mm。文字区单独就吃满框高时条区兜底给 1 模块，不让条码完全打不出。说明挂 `button.pd-help`（文案单一来源是 core 的 `PROPERTY_REGISTRY` 键 `cd-bar-height`），搜索可用「条高 / 条码高度 / 条区高度」命中。**与「最大高度 (mm)」分工不同**：后者限的是整图（含文字）上限，前者只管条区。

- 条形码**静区** `barQuietZone`（属性台「条码设置」→「静区 (模块)」）：条形码**元素**与**表格单元格**都能设，画布与 print-common 两套宿主的元素台/单元格台四处同口径。单位「模块」（1 模块 = 1 条宽），只留左右（上下留白会白吃掉元素高度），范围 0~20、**缺省 10**——10 正是一维码码制对静区的下限要求（GS1 取 2.54mm 与 10×条宽的大者），所以缺省档没有像二维码那样给 0。数值越小白边越窄、同样的框内条越粗：8 位数字走 CODE128C 时图形共 99 模块，其中 20 模块是白边，填 0 后在 20mm 可用框内每模块由 0.202mm 回到 0.25mm（条粗 +23.7%）。说明挂 `button.pd-help`（悬浮/点击才浮出，文案单一来源是 core 的 `PROPERTY_REGISTRY` 键 `cd-bar-quiet-zone`），属性搜索可用「条码静区 / 条码白边 / 条形码留白」命中。**缺省档不变，存量模板出纸逐字不变**；填 0 后白边压没，而静区参与「条→空→条」跳变，紧邻文字或表格线时可能扫不出，需实打验证。**二维码的静区仍是另一条 `qrQuietZone`（缺省 0），两者互不影响。**

- 条形码「条宽（倍率）」上限由 4 抬到 **8**：每模块首选宽度可到 `8/2 × 0.25mm = 1mm`（可用框足够时条码比原来大一倍），设置了 `printerDpi` 时仍吸附到整数打印点。结算规则不变——**仍只缩不放**，所以「大框里条码只到某个尺寸」是条宽上限决定的，现在这个上限翻倍。画布与 print-common 四处入口同步。

### 变更

- **单格四边都没有边框时，单元格台与工具栏回显「线型无 / 宽度 0」**（此前显示缺省实线 0.75，看起来像有一条看不见的框）。单选无边框格：线型下拉选中「无」、宽度 0、颜色仍保留缺省 #333 作后续批写色；顶部工具栏同理——四个线型图标全不亮、粗细 0。选任一非无线型时自动补缺省宽度 0.75（否则会按 0 宽写出一条看不见的框），选「无」且本来无框则宽度归零；仍是点预设/单边才落盘，「无」仍是清边框。多选（缺省批写源）与元素上下文不变；core 的 `CELL_BORDER_APPLY_HINT` 同步改为「一条边都没有时显示『无 / 0』」。**写入链路、模板结构与三条出纸零变化**；改写 canvas 2 条、common 2 条既有断言并新增 canvas 1 条 / common 1 条，变异自证 canvas 4 / common 3 条变红。实测两宿主：导入模板的无边框格回显 none/0，选实线自动 0.75、点「全部」写出 0.75 实线；有边框格仍逐项照实回显。

- **单元格台单格四边规格不一致改为「混合」占位**（补上一轮 A 留下的 B：单格存在多条不同规格的边时，三行此前回落缺省档——上虚线 2pt 红、右实线 0.75 黑的格子显示成实线 0.75 #333，看起来像完全没回显）。现在只把**不一致的字段**留空并标「混合」：线型下拉出禁用项「混合」、粗细输入留空并占位「混合」、颜色空块且 title「混合」，四边勾选仍按有无派生；面板提示改为「四边边框规格不一致…未改项按缺省档批写」。用户改任一项即按该值批写，已一致/未画框的字段仍照旧回显或落缺省档；两宿主同口径（canvas `mixedActive`、common `styleMixed/widthMixed/colorMixed`）。落盘后模型已统一，三行与提示随即回到实际值。**写入链路、模板结构与三条出纸零变化**；新增 canvas 1 条、common 1 条断言，先红后绿并做变异自证。实测两宿主：四边不一致显示「混合」、点「全部」写为 0.75 实线 #333 且提示复原；同格的同规格/部分边回显不受影响。

- **顶部工具栏的边框面板改为回读单元格选区**（补上一轮 A 明确不做的口子：属性台单元格台的边框行已回显，但工具栏的「线型 / 粗细 / 颜色」三行仍是初始化一次的本地草稿——选任何带非默认边框的格子都显示实线 0.75 #333，手工改值又能写）。现在单元格上下文下：单格取该格真实规格（core `resolveCellBorderDisplay`；四边不一致的字段留空——线型图标全不亮、粗细输入空并占位「混合」、颜色空块 title「混合」，面板底出常驻提示，未改项批写按缺省档兜底），多选不回读单格、三行落缺省档作批写源；只在选区变化时回填，同一选区内用户草稿不被重绘冲掉；点预设/单边一律用回读到的规格落盘（不再把 2pt 虚线覆盖回 0.75 实线），落盘后把混合/留空项落定为实际写入值。离开单元格上下文回缺省草稿，元素上下文行为不变。落点：canvas `useFormatToolbar` 新增 `cellBorderDraft`、`FormatToolbar.vue` 三行随选区 key 回填（`PresetColorPicker` 加 `emptyTitle`），common `FormatToolbar` 新增 `syncBorderDraft` / `setBorderWidth` / `setBorderColor` 与 `format-bar.ts` 同口径。**写入链路与三条出纸零变化**；新增 canvas 7 条、common 4 条断言，先红后绿并做变异自证。实测两宿主：单格 `虚线 2 / #ff0000`、仅上边 `点线 1 / #00aa00` 均逐项回显；四边不一致留空并出提示；多选落缺省档；「全部」按回读规格铺满四边且模型逐字段一致。

- **单元格台改为「单选回显、多选只批写」**（起因：多选时所有字段都取选区左上主格，显示的是第一格的类型/内容/对齐/字体/边框，写入却作用于全部可写格；边框三行还额外按选区派生、四边出半选，看起来像"回写成功了一部分"）。判据是选区内的**可写格数量**（跳过 `merged` 占位格）：恰好 1 个才回显该格配置——跨行/跨列的合并格虽然 rect 跨多行多列，但只有一个可写主格，仍按单选正常回显；≥2 个时整组进入批量设置态：文本/数字留空并显示「多选」占位、下拉出禁用的「多选」项（哨兵值 `__multi__`，不与「不指定」这类真实空值撞车）、单选/复选不选中、四边勾选框不再半选（只记本次点过的边）。本次批写过的值记在**按选区隔离的本地草稿**里并显示，换选区即清空（key 含元素 id，跨表也不串）；类型专属行（码制/条宽/静区/条高/纠错/缩放/最大宽高）仅在全部可写格同类型时出现，值仍为空/草稿；边框三行多选时落缺省档（实线 0.75pt）作为批写源，不取任何一格的派生值。多选时「内容」绑定组整组隐藏——它按 `r1,c1` 单格读写，留着会只回显/只写第一格（单元格台自身的内容框承担批量写）。重置按钮多选下恒可点且不显示单格脏点，一次把 `undefined` 写到全部选中格（common 走 `writeField`，同时清草稿，否则控件会停在重置前的值）。单点：core 新增 `collectWritableCells` / `resolveCellGroupMode` / `resolveSharedCellType` 与 `CELL_BORDER_APPLY_HINT_MULTI`，两宿主共用；common 的 `plainSelect` 支持禁用项、`resetButton` 增 `force` 档。**写入链路、模板结构与三条出纸零变化**。实测：画布 `:9303` 与 common `:9331` 真事件链——单选回显（含合并格）、多选各控件空/占位、批写字号落到两格、换选区草稿清空、条码共有类型行、边框预设按缺省档写两格、重置后两格清空且控件回空；新增单测 core 4 / canvas 10 / common 10，改写既有 2 条（半选口径），先红后绿并做变异自证。

- **属性台的边框行一律回显真实状态（单元格与文本元素），勾一条边不再删掉其余三条**（起因：单元格台的「上 / 右 / 下 / 左」是本地草稿勾选、元素台三行只读整圈三字段，都不读回模型——四边都有边框的格子在面板上全不亮、无边框的格子也全不亮，只有分边的文本元素宽度行一片空白；更糟的是勾任意一条边会按本地勾选集合整组覆盖，把该格已有的另外三条边写没）：

- **单元格台**：上/右/下/左四条边的按下态由选区 `borders` 派生（全有＝勾选、部分＝半选 `indeterminate`、全无＝不勾），切选区跟着变；点击只切那一条边（旧实现按本地勾选集合整组覆盖，勾一条会把该格已有的其余三条边写没）。「线型 / 宽度 / 颜色」三行不再存本地草稿，改成**填进选区当前的真实规格**：选区里边规格一致时逐字回显，规格不一或还没画过框回到缺省档（实线 0.75pt #333），改动仍只在点预设或勾单边时落盘（`CELL_BORDER_APPLY_HINT` 文案同步说破这一点）。

- **元素台**：同样三行显示**当前生效规格**——整圈宽度生效时取整圈，整圈未设或已归零时取可见分边的一致值，各边不一给「混合」占位（线型行出一个禁用的「混合」项、宽度框显示「混合」）。勾选框判据从"分边键存在"改成"这条边到底有没有线"（`elementBorderEdgeVisible`，与出纸 `resolveElementBorder` 同判据），所以只有分边的元素不再显示空宽度。

- **改整圈任一行的落盘随之变**：元素已有可见边框时任改一行都按新规格**铺满四边并清掉分边覆盖**——出纸是"先整圈后逐边覆盖"，留着分边改整圈就是「改了没反应」那个老坑。元素本来一条线都没有时只写用户改的那一键（改个线型不会凭空长出 0.75pt 的框，颜色也不替作者发明值）。**撤一条边**时若整圈正生效，四边都是整圈画的、删不掉单独一条，故把其余三边展开成分边、整圈宽度归零（模板形态随之从 `{borderWidth:2}` 变成 `{borderWidth:0, borders:{right,bottom,left}}`，出纸等价）。

- 单点收口在 core：`resolveBorderEdgeStates` / `setCellBorderEdge` / `resolveCellBorderDisplay` / `resolveElementBorderDisplay` / `elementBorderEdgeVisible` / `elementVisibleBorders` / `effectiveElementBorderSpec` / `setElementBorderField` / `setElementBorderEdgeVisible`，画布 `useFormatToolbar`、common `core/format.ts` 与两宿主属性台共用，`elementBorderEdgeOn`（只看分边键存在）已删除。**出纸链路零变化**：不新增字段、`resolveElementBorder` 与 `resolveCellBorderCss` 未动；唯一模板形态差异是四边撤空后删 `borders` 键（不再留 `{}`），以及上面那条单边展开。实测：画布 `:9303` 与 print-common 宿主 `:9331` 真事件链各跑一遍——元素勾「右」后三行报 0.75/solid、宽度改 3 四边同变、撤「上」其余三边保住且三行仍报 3；单元格点「全部」四框齐亮、改成虚线 2 再点「全部」三行回显 dashed/2、换到无边框格回到 0.75/solid。单测 core 24 条 / canvas 12 条 / common 12 条新增，全部先红后绿；canvas 的 spec 类型错误按 T-22 从 49 降到 44（本次改写顺带清掉 5 条，未新增）。

- **线型新增「无」，顶部工具栏的线型图标也允许一个都不选中**（起因：属性台里没有边框的元素一直显示"实线"，而线型本该能表达"没有边框"）。选项单点存 core `BORDER_LINE_STYLES`（无 / 实线 / 虚线 / 点线 / 双线），属性台两处下拉与工具栏图标共用。**语义：线型＝无 ⇔ 这里没有边框**——元素台选「无」立即清框（宽度归零、分边清空、`borderStyle` 记成 `none`）；反过来，给一个没有边框的元素选任一非无线型，就用缺省 `0.75pt` 给它开一条框（线型即"有没有框"的开关，不会出现选了没反应）。单元格台选「无」后点预设＝清掉对应边、勾单边＝撤该边（不写一条"勾着却看不见线"的隐形 `none` 边），仍是草稿制、点预设/勾边才落盘。工具栏的线型按钮再点一次即取消，四个图标全不亮；取消态下点预设＝清边框、点单边＝撤该边，按钮 tip 会写「再点一次取消，线型＝无」。**出纸新增一条判定**：元素整圈或分边的 `style: 'none'` 一律视为不画（与单元格 `TableCellBorder.style='none'` 同口径）——存量模板里若有人显式写过 `borderStyle: 'none'`，此前按非法值回落实线、现在不画线，这是本轮唯一的行为变更（示例库与技能脚本产出的模板都不含该值）。顺带修掉 common 单元格台线型下拉的选中回落：只靠 `<option selected>` 在内核不一致时会落到第二项，改用 `plainSelect` 显式赋 `select.value`（`dotted`/`double` 的存量单元格此前可能显示成"实线"）。实测：画布 `:9303` 选虚线即出 0.75pt 四边框、选无即清（宽度 0、四框灭）、单元格选无后点全部回到无框；common `:9331` 同链。core 新增 8 条断言、canvas 6 条、common 5 条，均先红后绿。

- **表格单元格文本按换行符断行，英文单词不再被逐字拆开**（起因：单元格表达式编辑器里的多行文本，出纸被压成一行）。可换行档（`wordWrap` 缺省 `true`）三端统一由 `white-space: normal` + `word-break: break-all` 改为 `white-space:pre-wrap;word-break:normal;overflow-wrap:break-word`：`\n` 真的换行、连续空格与行首空格原样保留、英文按整词换行（中文仍按字断行），只有当一个词本身就比列宽还长、独占一行也放不下时才在行末兜底切一次（Word/WPS 口径）。落点：core 的 `matrixCellStyle` 内联与 `.print-table` 全局规则、画布 `TableElement` 的内联与 scoped 规则、print-common 的 `cellStyle`（`designer.css` 由画布构建产物重新派生）；`.cell-fit` 定高容器靠继承同口径，测量趟按 `scrollHeight` 判溢出，二分逻辑无需改。**这是出纸行为变更**：数据里带 `\n` 的字段（ERP 地址、备注）以前折叠成一行，现在断成多行 → 行自动撑高、表格变长、**分页位移**；断点也变了（`MODEL-ABC-123` 一类串以前逐字硬切，现在只在空格/连字符处切），「截断」档裁得更多、「自动缩小」档字号可能压得更低。`wordWrap: false` 档逐字保持强制单行 + 省略号（该档 `\n` 仍折叠，其语义就是单行）。电池模块标签示例据此适配：「注意事项」格原文两处 `\n\n` 现断成多行，7pt 档 Chromium 实测整表 71.52mm，越过「纸内区 71mm − 表格 top 2.5mm = 68.5mm」的分页预算，会把该行整行推到第二张标签，故该格字号定为 6pt（实测 64.44mm、单枚一页、0 个单词被拆），行高声明按实测取 22.7mm；无 SN 变体由该模板深拷贝派生，同步生效，demo-common 四宿主 `templates.js` 已重生成。表达式编辑器预览区一并补 `pre-wrap`，多行结果在编辑器内就能看到。

- **取消字体预置：设计器不再写默认字体，字体下拉不再列出内置字体档**（起因：字体版权。`SimHei` / `Microsoft YaHei` / `PingFang SC` 等都是厂商授权字体，项目替每个新建元素预置族名，等于替用户决定了产出物用谁的字体）。core 的 `createDefaultOptions` 去掉 `fontFamily` 与新表格的 `tableDefaultFontFamily` 注入，字体框回到空值（显示「默认」）；出图端本来就只对显式值输出 `font-family`，所以未配置的元素落纸交还渲染端系统默认字体。候选只来自宿主 `fonts` prop 声明的模板字体（随模板分发、授权由宿主自负），清单外字体名仍可手工键入并写入模板。单元格继承序「单元格自身 → 表格默认 → 交还 CSS 继承」与 `tableDefaultFontFamily` 字段都保留。**存量模板逐字不变**——已写入的族名照旧生效，不做 migrate、不改 schema（否则打开再保存会静默改版式，字宽变化牵动换行与分页）。代价如实写明：本版曾为「热敏 203dpi 笔画发虚」把新建元素默认设为黑体，那层补偿随之撤掉，未配字体的模板会退到各端系统默认字（Windows 中文大概率落雅黑/宋体系），需要更实笔画请自行声明字体文件或键入本机已装族名。**全局兜底栈 `FALLBACK_FONT_STACK` 未动**：CSS 里引用族名不构成分发字体文件，风险线在「随包/随镜像带字体文件」，而改这条栈会波及所有既有模板的回落表现与跨端字宽。

- 技能 `print-template-json` 同口径收编：`build_template.py` 不再编译期补默认字体（`family` 简写仍映射 `fontFamily`、表格映射 `tableDefaultFontFamily`，未写就不产出该键），`references/template-schema.md` 的「字体档位」小节改为「不预置字体」并写明授权归属；电池模块标签示例去掉 `tableDefaultFontFamily: 'SimHei'`，四宿主 `templates.js` 已重生成。

- **画布侧三处按用户裁决改 Vue3 本体**（common↔canvas 对账 10-24 的结论，print-common 不动）：① 属性台「页面背景色」的恢复默认值图标**由未设色也恒点亮改为未设色呈灰**——此前 `:target` 传的是带 `|| '#ffffff'` 兜底的取色器模型，而 `base` 是 `undefined`，判据比出「脏」，点一下却只把 `undefined` 写回 `undefined`（亮着空操作的显示陷阱）；现改传原始 `templateData.pageBackground`，与 print-common 同判据。**不改出纸也不改模板**（写回值本就相同）。② 图层面板补 `flowList` 的类型图标 `⊟`——此前流式列表元素在图层里显示 `'?'` 兜底（工具箱与属性台都有名有图标，唯独这里漏了）。③ 元素台「流式列表」的列数/行高/间距/最多跨几列四行补上 `button.pd-help` 说明气泡，文案取 core 注册表里那五条 `fl-*` tip（此前它们只在 print-common 被消费，画布端是死文案）；跨列开关行两侧都不挂。**存量模板零变化**，三处都是引导层。

- **print-common 的静区两行与字体候选按画布判据收口**：① 条码 `barQuietZone` 与二维码 `qrQuietZone`（元素台 + 单元格台共三处）不再回填缺省值——未设置时两侧都**留空靠占位提示**（「默认 10」/「默认 0」）。连带把「把缺省值原样再敲一次要不要落键」统一到画布：画布 `StepperInput` 比的是原始值，所以留空态下敲 10 会写键、清空不写；本包此前的回填会让同一次操作被 `next !== current` 短路掉，**导出 JSON 的键存在性两侧不同**（出纸一直一致）。② 字体候选不再接受裸字符串条目（与画布/core 同判据，非声明对象条目静默丢弃），`host.fonts` 类型同步收紧；③ 候选整理与模糊匹配改调 core 单点，本包那份等价实现删除。断言：`code.spec.ts` +2 条（留空靠占位、显式敲 10 落键、0 档不被归并）+ 改写 1 条原锁「显 0」的旧断言，`font-select.spec.ts` +1 条，core `fonts.test.ts` +1 条含正对照。

- **四个 Common 宿主 demo 的顶部收纳判定改调 core 同一函数**：`apps/*/src/topbar-overflow.js` 此前就地重写了一遍收纳算法，本轮改为直接调 `resolveToolbarOverflow`（画布 `useToolbarOverflow` 用的也是它），并把输入口径照画布抄齐——可用宽扣左右内边距、弹性占位不计自然宽、「更多」钮按固定 74px 预算、自然宽只在「全展开」那一帧取。1440/900/700/560 四档实测：四个宿主的收起数逐档一致（2/7/8/9），560 档 `is-tight` 与 demo 同步为真；demo 与宿主剩下的差异只是**顶栏内容本身**（demo 7 个收纳单元、宿主 9 个），不再是算法分叉。同批还掉一处易踩的坑：**Vue2 宿主的档位条必须用 `v-show` 不能用 `v-if`**——它出现的那一帧会与同级「渲染中」格互相错配，Vue2 的无 key diff 直接重建整棵子树，刚 `doc.write` 进 iframe 的预览产物被清空（实测 12716 → 0 字符，加 `key` 也救不回）。

### 移除（破坏性）

- core 移除 `DEFAULT_PRINT_FONT_FAMILY` 与 `SYSTEM_FONT_OPTIONS` 两个导出；`withSystemFontOptions` 改名 `normalizeFontCatalog`，行为收窄为「整理宿主声明 + 族名大小写不敏感去重」，不再追加系统字体候选。三者都是本版内先加后撤的过渡产物（**从未随任何已发布版本出厂**，下游不存在需要迁移的 1.3.10 前调用点），画布 `useFontCatalog` 与 print-common `shell/font-select` 两处调用点已同步；下游引用需改到 `normalizeFontCatalog`。

- **画布移除内部 `composables/usePreviewZoom.ts`**：预览缩放的档位与纸宽结算已下沉 `@worm-vue3-print/core/designer`（新增 `designer/utils/preview-zoom`），该文件不再有任何实现内容。它从未进 `@worm-vue3-print/canvas` 的公共导出（入口只导出 `PrintHtmlPreview` 组件），文档与 demo 也无引用；深路径引用它的外部代码需改引 core。`PreviewZoom.spec.ts` 已改到 core，9 项仍全绿。

- **print-common 移除 `core/font-catalog.ts` 及其 `buildFontCatalog`**：字体候选的整理与模糊匹配已单点到 core `print/fonts.ts`（`normalizeFontCatalog` / `filterFontOptions` / `findFontOption` / `fontOptionLabel` / `normalizeFontQuery`），本包不再有第二套分档算法。该模块未进本包公共导出。

- **print-common 的 `fonts` 契约由 `readonly (string | PrintFontDeclaration)[]` 收紧为 `readonly PrintFontDeclaration[]`**（与画布 `PrintDesigner` 的 `fonts` prop 同类型）：向 `<print-designer>` 传裸字符串数组（`fonts='["SimSun"]'`）此前只有本包出候选、画布出空，现两侧都**静默丢弃**非声明条目——要出候选必须写成 `{ family, label?, files }`。导出 JSON 与出纸不受影响（该字段本就只进候选）。

### 修复

- **print-common 的「流式列表」分组四处对齐画布**（本条修的是本版新增的 `flowList` 元素，画布侧无改动）：
  ① 步进框改显 core `resolveFlowColumns/resolveFlowRowHeight/resolveFlowGapX/resolveFlowMaxSpan` 的解析值——手写或存量模板
  缺这些字段时画布显 4/8/4/2，本包此前留空框；② 「列数挤不下」提示行补上句末句号，与画布逐字同串；
  ③ **关掉「内容过长时跨列」开关不再凭空写 `flowMaxSpan`**（画布只在打开那一支补钳，本包此前开与关都写，
  未填过该字段的模板会被落一个 `min(2, 列数)`）；④ 分组键由 `flow-list` 改为与画布 `group-key` 同串的 `flowList`，
  折叠偏好才真的读写同一个 `property-group-flowList`（此前两侧各存一份，违背本包「偏好互通」的既有声明）。
  新增 4 条契约断言（`shell/__tests__/flow-list.spec.ts`），并补 `__tests__/format-border.spec.ts` 6 条
  锁住顶部格式栏边框预设「按上下文分流」与「内部」那一格仅单元格上下文可点（画布侧此前只测内层方法）。

- **四个 Common 宿主 demo 的顶栏自适应收纳回到与 demo 同源**（`demo-common`，不影响 npm 产物）：
  宿主样式产物 `demo-ui.css` 由 `sync-demo-styles.mjs` 生成，而该脚本的抽取清单漏了
  `demo/src/components/DemoTopbarMore.vue`，且自 V1.3.7 起未再重跑 ⇒ 已入库产物对 `.demo-ou`/`.demo-spacer`
  /`.demo-topbar.is-tight`/`.demo-more-*` **零规则**，宿主代码却在渲染这些类（收纳单元被压回 `flex-shrink:1`，
  自然宽量不准）。补齐四条：① 抽取清单补入该组件并重跑派生（886 → 977 行，四份仍同 MD5）；
  ② 顶栏补上弹性占位 `<span class="demo-spacer" data-overflow-spacer />`（demo 靠它承担左右分隔，
  旧的 `:first-of-type{margin-left:auto}` 已删）——1440 视口实测右组距右沿由 **71px 回到 16px**，与 demo 相同；
  ③ 「更多」的开合补挂与 demo 同三条状态类（`is-open` / 触发钮 `on` / 折角 `up`），此前只切 `hidden`
  导致钮不高亮、折角不翻；④ 溢出兜底类名由全仓零引用的 `is-toolbar-overflow` 改为 CSS 真正使用的 `is-tight`，
  并按 canvas `useToolbarOverflow` 的判据把弹性占位排除在自然宽之外；触发钮撤掉多挂的 `demo-print-btn`
  （顶栏按钮数由 7 回到与 demo 一致的 6）。五档视口 × 五页 computed style 实测逐项相同，四宿主 `verify-demo` 仍 36/36。

- **表格单元格的 `barWidth` / `barFontSize` 在出纸端整条失效**：`data-binder` 的单元格字段是逐个白名单列举，这两项既没进白名单也没进 `RenderCell` 类型，属性台把条宽调到 3/4/8 只有设计器里变大、出纸仍按缺省 0.25mm/模块（与 `qrQuietZone`、`objectPosition` 同一个坑）。现补进白名单与类型声明，设计态与出纸重新共用同一份几何。

- **单元格条码的文本字号取错字段**：出纸读的是单元格正文字号 `fontSize`（pt），而属性台写入的是 `barFontSize`（相对条高 30），与画布 `CellBarcode` 不同源。现按 `barFontSize ?? fontSize` 取值（条形码元素只有 `fontSize`，该路行为逐字不变）。**存量影响**：仅「条形码单元格同时设了 `fontSize` 且未设 `barFontSize`」时，文本区高度从那个 pt 值回到缺省档，条码随之同比略变——这是把出纸拉回设计器所见的形态。

- **素材台与页签的悬停提示统一为设计器气泡**：字段行与分组名此前挂浏览器原生 `title`，与顶栏、属性台的深色气泡不是一套，长字段名被省略后只能看系统提示；现改为同一套 `data-tip` 固定浮层，悬停即可看全「中文名 (变量名)」，气泡按实宽夹回视口、不再被侧栏或页签列表的 `overflow` 裁掉。顺带修掉 Common 宿主里页签 / 素材台悬停同时冒出原生与浮层两份气泡的存量问题。

- **预览缩放的「适配」档按真实纸宽计算**：此前缩放自带一份纸型宽度表，A3 / A5 横版、Letter / Legal、针式与热敏 / 连续纸的宽度或漏算或按纵向 A4 处理，导致「适配」档比例偏差；现改为复用 core 的 `getPaperDimensions`，与出纸几何同源。

## V1.3.9(2026-10-22)

### 修复

- **设计器内置「更新记录」漏登 #IKPAGV 那一条**（[Gitee #IKPAGV](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKPAGV)）：素材台字段树长名自适应换行的**功能修复已随 `1.3.8` 发布并在包内生效**（取证据于官方 registry 的 `canvas@1.3.8`：`dist/canvas.css` 已含 `.node-meta` 与新 `.node-key` 规则），但那条文案当时没进 `help-content/changelog.ts`，装了 1.3.8 的人在应用内的「更新记录」里看不到它。本版补齐该条文案（中英 CHANGELOG 与两份内置更新记录四处同步），并按新基线重打桌面客户端安装包。**功能与模板 schema 零变化**。

## V1.3.8(2026-10-22)

### 新增

- 图片**裁剪锚点改为可视化取位**（[GitHub issue #4](https://github.com/worm-longliu/worm-vue3-print/issues/4)）：属性台从单一文本值改为「位置档下拉 + 可动轴数字框 + 原图可视窗示意」——红框就是最终会被打印的那块画面，换档、改数字时同步移动。有图片自然尺寸时只显示真正可动的那一轴（两轴都能动才出九宫格），拿不到尺寸时降级为两框；无法归一化的存量写法（mm 偏移、四值语法、`calc`）进入「自定义」并原样保留。缩放模式 `cover` 的用户可见名统一改为「剪裁（等比铺满后裁边）」，档位表收编到 core 一份，canvas 与 print-common 同源。
- 图片**裁剪放大比例** `fitScale`（100~400，仅「剪裁」档消费）：图与框同比例时，等比铺满后恰好等于框、一条边都裁不掉；放大比例把画面按百分比再推大，两轴才各多出一条可裁的边。声明落在 core 新增的 `render/crop-style.ts`，出纸、画布与 print-common 五处同源；`transform: scale()` 的缩放原点复用同一条锚点值（锚点既是取位钉住点也是放大不动点）。100 与缺省不落声明，存量模板逐字不变。

### 变更

- **锚点行只在「剪裁」档出现**：包含 / 拉伸填满 / 原始尺寸 / 缩小四档不再显示裁剪锚点与放大比例——这些档没有真被裁掉的边，方框配方图时整行只报「两轴都没有可挪的余量」属噪声。canvas 与 print-common 的元素台、单元格台四处统一。
- 表格**含图单元格选「剪裁」后出纸行高不再被图片撑高**：`cover` 档把外框钉在可用框高、`<img>` 铺满该盒；真 Chromium 实测声明 12mm 的行由约 23.8mm 回到 12mm，取顶 / 取底时画面按锚点裁切（取顶打出顶端红带、取底打出底端蓝带）。其余四档逐字保持存量形态。**注意**：既有模板里表格图片单元格若用了「剪裁」，升级后行高会变矮，请复核版式。

### 修复

- **大写金额万 / 亿 节单位丢失**（[Gitee #IKOYG0](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKOYG0)）：原实现按四位一节换算时，节单位取的是「当前节」下标，首个满四位时下标仍落在第 0 节、取到空串，万 / 亿永远拼不上。现改为按四位一节从高位向下拼接，节单位取本节下标，并补齐跨节零；顺带纠正角位为 0 而分位非 0 时「元」后必须写「零」、不足一元保留「元」位。仅「≥1 万」「x.0y 元」「0<|金额|<1」三类输出变化，全部由错转对。
- **字体下拉展开时把宿主撑变形**（[Gitee #IKP3MU](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKP3MU)）：候选列表此前留在文档流里，展开时把顶栏收纳单元由 28px 撑到 157px、属性台字体字段下移 122px；现改为浮层并按可用空间上下翻档，顶栏 /「更多」面板 / 属性台三处不再被撑开。该缺陷自 1.3.3 格式工具栏并入顶栏起存在，不是 1.3.7 工具栏收纳的回归。
- **含表格与横竖线的单页模板被拆成两页**（[Gitee #IKOUJI](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKOUJI)，C3）：分页预算原按一维纵向流累加，两条与表格横向不相交的竖线也会吃掉纵向预算，表格放不下即虚假换页；换页后元素改用流式光标，设计坐标随之丢失。现改为按横向占用列记账，横竖线与表格各算各列；报告人模板由 2 页 / 横线跳到第 2 页 y=38.9 恢复为 1 页 / y=86.8（设计 86.87）。**说明**：同一 issue 内的 C2（表格跟随区数据驱动漂移）与 C1（跟随区内竖线高度丢失）仍未修复，已登记 TODO T-11，本次不宣称全部关闭。
- 设计态**未求值的图片表达式**（如 `{image}`）不再被当成真实图片：属性台回落到内置示例图并明确标注「示例图」，换图或加载失败时清掉上一张图的可挪量与取景窗，不再出现「破图 + 旧余量」；同时修正取景示意框被面板宽度拉成横条的几何错（红框现与示例图同框）。
- **素材台字段名过长时中文被挤没**（[Gitee #IKPAGV](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKPAGV)）：字段行原为「中文名 + 变量名」同行，变量名不限宽，长变量名把中文名挤到 0px、自己也冲出 224px 侧栏被裁。现改为自适应换行——放得下仍同行，放不下时变量名落到第二行、中文名独享整行宽度；两侧各自超长时按省略号截断，整行悬停显示「中文名 (变量名)」全文，分组名同样补悬停全文。canvas 与 print-common 同一结构同一规则，实测长字段中文名 148px 完整显示，原始 14 条字段仍全部单行 33px。

## V1.3.7(2026-10-19)

### 新增

- demo-common 四个子 demo 的顶部操作区接入**同一套自适应收纳**（[GitHub issue #4](https://github.com/worm-longliu/worm-vue3-print/issues/4) 拆解项 T-10）：jquery / vue2 / react / vue3 宿主各自新增 `src/topbar-overflow.js`（判定与 core `resolveToolbarOverflow` 一致；直挂形态没有打包器，拿不到 core 子路径，故就地实现同一算法）与 `src/styles/topbar-overflow.css`（`demo-ui.css` 是同源产物、禁止手改，收纳布局另起一份），可折叠项统一包 `.demo-ou`、面板内给 `data-overflow-slot` 落位。四宿主实测 1600/1280/900/700/640 五档：文本折行 0、内容溢出条底 0、顶栏恒 45px、收纳数 0/0/3/5/8；被移进面板的复选框仍随框架状态更新（class 加 `on`、文案改「3 份」）且不回到行内。

- 文本**两端对齐** `justify`（[GitHub issue #4](https://github.com/worm-longliu/worm-vue3-print/issues/4)）：`TextAlign` 增档，属性台「对齐」加「两端」radio、格式工具栏对齐面板加第四格（canvas 与 print-common 同图标 `TextAlignJustify`，common 图标表由 canvas 导入自动派生），tip 写明「撑满行宽，含末行」。出纸端与画布/common 同策两处：一是 `justify` 与垂直对齐组合时把 flex 主轴改成纵向，让行盒取满宽（横向 flex 的匿名文本项无法拉伸，改前会静默回落成左对齐）；二是随 `text-align:justify` 一并输出 `text-align-last:justify`——CSS 的 `justify` 不拉伸段落末行，而文本元素通常只有一行、那一行就是末行，改前单行设两端对齐毫无变化（真实设计器实测：元素盒 349px 宽而单行行盒只有 140px，改后行盒撑满 349px）。语义按打印设计器同行取「撑满行宽」，与 Word 的「两端对齐」有别：多行文本的末行同样被拉开（Word 中该形态叫「分散对齐」）。
- 表格**单元格两端对齐**：属性台「水平对齐」补第 4 档「两端」（canvas 与 print-common 同位同文案）。此前格式工具栏的第 4 格在单元格上下文里已经能写入 `align: 'justify'`（`useFormatToolbar` 在 `context==='cells'` 复用同一对齐面板），但属性台看不到也点不到，且出纸只输出 `text-align:justify`——真实设计器实测 83px 宽的表头格里内容仍停在 48px。现三端补齐：core `matrixCellStyle()` 成对输出 `text-align-last:justify`，canvas `TableElement` 与 print-common `table.ts` 的单元格样式同步；真实设计器点「两端」后同一格行盒 48px → 撑满内容宽 73px。缺省仍按 `left`/`center` 走，存量模板零变化（仅 `align === 'justify'` 时多这一条声明）。
- 长文本**首行缩进** `longTextIndent` 真正落纸（属性台「外观」组同时补上「首行缩进 (字符)」入口与说明）：`text-indent` 以 **em** 输出（随字号走，`textFit='shrink'` 把字号缩小后缩进同步变窄），与 Word/WPS「首行缩进 2 字符」同形态；画布与 print-common 两处由 `pt` 同步改为 `em`。仅 `longText` 元素消费，给 `text` 元素塞该键不生效——与画布语义对齐。
- 图片**裁剪锚点** `objectPosition`：独立 image 与表格单元格图片的 `<img>` 输出 `object-position`（如 `center 20%`，证件照保住头顶）；属性台「外观」组为 image 新增「缩放模式」与「裁剪锚点」，表格单元格属性面板同步补「裁剪锚点」（仅图片单元格显示）（canvas 与 print-common 同位同文案，说明挂 `button.pd-help`，文案单一来源是 core 的 `PROPERTY_REGISTRY`）。含 `;`、引号、`url()` 等非法字符的值整条丢弃（宿主侧 CSSOM 同样丢弃，两端行为一致）。
- 桌面客户端出纸通路：**HTML 直打**。core 产出的最终 HTML 直接交给 `webContents.print({ silent: true })`，与浏览器 `window.print()` 同源：纸张按渲染管线算出的 `paperMm` 以**微米**显式声明，边距恒 `none`，出纸前把 `deviceName/pageSize/copies/landscape` 落日志（`Chromium 原生打印参数`）。三端都不再依赖外部命令。勾选「保留生成的 PDF」时才额外产出同一份 `printToPDF` 结果作为比对**参考件**（不勾选则渲染停在准备阶段，省一次出图）；任务记录新增 `printRoute` 留痕，旧记录按 `pdf` 理解。macOS 实测（支持自定义尺寸的标签队列）：落盘介质精确等于声明值（60×40 / 80×60 / 100×80 mm，`/Rotate=0`、内容正立），比 PDF 通路 `printToPDF` 的取整结果（60.4×40.2 mm）更准；`silent` 未弹交互框，60s 回调兜底未触发。
- 设计器顶部工具栏**自适应收纳**：宽度不足以容纳全部按钮组时，按固定优先级链（剪贴板 → 格式刷 → 缩放 → 排列/视图 → 边框 → 颜色 → 对齐 → 文字样式 → 字体与字号）从链首起把按钮组收进新出现的「更多」下拉，面板内保留原有分组标题与图标网格形态；全部收完仍放不下时品牌区文字转为省略号截断。判定函数 `resolveToolbarOverflow` 落在 `@worm-vue3-print/core/designer`，canvas 与 print-common 两套宿主共用同一链序。canvas 侧用 `Teleport` 搬运，组件实例不重挂载，因此「边框」面板里选好的线型/粗细/颜色在窗口反复缩放后存活；common 侧因整树重建模型改为重绘后置遍搬运，并新增 `openMore` 状态使「更多」与内层下拉能同时展开。
- demo 顶部操作区接入同一套收纳：常驻「worm-vue3-print」标识、标题与「打印输出」，其余 9 项按 模板 ID → 业务类型 → 宿主示例切换 → 清空 → 导入模板 → 导出模板 → 自定义字段与数据 → 批量打印 → 加载示例 的顺序收进「更多」，面板用 demo 自身视觉、宿主自持 DOM。改前实测 640px 宽时顶部条只有 45px 高而「自定义字段与数据」按钮被压到 156px 高（逐字竖排），11 个文本项全部折行并溢出条底 55px；改后同宽度全部收进面板，无一项竖排、无溢出。左右分隔改由显式 `.demo-spacer` 承担（原 `.demo-print-btn:first-of-type { margin-left: auto }` 在按钮被包成收纳单元后已选不中）。
- 收纳机制提升为 canvas 公开 API：新增导出 `provideToolbarOverflow` / `useToolbarOverflow` / `emptyToolbarOverflow` / `createOverflowUnitDirective` / `TOOLBAR_OVERFLOW` 与 `ToolbarOverflowContext` / `OverflowUnitDef` 类型，宿主自己的工具栏可复用同一链序与判定；落位容器改按 `data-overflow-slot` 属性配对、自然宽排除项按 `data-overflow-more` / `data-overflow-spacer` 属性识别，不再与 canvas 的类名耦合。

- 桌面客户端窗口与托盘图标改用与安装包同源的 `build/icon.png`（该图随之进 asar，安装包约 +1 MB），任务栏、Alt-Tab 与快捷方式图形一致；macOS 托盘仍用单色模板图以适配菜单栏深浅色。
- 属性台新增「**静区 (模块)**」（[Gitee issue #IKN95F](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKN95F)）：二维码四周留出的空白格数，二维码**元素**与**表格单元格**都能设，canvas 与 print-common 两套宿主同口径，范围 0~8、**缺省 0**（此前出纸固定 4 模块，因此既有模板的码面占框比例从 72.4% 变 100%）。0 即不留白边、码面等比铺满元素框，扫码所需静区由元素框外的白纸充当；需要 ISO/IEC 18004 推荐的合规静区时显式填 4。属性搜索可用「静区 / 白边 / 留白 / 铺满」命中。说明文字挂在标签后的帮助图标上（悬浮或点击才浮出，文案单一来源在 core 的属性注册表），不常驻占用属性台纵向空间。
- **`@worm-vue3-print/common` 以预览版发布到 npm**：此前该包只在工作区内构建，非 Vue3 宿主只能走源码安装。本版起发布**预发布版本**——dist-tag `next`、版本 `1.3.7-beta.0`、**不占 `latest`**，安装必须写 `npm i @worm-vue3-print/common@next @worm-vue3-print/core`（npm 上还没有 `latest`，省略 `@next` 会报 `No matching version found`）。同时补开样式公开子路径 `@worm-vue3-print/common/style.css`（→ `dist/common.css`，只有渲染进 light DOM 才需要它；此前 `exports` 只开放 `.` 与 `./browser`，打包器侧引不到这份 CSS）。发布通路**不进 GitHub Actions**，改由本地脚本：演练 `npm run publish:common:dry-run`、正式发布 `npm run publish:common:beta`（固定按 core → canvas → common 构建，再跑 core / canvas / common 三套测试；演练 exit 0，tarball 43 文件 / 380.0 kB / 解包 1.3 MB），步骤与红线见 `CONTRIBUTING.md`「方式三」。**该包仍是实验性质、尚未完成稳定性测试，不建议用于生产**；Vue 3 项目请继续用 `@worm-vue3-print/canvas`。

### 变更

- demo：**自定义字体改为跟随模板声明**。设计器字体候选与画布 `@font-face` 的来源由宿主常量 `DESIGNER_FONTS` 改为**当前模板 JSON 自带的 `fonts`**（多页模板用 core 的 `mergeFontDeclarations` 合并各页），同时删掉与 `template-comprehensive-showcase.json` 内那份重复的声明。只有综合示例模板内嵌三款公开字体（马善政毛笔楷书 / 站酷快乐体 / 站酷庆科黄油体），其余 9 份示例的字体下拉只剩「默认」，保存与导出也不再被写入字体声明；导入自带 `fonts` 的模板同样自动生效。模板内保存的是相对路径 `/fonts/...`（各出图端按自己的 `baseUrl` 解析），传给设计器前补成 `FONT_BASE_URL` 绝对地址，避免 GitHub Pages 子路径部署时 404。

### 变更（破坏性）

- 桌面客户端**取消「出纸方式」配置项**：`config.json` 不再接受 `printRoute`（旧文件里的该键被忽略），出纸固定走 HTML；需要回退到「HTML → `printToPDF` → 系统命令」时改 `print-engine.ts` 的 `ACTIVE_PRINT_ROUTE` 并重新构建，且只对 macOS / Linux 有效。
- 桌面客户端在 **Windows / Linux 不再显示 File/Edit/View/Window 应用菜单**（`Menu.setApplicationMenu(null)`，文本框的 Ctrl+C/V 由 Chromium 自身处理）；macOS 保留默认菜单。

### 移除（破坏性）

- 移除从未被消费的可选字段 `lHeight`（与 `lineHeight` 语义重复）与 `leftSpaceRemoved`：全仓零消费，模板里残留同名键被忽略，渲染行为零变化。

- 桌面客户端 Windows 侧的 **SumatraPDF 出纸通路整体移除**：`print-backend.ts`（三处安装位置探测）、`sumatra-installer.ts`（官方便携版下载 + sha256 校验 + 一键安装）、设置页的出纸后端状态条与 `worm:settings:install-print-backend` IPC 均不再存在，`printPdfFile` 在 win32 直接报错。此前该通路的口径（只发份数与方向、不发任何纸张参数）随代码删除，Windows 不再需要安装外部工具。
- 随之失效的参数口径：`paperName`（驱动纸型名）与 `margins` 在当前出纸通路**不被消费**（协议保留以兼容）。要按驱动纸型出纸请设驱动/队列首选项；`-o media=<名称>` 那条通路只在 macOS / Linux 保留。

### 修复

- 桌面客户端：**含条码或二维码的模板此前一张都打不出来**，任务固定以 `PRINT_FAILED：码值渲染超过 ~30000ms` 结束（无码模板不受影响）。渲染管线要先在页面里生成码值 SVG、再把它填进 HTML 去做测量，即**码值阶段早于任何一次 `setContent`**；而客户端的 Electron driver 在窗口从未提交过任何文档时就调 `webContents.executeJavaScript`——Electron 会把这段脚本排队等一次文档提交，隐藏窗口永远不提交，调用于是静默挂到超时。现 driver 在首次注入执行器前先载入一个空白文档。实测（本机 PDFwriter 虚拟队列）：出厂面单模板（条码 + 二维码、自定义纸 100×150mm）由超时失败变为 **2.5s 出纸**，落盘介质精确 100.00×150.00 mm、`/Rotate=0`；单条码 1.5s、单二维码（静区 4）1.5s、含两端对齐/首行缩进/裁剪锚点/双二维码的排版探针模板 1.9s。**该缺陷自 1.3.5 起即存在**（同一台机器上用户已装的 1.3.5 客户端跑同一模板同样超时，已实测对照），非 V1.3.7 引入，随本版安装包一并修复——升级前用桌面客户端打条码/二维码的用户，此前只能改用浏览器打印或服务端 PDF。
- 子 demo 顶栏的「宿主示例」互跳下拉**常驻可见**并压在画布上：`demo-ui.css` 里 `.demo-host-switch-menu { display: flex }` 这条作者规则盖住了 `<details>` 闭合态的 UA 隐藏。四宿主的 `topbar-overflow.css` 各补一条 `.demo-host-switch:not([open]) > .demo-host-switch-menu { display: none }`；根治应落到 demo 样式源后重跑 `npm run styles:demo-common`。
- common 宿主的属性台**字段帮助气泡与 canvas/vue3 不一致**：canvas `DesignerToolbar.vue` 里裸选择器 `[data-tip]::after`（`bottom:-32px; left:50%; translateX(-50%); padding:4px 8px; white-space:nowrap; z-index:100`）在派生 common 样式表时被剥掉 `[data-v-*]`，连带命中属性台的 `.pd-help::after`——90 多字的「静区 (模块)」说明因此不换行、被拉成超宽长条且左偏居中、层级从 120 掉到 100。`scope-patches.css` 按 `native-controls.css` 的 `.pd-help::after` 逐条还原（top/bottom/left/transform/padding/white-space/z-index）。A/B 实测：同一探针元素两侧现均为 `left:0 / transform:none / padding:5px 7px / white-space:normal / width:196px / z-index:120`，仅 `top` 差 1px（气泡定位基座是 `.pd-label`，其行高两宿主本就有 ±1px 记录内差异）。

- 「更多」收纳面板内的下拉子面板（如「边框」）向右戳出父面板：1000px 视口实测父面板 186px、子面板 218px 且左边距 17px，**溢出 48px**（[GitHub issue #4](https://github.com/worm-longliu/worm-vue3-print/issues/4) 附带项 T-07a）。`.tb-more-panel` 现按实测抬高 `min-width: 244px`（17 + 218 + 9），改后父面板 246px、溢出归 0；print-common 侧「更多」面板本就 282px 容得下 218px 子面板，规则无副作用。

- 独立 image 元素的 `fit` 在出纸端被写死 `object-fit:contain`（画布按 `cover` 裁剪显示，预览/PDF/客户端三路都不一致）：改为读取 `opts.fit`，未设时仍 `contain`，存量模板输出逐字不变。
- 主题变量接通：`native-controls.css` 输入类控件/选项 chip/`​.pd-dialog`、`ExpressionEditor` 类型页签与 hover 与预览错误态与四张帮助卡片、`TableContextMenu` 全量、`PresetColorPicker` 触发器与浮层，以及滚动条三档（含 hover）统一改 `var(--pd-*, 原值)`；26 个新令牌集中登记在 `PrintDesigner.vue` 的 `.designer-container`，浅色默认逐像素不变（浏览器实测 `.pd-input`/`.pd-select`/`.pd-radio` 计算值仍 `rgb(255, 255, 255)`；`.pd-switch::after` 开关滑块白底属正确形态，显式保留）。
- `PresetColorPicker` 双根（button + Teleport）导致 `Extraneous non-props attributes (class)` 告警且样式落空：组件 `inheritAttrs: false` + 显式 `v-bind="$attrs"` 绑到触发器；`.page-bg-picker` 的 `flex: 1` 改由真实节点承载——fragment 根拿不到宿主 scoped 属性，class 即使落位也匹配不上 `.page-bg-picker[data-v-*]`。

- 桌面客户端（macOS）：**回退的 PDF 出纸通路上，横向标签被打成纵向**。V1.3.6 登记的「`-o orientation-requested=4` 的实现是**交换介质长宽**，故 macOS 的 `Custom.` 也按纵向序（短边×长边）声明」**结论有误**——该观测来自 PostScript 通路（`cgpdftops`）的 `do_rotate` 日志，而 driverless / `_ib` 这类**直接收 PDF 的队列走 `cgpdftopdf`**，其语义是「按你声明的介质朝向，把内容转过去贴它」，并不交换介质。实测（macOS 15.7.8 + CUPS 2.3.4，开源 RWTS-PDFwriter 虚拟队列，9 种纸型 × 3 种下发形态共 27 例）：100×75 标签按 `Custom.212.6x283.46` 加方向请求下发时，落盘介质为 212×283pt 的**纵向页**且内容被补 90°；改按 `Custom.283.46x212.6` 真序声明则介质=100×75 mm、内容正立、产物字节与输入一致。现 **`Custom.` 与 Linux 统一按页面真实朝向声明，macOS 不再为它补方向请求**；方向请求只保留给「命中标准纸型名（`A4` / `Letter` 本身就是纵向介质）的横向页」，该场景实测行为不变（在纵向纸上正立出横向）。**行为变更**：仅影响 macOS 上把 `ACTIVE_PRINT_ROUTE` 改回 `pdf` 的回退构建；默认的 HTML 直打不消费 `media=`，不受本条影响。接单前可用 `grep -m1 CustomPageSize /etc/cups/ppd/<队列>.ppd` 确认队列认不认自定义尺寸——不支持时 `Custom.` 仍会被静默忽略并回落驱动默认纸型，标签只能靠驱动内已定义的 `paperName`（仅在 PDF 通路可用）。

- 设计器顶部工具栏**不再折行压画**（[GitHub issue #4 评论 1](https://github.com/worm-longliu/worm-vue3-print/issues/4)）：此前按钮组与其文字标签可被 flex 压缩，实测自然宽合计超出可用宽即出现文字逐字换行，标题区被压到 13px 宽 / 62px 高、整块 146px 高并溢出工具栏底边 47px 叠到画布上；触发点比反馈更靠前——**1520–1600 CSS px 之间**就开始折行（1080p / 2K 屏 100% 缩放即命中），并非只有明显缩小视口才会出现。现由上面的自适应收纳承接：子项一律禁止压缩（仅品牌区可收缩），放不下先收按钮组，收尽仍不足才让品牌区文字走省略号。

- 二维码**不再小一圈，铺满元素框与单元格**（[Gitee issue #IKN95F](https://gitee.com/liulong_oschina/worm-vue3-print/issues/IKN95F)）：二维码走 `<img>`，但出图端只写了 `max-width/max-height:100%` 而没有 `width/height:100%`——替换元素因此按内在尺寸绘制，而 SVG 的内在尺寸是「模块数 × 4 + 4 模块静区」（默认码值 116px ≈ 30.7mm），与元素框的 mm 完全无关，框一旦大于它就明显不铺满、`object-fit` 也随之空转（真实 Chromium 实测：60mm 框只画 65.3%、80mm 框 48.9%；24mm 框恰好被 `max-width` 压满，所以小二维码看不出来）。出图端现补 `width:100%;height:100%`，`fit` 未设置时按属性面板默认输出 `object-fit:contain`（此前预览写 contain、出纸不写，两边口径分裂）。设计态四处实现（canvas 的 `QrcodeElement` / `CellBarcode`、print-common 的 `shell/code.ts` / `shell/table.ts`）改用 `@worm-vue3-print/core/browser` 的同一份 SVG：canvas 此前把 mm 数值当 px 传给 `qrcode` 库的 `toDataURL({ width })`，28.2mm 的框只出 28px 的图（实测占容器 26.3%）且模块宽落在非整数像素上；print-common 元素级用 `margin: 0`、单元格用 `margin: 1`、出纸用 4 模块，静区三处各不相同。**静区**：此前出纸固定 4 模块、canvas 预览 1 模块、print-common 预览 0 模块，三处各说各话；现统一由新属性 `qrQuietZone`（属性台「静区 (模块)」）决定，缺省 0 模块（码面即等比铺满元素框），缩放元素框也不再重出图。


## V1.3.6(2026-10-16)

### 新增

- 桌面客户端 Linux 安装包（`deb` / `rpm` / `AppImage`，x64）：`npm run pack:client:linux` 在 Docker 容器内交叉构建（`rpm` 目标依赖 `rpmbuild`，macOS 宿主没有该可执行文件），产物随发行版附件提供。包内容、依赖声明与 SHA-256 均已核对，但**未经任何 Linux 真机安装与出纸验证**：出纸依赖 CUPS，AppImage 需 `libfuse2`（只提供 fuse3 的发行版可用 `--appimage-extract-and-run`），deb/rpm 内 `chrome-sandbox` 为非 setuid（`0755`）。本版不提供 `snap` 与 arm64 包，口径见 [客户端 README](../../clients/print-client/README.md)。

### 修复

- 桌面客户端（Windows）：**静默打印把「宽大于高」的标签页旋转 90° 出纸**。100×75 mm 这类宽幅标签经客户端静默打印时，纸上内容被整体旋转 90°，而生成的 PDF 本身正确（在阅读器里方向正常）。根因是 Windows 出纸交给 SumatraPDF，它默认会对「宽 > 高」的页面无条件加 90°，只在方向被判定为横向时才抵消回 0°，而未显式声明方向时该判定取自打印驱动（标签驱动默认多为纵向）。现按页面自身长宽比显式声明方向（`-print-settings "<份数>x,landscape|portrait"`，正方形页归 `portrait`），宽幅页不再被旋转。**行为变更**：升级后同一份宽幅标签的出纸方向与 PDF 一致；此前为规避该问题把模板做成竖版再手动旋转的做法需改回按真实出纸方向设计。驱动中标签定义的朝向若与模板不一致，仍可能由驱动反向旋转，需在驱动 / 机器设置里对齐。
- 桌面客户端（macOS / Linux）：**纸张声明此前从未真正下发**。`printPdfFile` 组装出纸命令时按字段逐个转发参数、漏掉了 `paper`，页面尺寸因此到不了命令构造层，V1.3.0 起引入的 `-o media=…`（宿主指定驱动纸型 → 标准纸型匹配 → `Custom.<宽>x<高>`）只在宿主显式给出驱动纸型 `paperName` 时才下发。现改为原样透传全部选项。**行为变更**：macOS / Linux 客户端出纸现在会真正声明纸张，此前按队列默认纸张（多为纵向 A4/Letter）处理的任务改用页面真实尺寸；横向页还需下一条的方向声明。
- 桌面客户端（macOS / Linux）：**横向页只声明纸型名仍被转 90°**。实测判据与 Windows 同源——CUPS 的 `pdftops` 按「生效介质朝向 vs 页面朝向」补 90°，而 `A4` / `Letter` 这类标准纸型名本身就是**纵向介质**，声明它等于把横向页贴到纵向纸上，照样被转。macOS 出纸在「页面宽 > 高且未指定驱动纸型」时额外下发 `-o orientation-requested=4`，让滤镜把介质翻成横向（实测 `do_rotate` 由 90 变 0）；纵向页与正方页不发（发了介质被翻成横向、正立内容反被转 90°）。该请求的实现是**交换介质长宽**，所以 macOS 上的 `Custom.` 也随之改按**纵向序（短边×长边）**声明，翻一次正好落回页面真实尺寸（实测支持自定义尺寸的队列上，按真序声明再翻会把 100×75 标签打回 212.6×283.46）。**Linux 反向走纸张**：cups-filters 1.28 实测把 `orientation-requested` 实现为「给页面写 `/Rotate 270` 并交换 MediaBox」，标签机反被打歪，所以 Linux 不发该请求，横向页也不再报纵向纸型名，改按页面真实朝向走 `Custom.<宽>x<高>`（A/B 实测：同一份横向 A4 在支持自定义尺寸的队列上 MediaBox 由 595×842 变为 841.89×595.28，且不写 `/Rotate`）。**行为变更**：macOS 与 Linux 上横向 A4、宽幅自定义纸的出纸方向与 PDF 一致。注意队列 PPD 不支持自定义尺寸时 `media=Custom.*` 会被**静默忽略**并回落队列默认纸张（AirPrint / driverless 队列即如此，实测三种参数下发的旋转结果完全相同），标签类纸张建议在宿主侧传驱动内已定义的 `paperName`。

## V1.3.5(2026-10-05)

### ⚠️ 破坏性变更（移除功能）

- **移除「首页专属」首页叠加区**：`@worm-vue3-print/core` 的 `TemplateData.firstPageOverlay` 字段、分页引擎的首页预算扣减、`.first-page-overlay` CSS 与首页叠加层 HTML 全部删除；`@worm-vue3-print/canvas` 与 `@worm-vue3-print/common` 的工具栏「首页专属」入口、画布叠加区占位、属性面板「首页叠加高度」字段同步移除。**行为变更**：`firstPageOverlay.height > 0` 或含元素的用户自有模板，出纸排版回归「无首页叠加区」——首页内容区可用高度比 1.x 多出该叠加高度，请按新口径复核版式。导入含该字段的旧模板时由 `normalizeTemplateUnits` 自动剥离，不会报错。
- **移除设计器「叠层对比」**：canvas 的 `requestScreenshot` prop 与 `ScreenshotRequest` / `RequestScreenshotFn` 类型、Common 的 `requestScreenshot` 属性与 `setOverlay()` 公开方法删除。宿主无需再注入截图适配器。
- **移除服务端截图能力**：`@worm-vue3-print/core` 的 `renderScreenshot` / `buildScreenshotTargetSpec` / `ScreenshotTargetSpec` / `PrintSession.toScreenshot` / `PageDriver.screenshot` 与 `@worm-vue3-print/render` 的 `POST /render/screenshot` 端点删除。PDF 链路（`renderPdf`、`POST /render/pdf`）以及浏览器打印、服务端 PDF、桌面静默打印三条出纸口径均不受影响。
- **`PrintFailureCode` 联合类型移除成员 `'SCREENSHOT_FAILED'`**：该成员随截图管线一并删除。这是对外公开类型的成员删除——从 npm 升级到 1.3.5 后，任何对该成员值的引用（`switch` 分支、赋值、类型标注）都会编译报错，请删除对应分支或改用其余码值（`INVALID_PAPER` / `MEASURE_FAILED` / `RENDER_TIMEOUT` / `PDF_FAILED` / `UNSUPPORTED_RUNTIME` / `INTERNAL`）。
- `skills/print-template-json` 的模板生成器不再补齐 `firstPageOverlay` 骨架字段；内置示例模板已同步剥离。
- 已知落后：工具栏演示视频仍包含「首页专属」「叠层对比」两个按钮的镜头，本版未重录。

### 修复

- `@worm-vue3-print/canvas`：**右键菜单弹出后所有动作点了没反应**。根因是画布「外点即关」的 `mousedown` 监听会在菜单项的 `click` 之前移除菜单 DOM，元素菜单 8 项与表格菜单 12 项全部落空。现改为菜单根节点 `@mousedown.stop` + `contains` 守卫 + 菜单代次计数（连续右键两处不会互相关闭），动作统一经 `closeContextMenu` 解绑后再派发；表格菜单同理由 `mousedown` 改 `mouseup` 关闭。**行为变更**：此前依赖「右键弹菜单但动作无效」这一表象写的宿主代码会开始真的执行复制 / 粘贴 / 删除 / 层级等操作。
- `@worm-vue3-print/canvas`：**表格单元格右键无反应**。单元格层原本带「表格未选中即忽略」守卫，且 `stopPropagation` 已挡住元素菜单，导致未选中表格时右键完全静默。现改为右键命中即先单选该表格再弹表格菜单，与「单元格右键不要求先选中」的口径一致。
- `@worm-vue3-print/canvas`：**右键不再改变选中态导致操作静默失效**。复制 / 剪切 / 删除 / 层级只作用于当前选中集，而此前点空白取消选中后再右键元素仍是未选中态，操作看似无反应。现右键命中非选中元素时先单选该元素（命中已选中的多选成员不打断多选），元素菜单「粘贴」补剪贴板守卫，与空白菜单口径统一。

### 变更

- **npm 分发署名与产物体积**：`@worm-vue3-print/core`、`@worm-vue3-print/canvas` 补 `LICENSE` 文件与 `author` / `repository` / `readme` 元数据；构建产物统一注入 MIT 版权头（core 由 tsup banner 覆盖 esm / cjs / minify / iife，canvas 由 vite 插件覆盖 lib 产物，类型声明由 `scripts/inject-license-banner.mjs` 兜底）。canvas 关闭 sourcemap，tarball 由 606.9 kB 降至 203.6 kB，且不再随包发布未混淆源码。
- **样式引入入口口径修正**：npm 宿主必须 `import '@worm-vue3-print/canvas/style.css'`。此前文档中的 `@worm-vue3-print/canvas/native-controls.css` 不在包的 `exports` 声明内，Node 解析直接报 `ERR_PACKAGE_PATH_NOT_EXPORTED`；该路径只有源码 / 别名接入方式可用。共修正 7 处文档示例。

### 新增

- 文档：新增英文首页 `docs/en/Overview.md`（页首声明由 AI 依据中文文档生成、中文版为权威版本）；README 新增「依赖开源协议」章节（含 dev 依赖逐包审计，无 GPL / AGPL / LGPL 污染，`dompurify` 按 Apache-2.0 分支使用）。
- demo：新增「双列卷纸标签」示例（60×45 mm 标签拼版到 122 mm 宽卷纸，页高 = 单枚标签高，份数由渲染管线按 `perSheet` 自动分页）；新增竖屏口播视频流水线（1080×1920 成品与 ASS / SRT 字幕）。示例计数修正为 10 份。

### 实验性（不在 npm 发布范围内）

- `@worm-vue3-print/common`（工作区包 `packages/print-common`）与多宿主示例 `demo-common/` 为**实验性质、尚未完成稳定性测试**，只在工作区内构建，未发布 npm；用于以零框架运行时形态（原生自定义元素 `<print-designer>`）向 Vue 3 / Vue 2 / React / jQuery 等多种运行时框架（含无框架宿主）提供设计器。Vue 3 项目请使用 `@worm-vue3-print/canvas`。本版本内该包对齐 canvas 的右键口径，并把双击改走 `mousedown` 判定器（画布重绘会断掉原生 `dblclick`），新增与 `dblclick-element` 对称的宿主事件 `dblclick-cell`；示例库与样式由 `scripts/sync-demo-samples.mjs`、`scripts/sync-demo-styles.mjs` 从 `demo/` 同源生成，五个宿主工程顶栏提供互跳入口。

## V1.3.4(2026-09-27)

### 修复

- `@worm-vue3-print/core`：**出纸页脚左边距丢失**。出纸 CSS 里 `.page-footer` 为绝对定位，包含块是 `.print-page` 的 padding box 外缘（= 纸面左缘），`left: 0` 使 `margins.left` 对其不生效——页脚元素出纸后比设计器预览整体左移一个左边距（页眉 / 内容区在文档流内，正常享受 padding）。现改为 `left: margins.left`，与垂直方向 `top` 显式补偿下边距的既有做法对称；浏览器打印、服务端 PDF、桌面客户端静默打印三条链路共用此 CSS，一并修复，出纸旋转（转子）与批量连续纸场景随之生效。**行为变更**：存量模板出纸页脚会右移 `margins.left`（即与设计器所见对齐，属纯修复）；此前若靠手动加大页脚元素 `left` 补偿过该问题，升级后会出现双重偏移，需在设计器中把 `left` 调回预期位置。

## V1.3.3(2026-09-27)

### 新增

- `@worm-vue3-print/core`：**元素级边框全量生效并支持分边**。新增 `render/element-border`（`resolveElementBorder` / `ELEMENT_BORDER_SIDES` / `acceptsElementBorder`）作为元素边框的唯一判定口径，画布与出纸共用同一函数（px 口径，`box-sizing: border-box`，边框不改变元素几何），并经 `/designer` 子路径导出供设计器复用。`ElementOptions` 新增 `borders` 分边字段（`top` / `right` / `bottom` / `left`，在整圈 `borderWidth` / `borderStyle` / `borderColor` 之上逐边覆盖；未设整圈时仅这些边生效）。`rect` / `oval` / `hline` / `vline`（用 border 画自身本体）与 `table`（走单元格边框）排除在外，避免双重边框；宽度未设、≤0 或非法值一律视为无边框，不兜底成默认边框。**行为变更**：存量模板里已写入元素级 `borderWidth` 的非形状元素（文本、长文本、图片、条码、二维码、HTML、页码）此前画布与出纸都不显边框，升级后会真的画出边框；形状、线条与表格不受影响。
- `@worm-vue3-print/canvas`：**格式工具栏**（仿 Word / WPS）。字体、字号、加粗 / 下划线 / 删除线、文字色 / 背景色、水平与垂直对齐、边框（预设「所有 / 外侧 / 内部 / 无」+ 单边开关 + 线型 / 线宽 / 颜色）可一次作用于全部选中元素或表格单元格；多选样式不一致时以「混合」占位显示。
- `@worm-vue3-print/canvas`：**格式刷**。单击刷一次、双击连续刷、`Esc` 或清空选中退出；从单个源元素捕获格式，按目标类型过滤写入（文本字段仅落文本 / 长文本，元素级边框仅落在可携带边框的类型，背景色各类型通用），分边边框深拷贝，框选多目标一次提交只记一次历史。
- demo：**教学视频流水线**。串起 Playwright 录制 → edge-tts 配音 → ffmpeg 合成，含打样单风格片头封面、`VIDEO_SCRIPT` 多剧本切换（工具栏 / 表达式 / 组合教学）与字幕同步校验。

### 变更

- `@worm-vue3-print/canvas`：格式工具栏由第二行独立条**合并进顶部工具栏单行**，对齐 / 边框 / 排列 / 视图收进下拉分组（新增通用 `ToolbarDropdown`）；原先随选中状态显隐的分组改为**常驻 + 置灰**，禁用按钮悬停提示给出原因。宿主若依赖设计器内部 DOM 结构 / 类名，需重新核对。

### 修复

- demo：字幕同步校验的停顿采样窗由 `[end+0.1, +0.35]` 收窄为 `[end+0.05, +0.2]`，避免探入下一句声母而把上一句误判为「抢跑」。

### 文档与维护

- 设计器内置帮助新增「格式工具栏与格式刷」说明，更新记录同步本版本。
- demo 录制器新增 `reload` 步骤，16:9 1920×1080 画面口径与路径口径拆出 `paths.mjs`。

## V1.3.2(2026-09-26)

### 新增

- demo：新增**「分页极限测试」多页示例**（组合 + 表格的极端版式，用于复现与验证换页后的元素放置），纳入示例库；`SampleThumb` 缩略图兼容多页模板 wrapper。

### 变更

- `@worm-vue3-print/canvas`：设计台图标全面换为 **lucide 按需引入**（工具栏 / 图层面板共 17 个图标，统一补齐 tooltip），组合 / 取消组合改用 `Group` / `Ungroup` 专属图标。
- `@worm-vue3-print/canvas`：**组合与多选交互口径修正**：① 取消组合入口在任一选中元素属于组时即显示（旧「单选才显示」对整组多选是死分支）；② 元素拖拽起点不再重复发送 select，Ctrl/⌘ 逐个加选生效，画布与图层面板均可多选；③ 图层面板底部新增独立一行的组合 / 取消组合按钮，支持 Ctrl/⌘ 加选；④ 画布右键菜单移除此前并不生效的「编组/取消编组」入口，组合入口统一为：工具栏按钮、图层面板底部按钮、快捷键 `Ctrl+G` / `Ctrl+Shift+G`；⑤ 帮助文档补充框选规则（从空白区起拖：左上→右下=相交命中、右下→左上=完全包围命中）、组合强制同页与超高裁切警示，用户可见文案统一为「组合 / 取消组合」。

### 修复

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**表格下方跟随元素的打印间距被拉大**。表格设计底部（`tableDesignBottom`）旧口径只取 `tableRows` 行高之和（min-height 语义），忽略设计器实测回写的 `options.height`——当行内容把表格撑高时，跟随偏移多算出「实测高 − 行高和」的虚假间距（实测模板最大达 3.77mm）。现改为 `top + max(options.height, Σ行高)`：以画布视觉底部为基准，行高之和保留为物理下界，避免脏数据把跟随元素反向叠压表格。**行为变更**：存量模板中「行内容把表格撑高」的模板，表下跟随元素的出纸间距会收回到与设计台所见一致；在设计器保存过的模板属纯修复，三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源生效。
- `@worm-vue3-print/core`：**分页换页后区块一律锚 0，导致末页组合元素叠压表格**。换页后表格续片、组合、普通元素原本都从新页顶部 0 开始放置，应顺排的元素互相叠在一起。现改为流式光标（`pageCursorTop`）顺排放置，且表格切片起点在行组扣预算前提前捕获，保证跨页续片后跟随元素正确接排；并补充分页引擎极限回归测试（组合整组不拆分、多区块叠页场景）。
- demo：移除对 `@worm-vue3-print/canvas/native-controls.css` 的错误全局引入（该样式文件已不存在）。

### 维护

- `@worm-vue3-print/canvas`：修复测试间歇性 `localStorage` 未定义——新增全局 vitest setup 兜底。
- 仓库脚本：根 `package.json` 清理对已删除工作区 `@worm-vue3-print/client` 的残留引用。
- 文档：补充 Electron 客户端依赖 core **dist 子路径**（`@worm-vue3-print/core/client`）的构建约定——新增或改动 core 子入口后必须重建 core 的 dist。

## V1.3.1(2026-09-21)

### 新增

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：表达式**数值运算与修约**。
  ① 四则函数：`ADD(a,b,…)`、`SUB(a,b,…)`、`MUL(a,b,…)`、`DIV(a,b)`，与运算符 `+ - * / %` 共用同一套数值语义，不便写运算符的场景可直接调函数。
  ② 修约函数：`ROUND(n,d)` 四舍五入、`ROUNDUP` / `CEIL` 进一法（远离零）、`ROUNDDOWN` / `FLOOR` 去尾法（朝零）、`ROUNDBANK` 四舍六入五成双（GB/T 8170）；`d` 缺省 2，传负数修约到整十 / 整百（`-2` → 百位）。修约按十进制字符串精确判定，不存在 `toFixed` 的浮点舍入陷阱，`ROUND` 与 `ROUNDBANK` 只在「恰好一半」时不同（前者进位、后者凑偶）。
  ③ 运算符补齐数值语义：字符串数字按数值参与运算、消除二进制浮点噪声、除零与空值兜底。详见下条「变更」。
  ④ 设计器表达式编辑器「函数」页新增「数值运算」分组，四则与修约函数可双击插入；帮助面板内置函数表同步补充。
- `@worm-vue3-print/core`：新增底层数值模块（`numeric.ts`），函数与运算符共用；主入口导出 `addNumbers` / `subtractNumbers` / `multiplyNumbers` / `divideNumbers` / `round` / `roundUp` / `roundDown` / `roundHalfEven`，宿主自有逻辑可复用。
- demo：新增**综合示例模板**（A4 横向、多级表头、表格单元格内图片 / 条形码 / 二维码混排），纳入示例库与 `print-template-json` 技能资源；顶栏「加载默认布局」改为「加载示例」，进入页面即自动载入该模板。
- demo：新增**「自定义字段与数据」弹窗**——直接在页面上增删打印数据字段、编辑多份打印数据，批量打印同步适配。
- demo：支持**静态托管在线预览**——新增 `edgeone.json`（EdgeOne Pages）与 `.github/workflows/pages.yml`（GitHub Pages，推送 master 自动构建部署，预览地址见 README）；字体基址与示例图片路径改用 `import.meta.env.BASE_URL` 与当前站点 origin，去掉 localhost 硬编码，适配子路径部署。

### 变更

- **静默打印浏览器端 SDK 并入 core，不再单独发布**：原独立包 `@worm-vue3-print/client`（`0.1.0`，从未发布到 npm）迁移为 `@worm-vue3-print/core` 的子路径导出 `@worm-vue3-print/core/client`，导入方式由 `import { PrintClient } from '@worm-vue3-print/client'` 改为 `from '@worm-vue3-print/core/client'`。SDK 零运行时依赖（仅用浏览器 WebSocket），core 不新增依赖；`PrintClient`、`WsTransport`、`WormPrintError`、`MESSAGE_TYPES` 等全部导出符号与能力保持不变。`packages/print-client-sdk` 目录删除；桌面客户端（Electron）内部引用同步改走 core。
- `@worm-vue3-print/core`：**行为变更** 算术运算符（四则与一元正负号）改为数值语义，存量模板在以下场景结果会变（都是朝「符合直觉」的方向修）：
  ① 两侧都是数字或数字字符串时按数值运算——`'3' + 4` 由 `'34'` 变为 `7`，`{qty + price}` 不再拼出 `312.5`；
  ② 消除二进制浮点噪声——`0.1 + 0.2` 由 `0.30000000000000004` 变为 `0.3`，`12.5 * 3 * 1.13` 由 `42.37499999999999` 变为 `42.375`；
  ③ 除数为 0 或无法解析为数字时返回 `0`，不再输出 `Infinity` / `NaN`；`null` / 空串参与算术按 0、拼接时按空串（此前拼接会印出 `null`）；
  ④ 任一侧不是数字时 `+` 仍保持字符串拼接（`name + '有限公司'` 行为不变）。
- demo：打印预览弹框改为**全屏**（内容区占满视口），移除「点击空白处关闭」，新增 Esc 关闭。

### 修复

- `ROUND(n, d)` 此前由 `Number.toFixed` 实现，存在浮点舍入错误：`ROUND(1.005, 2)` 得到 `1`（应为 `1.01`）、`ROUND(2.675, 2)` 得到 `2.67`（应为 `2.68`）。现按十进制精确修约。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：系统变量**无法在表达式内参与运算或函数调用**——`{pageIndex + 1}`、`{ADD(pageIndex,1)}`、`{DATE(printDate,'YYYY')}` 求值失败后会被当作原文印出（模板求值失败的降级行为），只有「整个花括号就是一个变量」的 `{pageIndex}` 能出结果（靠出图后的文本替换）。原因是绑定阶段的表达式上下文里只有业务数据，不含系统变量，而页码要等分页后才有值。现改为：① `printDate` / `printTime` 在数据绑定时并入上下文（业务数据同名时优先）；② 引用 `pageIndex` / `totalPages` 的表达式在绑定阶段保留原始表达式（测量趟按原始文本测量），最终渲染时按所在页页码重新求值——元素、页眉/页脚、首页叠加与表格单元格四者一致，三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源。**存量模板产物不变**：无 rawFormatter 的模板走快速路径，不做任何重算。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**多级表头分页续片会丢掉下面几级表头**。多级表头的各行由 `rowspan` / `colspan` 连成一个结构整体，而「每页重复」此前按行独立判定——只勾选首行时，续片只重复首行，第二级及以后的表头整段丢失，首行的跨行主格还会越界吃掉数据行的位置。现改为：① 表头区（第 0 行起的连续标题行）内任一行勾选即**整个表头区**重复；② 重复行数按 `rowspan` 完整性对齐到最近的闭合边界，跨出表头区的主格在续片渲染时裁剪到边界内，不再越界吞格；③ 插入标题行、把行改为标题行时自动继承相邻标题行的重复设置，避免漏勾；④ 属性面板开关更名为「表头每页重复」，作用于整个表头区。单行表头行为不变，存量单行表头模板产物逐字一致。

## V1.3.0(2026-09-20)

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**多页面模板**——一份文书由多篇**版式不同**的页面按固定顺序组成，全部绑定**同一份数据**（如「封面 + 正文 + 条款」）。此前一份模板只能描述单页版式，多页只能来自内容溢出切片或同模板多份拼接，无法在同一份文档里组合不同版式。
  ① 数据模型：新增 wrapper 类型 `MultiPageTemplateData`（`{ version?: 1, pages: TemplateData[] }`），`RenderRequest.templateJson` 与 `PrintJob.templateJson` 放宽为 `TemplateData | MultiPageTemplateData`；`TemplateData` 新增可选 `name`（页面名，页签显示与错误上下文用，渲染端忽略）。
  ② 新增 `print/multi-template.ts`（主出口导出）：`normalizeTemplate`（归一化 + 统一校验）、`isMultiPageTemplate`、`mergeFontDeclarations`（各页声明的字体按族名去重合并）、`composeMultiPageDocument`（多页面拼接为单文档）。
  ③ 渲染语义：每个页面模板**各自独立跑一遍完整的「绑定 → 测量 → 分页」**，共用同一份数据；「下一模板必须新开一页」由各自产出的整页 `.print-page` 天然保证，无需额外分页指令；页码 `{pageIndex}` / `{totalPages}` 在**份内全局连续**（按前序模板页数累计 `pageOffset`）；`firstPageOverlay` 的生效条件由「文档第 1 页」改为「**各模板自身的首页**」（单模板时两者等价，行为不变）；`pageCount` 为份内全部模板页数之和，整份文档**一次出图**（单次 `page.pdf()`）。
  ④ CSS 随之作用域化拆分为 `buildBasePageCss()`（模板无关部分）+ `buildPageGeometryCss(template, '.mt-N')`（各页几何）；**单模板产物与旧版逐字一致**，由护栏测试锁死，存量模板零迁移。
  ⑤ 三条硬校验由 `normalizeTemplate` 统一抛出，设计器保存/预览、render 服务共用：至少 1 页；各页纸张尺寸（含方向）必须一致；**不支持连续纸与标签拼版**（二者与「必须新开一页」语义冲突）。错误信息带页面名，如 `多页面模板不支持标签拼版（第 2 页「条款」）`。
- `@worm-vue3-print/canvas`：多页面设计能力。新增**页面栏**（`PageTabs`），支持新增、复制、删除、前移/后移、**双击重命名**、点击切换，操作按钮带上下文悬浮提示；删到只剩一页时自动回落单模板模式。纸张设置（纸型/方向/自定义尺寸）绑定当前页但**改一次即写入所有页**（多页面要求纸张一致，UI 只暴露一份纸张设置），页边距、页眉页脚、首页叠加、水印与内容元素则按页各自独立；多页模式下隐藏拼版配置、禁用连续纸纸型（与渲染端校验互为双保险）；`getTemplateJson()` 单页输出裸 `TemplateData`、≥2 页输出 wrapper，`initialTemplate` prop 放宽为联合类型并在载入时归一化；保存/预览前用 core 的 `normalizeTemplate` 同款校验，错误在 UI 内直接提示。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**页面内容旋转角度**（`TemplateData.outputRotation`，取值 `0 / 90 / 180 / 270`，属性面板「内容旋转角度」，缺省 `0`）——解决「横版设计、竖版出纸」：90/270 时出纸纸张宽高互换（`PreparedDocument.paperMm` 随之改变），页面内容整体旋转填满出纸版面，**不缩放、不裁切**；0/180 纸张不变。最终渲染层按角度追加 rotor 类包裹页面（测量趟不包裹，避免两次结果不一致）。单页与预览/服务端/客户端三端同源。
- `@worm-vue3-print/core`：打印管线支持**批量打印**——`printData` 传对象数组即按数组长度拼出同一个文档的多份副本（此前只能宿主页自己做 HTML 拼接）：同模板多份共用一次渲染管线，份间强制分页（`.print-copy` + 份间分页 CSS；连续纸走命名页，各份高度可不同）；`PreparedDocument` 新增 `copies` 与批量时每份的物理纸张尺寸 `copyPaperMm`。新增纯字符串合并器 `composeBatchHtml`（单份产物类型 `BatchCopyInput`）与 `normalizePrintData` / `MAX_BATCH_COPIES`（**上限 500 份**，空数组或含非对象项直接报错并给出 1 基项序号）。`@worm-vue3-print/render` 的 PDF 接口与桌面客户端 `print` 协议同步接受数组并按同一上限校验（截图接口同样接受数组，但按既有语义**只渲染首条**），浏览器预览回传渲染份数。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**设计背景（定位底图）**——`TemplateData.designBackground`（`src` + `rotation`，90° 步进），页面属性支持上传、旋转、移除；**只在设计画布显示**用于套打对位，预览、服务端 PDF 与静默打印一律忽略（不产出）。宿主通过 `uploadDesignBackground` 适配器提供上传实现（须返回完整可访问图片路径，不参与 `baseUrl` 拼接），也可由深层注入键 `UPLOAD_DESIGN_BACKGROUND_KEY` 提供。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：纸张尺寸切到**标签纸**（80×60 / 60×40 / 40×30mm）时，默认套用「整张纸都给内容区」的版面——四边页边距归零、页眉页脚高度归零（页眉页脚里已有的元素保留，把高度改回即可恢复）。该默认值**只在切换纸型时套用一次**，之后用户仍可在「页边距」「三区高度」里自行改回；存量标签纸模板打开时不会被改写。core 新增 `isLabelPaperSize` / `labelPaperDefaults` 两个纯函数，宿主与自建设计器可复用同一口径。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**行为变更** 条形码（**元素**与**表格单元格**）不再拉伸填满可用框，改为同一套「条宽 → 打印机 dpi → 等比缩小」结算（`render/barcode-dot.ts` 的 `resolveBarcodeSize`）：
  ① **首选尺寸来自条宽**：每模块 `barWidth/2 × 0.25mm`，可用框装得下就按原样落纸、不再放大——放大到填满必然得到非整数条宽，正是出纸「忽宽忽窄」的根因；
  ② **设置了打印机分辨率时 dpi 优先适配**：首选尺寸吸附到「每模块整数个打印点」（DPI 优先于条宽的精确毫米值，如 0.25mm 在 300dpi 下取 3 点 ≈ 0.254mm），宽度足够即按此落纸；
  ③ **可用宽度不足时等比缩小**：有点阵时按整数点逐级缩小以保住点对齐，连 1 点/模块都放不下才退回连续等比缩放（此时已无法对齐，但不会溢出可用框）；宽高始终同比缩放，条码不会被拉变形。
  三端（设计器画布 / 浏览器出图 / 服务端渲染）的元素与单元格共用同一份常量与算法；尺寸统一由该
  结算函数给出后，条形码出图改为**恒内联 `<svg>`**（`<img>` 承载 SVG 时 Chromium 会把内在尺寸取整到 CSS px，结算出的 mm 会被改写），`maxWidth`/`maxHeight` 并入可用框参与结算；
  拉伸会把条宽变成非整数，故**条形码不再提供「缩放模式」**（条宽与 dpi 决定尺寸，需要上限用「最大宽高」），属性面板同步调整。**同一份旧模板的条码会变小**（缺省 barWidth=2 时约为元素框的一半），这是有意为之——放大条宽即可加大条码，换来的是出纸条宽稳定。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：文本元素与表格单元格支持**三种文字溢出显示形式**（属性面板「文字溢出」，模板字段 `textFit`）：
  `clip` 截断（不换行 `wordWrap:false` 时以省略号收尾）、`shrink` 自动缩小（下限 `shrinkMinFontSize`，缺省 6pt，缩到下限仍放不下则退化为截断）、
  `autoHeight` 自适应行高（元素高度/行高随内容增高）。**缺省值与既有行为一致，存量模板不受影响**（`text` 缺省截断、`longText` 与单元格缺省自适应行高）；
  自动缩小在测量趟用真实排版引擎二分求解并通过 `applyTextFit` 回写模板（会话原语 `measure` 返回值由 `RawMeasurement[]` 变为 `{ measurements, fits }`），
  三端字号一致；设计器画布复用同一份算法与可用高度换算（`fitTextNode`），设计态字号即出纸字号。DOM 执行器产物版本升到 `2`（新增 `applyTextFit`）。
- `@worm-vue3-print/core`：新增打印管线模块（driver 契约 + 共享 DOM 宿主 runtime + 三端 driver），
  浏览器、服务端、桌面客户端统一使用同一份测量、分页、连续纸推导、码制渲染与出图规格；
  新增 IIFE 执行器产物与 `@worm-vue3-print/core/node` 出口（`loadExecutorBundle`）。
- `@worm-vue3-print/render`：**行为变更** ① 连续纸模板按内容推导纸高（此前固定 `80×297mm`）；
  ② 条码/二维码渲染基线由 `bwip-js` 切换为 `jsbarcode`/`qrcode`（与浏览器预览一致）；
  ③ 就绪等待由 `networkidle` 改为 `domcontentloaded` + 5s 就绪等待；服务端不再依赖 `bwip-js`。
- `print-client`：**行为变更** 测量就绪等待由 3s 调整为 5s；渲染 worker 与 IPC 桥删除，
  改由主进程装配 core 管线与 Electron driver（`print.submit` / `print.submitHtml` 协议与出纸行为不变）。
- 已知缺口（本次未实现）：协议接受 `color` 与 `pageRanges`，但 PDF→系统打印链路从未应用这两个参数。
- `@worm-vue3-print/core`：**行为变更** 表格单元格此前已存有 `fontFamily` 的模板，渲染时该字段被静默丢弃（`data-binder` 的字段映射表未收录）；本次修复后单元格字体会真正生效，**同一份旧模板的呈现会发生变化**。同时修复 `font-family` 输出未加引号、未带兜底栈的问题（含空格的族名如 `Microsoft YaHei` 此前不生效）。
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`：新增 `PrintDesigner` 的 `fonts` prop（`PrintFontDeclaration[]`）——**模板级字体声明**，宿主配置后设计器注入 `@font-face`、在字体下拉中列出，保存/预览/截图时同步写入模板 JSON 的 `fonts` 字段，服务端与桌面客户端据此出图，三端不再依赖各自系统里装了什么字体。字体的 `url` 以 `/` 开头时按渲染端 `baseUrl` 解析（复用图片相对路径那套规则），绝对 URL 原样使用。
- `@worm-vue3-print/core`：渲染出的 HTML 会带上模板声明字体的 `@font-face`（`font-display: block`），且第一遍测量与最终出图都注入；DOM 执行器在就绪等待时**显式加载**文档里声明的字体，避免只等 `fonts.ready` 提前 resolve、按兜底字体度量导致分页与出图错版。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：字体声明新增可选 `label`（业务名，如「马善政毛笔楷书」），字体输入框与下拉优先展示 label 并在括号里附上真实族名（如「马善政毛笔楷书（Ma Shan Zheng）」），搜索同时匹配 label 与族名；**写入模板与 `@font-face` 的始终是 `family`**，输入 label 回车会映射回族名，避免把展示名写进模板导致字体静默失效。
- 字体基址与图片基址解耦（**修复自定义字体只在设计稿生效**）：模板声明字体的相对 URL 此前被拼到图片 `baseUrl` 上（如业务 OSS 域名），出图端因此 404、静默回退系统字体。现改为 `bindData(template, data, baseUrl, fontBaseUrl)`——`fontBaseUrl` 独立指定，缺省回落 `baseUrl`，传空串表示不拼接（浏览器端按文档 origin 解析，缺省行为）；`PrintJob`、render 服务的请求体与 `FONT_BASE_URL` 环境变量、SDK `print(..., { fontBaseUrl })`、客户端校验与渲染、`PrintHtmlPreview` 均支持。另外 **字体站点/CDN 必须返回 `Access-Control-Allow-Origin`**：出图端加载模板 HTML 时的 origin 为 `null`/应用协议，缺 CORS 头字体同样会被拦下。
- `@worm-vue3-print/canvas`：文本元素与表格单元格属性面板的「字体」下拉只列出模板声明字体（展示 label，模板当前值不在声明内时保留并标注「（未知）」）；声明之外的字体名仍可直接输入，不做静默清除。
- `@worm-vue3-print/core`：分页引擎支持**元素堆叠与显式编组同页**。此前内容区每个非表格元素各自扣减一次实测高度，纵向重叠的元素会被重复计高（触发本不需要的换页），且放不下时单个元素被独自推到下一页，导致设计器里的层叠组合在打印时被静默拆散。现改为：① 纵向区间相交的元素按并查集聚为「堆叠单元」，纵向只按并集占用一次版面、放不下时整组一起换页（上下边相切不算重叠，顺序流式排版结果不变）；② `options.groupId` 相同的显式编组成员强绑定同页，不参与表格跟随区归属，组内含 `pageable:false` 成员时整组锁定首页；③ 换页后整组平移到内容区顶部，组内相对偏移保持设计值；④ 内容区层序排序由仅按 `top` 改为 `top → zIndex → 模板数组序`，无 zIndex 时与设计器 DOM 层序确定一致。
- `@worm-vue3-print/canvas`：单击已编组元素的任一成员即选中整组（此前只选中单个成员），整组拖拽移动、Ctrl+G 编组、Ctrl+Shift+G 取消编组、右键菜单与图层层级保持一致；Ctrl/⌘ 多选仍按单元素切换。
- **破坏性变更：移除字体查询功能（含服务端与桌面客户端）** 不再获取两端系统字体清单——删除 `PrintDesigner` 的 `serverFonts` / `clientFonts` / `loadFonts` props 与「查询字体」按钮、离线与缺失字体提示；删除 `@worm-vue3-print/render` 的 `GET /fonts` 与 `X-Font-Warnings` 响应头、`@worm-vue3-print/client` 的 `fonts.list` 协议与 `PrintClient.listFonts()`、桌面客户端 `print.submit` 的缺字 `warn` 日志，以及 core 的 `readSystemFonts` / `mergeFontSources` / `findMissingFonts` 等清单合并与缺失校验能力。字体可用性完全由模板 `fonts` 声明与 `@font-face` 决定。

### 新增

- `@worm-vue3-print/core`：新增**条形码打印点对齐**（新模块 `render/barcode-dot.ts`）——把条码最终尺寸吸附到打印机点阵网格，修复热敏打印机出纸「条宽忽宽忽窄、边缘发灰」。根因（实测）：元素框 56.4×14.1mm、CODE128 编 8 位数字时单模块 0.318mm，在 203dpi（8 点/mm）下等于 **2.55 个打印点**；PDF 里条码是纯矢量且几何精确，但打印机/RIP 只能按整点成像，非整数条宽被各自取整成 2 点或 3 点。工具类软件之所以清楚，是因为它把窄条宽度定为整数打印点（如 3 点 = 0.375mm）。条形码元素新增 `printerDpi`（`options.printerDpi`，常见 203/300/600）；**表格单元格条形码同样支持**（`TableCell.printerDpi`，可用框 = 单元格内容区：所跨列宽/行高扣除内边距与塌陷边框，由新增的 `cellFitWidthMm` 与既有 `cellFitCapMm` 同一口径求出；表格未配置 `tableColWidths` 时宽度未知，不启用点对齐）——两者都在面板提供「打印机分辨率」下拉，且点对齐时隐藏缩放模式与最大宽高（叠加会把对齐结果重新缩成非整数点）；单元格类型切离条形码时清除该字段。同时修复另外两处清晰的元凶：① 条形码 SVG 补 `shape-rendering="crispEdges"`（二维码一直是这么设的；实测条边缘灰像素占墨迹 11.3% → 1.7%）；② 恢复**左右静区**（jsbarcode 缺省 10 模块，此前出图端写死 `margin:0`，EAN13/UPC/ITF14 会直接扫不出），且静区只留左右以免上下留白白白吃掉元素高度。设计器画布 `BarcodeElement` 与出图端共用同一份常量与算法（jsbarcode 参数统一以「模块」为单位表达），修掉此前设计态与出纸两套图形、`fontSize` 被当成 pt 的问题。**未设置 `printerDpi` 时几何与既有行为一致**（仅静区与去抗锯齿生效）。
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`：条形码/二维码**元素**补齐与表格单元格同口径的配置能力——属性台新增「条码设置」分组（此前该分组组件存在但未挂载，码制/条宽/显示文本/字号/纠错级别在界面上无处可改）：条形码可选码制（CODE128 / EAN13 / EAN8 / UPC / CODE39 / ITF14，存量大写归一化，选缺省码制时清字段）、条宽（倍率 2~4，启用打印机分辨率后隐藏并改为自动对齐）、显示文本（`hideTitle`）、文本字号（相对条高）；二维码可选纠错级别；「自定义设置」段与单元格一致：缩放模式（`fit`）、最大宽度/最大高度（mm，`ElementOptions` 新增 `maxWidth`/`maxHeight`）。新增字段经 `codeImgHtml` 透传到出图 `<img>` 的 `object-fit`/`max-width`/`max-height`，画布侧同步生效（内联 `<svg>` 用 `preserveAspectRatio` 等价映射，`fit='none'` 退化为 meet）。**未设置新字段时产物零变化。**另修复：单元格条形码在设计态默认不显示码值下方文本——`showText` 是布尔 prop，缺省会被 Vue 转成 `false`，而出图端 `showBarcodeText` 缺省为显示，两者不一致；现由 `TableElement` 显式传 `cell.showBarcodeText !== false`，画布侧 jsbarcode 参数（条高 30 / 字号 10 / 左右静区 10 模块 / 关抗锯齿）也与出图端同源。
- 打印客户端：新增「保留生成的 PDF」排查开关（配置窗口勾选，`config.json` 的 `keepGeneratedPdf` / `pdfOutputDir`，留空默认 `userData/pdf`）——保留每次打印生成的 PDF，任务记录显示其绝对路径并提供「打开目录」，用于判断问题出在 PDF 生成还是打印机/驱动。
- `@worm-vue3-print/client`：新增浏览器预渲染直提交通道——协议消息 `print.submitHtml` 与 SDK 方法 `PrintClient.printHtml(rendered, options, templateName)`。宿主页用 `@worm-vue3-print/core/browser` 的 `renderHtmlPages` 在浏览器内完成两遍渲染，把最终 HTML（含纸张/方向/边距/连续纸高度）直送客户端静默出纸，客户端不再执行模板渲染；旧 `print`（客户端内渲染）链路保留兼容。
- 打印客户端：`print.submitHtml` 入站校验（HTML 非空、≤20MB、`paperMm` 毫米正数、`continuous`/`pageCount` 类型），纸张/方向/边距覆盖项一律以 `INVALID_REQUEST` 拒绝；打印引擎重构为「准备（渲染或直取 HTML）→ 出纸」双路共用流程。
- demo：「客户端静默打印」改为浏览器侧渲染后经 `printHtml` 提交（新增 `src/browser-render.ts` 封装）。
- 新增仓库内技能 `skills/print-template-json`：**用简写 JSON 生成打印模板**。SKILL.md 定义工作流，`scripts/build_template.py` 把简写（box / size / align / code / cols / rows …）展开为完整 `TemplateData`（自动补骨架、元素 id、`printElementType`、表格合并占位格），`scripts/validate_template.py` 按管线硬规则出纸前校验（越界、2mm 安全余量、列宽行高和、每行列数、拼版列数上限、连续纸禁拼版、表达式花括号配对与函数白名单），`assets/templates/` 附 7 份成品模板与数据。
- demo：新增**示例模板库**（`src/samples/`）——7 份静态数据示例（采购收货单、称签、价签、快递面单、零售小票、资产标签、销售出库单），「加载示例」改为分组选择弹窗，卡片缩略图按元素坐标等比绘制；选中即载入模板、字段树与打印数据，批量数据按示例自带或安全派生。
- `@worm-vue3-print/canvas`：设计器多页面 API——`useDesignerState` 与 `PrintDesigner` 实例暴露 `pages` / `activePageIndex` / `switchPage` / `addPage` / `duplicatePage` / `deletePage` / `renamePage` / `movePage`；撤销历史与选区管理由单页扩展为按页收敛（页操作即清空当前页选区）。

- `@worm-vue3-print/core`：新增同构水印模块（`render/watermark.ts`）——`generateHtml` 在每页最底层输出 `.watermark-layer`（**显式矢量瓦片**，逐块 `<svg class="watermark-tile">`），设计模板、浏览器预览、服务端 PDF、静默打印四端水印渲染完全一致。
- `@worm-vue3-print/core`：`WatermarkOptions` 新增 `tileWidth`/`tileHeight`（瓦片尺寸，控制水印密度，默认 260×180）；导出 `WATERMARK_DEFAULTS`、`WATERMARK_DENSITY_PRESETS`、`PX_PER_MM`、`MM_PER_PX`、`isWatermarkVisible`、`resolveWatermarkText`、`formatTimestamp`、`resolveWatermarkLayout`、`renderWatermarkTileSvg`、`renderWatermarkLayerHtml`。
- `@worm-vue3-print/core`：水印表达式支持系统变量 `{printDate}`（打印日期 YYYY-MM-DD）、`{printTime}`（打印时间 HH:mm:ss）、`{pageIndex}`（当前页码）、`{totalPages}`（总页数），与表达式弹框「变量」一致；`injectSystemVariables` 同步支持 `{printTime}` 替换，并导出 `resolveSystemVariables` 供设计器预览复用（预览与打印取值同源）。
- `@worm-vue3-print/canvas`：水印配置面板合并为单一「水印表达式」输入——**纯文本即静态水印（`mode=fixed`）**，含 `{字段}`、函数调用（`CONCAT(...)`）或字段路径（`order.no`）则按表达式解析（`mode=binding`），无需再手选模式；表达式通过表达式弹框（按钮或双击输入框打开）编辑，弹框内可直接选业务字段与打印日期/时间等变量；移除预设绑定字段下拉与时间戳开关（时间戳改由表达式里的 `{printDate}`/`{printTime}` 表达）；测试值仅在表达式模式下展示；保留密度（密/中/疏/自定义瓦片尺寸）等设置。
- `@worm-vue3-print/canvas`：`WatermarkConfig`、`CanvasPaper` 水印渲染改用 core 同构模块，三端渲染一致。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**标签拼版**（模板 `tiling` 配置）——小尺寸标签模板不再「一张纸打一个标签」：开启后按「列 × 行」把多份标签铺进目标纸（默认 A4 纵向、四边留白 10mm、格间距 2mm、列数手工指定、行数按纸面自动推导），单份数据同样走拼版（1 格 1 张）。core 新增 `print/tiling.ts`（`computeTileLayout`：纸面/列数/标签高度校验与行列推导，连续纸不支持拼版）与 `print/tile-compose.ts`（按格铺排合成 HTML）；拼版下 `renderPdf` 的 `pageCount` 改为**实际输出张数**（预览「共 N 页」与客户端任务历史同口径），`paperMm` 为目标纸尺寸。canvas 新增拼版配置面板（开关、目标纸与方向、自定义尺寸、四边留白、横纵间距、列数），实时显示行列数与可容纳格数；任一份标签底部超出其内容区时拼版直接报错，不静默裁切。`@worm-vue3-print/render` 新增拼版端到端集成测试（真实 Chromium 校验张数与格坐标）。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：纸张预设新增**针式打印纸**（`DOT_FULL` 全等分 241×279.4mm、`DOT_HALF` 二等分 241×139.7mm、`DOT_THIRD` 三等分 241×93.1mm）、**标签纸**（`LABEL_80X60` / `LABEL_60X40` / `LABEL_40X30`）、**小票纸**（`THERMAL_57` / `THERMAL_80` / `THERMAL_110`，连续纸：纸宽取预设值、可用 `customWidth` 覆盖如 58mm，出纸高度仍按内容推导、方向强制纵向）。`PaperSize` 与 `PAPER_DIMENSIONS`/`PAPER_PRESETS` 同步扩展，`isContinuousPaperSize(paperSize)` 判定连续纸（小票纸与 `CONTINUOUS` 均为真），拼版目标纸下拉仍排除连续纸；设计器「纸张尺寸」下拉按「常用纸张 / 针式打印纸 / 标签纸 / 小票纸 / 连续纸」分组显示中文名与尺寸。

### 修复

- `@worm-vue3-print/core`：修复水印经**真实打印机出纸**后被放大约 3 倍、位置偏移、平铺错乱的问题。根因是水印原先用 CSS 平铺背景（`background-image` + `background-repeat`）实现，Chromium 会把它编译成 PDF 平铺图案（tiling pattern），PDF 查看器正常但出纸链路的 RIP 忽略图案矩阵（其所在 form 的 CTM 为 3.125 = 300dpi÷96px，实测放大倍数吻合）。现改为显式矢量瓦片：`resolveWatermarkLayout` 按纸张尺寸（含连续纸探针推导的最终纸高）计算瓦片网格，逐块输出内联 `<svg>`，出纸几何回到设计值（A4 默认密度 68.8mm × 47.6mm）。删除 `buildWatermarkSvgDataUrl`，杜绝回归到平铺背景方案。
- 打印客户端：修复**出纸方向与浏览器/服务端预览不一致**（横向页面被打成纵向）。根因是出纸命令未声明纸张，CUPS 按队列默认纸张（多为纵向 A4）处理，`pdftopdf` 把横向页旋转 90°（产物 PDF 带 `/Rotate 90`）。现在按「宿主指定驱动纸型 → 标准纸型匹配 → `Custom.<宽>x<高>`（点）」显式下发 `-o media=…`，实测同一份横向 A4 页面由 `/Rotate 90` 恢复为 `/Rotate 0`，纵向页面不受影响。
- 打印客户端：修复静默打印「PDF 生成超时 → 后续任务全部 BUSY」——`webContents.printToPDF` 已移除回调重载（回调永不触发、Promise 拒绝被静默吞掉），且 `PrintToPDFOptions.pageSize` 单位是**英寸**而非微米（误传微米会得到 210000×297000 英寸纸张，Electron 44 直接生成失败）。改用 Promise + 超时兜底（`src/main/pdf-generator.ts`）、纸张微米→英寸换算、显式零边距与 `printBackground: true`；生成失败/超时统一以 `PRINT_FAILED` 返回并释放串行锁，客户端静默打印产物与服务端 PDF 的水印、纸张尺寸一致。
- 打印客户端：出纸链路文档同步为「HTML → printToPDF → 系统打印命令」（`clients/print-client/README.md`、`docs/中文/指南/静默打印.md`、静默打印技能参考）。
- `@worm-vue3-print/core`：修复小纸张模板输出**空白第一页**（如 80×60mm 自定义纸、边距 10mm、内容高 38mm）。两处根因：① 分页引擎 `finishPage()` 无条件把当前页入列，首个元素/单元判定放不下时会产出一张空纸、内容整体下移一页；现在空页不入列，内容按设计坐标留在本页；同时在 `PageLayout.overflow` 标记「内容底部超出内容区会被纸面裁掉」（按物理边界判定，不看分页预算里的 2mm 安全余量——贴着纸边排仍是合法排版），拼版「每份恰好 1 页」校验据此继续阻断真正超高的内容。② DOM 执行器测量元素高度用 `offsetHeight`（整数 px，向上取整），38mm 被读成 144px = 38.1mm，恰好越过 40mm 内容区扣除 2mm 安全余量后的 38mm 预算，把「放得下」误判为「放不下」；现改用 `getBoundingClientRect().height` 取亚像素真实高度（表格行高同理）。
- `@worm-vue3-print/canvas`：修复多页面模板**页面重排后页签名漂移、新增页重名**——首页（默认模板创建或宿主载入）没有存储 `name`，页签只能按位置回退显示「页面 N」，页面前移/后移后索引变化导致名字整体漂移，与已固化的页名冲突；现在初始化时给无名页补存固定默认名，`addPage` 改取第一个未占用的名字（删页后再新增也不会重名）。
- `@worm-vue3-print/core`：修复多页面模板**批量打印时份间分页失效**——批量拼接时每份虽已包 `.print-copy`，但 CSS 拼接漏了份间强制分页规则，每份最后一个 `.print-page` 命中 `:last-child`（`break-after: auto`），两份会连着排；现复用 `COPY_BREAK_CSS` 并在批量时追加（已导出该常量），render 集成用例验证「2 份 × 3 页 = 6 页」。
- `@worm-vue3-print/core`：浏览器适配器 `renderHtmlPages`（`@worm-vue3-print/core/browser`）入参类型放宽为 `TemplateData | MultiPageTemplateData`，浏览器侧可直接提交多页面模板。

### 变更

- 渲染微服务 `worm-vue3-print-render` 并入本 monorepo，落地为私有服务包 `services/print-render`（包名 `@worm-vue3-print/render` 保持不变，不发布 npm）；通过 npm workspace 本地软链依赖 `@worm-vue3-print/core`，不再从 npm registry 安装 core。
- 根工作区新增 `services/*` 分层；`npm run build` 同时构建 render，根 `npm test` 仍只覆盖 core/canvas，render 的浏览器集成测试由 CI 独立 job 执行。
- 新增根 `.npmrc`：Playwright 浏览器不随依赖安装自动下载，本地/CI 按需执行 `npx playwright install chromium`，Docker 镜像使用基础镜像内置 Chromium；Docker 构建上下文改为仓库根（`docker build -f services/print-render/Dockerfile .`）。
- demo（`demo/`）新增服务端 PDF 打印：顶栏显示渲染服务在线状态，「服务端 PDF」按钮经 Vite dev 代理（`/render-api/*`，代理层注入 `X-Render-Key`）调用 render 微服务，取当前画布 JSON + 示例数据两遍渲染出 PDF 并新标签页打开。
- `@worm-vue3-print/canvas`：**破坏性变更** 删除设计器内置的「加载默认布局」按钮与 `load-default-template` prop——模板加载/重置属于宿主业务。宿主在自有页面区域渲染入口，把新的 `TemplateData` 赋给 `initial-template` 即可重载画布（设计器按引用变化监听并记录一次历史，撤销可回退）。原注入 `load-default-template` 的宿主该 prop 会被忽略，需改为上述写法。
- demo：适配多页面模板——载入/导入/保存接受并处理 `MultiPageTemplateData`（存什么返回什么），预览与批量数据源按整份多页文档渲染。
- `@worm-vue3-print/render`：多页面模板端到端集成测试（真实 Chromium 校验 PDF 页数、各页纸张一致、「下一模板新开一页」的页边界），请求类型放宽为联合类型后逻辑全部落在 core 校验。

### 已知限制

- 多页面模板出纸时「内容旋转角度」取**首页**的 `outputRotation`（各页纸张尺寸已强制一致，但角度尚未纳入一致性校验）；每页独立旋转角度留作后续扩展。
- 多页面模板不支持连续纸与标签拼版，也不支持数据驱动的条件包含页（如金额超阈值才追加条款页）。

## V1.2.2(2026-09-11)

### 变更

- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/designer`——框架无关的设计器内核，包含完整模板模型类型、通用工具（元素工厂、表格矩阵、单位换算、模板迁移、标尺等）与纯交互逻辑（对齐、分组、键盘、缩放、吸附计算），无 Vue/React 等框架依赖。
- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/browser`——浏览器侧渲染适配器（`renderHtmlPages` 两遍分页渲染、`browserCodeRenderer` 条形码/二维码渲染）。
- `@worm-vue3-print/canvas`：设计器模型、工具与纯逻辑下沉至 core 子路径，canvas 仅保留 Vue 适配层；公共导出 API 保持不变，core 主入口仍保持零运行时依赖。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏放大/缩小按钮直接线性修改缩放比例、未做滚动锚点校正导致画面漂移的问题；按钮缩放改为与 Ctrl+滚轮一致的乘性步进，并以视口中心为锚点（与「适应窗口」同一缩放管线）。

## V1.2.1(2026-09-11)

### 变更

- `@worm-vue3-print/canvas`：工具栏编辑区/层级区/视图区图标按钮统一使用 data-tip 自定义悬浮提示，补齐「网格」「吸附」缺失提示；提升提示层级，不再被画布顶部标尺遮挡。
- `@worm-vue3-print/canvas`：优化「适应窗口」——以视口中心为锚点一步缩放到位（与 Ctrl+滚轮同一缩放换算管线），缩放平滑过渡；允许低于交互缩放下限（最小可至 5%），超大纸张也能整版容纳，纸张在画布视口内水平垂直居中。
- `@worm-vue3-print/canvas`：新增 `showHelp` 配置——控制帮助入口（帮助按钮与帮助弹框）显示，默认开启，传入 `false` 即可隐藏。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏悬浮提示气泡被画布顶部固定标尺遮挡无法显示的问题。
- `@worm-vue3-print/canvas`：修复「适应窗口」后超大纸张仍残留滚动条、纸张未在画布视口居中（垂直偏上）的问题。

### 文档

- 新增打印设计工作台布局线框图文档（`docs/中文/打印设计工作台-布局线框图.md`），标注各区域名称、功能与对应组件文件，便于后续布局调整。

## V1.2.0(2026-09-10)

### 新增

- `@worm-vue3-print/canvas`：新增帮助文档模态框（HelpModal），包含功能介绍、快捷键一览、常见问题等帮助内容。
- `@worm-vue3-print/canvas`：标尺参考线增强——支持拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。
- `@worm-vue3-print/canvas`：表格列宽拖拽新增末列右边界手柄，可直接拖拽调整末列宽并受 `maxTableWidth` 钳制。

### 变更

- `@worm-vue3-print/canvas`：优化缩放逻辑，取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。
- `@worm-vue3-print/canvas`：移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。

### 文档

- 仓库根目录新增 `AGENTS.md` AI 代理行为规范文件，明确代理在本仓库工作时的语言、专家态度、协作约定等强制要求。
- 新增 `worm-vue3-print` 集成支持 skill（`skills/worm-vue3-print-integration/`），包含安装指南、集成 API、故障排查等参考文档。

### 修复

- `@worm-vue3-print/canvas`：修复表格列宽拖拽存在的多个缺陷——内部列边界向左拖时左列宽度不变导致边界线不跟随光标、px→mm 单位换算缺失导致拖拽距离存在约 3.78 倍偏差、`table-layout:fixed` 下拖拽过程中表格 CSS `width(100%)` 与列宽和失配导致浏览器按比例拉伸列使边界线与右侧内容偏离光标；同时删除 `onColResizeStart` 中残留的 `document.title` 调试代码。

## V1.1.0(2026-09-06)

### 新增

- `@worm-vue3-print/canvas`：表格元素支持列宽拖拽——设计态选中表格后，在列边界悬停并拖动即可调整该列宽（左侧列），实时更新画布与元素尺寸；受打印范围宽度（`maxTableWidth`）与最小列宽（5mm）钳制，拖拽结束后计入一次撤销历史。属性面板的列宽数值输入保留作为精确输入兜底。
- `@worm-vue3-print/canvas`：表格单元格支持图片类型——单元格可切换为图片类型，设计态支持选择图片与设置 fit/maxWidth/maxHeight，预览与打印输出完整渲染。
- `@worm-vue3-print/canvas`：条形码与二维码单元格支持 fit/maxWidth/maxHeight 属性。
- `@worm-vue3-print/canvas`：属性面板位置尺寸改用 StepperInput 控件，支持按钮微调数值；StepperInput 支持可选值列表和小数步进。
- `@worm-vue3-print/canvas`：新增统一颜色选择器并重构属性面板字段分组。
- `@worm-vue3-print/canvas`：支持页面（纸张）背景色 `pageBackground`，预览与打印/PDF 输出一致。
- `@worm-vue3-print/canvas`：支持 canvas 库模式构建与 npm 发布。

### 修复

- `@worm-vue3-print/canvas`：打印/导出 PDF 保留元素背景色（`print-color-adjust: exact`）。
- `@worm-vue3-print/canvas`：打印预览保留元素重叠，表格下方跟随元素按设计坐标绝对定位并透传层级 z-index。
- `@worm-vue3-print/canvas`：打印页眉页脚区域贴页面底部，修复页边距失效。
- `@worm-vue3-print/canvas`：条形码渲染缺少 `object-fit: contain`。
- `@worm-vue3-print/canvas`：修复 canvas 测试在 vitest v4 + happy-dom 环境下 `localStorage` 未定义的问题，补充 mock 以兼容测试环境。

## V1.0.0(2026-09-02)

### 新增

- 首次开源发布。
- `@worm-vue3-print/core`：模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定）。
- `@worm-vue3-print/canvas`：Vue 3 可视化打印模板设计器画布。
- 渲染微服务拆分为独立仓库 `worm-vue3-print-render`（仅 Docker 部署，不上 npm）。
