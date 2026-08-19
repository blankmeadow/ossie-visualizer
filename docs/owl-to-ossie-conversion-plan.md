# FIBO / OWL 到 Apache Ossie Ontology 转换计划

## 1. 结论

可行，但应把它定义成“OWL 语义投影”，而不是无损重写。

OWL 2 DL 的表达能力高于 Apache Ossie 0.2.0.dev0 Ontology。第一版转换器只生成
Ossie 本体层，不生成 `semantic_model`、`datasets`、`fields`、`metrics` 或
`ontology_mappings`。不能等价表达的公理必须进入转换报告，不能静默丢弃，也不能编造
表字段来补齐。

目标输出是一个可被 `Ossie Visualizer` 直接打开的纯 Ontology JSON：

```text
FIBO / OWL files + import catalog
              │
              ▼
      load import closure
              │
              ▼
 normalize IRI / labels / axioms
              │
              ▼
     conservative projection
        │          │
        ▼          ▼
 ontology.ossie.json   conversion-report.json
        │          │
        └──────┬───┘
               ▼
       official schema validation
```

## 2. 输入与输出

### 2.1 输入

- RDF/XML、Turtle 或 JSON-LD 序列化的 OWL 2 本体；
- 可选的 XML catalog，用于离线解析 FIBO 的 `owl:imports`；
- 一个明确的根本体 IRI；
- 可选的 namespace/module 白名单；
- 可选的人工名称覆盖文件，用于解决 IRI 局部名冲突。

FIBO 是模块化本体族。转换器必须能读取多个源文件和完整 import closure，但可以把选定
范围聚合为一个 Ossie JSON。不能简单拼接 TTL，也不能忽略 import 后继续转换。

### 2.2 输出

| 文件 | 作用 | 是否属于 Ossie 协议 |
|---|---|---|
| `ontology.ossie.json` | 单文件纯本体结果 | 是 |
| `conversion-report.json` | 覆盖率、降级项、丢失公理、冲突和来源统计 | 否，转换审计文件 |
| `iri-map.json` | 源 IRI 到 Ossie 名称的可追溯映射 | 否，转换审计文件 |

`ontology.ossie.json` 只包含官方本体结构：

```json
{
  "version": "0.2.0.dev0",
  "name": "fibo_selected_ontology",
  "description": "...",
  "ontology": []
}
```

不为满足可视化或检索需要增加私有字段。IRI、语言标签、来源模块和未转换注解保存在审计
文件中。

## 3. 转换原则

1. **保守转换**：只有语义方向明确且 Ossie 可表达时才生成结构。
2. **不猜物理模型**：OWL 属性不是表字段，不生成 Dataset、Field 或 Mapping。
3. **稳定标识优先**：名称来自 IRI，而不是当前显示标签；标签只用于描述和审计。
4. **必要条件与派生条件分开**：OWL `SubClassOf` 限制通常是约束，不能误写成
   `derived_by`；只有充分分类规则才进入 `derived_by`。
5. **不静默降级**：每个未表达或近似表达的公理都必须带来源 IRI 和原因进入报告。
6. **确定性输出**：相同输入、catalog、范围和名称覆盖必须产生字节级稳定的排序结果。

## 4. OWL 到 Ossie 映射规则

### 4.1 可以直接表达

| OWL / RDF | Ossie | 规则 |
|---|---|---|
| `owl:Class` | `EntityType` | 每个纳入范围的命名类生成一个 Concept |
| 命名 `rdfs:subClassOf` | `extends` | 只保留直接父类，传递闭包不重复写入 |
| `owl:ObjectProperty` | Relationship | 按明确的命名 domain 挂到首角色 Concept，range 成为附加 role |
| `owl:DatatypeProperty` | Relationship | range 映射为 Ossie BuiltIn 或命名 ValueType |
| `rdfs:Datatype` / 自定义 datatype | `ValueType` | 必须能确定其 BuiltIn 基类型 |
| `owl:hasKey` | `identify_by` | key 中的属性必须已转换为该 Concept 下的 Relationship |
| `owl:FunctionalProperty` | `ManyToOne` | 对二元关系，末角色由首角色唯一确定 |
| functional + inverse-functional | `OneToOne` | 仅二元关系可转换 |
| label / definition / comment | `description` | 按配置的语言优先级选择，不拼接全部注解 |
| inverse verbalization | `verbalizes` | 可作为同一关系的第二种自然语言表达 |

