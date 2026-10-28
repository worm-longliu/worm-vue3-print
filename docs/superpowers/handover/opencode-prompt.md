# opencode 委托提示词：拼版内容旋转收尾实现（验收方：主会话 agent）

把下面整段作为提示词交给 opencode（模型 `opencode/deepseek-v4.1-flash-free`，`opencode run -m … --auto`，cwd=/Users/worm/worm-vue3-print）。发出前先按「发起前检查」核对实况、按需修订。

---

## 一、背景

仓库 worm-vue3-print（npm workspaces monorepo）。本分支工作区含一个已实现、未提交的功能：拼版模式支持内容整体旋转角度 `outputRotation`（口径 A：每格内容旋转）。完整口径、文件清单、验证证据见交接文档 `docs/superpowers/handover/2026-10-27-tiling-output-rotation-handover.md`——它是本任务的唯一权威依据，先完整读它。

## 二、现状

- 交接文档第三节所列改动已存在于工作区（未提交），此前全量验证为绿：core+canvas+common+client 154 文件 2290 条、渲染服务 38 条。
- 元素级旋转会话已结束，但其改动**同样未提交**、留在本工作区（交接文档第六节清单，归属已逐文件核实）。这意味着：
  - 全量测试跑在「两功能混合」的工作树上，若出红，先看红在谁的文件里；
  - **第六节文件（及任何含元素旋转语义的代码）出红只报告、一律不修**——那是别人未提交的工作；
  - 只有本功能文件（第三节清单）出红才按最小修改修复。

## 三、任务（按序执行）

1. 读交接文档全文。
2. 重新核对实况：`git status`、`git log --oneline -10`。若交接文档与实况冲突（文件已被提交/消失/归属变化），以实况为准并在报告里写明差异。
3. `npm run build`（全工作区必须通过）。
4. 全量测试：`npm test > /tmp/oc-full.log 2>&1; echo EXIT=$?`，渲染服务：`npm run test -w @worm-vue3-print/render > /tmp/oc-render.log 2>&1; echo EXIT=$?`。禁止管道 tail 吃掉退出码。
5. 若有红：先判断红因（他人提交引入的回归 / 本功能与元素旋转的交叉冲突 / 环境问题），按最小修改修复；涉及 `help-content/*.ts` 的改动必须 canvas/common 两侧逐字同步；core 源码改动后必须重建 dist 再跑 canvas/common 测试。
6. 若全绿：不做任何"顺手优化"，直接进入交付。

## 四、验收判据（报告里必须给出）

- `npm run build` 退出码。
- 全量测试：文件数、用例总数、EXIT 值；渲染服务同。
- 若做了修复：每个红因的定性 + 改动文件清单 + 修后复跑数字。
- 工作区最终 `git status --short` 原样贴出。

## 五、门禁（违反任何一条即验收不通过）

1. **禁 git 写**：不执行 add / commit / stash / checkout / reset / clean / push 等任何改变 git 状态的命令。提交由验收方完成。
2. **禁删测试、禁放宽断言**：修红只允许改实现代码；如认为测试本身错误，不改，写进报告留给验收方裁决。
3. 禁碰交接文档第六节所列他人文件（若已被他人提交则自然解除）；禁改 `docs/superpowers/specs/` 下任何文件。
4. 探针/临时验证代码一律不入库，用完即删。
5. 提示、注释、报告一律简体中文。
6. 不做交接文档第五节第 1 步（提交）与第 4 步（发布）——那是验收方/用户的事。

## 六、交付物

一份简体中文报告：任务逐条执行结果、验收判据数字、最终 git status、遗留问题清单。

---

## 发起前检查（主会话 agent 用，不交给 opencode）

- [ ] 元素级旋转会话 a7050270 已完成（runtimeState 非 running，或其文件已出现在提交历史）。
- [ ] `git log` 里已能看到元素旋转相关提交；交接文档第六节按实况修订。
- [ ] 若元素旋转提交吞走了 `designer/types.ts` 的 outputRotation 注释 hunk：核对该 hunk 是否已在他们的提交里，避免验收后重复提交。
- [ ] 记录发起前基线：`git rev-parse HEAD`、当前 `git status --short` 存档。
- [ ] 验收时四道关：EXIT 数字逐包核对、`git show --stat` 对账、禁删测试复查（对比用例总数不得下降）、混改文件 hunk 归属复核。
