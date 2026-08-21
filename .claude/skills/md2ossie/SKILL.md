---
name: md2ossie
description: >
  将 Markdown、领域设计、术语表或自然语言业务规则转换为 Apache Ossie 0.2.0.dev0
  Ontology JSON，并审查、修复或验证已有 Ossie ontology。凡涉及从业务文档提取 EntityType、
  ValueType、relationships、roles、multiplicity、identify_by、requires、derived_by、
  verbalizes 或 ontology_mappings，或用户要求核对 Ossie 官方 schema/规范、排查导入错误时，
  都应使用本技能。它区分官方 schema 硬约束、官方 specification 语义约束和项目建模约定，
  并提供固定版本的官方 schema 与离线引用校验器。
compatibility: >
  Python 3.9+；校验器需要 jsonschema>=4.26.0,<5。官方 schema 已内置，安装依赖后校验过程不访问网络。
---

# Markdown 转 Apache Ossie Ontology JSON

目标是生成保守、可追溯、符合 Apache Ossie `0.2.0.dev0` 的 Ontology JSON。不要为了“看起来完整”而把无法可靠表达的业务文字伪造成公式。

## 开始前

1. 阅读 [`references/methodology-and-pitfalls.md`](references/methodology-and-pitfalls.md)。它说明官方语义、基数方向、ValueType 取舍和常见误区。
2. 需要起始结构时复制 [`assets/template.ossie.json`](assets/template.ossie.json)。
3. 官方 schema 与 ontology specification 一起固定在 Apache Ossie commit `88e0011148283302c9a04cd0287e00e0b9d87354`，见 [`assets/vendor/apache-ossie/README.md`](assets/vendor/apache-ossie/README.md)。语义规则有疑问时，以 vendored 的 [`ontology.md`](assets/vendor/apache-ossie/ontology/ontology.md) 为准。

## 校验器边界

- 结构校验没有重新发明 OSSIE schema：`validate_ossie.py` 使用未修改的官方 `ontology.json` 和 `osi-schema.json`，并通过标准 `jsonschema` 引擎执行。
- 适配器只负责把官方远程 `$ref` 绑定到同一提交的本地 core schema，再增加明确标为 `Semantic Lint` 的 ontology 检查。
- 内置的官方 `validation/validate.py` 保留作来源审计和维护时交叉验证，不作为默认入口。它对纯 ontology 只执行 schema 层，而且会自动请求远程 `$ref`。
- 若只想看官方 schema 结果，可加 `--schema-only`；日常生成任务应使用默认双层校验。

## 转换流程

### 1. 划定输出范围

- 默认只生成 `version`、`name`、可选的 `description`/`ai_context`/`requires` 和 `ontology`。
- 只有输入包含真实逻辑模型、字段表达式和映射证据时才生成 `ontology_mappings`；不要从纯业务文档猜测 dataset、field 或 SQL mapping。
- 把不能无损表达、证据不足或表达式语法不确定的规则列入交付说明，不要静默丢弃。

### 2. 分类概念

- `EntityType` 表示必须借助其他信息引用的现实对象，如客户、订单、账户。
- `ValueType` 表示在基础数据类型之上具有独立业务语义的值，如受约束的客户编号、币种代码。它必须直接或间接 `extends` 官方内置值概念。
- 通用、无独立语义的属性值可直接引用内置值概念，无需为每个字段创建 ValueType。
- 官方内置概念只有：实体 `Any`；值 `Boolean`、`Date`、`DateTime`、`Decimal`、`Float`、`Integer`、`String`。
- `snake_case`、`PascalCase` 等只是团队约定；schema 没有限制命名格式。选定一种并保持稳定，内置概念保留官方大小写。

### 3. 建立继承与标识

- 用 `extends` 写直接父概念，不重复传递父类。
- EntityType 的父概念只能是 EntityType（根实体可省略 `extends`，隐式继承 `Any`）。
- ValueType 必须最终继承一个内置值概念，不能继承 EntityType。
- `identify_by` 填当前 concept 下 relationship 的局部 `name`，不是 `Concept.relationship` 全名。
- 标识关系是二元关系。复合标识把多个局部关系名放入 `identify_by`。

### 4. 建立 relationships

- relationship 挂在其首个 role 的 concept 下；这个首 role 是隐式的，不写入 `roles`。
- `roles` 只列后续 role，顺序有语义。零个 `roles` 表示一元关系，一个表示二元关系。
- role `name` 仅在同一 concept 多次扮演 role 或表达式需要消歧时添加。
- `verbalizes` 是必填字段。可在同一 relationship 中放正向和反向两种自然语言读法；不要仅为“反向显示”复制第二个关系，因为 OSSIE 没有 `inverse_of` 字段证明二者等价。

### 5. 正确解释 multiplicity

- `multiplicity` 可省略；允许值只有 `ManyToOne` 和 `OneToOne`。`OneToMany` 会直接违反官方 schema。
- `ManyToOne` 表示最后一个 role 由前面所有 roles 唯一决定。二元关系中即“每个首 role 对象至多对应一个末 role 对象”。
- `OneToOne` 仅适用于二元关系，并表示两个方向都满足 ManyToOne。
- 普通单值属性通常是 `ManyToOne`，因为多条实体记录可以共享同一个值；只有值也能唯一反查实体时才用 `OneToOne`。
- 对“一位父对象有多个子对象、每个子对象只有一个父对象”，把关系挂在子对象下并指向父对象，使用 `ManyToOne`。若挂在父对象下表达 `has_children`，不要改填不存在的 `OneToMany`，也不要填 `ManyToOne`；应省略 multiplicity，否则会错误地表示“每个父对象至多一个子对象”。

### 6. 保守翻译规则

- `requires` 约束 concept 或 relationship 的 population；concept 规则必须引用该 concept，relationship 规则必须引用其一个或多个 roles。
- `derived_by` 定义派生 population/links，不是普通字段计算备注。
- ontology schema 只验证表达式是字符串，不验证表达式语义。不要把 `MATCHES`、`IN`、`=` 或任意 SQL 片段宣称为 OSSIE 已保证支持的语法。
- 优先沿用官方 specification 已展示的比较、`AND`、`EXISTS (...)` 和 relationship 导航写法。对未在当前实现中验证的正则、枚举、日期函数或方言语法，保留为自然语言说明并明确标记待确认。

### 7. 校验并人工复核

从仓库根目录运行：

```bash
python3 -m pip install -r .claude/skills/md2ossie/requirements.txt
python3 .claude/skills/md2ossie/scripts/validate_ossie.py --strict path/to/model.ossie.json
```

验收必须同时满足：

- `Schema Status: passed`：官方 JSON Schema 结构校验通过。
- `Semantic Lint Status: passed`：本技能检查的引用、继承、role、标识和 multiplicity 规则通过。`skipped`（用了 `--schema-only`）和 `not-run`（文档结构损坏到无法遍历）都不算通过，必须先修好再重跑。
- `Total Errors: 0` 与 `Total Warnings: 0`。
- 人工复核表达式含义、建模粒度、未转换规则和输入证据。`0 errors` 不代表表达式已经被 OSSIE 执行器验证。

## 交付内容

返回：

1. 生成或修复后的 `.ossie.json` 路径。
2. 校验摘要（schema、semantic lint、errors、warnings）。
3. 关键建模决策，尤其是 ValueType、identifier 和 multiplicity。
4. 未能可靠形式化的规则及原因。
