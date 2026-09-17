# 架构说明

## 分层

```
React Native App (Expo)
        │  HTTP / JSON
        ▼
FastAPI
 ├── routers/      HTTP 边界，只做参数校验、鉴权和编排
 ├── services/     写入个人词库的业务规则（合并、手动添加）
 ├── ai/           导入管线
 ├── learning/     学习引擎
 ├── billing/      Feature / Entitlement
 └── models.py     SQLAlchemy ORM
        │
 ┌──────┴────────┐
 ▼               ▼
PostgreSQL     对象存储
（MVP 默认      （MVP 默认本地
  SQLite）        文件系统）
        │
        ▼
Vision LLM（可插拔，默认离线 mock）
```

第一版不做微服务，也不依赖 Redis。

---

## 导入管线

`app/ai/pipeline.py` 是整个管线的编排入口：

```
图片
 │
 ▼  providers/  （唯一的模型调用点）
OCR / 正文还原 / 候选提取
 │
 ▼  segmenter.py
分句、断词回接、题号剥离、中文释义列剥离
 │
 ▼  phrases.py           ← 短语优先，最长匹配，消耗掉的 token 不再单独成词
短语匹配
 │
 ▼  lemmatizer.py
词形归一
 │
 ▼  data/lexicon.py
中文释义与音标兜底
 │
 ▼  filters.py
学习价值判断（功能词 / 低价值词 / 专有名词 / OCR 噪声 / 超纲）
 │
 ▼  pipeline.py
个人词库去重 + 原文例句关联（精确 offset）
 │
 ▼
AnalysisCandidate（等家长确认）
```

### 为什么模型之后还要一整套确定性处理

Vision LLM 负责它擅长的：把照片变成干净的英文正文，并给出一版候选和释义。
但它不稳定 —— 同一页两次调用可能一次给 `look for`、一次给 `look`，
也可能提出一个页面上根本不存在的词。

所以模型的输出只被当作**建议**：

- 候选词必须在还原出的正文里真的被匹配到，否则丢弃 —— 没有 occurrence 的词
  会破坏「原文例句」这个核心承诺；
- 词形归一、短语优先、去重、学习价值判断一律由本地代码重新执行；
- 模型只有一件事是被信任的：中文释义和音标（因为它看得到上下文，知道这一页用的是哪个义项）。

换模型、换供应商、甚至供应商临时抽风，个人词库都不会被污染。

---

## 学习引擎

### Mastery 与 SRS 是两件事

| | 回答的问题 | 存在哪 |
|---|---|---|
| Mastery | 下次**怎么**考？ | `meaning_score` / `reverse_score` / `spelling_score` / `context_score` |
| SRS | 下次**什么时候**考？ | `srs_level` / `next_review_at` / `last_review_at` |

两者都挂在 `ChildVocabulary` 上，但从不互相换算。

### 题型路由

```
review_count == 0                      → 首次学习卡
meaning_score  < 0.60                  → T1 英→中
reverse_score  < 0.60                  → T2 中→英
spelling_score < 0.60                  → T3 挖空
spelling_score < 0.75                  → T4 完整填写
context_score  < 0.60 且有可用原句      → T5 原文例句挖空
以上都通过                              → 轮考最弱的一项
```

再叠加一条降级规则：**连续答错 2 次**，题型自动往回退一档
（T5/T4 → T3 → T2 → T1），而不是反复拿同一堵墙撞孩子。

### 分数怎么动

```
答对且没用提示   score += (1 - score) × 0.40
答对但用了提示   score += (1 - score) × 0.15
答错             score ×= 0.50
首次学习卡        不计分
```

渐进逼近 1，永远不会到 1，所以一个词不会被彻底判定为「学完了」。

### SRS 阶梯

```
当天 → 1 → 2 → 4 → 7 → 15 → 30 天

答对         升一级
答对但用提示  原地不动（还没证明能独立回忆）
答错         退两级，最低回到当天
```

前台只说「自动安排复习」，不出现艾宾浩斯 / SRS / FSRS 任何字样。

### 今日任务

```
到期复习（按 next_review_at 升序）
   ↓ 不足每日学习量
用从未学过的内容补齐
   ↓
上限 = 每日学习量
```

到期复习 ≥ 上限时，当天一个新词都不加。

---

## 数据模型

```
Child
 ├── Source ──┬── SourceImage
 │            └── Sentence ◄────── VocabularyOccurrence
 │                                        │
 ├── ChildVocabulary ─────────────────────┤
 │        │                               ▼
 │        ▼                        VocabularyItem
 │    ReviewLog
 ├── StudyDay
 └── UserEntitlement
```

几点说明：

- `VocabularyItem` 是全局的（`lemma + type` 唯一），
  每个孩子的学习状态挂在 `ChildVocabulary` 上；
- `VocabularyOccurrence` **全量保存**，前台最多展示 3 条；
- `ReviewLog` 只追加不删除 —— 它是以后训练记忆模型的唯一原料；
- `AnalysisCandidate` 把「AI 提议的」和「已加入词库的」隔开，
  所以家长确认到一半退出还能恢复。

---

## 计费边界

```
Feature（能力）            AI_IMAGE_IMPORT / MANUAL_VOCABULARY_ADD / PDF_IMPORT / ...
       │
UserEntitlement（额度）    quota_type + quota_total + quota_used + period
```

业务代码里没有 `if user.is_free`，只有
`entitlements.check(db, child_id, FeatureCode.AI_IMAGE_IMPORT)`。

扣费时机（`pipeline.AnalysisOutcome.should_consume_quota`）：

| 情况 | 扣额度 |
|---|---|
| 分析成功且有候选内容 | ✅ |
| 分析成功但一个候选都没有 | ❌ |
| OCR 失败 / 模型报错 | ❌ |
| 上传失败 | ❌ |
| 家长最终一个都没勾选 | ✅（服务已交付） |

付费墙只在「词库 → ＋ → 拍照/相册」且额度为 0 时出现。
今天首页、学习中、学习完成页、复习、词库浏览、手动添加都不会被打断。

---

## 埋点

`AnalyticsEvent` 记录规格里要求的漏斗：

```
IMPORT_STARTED → IMPORT_ANALYZED → IMPORT_CONFIRMED
ANSWER_SUBMITTED / ANSWER_CORRECT / ANSWER_WRONG / HINT_USED / AUTO_ADVANCE
SESSION_COMPLETED
PAYWALL_SHOWN / PAYWALL_UPGRADE_CLICKED / PAYWALL_MANUAL_ADD_CLICKED
```

其中最该盯的是**第 4 次 AI 导入尝试率** —— 它先验证家长是否真的形成了
持续上传学习材料的需求，比单纯的付费按钮点击率更有意义。
