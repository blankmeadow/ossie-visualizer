# Ossie Visualizer

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Ossie Visualizer** 是一个纯前端、Local-First 的 **Apache Ossie** 数据模型与 Semantic Model 可视化工作台。

它可以在浏览器端解析并以交互式图形方式展现 Apache Ossie 规范下的 Ontology（本体）、Semantic Model（语义模型）、Dataset（数据集）、Relationship（关系表）与 Mapping 映射，便于数据工程师与架构师直观理解与治理语义模型。

---

## 核心特性

- 🔒 **Local-First / 纯前端架构**：所有 JSON 校验与图形渲染均在浏览器端完成，无需后端服务或网络请求，数据隐私安全。
- 🔍 **多层级模型支持**：
  - 支持纯 `ontology` 本体文档（如 FIBO/OWL 投影产生的 Ossie Ontology）。
  - 支持包含 `ontology_mappings`、`semantic_model` 及 `concept_mappings` 的完整 Ossie JSON 模型。
- ⚡ **智能语法与引用校验**：在加载前自动进行语法、Concept、`extends`、Role、`identify_by`、Dataset 和 Mapping 的交叉引用检查。
- 🕸️ **交互式图谱可视化**：
  - **Concept Graph**：展现 EntityType、ValueType、继承层级与 Role 对象关系图。
  - **Dataset & Metric Graph**：展现 Dataset 关联、Semantic Model 关系边及 Metric 衍生节点。
- 🔎 **追踪与深度聚焦**：
  - 支持从 Concept 一键追踪至 Concept Mapping 及底层物理 Dataset。
  - 支持按名称、描述及 `ai_context.synonyms` 全局搜索。
  - 支持一跳/两跳 Node Focus（节点聚焦）与高亮。

---

## 快速开始

### 依赖环境

项目要求 **Node.js 20.12.0** 或更高版本：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20
```

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/blankmeadow/ossie-visualizer.git
cd ossie-visualizer

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

启动后在浏览器打开 `http://127.0.0.1:4178` 即可使用。项目根目录下提供示例文件 `public/sample-ossie-model.json` 可供直接导入测试。

---

## 测试与构建

```bash
# 运行单元测试 (Vitest)
npm test

# 编译生产包
npm run build
```

---

## 开源协议

本项目基于 [Apache License 2.0](LICENSE) 协议开源。
