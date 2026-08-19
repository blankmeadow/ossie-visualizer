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
  - **Concept Graph**：只展现 EntityType 与实体之间的关系（含继承层级）；指向 ValueType 或内建类型的关系属于该实体的属性，改在详情面板中以表格呈现。
  - **Dataset & Metric Graph**：展现 Dataset 关联、Semantic Model 关系边及 Metric 衍生节点。
- 📋 **概念详情表格化**：
  - 属性表：属性名、目标 ValueType（含其内建基础类型）与约束（主键、Multiplicity、`requires`、ValueType facet）。
  - 关系表：本概念声明的实体关系，以及其他概念指向本概念的入向关系。
  - 继承成员按来源父概念分组显示。
- 🌏 **中英文界面**：默认跟随浏览器语言，可在顶栏手动切换并记住选择。
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

启动后在浏览器打开 `http://127.0.0.1:4178` 即可使用。

### 示例文档

`public/flights.yaml` 是 [Apache Ossie 官方示例](https://github.com/apache/ossie/blob/main/examples/flights.yaml) `examples/flights.yaml`，逐字节原样收录（含 ASF 许可头），可直接导入。它覆盖：

| 要素 | 覆盖情况 |
|---|---|
| Concept | 12 个 EntityType、32 个 ValueType |
| `extends` | 32 处（含 ValueType 到内建类型的继承链） |
| `identify_by` | 12 处（含复合标识符） |
| Relationship | 58 条（45 条属性、13 条实体关系，含 2 条多角色关系） |
| `verbalizes` | 58 处 |
| `multiplicity` | 56 处 |
| `requires` | 文档级 2 条、Concept 级 5 处、Relationship 级 5 处 |
| `derived_by` | 4 处 |
| Semantic Model | 6 个 Dataset、51 个 Field |
| Concept Mapping | 11 处 |

该文档**未涉及**的要素：Relationship 的 `description`、Dataset 之间的关系、Metric、`ai_context`。官方另一个示例 `tpcds_semantic_model.yaml` 覆盖了后三者，但它是纯语义模型文档（顶层 `semantic_model`、没有 `ontology`），不符合本工具要求的文档形态，因此未纳入。

> 规范和官方示例都以 YAML 编写，因此导入支持 `.json` / `.yaml` / `.yml`；YAML 文档在「JSON」页按原文展示，不会被转成 JSON——否则注释（包括许可头）会丢失。

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