XSD 到 Ossie BuiltIn 的第一版映射：

| XSD | Ossie BuiltIn |
|---|---|
| `xsd:string`、`rdf:langString`、`xsd:anyURI` | `String` |
| `xsd:boolean` | `Boolean` |
| 整数族 | `Integer` |
| `xsd:decimal` | `Decimal` |
| `xsd:float`、`xsd:double` | `Float` |
| `xsd:date` | `Date` |
| `xsd:time` | `Time` |
| `xsd:dateTime`、`xsd:dateTimeStamp` | `DateTime` |

`xsd:anyURI → String` 属于显式降级，必须记入报告。

### 4.2 有条件转换

| OWL 公理 | 转换条件 | Ossie 表达 |
|---|---|---|
| `EquivalentClasses(C, Parent ∩ condition)` | condition 能完整翻译为 Ossie 关系表达式 | `extends: [Parent]` + `derived_by` |
| `C SubClassOf restriction` | restriction 是可翻译的必要条件 | Concept `requires` |
| `someValuesFrom` | 属性已映射且 role 无歧义 | `EXISTS ( Concept.relationship )` 或更具体关系表达式 |
| `hasValue` | 常量类型可映射 | `requires` 中的等值条件 |
| datatype facet | facet 能安全翻译 | ValueType `requires` |
| 多个显式 domain | 每个 domain 都是命名类 | 在各首角色 Concept 下生成关系，并报告源属性被展开 |

所有表达式先进入内部 AST，再由单一 formatter 生成 Ossie 字符串。禁止直接拼接 RDF
文本或依靠正则猜测复杂 OWL 公理。

### 4.3 第一版不转换

- `owl:unionOf`、`owl:complementOf`、复杂 `owl:oneOf`；
- 任意深度的 property chain；
- SWRL 规则；
- 命名个体和事实数据；
- disjointness、negative property assertion；
- 无法唯一确定首角色的全局属性；
- 依赖开放世界假设、非单调推理或匿名类身份的公理；
- 不能证明与 Ossie set semantics 等价的 cardinality 组合。

这些内容全部进入 `conversion-report.json`。第一版不把复杂限制翻译成看似可运行、实际
语义不等价的 SQL 字符串。

## 5. 名称、语言和冲突策略

### 5.1 稳定名称

- 默认取 IRI fragment 或最后一个 path segment；
- 规范为 `snake_case`；
- 名称必须匹配 `^[a-z][a-z0-9_]*$`；
- BuiltIn 名称保留官方大小写；
- 同一 IRI 始终得到同一名称。

### 5.2 冲突

两个不同 IRI 得到同一名称时，转换默认失败，并输出候选来源。只有名称覆盖文件可以解除
冲突。不能按加载顺序自动添加数字，因为这会让后续版本不稳定。

### 5.3 多语言

- 描述选择顺序可配置，默认 `zh-CN → zh → en → 无语言`；
- Concept 名称不随语言变化；
- 其他 label、definition、synonym 保存在 `iri-map.json`，不塞进 Concept 私有字段；
- 若没有可用定义，可用首选 label 生成最小描述，并标记 `generated_description`。

## 6. Import、推理与模块边界

1. 使用 RDF parser 和 catalog 加载根本体及 import closure；离线缺失 import 是阻断错误。
2. 先做 OWL 2 DL 一致性检查，再转换。
3. Reasoner 用于发现冲突和校验分类，不默认把整个推理闭包物化到输出。
4. `extends` 默认输出源本体中最小的直接命名父类集合，避免继承边爆炸。
5. 支持按 FIBO domain/module/namespace 选取范围；跨范围父类可以选择：
   - 一并纳入最小依赖；或
   - 作为未解析外部依赖阻断转换。
6. 第一版不允许生成悬空 `extends`、role 或 `identify_by` 引用。

## 7. 转换报告

报告至少包含：

```json
{
  "source": {
    "root_ontology": "...",
    "imports_loaded": 0,
    "source_hash": "..."
  },
  "output": {
    "entity_types": 0,
    "value_types": 0,
    "relationships": 0
  },
  "coverage": {
    "axioms_total": 0,
    "exact": 0,
    "degraded": 0,
    "omitted": 0,
    "blocked": 0
  },
  "issues": [
    {
      "severity": "warning",
      "source_iri": "...",
      "axiom_kind": "DisjointClasses",
      "reason": "not representable in Ossie 0.2.0.dev0"
    }
  ]
}
```

