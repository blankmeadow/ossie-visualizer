# React 模板与样式参考清单

本文为 `ossie-visualizer` 整理可参考的 React 项目模板、设计系统与同类开源项目。

**本文只是资料，不改动任何现有代码。** 是否落地、落地到什么程度，由你决定。

---

## 1. 现状评估

先说清楚现在是什么，推荐才有依据。

### 1.1 技术栈

| 项 | 现状 |
|---|---|
| 构建 | Vite 8 |
| 框架 | React 19 |
| 图引擎 | `@xyflow/react` 12（React Flow） |
| 编辑器 | CodeMirror 6（`@uiw/react-codemirror`） |
| 图标 | lucide-react |
| 布局算法 | `@dagrejs/dagre` |
| 语言 | **纯 JavaScript（`.jsx`），无 TypeScript** |
| 样式 | **单个 `src/styles.css`，223 行手写 CSS** |
| 测试 | Vitest |
| Lint / Format | **无** |

### 1.2 样式底子：可以保留

`src/styles.css:1-22` 已经有一套自定义 CSS 变量：灰绿主色（`--green` / `--green-dark` / `--green-soft`），加上橙、紫、琥珀三条辅助色，各自带 `-soft` 变体，用来区分 Dataset / Mapping / Metric 三类节点。

这套配色是有想法的，**不建议推倒重来**。下面所有方案的前提都是把这几个颜色迁移过去，而不是换成别人的默认色板。

### 1.3 四个真实缺口

**（1）没有暗色模式，且是硬编码级别的没有**

不只是缺少 `.dark` 规则，而是浅色值散落在 JS 里：

- `index.html:6` — `<meta name="color-scheme" content="light" />`
- `GraphCanvas.jsx:211` — `<Background color="#ccd2cb" />`
- `GraphCanvas.jsx:217` — MiniMap `nodeColor` 里三个十六进制色写死在三元表达式中
- `GraphCanvas.jsx:218` — `maskColor="rgba(241, 243, 238, 0.78)"`

也就是说，即使把 CSS 全部改成响应主题的，画布内的背景点、缩略图遮罩和节点色仍然是浅色的。这是加暗色模式时最容易被漏掉的一块。

**（2）字号没有阶梯**

`styles.css` 里出现了 **13 档不同字号**，从 7px 到 32px（`.welcome h1` 还有一个 `clamp(30px, 4vw, 48px)`）。其中 7px–12px 这个区间就占了 72 处声明：

```
7px×5  8px×13  9px×24  10px×15  11px×8  12px×7
13px×4 14px×5  16px×1  18px×2   21px×1  27px×1  32px×1
```

9px 用了 24 次、10px 用了 15 次、8px 用了 13 次 —— 这三档之间的差异在实际渲染中几乎不可辨，属于随手写出来的值而非设计决策。间距值同理。**这是引入 design token 收益最直接的地方。**

**（3）CSS 无分层，且为单行压缩写法**

223 行里塞了全部内容：重置、布局、组件、React Flow 覆盖、响应式。多条规则写在同一行（例如 `styles.css:111`、`:123`、`:198`），`.json-view` 那一行光是 CodeMirror 的覆盖样式就有近 2000 字符。可读性和可维护性都已经到极限。

**（4）交互组件为手写，缺无障碍**

侧栏的筛选菜单（`App.jsx:386-405`）自己实现了弹层：手动监听 `pointerdown` 和 `keydown`、手动管理 `aria-expanded` / `role="menuitemradio"`。写得其实很规范，但焦点陷阱、方向键导航、关闭后焦点归还这些仍未覆盖。Inspector 面板（`Inspector.jsx`，389 行）同理。

**小结**：配色留着，问题在**分层、token 阶梯、暗色模式、弹层组件**这四项。

---

## 2. 首选路线：Tailwind + shadcn/ui

### 2.1 为什么这条路线对本项目格外合适

