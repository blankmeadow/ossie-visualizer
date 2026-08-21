# Apache Ossie 0.2.0.dev0 Ontology 建模与避坑

本指南以固定提交 `88e0011148283302c9a04cd0287e00e0b9d87354` 的官方文件为基线：

- [Ontology JSON Schema](https://github.com/apache/ossie/blob/88e0011148283302c9a04cd0287e00e0b9d87354/ontology/ontology.json)
- [Ontology Specification](https://github.com/apache/ossie/blob/88e0011148283302c9a04cd0287e00e0b9d87354/ontology/ontology.md)
- [Core Schema](https://github.com/apache/ossie/blob/88e0011148283302c9a04cd0287e00e0b9d87354/core-spec/osi-schema.json)

## 先区分三类规则

| 层级 | 含义 | 示例 |
|---|---|---|
| 官方 schema 硬约束 | JSON Schema 能机械判定 | `version` 必须是 `0.2.0.dev0`；concept 不允许 `ai_context`；multiplicity 枚举只有两项 |
| 官方 specification 语义约束 | 文档规定、schema 未完全表达 | `OneToOne` 只用于二元关系；ValueType 最终继承内置值概念；首 role 由容器 concept 隐含 |
| 项目约定 | 为稳定性和可维护性选定，不是官方要求 | 使用 `snake_case`、描述语言优先级、输出排序 |

不要把项目约定写成“schema 要求”，也不要把 schema 通过等同于语义正确。

## 为什么不直接以官方 validate.py 为唯一入口

本技能内置的三个官方文件都保持字节不变。默认校验器仍以官方 schema 为结构真相，只做两项适配：

1. 把 ontology schema 的 GitHub raw `$ref` 映射到同一提交的本地 core schema，避免运行时联网和上游漂移。
2. 补充官方 schema 没有编码的 ontology semantic lint。

官方 `validation/validate.py --schema ontology/ontology.json` 可用于维护时交叉验证，但当前脚本的名称唯一性、引用和 SQL 检查只面向顶层 `semantic_model`；对纯 ontology 不检查 concept/role/identifier 等语义引用。另外，它让 `jsonschema` 自动获取远程 `$ref`，新版本 `jsonschema` 已对这种行为给出弃用与安全警告。

需要严格区分时使用：

```bash
# 只运行未修改的官方 ontology schema（本地解析 $ref）
python3 scripts/validate_ossie.py --schema-only model.ossie.json

# 官方脚本交叉验证；需要 PyYAML、jsonschema 和网络
python3 assets/vendor/apache-ossie/validation/validate.py \
  model.ossie.json \
  --schema assets/vendor/apache-ossie/ontology/ontology.json
```

## 官方结构速查

顶层必填：

```json
{
  "version": "0.2.0.dev0",
  "name": "domain_ontology",
  "ontology": [
    {
      "concept": "thing",
      "type": "EntityType"
    }
  ]
}
```

顶层还允许 `description`、`ai_context`、`requires`、`ontology_mappings`。`ontology` 至少一项。

concept 必填 `concept`、`type`，可选字段只有：

- `description`
- `extends`
- `derived_by`
- `identify_by`
- `requires`
- `relationships`

relationship 必填 `name`、`verbalizes`，可选 `description`、`roles`、`multiplicity`、`derived_by`、`requires`。

## 从 Markdown 到 ontology

### 1. 先建立证据表

对每个候选概念或规则记录原文依据，至少区分：

- 实体：有身份、生命周期或可被引用的现实对象。
- 业务值：数据类型之上还有可复用语义或约束。
- 普通属性：只在局部充当一个值，没有必要成为独立概念。
- 关系：连接对象/值的事实。
- 约束：必须成立，但不产生新对象或 links。
- 派生：从其他 facts 推导新的对象集合或 links。

证据不足时保留自然语言，不猜测唯一性、基数、公式或物理字段。

### 2. 选择 EntityType、ValueType 或内置值概念

| 场景 | 建模方式 |
|---|---|
| 客户、订单、账户 | `EntityType` |
| 普通备注、名称、日期 | relationship 指向 `String`、`Date` 等内置值概念 |
| 有稳定业务含义并被复用的客户编号、受约束代码 | `ValueType`，并 `extends` 一个内置值概念 |
| 只是源系统字段名，没有独立领域含义 | 不创建 concept；如需本体属性，仅建 relationship |

官方 ontology 内置概念是：

- EntityType：`Any`
- ValueType：`Boolean`、`Date`、`DateTime`、`Decimal`、`Float`、`Integer`、`String`

`Time`、`DateTimeTz`、`Opaque` 是 core semantic model 的 DataType，但不是当前 ontology specification 列出的内置 concept。不要在 ontology role 中把它们当作无需声明的内置概念；若确有需要，应显式定义可追溯的 ValueType 映射或记录规范缺口。

### 3. 理解隐式首 role

关系放在哪个 concept 下，哪个 concept 就扮演第一个 role：

```json
{
  "concept": "account",
  "type": "EntityType",
  "relationships": [
    {
      "name": "owner",
      "roles": [{ "concept": "party" }],
      "multiplicity": "ManyToOne",
      "verbalizes": [
        "{account} 归属于 {party}",
        "{party} 拥有 {account}"
      ]
    }
  ]
}
```

完整关系标识是 `account.owner`。`roles` 中只写附加 role，因此该例是二元关系，不是一个 role 的一元关系。

当同一个 concept 重复扮演 role 时，为附加 role 指定名字：

```json
{
  "name": "parent_of",
  "roles": [{ "concept": "person", "name": "child" }],
  "verbalizes": [
    "{person} 是 {person:child} 的父母",
    "{person:child} 是 {person} 的子女"
  ]
}
```

### 4. multiplicity 是函数依赖，不是 UI 箭头

| 写法 | 准确含义 |
|---|---|
| 省略 | 未声明最后 role 的唯一性；可表达无此函数依赖的关系 |
| `ManyToOne` | 对给定的前 `n-1` 个 roles，最后一个 role 至多一个 |
| `OneToOne` | 仅二元关系；两个方向都 ManyToOne |

二元例子：

- `account.owner -> party`：每个账户至多一个所有者，使用 `ManyToOne`；多个账户可共享同一 party。
- `person.display_name -> String`：每人至多一个显示名但多人可同名，使用 `ManyToOne`。
- `person.ssn -> SocialSecurityNumber`：如果双方都唯一，使用 `OneToOne`。
- `parent.children -> child`：一个 parent 可以多个 child，不能填 `ManyToOne`。更清楚的建模是 `child.parent -> parent` + `ManyToOne`，并在同一关系的第二条 `verbalizes` 写反向读法。

对三元及以上关系，`ManyToOne` 只约束最后 role。例如 `(item, store, amount)` 表示给定 item 与 store 后 amount 至多一个。

### 5. identify_by 使用局部关系名

```json
{
  "concept": "license",
  "type": "EntityType",
  "identify_by": ["account", "seat_number"],
  "relationships": [
    {
      "name": "account",
      "roles": [{ "concept": "account" }],
      "multiplicity": "ManyToOne",
      "verbalizes": ["{license} 属于 {account}"]
    },
    {
      "name": "seat_number",
      "roles": [{ "concept": "Integer" }],
      "multiplicity": "ManyToOne",
      "verbalizes": ["{license} 的席位号是 {Integer}"]
    }
  ]
}
```

这里写 `account`，不要写 `license.account`。每个标识 relationship 必须在当前 concept 下存在且是二元关系。

## 高频坑点

### 坑 1：把 `ai_context` 放进 concept

官方 schema 对 concept 使用 `additionalProperties: false`，不允许 `ai_context`。它只在当前 ontology 顶层出现：

```json
{
  "version": "0.2.0.dev0",
  "name": "account_ontology",
  "ai_context": {
    "instructions": "将账户术语按本体定义解释",
    "synonyms": ["资金账户", "结算账户"]
  },
  "ontology": [
    {
      "concept": "account",
      "type": "EntityType",
      "description": "具有独立身份的资金账户"
    }
  ]
}
```

JSON 不能包含 `//` 注释；解释文字放在代码块之外。

### 坑 2：使用 `OneToMany`

官方 ontology schema 的 Multiplicity 枚举只有 `ManyToOne` 与 `OneToOne`，写 `OneToMany` 会直接校验失败。

对于“一个 parent 有多个 child、每个 child 只有一个 parent”，优先声明 `child.parent -> parent` 并用 `ManyToOne`。若必须声明 `parent.children -> child`，省略 multiplicity；不能用 `ManyToOne` 冒充反方向，也不能发明 `OneToMany`。

### 坑 3：认为每个 relationship 都必须写 multiplicity

schema 中该字段可选。只在输入明确支持函数依赖时填写。未知就省略，不能用 `ManyToOne` 代替“我不知道”。

### 坑 4：普通属性全写 `OneToOne`

`OneToOne` 还要求属性值反向唯一。名称、状态、日期、余额通常会被不同实体共享；这些单值属性若首对象决定末值，应使用 `ManyToOne`。

### 坑 5：完全禁止 ValueType

为每个源字段建 ValueType 会导致概念爆炸，但完全禁止也会丢失领域语义。使用判断标准：这个值是否有稳定业务名称、可复用约束或作为身份的一部分；若是，建 ValueType，否则引用内置值概念。

### 坑 6：复制“正向关系 + 反向关系”

两个 relationship 在模型中是两个独立 facts，schema 没有 `inverse_of` 可以声明等价。仅需自然语言正反读法时，把两条文本放在同一个 `verbalizes`。只有业务上确实需要另一个可独立映射/派生的关系时才另建，并明确其推导依据。

### 坑 7：把未确认的表达式语法写成官方规则

ontology schema 仅把 `requires`、`derived_by` 的元素定义为字符串；schema 通过不代表表达式可解析。官方 specification 展示了比较、布尔连接、`EXISTS (...)` 与 relationship 导航，但没有把任意正则或枚举语法列为已保证能力。

因此：

- 只有在目标实现或官方 parser 已验证时才生成复杂表达式。
- concept `requires` 要引用该 concept；relationship `requires` 要引用其 roles。
- `derived_by` 必须说明如何构造 concept population 或 relationship links，不能只放裸算术结果。
- 无法确认的格式、枚举和跨对象规则保留在 `description`/顶层 `ai_context.instructions` 或单独的转换报告中。

### 坑 8：认为简短 description 是 schema 要求

schema 只要求它是字符串。description 可以写清业务含义和边界，但不要用它冒充机器可执行约束，也不要塞入来源系统字段、未审计公式和互相冲突的规则。

### 坑 9：只做 schema 校验

官方 schema 不检查重复 concept、悬空 role、继承类型、ValueType 基类、role 消歧、`OneToOne` 元数或 `identify_by` 是否存在。本技能验证器额外做 semantic lint，但仍不执行 ontology 表达式，也不证明业务规则等价。

## 验收清单

1. 顶层只有官方允许字段，`version` 精确为 `0.2.0.dev0`。
2. concept 名称唯一，不覆盖内置 concept。
3. EntityType/ValueType 分类和 `extends` 类型一致。
4. 每个 ValueType 最终继承官方内置值 concept。
5. relationship 名在所属 concept 内唯一，`verbalizes` 非空。
6. role 引用存在；重复 role concept 已命名消歧。
7. multiplicity 有输入依据，且方向与最后 role 一致。
8. `OneToOne` 仅用于二元关系；普通属性未误标唯一。
9. `identify_by` 指向当前 concept 的二元 relationships。
10. 表达式未超出已验证语法；无法形式化的规则已单列。
11. 离线 schema 校验与 semantic lint 均为 0 errors、0 warnings。