“转换成功”只表示生成的 Ossie 文档合法；报告中仍可能存在已确认的降级或省略。调用方应
按门槛决定是否接受，例如 `blocked == 0` 且 `omitted / axioms_total < 5%`。

## 8. 建议 CLI 合约

```bash
python owl_to_ossie.py convert \
  --input /path/to/fibo \
  --root-ontology https://spec.edmcouncil.org/fibo/ontology/... \
  --catalog /path/to/catalog-v001.xml \
  --include-namespace https://spec.edmcouncil.org/fibo/ontology/FND/ \
  --language zh-CN,zh,en \
  --name fibo_foundations \
  --output ontology.ossie.json \
  --report conversion-report.json \
  --iri-map iri-map.json
```

另提供两个只读命令：

- `inspect`：统计 imports、class、property、公理类型和预估损失，不生成结果；
- `validate`：使用官方 `ontology/ontology.json` 校验输出，并做悬空引用、继承环和名称冲突检查。

## 9. 实施阶段

### 阶段 A：解析与盘点

- 使用 `rdflib` 读取 RDF/XML、TTL、JSON-LD；
- 支持 XML catalog 和本地 import closure；
- 建立统一 IRI 索引；
- 输出 `inspect` 统计和公理类型分布。

### 阶段 B：保守投影

- 实现 Class、named subclass、object/data property、datatype、hasKey 和 multiplicity；
- 实现稳定命名与冲突覆盖；
- 生成纯 Ontology JSON、IRI map 和损失报告。

### 阶段 C：限制表达式

- 引入内部表达式 AST；
- 先支持 `someValuesFrom`、`hasValue` 和简单 datatype facet；
- 区分 `requires` 与 `derived_by`，为每种转换模式建立金标测试。

### 阶段 D：FIBO 小范围试点

- 先选择一个边界清晰、依赖可控的 FIBO Foundation 子模块；
- 人工抽查 Concept、extends、relationship、identify_by 和限制表达式；
- 达到验收门槛后再扩大到 Business Entities，不直接全量转换 FIBO。

### 阶段 E：可视化验收

- 用 Ossie Visualizer 打开输出；
- 检查纯 Ontology 模式下 Overview、Ontology、搜索、1/2 跳聚焦和详情；
- Semantic Model 与 Mapping 层应明确为空，不能伪造覆盖率。

## 10. 验收标准

- 输出通过 Apache Ossie 0.2.0.dev0 Ontology JSON Schema；
- 输出中不存在 `semantic_model`、Dataset、Field、Metric 或 Mapping；
- Concept、extends、role、identify_by 全部可解析且无环；
- 同一输入连续转换两次结果一致；
- import 缺失、名称冲突和不支持公理均可定位到源 IRI；
- 任何省略都有报告，`omitted + degraded + exact` 与纳入范围公理数对账；
- 至少包含 Class、继承、对象属性、数据属性、ValueType、hasKey、限制表达式、冲突和
  import 缺失测试；
- 在选定 FIBO 试点模块上完成人工语义抽查，再决定是否扩大范围。

## 11. 明确不做

- 不读取数据库或 `information_schema`；
- 不生成表、字段、SQL、Cube 模型或查询口径；
- 不把 FIBO 个体数据搬进 Ossie；
- 不在 Ossie Concept 中加入 IRI、label 数组等非官方字段；
- 不以“能生成 JSON”为理由声称 OWL 语义已无损保留。

## 12. 规范依据

- [Apache Ossie Ontology JSON Schema](https://github.com/apache/ossie/blob/main/ontology/ontology.json)
- [Apache Ossie Ontology Specification](https://github.com/apache/ossie/blob/main/ontology/ontology.md)
- [Apache Ossie Core Semantic Model Schema](https://github.com/apache/ossie/blob/main/core-spec/osi-schema.json)
- [FIBO repository and module structure](https://github.com/edmcouncil/fibo)
- [FIBO ontology guide](https://github.com/edmcouncil/fibo/blob/master/ONTOLOGY_GUIDE.md)