一般推荐 shadcn/ui 的理由是「代码入仓、完全可控、自带主题」。但对本项目还有一条更硬的理由：

> **xyflow 官方维护了一套基于 shadcn/ui 的 React Flow 组件注册表 —— React Flow UI（`ui.reactflow.dev`）。**

它在 2025-10 更新至 **React 19 + Tailwind CSS 4**，与本项目的 React 版本完全对齐。这意味着走这条路不是「用 Tailwind 把现有样式重写一遍」，而是**能直接换用官方实现的图组件**。

- 组件总览：<https://reactflow.dev/ui>
- 上手教程：<https://reactflow.dev/learn/tutorials/getting-started-with-react-flow-components>
- 更新公告（React 19 + Tailwind 4）：<https://reactflow.dev/whats-new/2025-10-28>

安装形式（前提是项目已配好 shadcn + Tailwind）：

```bash
npx shadcn@latest add https://ui.reactflow.dev/base-node
npx shadcn@latest add https://ui.reactflow.dev/database-schema-node
```

### 2.2 React Flow UI 组件 → 本项目代码的对应关系

这是本文最值得细看的一节。以下映射逐条比对过源码：

| React Flow UI 组件 | 对应本项目 | 能解决什么 |
|---|---|---|
| **Base Node**<br>（`BaseNode` / `BaseNodeHeader` / `BaseNodeHeaderTitle` / `BaseNodeContent` / `BaseNodeFooter`） | `OssieNode.jsx` 整体 | 现在是裸 `div` + BEM class（`ossie-node__header` / `__name` / `__subtitle` / `__badges`）。换成有结构的容器组件后，新增节点类型不必再手写一遍 class 组合 |
| **Database Schema Node** | Dataset 节点（含 fields） | **近乎现成**：它本就是「表名 + 字段行 + 每行带标签连接点」的节点，正是 Dataset→Field 需要的形态 |
| **Base Handle / Labeled Handle** | `OssieNode.jsx:33-44` 的 `NodeHandle` | 现在靠 `offset` 百分比手工算 `left`/`top` 定位。Labeled Handle 提供带标签的标准实现 |
| **Node Appendix / Status Indicator** | `.ossie-node__badges`；`is-selected`/`is-related`/`is-dimmed` 三态 | 三态高亮目前靠 `OssieNode.jsx:15` 的模板字符串拼 class，加一种状态就要同时改 JSX 和 CSS |
| **Edge with Button** | `RelationshipEdge.jsx` 整体 | 你已经自行实现了 `EdgeLabelRenderer` + 按钮 + `scale(1/zoom)` 反向缩放（`RelationshipEdge.jsx:51`）—— 官方组件是**同一套模式的标准实现**，可以对照着看有没有遗漏的边界情况 |
| **Node Search** | 侧栏搜索（`App.jsx:371`）+ 聚焦跳数 | 现在搜索只在侧栏列表内，选中后靠 `setCenter` 移动视口。Node Search 是画布内直接定位 |
| **Zoom Slider / Zoom Select** | `.depth-switch` 旁的缩放控制 | 替代当前的默认 `<Controls>`（`GraphCanvas.jsx:212`） |
| **DevTools** | 调试 `lib/graph.js`（515 行，最大的文件）的建图结果 | 实时查看节点/视口状态，排查布局问题 |

注册表内的完整分类：Node Utilities（Base Node、Status Indicator、Node Appendix、Node Tooltip）、Custom Nodes（Database Schema、Placeholder、Labeled Group）、Handles（Base、Labeled、Button）、Custom Edges（Edge with Button、Edge with Node Data、Animated SVG Edge）、Controls（Node Search、Zoom Slider、Zoom Select）、Misc（DevTools）。

> **提示**：撰写本文时 `reactflow.dev` 在当前网络环境下无法直接访问，以上组件名均来自可核实的公开检索结果，未凭印象编造。具体 API 签名请以官网为准。

### 2.3 JavaScript 项目怎么用（重要）

本项目是 `.jsx`，而 shadcn/ui 与 React Flow UI 的注册表组件都以 TypeScript 编写。这不是障碍，但需要正确配置：

**shadcn 官方支持 JS 输出**，有专门文档页：<https://ui.shadcn.com/docs/javascript>

关键是 `components.json` 里的 `"tsx": false`：

```json
{
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "",
    "css": "src/styles.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

同时需要 `jsconfig.json`（而非 `tsconfig.json`）来声明路径别名：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

`iconLibrary` 设为 `lucide` 正好和你现在用的 lucide-react 一致，无需换图标库。

**一处需要实测的地方**：`tsx: false` 时 CLI 会把组件转成 `.jsx`。对 shadcn 自家注册表这是官方支持的路径；对 **React Flow UI 这种第三方注册表**，转换理论上走同一套管线，但**建议先单独 add 一个组件（例如 `base-node`）验证产物正常，再决定是否全量迁移**。这一条我无法在不改动项目的前提下替你验证，标注为待确认。

### 2.4 Vite 接入步骤

```bash
npm install tailwindcss @tailwindcss/vite
```

`vite.config.js` 需要加 Tailwind 插件和 `@` 别名（保留你现有的 `base` 和 `server` 配置）：

```js
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  base: './',
  server: { host: '127.0.0.1', port: 4178 },
})
```

然后 `npx shadcn@latest init`。

- Vite 安装指南：<https://ui.shadcn.com/docs/installation/vite>
- `components.json` 字段说明：<https://ui.shadcn.com/docs/components-json>
- CLI 用法：<https://ui.shadcn.com/docs/cli>

Tailwind v4 不再需要 `tailwind.config.js`，主题直接用 CSS 的 `@theme` 声明 —— 这对你有利：`styles.css:1-22` 现有的那套 CSS 变量可以近乎平移过去。

### 2.5 成本与风险（不粉饰）

**改动面**：`App.jsx`（460 行）+ `Inspector.jsx`（389 行）+ 其余 4 个组件的**全部 `className` 需要重写**，`styles.css` 223 行最终会被拆解消化。这是一次大改，不是补丁。

**收益**：

- 暗色模式从「要写两套颜色」变成「换一组 CSS 变量」，且能顺带解掉 §1.3(1) 里 `GraphCanvas.jsx` 硬编码色的问题（改为读 CSS 变量）。
- 字号/间距强制走 Tailwind 的阶梯，13 档字号自然收敛。
- 筛选菜单（`App.jsx:386-405`）可换成 shadcn `DropdownMenu`，手写的 `pointerdown` / `Escape` 监听和焦点管理全部由 Radix 接管。
- Inspector 面板可考虑 `Sheet` 或 `Tabs`；导入弹窗（`ImportDialog.jsx`）可换 `Dialog`。

**建议的渐进迁移顺序**（不要一次性重写）：

1. `init` 配好 Tailwind，让它与现有 `styles.css` **共存**（Tailwind v4 的 preflight 会重置部分样式，这一步就要观察冲突）。
2. 先迁 `OssieNode.jsx` 到 Base Node —— 单文件、54 行、影响面清晰，用它验证 §2.3 的 JS 转换是否正常。
3. 再迁弹层类组件（`ImportDialog` → `Dialog`，筛选菜单 → `DropdownMenu`）—— 这两处收益最高（无障碍）。
4. 最后处理 `App.jsx` 的布局壳和 `Inspector.jsx`，收掉 `styles.css`。

每一步都能独立跑起来、独立提交，随时可以停在中途。

---

## 3. 应用外壳与仪表盘模板

本项目的布局是「顶栏 + 标签栏 + 左侧索引栏 + 中间画布 + 右侧 Inspector」，属于典型的 dashboard shell。

| 来源 | 链接 | 说明 |
|---|---|---|
| **shadcn/ui Blocks（官方）** | <https://ui.shadcn.com/blocks> | 官方 dashboard / sidebar 区块，免费。`sidebar` 系列可直接对照你的左侧索引栏 |
| **xyflow 官方 Vite 模板** | <https://github.com/xyflow/vite-react-flow-template> | `npx degit xyflow/vite-react-flow-template my-app`。**含 ESLint 配置** —— 你现在没有 lint，可以直接抄它的规则集 |
| shadcnblocks.com | <https://www.shadcnblocks.com/blocks/sidebar> | 第三方区块库，**部分免费部分付费** |
| blocks.so | <https://blocks.so/sidebar> | 第三方，有免费 sidebar 区块 |
| Shadcn UI Kit | <https://shadcnuikit.com/> | 完整后台模板，含 Mini Sidebar / 折叠侧栏等布局变体 |

> 第三方 blocks 站点良莠不齐且不少要付费，**优先看官方 Blocks**，不够用再往下找。

---

## 4. 备选组件库

你已倾向 shadcn/ui，此节仅作对比留档。

**Mantine** — <https://mantine.dev>

开箱即用，暗色模式、表单、通知、弹层一应俱全，文档质量高。与 shadcn 的根本差异：**Mantine 是 npm 依赖，shadcn 是代码复制进仓库**。前者升级方便但定制受限于其 API，后者完全可控但要自己维护。值得注意的是 —— 下一节的 JSON Crack 用的正是 Mantine。

**Radix Themes** — <https://www.radix-ui.com/themes>

Radix 官方的成品主题层。shadcn/ui 的底层就是 Radix Primitives，所以两者气质相通；Radix Themes 是「直接给你调好的一套」，shadcn 是「给你源码自己调」。如果嫌 shadcn 改动面太大，Radix Themes 是折中选项。

**如果最后决定不引入任何库**：那就把 §1.3 的四个缺口自己补上 —— 拆分 `styles.css` 为 `tokens.css` / `base.css` / `components.css`，建立字号与间距阶梯，用 `light-dark()` 或 `[data-theme]` 加暗色模式，并把 `GraphCanvas.jsx` 里的硬编码色改为读 CSS 变量。这条路零依赖，最符合项目「纯前端 / Local-First / 零负担」的定位。

---

## 5. 同领域开源项目

这一类不是看样式，是看**产品形态与交互决策**。和本项目重合度从高到低：

### 5.1 JSON Crack — 最贴近的参照

<https://github.com/AykutSarac/jsoncrack.com>

**形态几乎与本项目相同**：左边代码编辑器、右边把 JSON 转成交互式图。

技术栈：TypeScript + Next.js + **Reaflow**（图）+ **Monaco**（编辑器）+ **Zustand**（状态）+ **Mantine**（UI）。用 Turborepo 组织，把画布抽成了独立的 `packages/jsoncrack-react` 包。

**值得借鉴的三点**：

1. **状态管理拆分** —— 你现在 `App.jsx` 单个组件里有 **13 个 `useState`**（`model` / `fileName` / `warnings` / `importErrors` / `importOpen` / `activeTab` / `query` / `selection` / `showRelationships` / `showValueTypes` / `showMetrics` / `focusDepth` / `sidebarKind`），并且要靠 `selectTab`（`App.jsx:164-175`）手工重置其中五个 —— 这是典型的「该上状态库了」的信号。JSON Crack 用 Zustand 把这类图状态收拢，是可直接对照的解法。
2. **画布抽包** —— 把可视化内核和应用壳分开，便于将来做嵌入式版本或 VS Code 扩展（它自己就做了 VS Code 扩展）。
3. **明暗主题切换** —— 它的图节点颜色是随主题走的，正好是你 §1.3(1) 需要解决的问题。

对比差异：它用 Reaflow + Monaco，你用 React Flow + CodeMirror。**你的选型对纯前端场景更轻**（Monaco 体积远大于 CodeMirror），不必跟着换。

### 5.2 AWS graph-explorer

<https://github.com/aws/graph-explorer>

React 编写的属性图 / RDF 浏览器，主打「不写查询语句也能探索图」。可参考它的**节点展开与逐跳探索**交互 —— 和你的「一跳/两跳聚焦」（`focusDepth`）是同一类问题的不同解法。

### 5.3 Microsoft Ontology-Playground

<https://github.com/microsoft/Ontology-Playground>

**零后端、纯静态**的本体浏览与设计工具，支持导出 RDF/XML 和分享交互式图 —— **Local-First 的定位与本项目完全一致**，可以看它在没有服务端的前提下怎么处理分享和持久化。

### 5.4 AKSW ontodia-graph-explorer

<https://github.com/AKSW/ontodia-graph-explorer>

RDF / SPARQL 图探索的经典实现，交互范式成熟。年代较早，主要看交互设计而非代码。

### 5.5 LineageViewer

<https://github.com/DataVisuals/LineageViewer>

React + TypeScript 的数据血缘查看器，集成 Marquez（OpenLineage）与 dbt，用 Cytoscape 渲染。与你的 Mapping 追踪视图（Concept → Mapping → Dataset）是同一类问题。

### 5.6 开源语义可视化补充

<https://github.com/opensemanticsearch/open-semantic-visual-graph-explorer> — 面向文档与知识图谱中命名实体、概念的连接探索。

---

## 6. 一页速查表

| 名称 | 类型 | 链接 | 对本项目的适用点 |
|---|---|---|---|
| **React Flow UI** | 组件注册表 | reactflow.dev/ui | ⭐ 官方图组件，React 19 + TW4，可直接替换 `OssieNode` / `RelationshipEdge` |
| **shadcn/ui** | 设计系统 | ui.shadcn.com | ⭐ 主推路线；解暗色模式 + 无障碍弹层 |
| shadcn JS 配置 | 文档 | ui.shadcn.com/docs/javascript | 本项目是 `.jsx`，必读 |
| shadcn Vite 安装 | 文档 | ui.shadcn.com/docs/installation/vite | 接入步骤 |
| shadcn/ui Blocks | 布局区块 | ui.shadcn.com/blocks | 侧栏 + 仪表盘外壳 |
| xyflow Vite 模板 | 项目模板 | github.com/xyflow/vite-react-flow-template | 含 ESLint 配置，补你的 lint 空白 |
| Mantine | 组件库 | mantine.dev | 备选；开箱即用 |
| Radix Themes | 组件库 | radix-ui.com/themes | 备选；shadcn 的折中版 |
| **JSON Crack** | 同类项目 | github.com/AykutSarac/jsoncrack.com | ⭐ 形态最像；参考状态管理与主题切换 |
| AWS graph-explorer | 同类项目 | github.com/aws/graph-explorer | 逐跳图探索交互 |
| MS Ontology-Playground | 同类项目 | github.com/microsoft/Ontology-Playground | 零后端本体工具，定位一致 |
| ontodia-graph-explorer | 同类项目 | github.com/AKSW/ontodia-graph-explorer | RDF 探索交互范式 |
| LineageViewer | 同类项目 | github.com/DataVisuals/LineageViewer | 血缘/映射链路视图 |

---

## 7. 如果只做三件事

按投入产出比排序，优先级最高的三项：

1. **先解暗色模式的硬编码**（小改动，不依赖任何库）—— 把 `GraphCanvas.jsx:211,217,218` 的颜色改为读 CSS 变量。这是后续任何主题方案的前置条件，且单独做就有价值。
2. **抄一份 ESLint 配置**（从 xyflow 官方 Vite 模板）—— 项目现在完全没有 lint。
3. **拿 `OssieNode.jsx` 试水 React Flow UI 的 Base Node** —— 单文件 54 行，验证 §2.3 的 JS 转换是否可行。这一步的结论决定了要不要走完整条 shadcn 路线。

第 3 步做完再决定全量迁移，风险最低。
