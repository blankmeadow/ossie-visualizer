# 规格 → 代码对照

方便按规格条目找实现。

## 产品与信息架构

| 规格 | 实现 |
|---|---|
| §3 三个一级入口 | `mobile/App.tsx`、`mobile/src/components/TabBar.tsx` |
| §5 今天（三种状态） | `mobile/src/screens/TodayScreen.tsx` |
| §6 词库 + ＋ 入口 | `mobile/src/screens/LibraryScreen.tsx`、`AddSheet.tsx` |
| §7 拍照 / 相册导入 | `mobile/src/screens/CaptureScreen.tsx` |
| §31 我的 | `mobile/src/screens/ProfileScreen.tsx` |
| §32 不做注册墙 | `backend/app/deps.py`、`mobile/src/api/client.ts` (`ensureChild`) |

## AI 管线

| 规格 | 实现 |
|---|---|
| §8 处理流程 | `backend/app/ai/pipeline.py` |
| §9.1 VocabularyItem（WORD / PHRASE） | `backend/app/enums.py`、`models.py` |
| §9.2 提取与过滤原则 | `backend/app/ai/filters.py` |
| §9.3 短语优先 | `backend/app/ai/phrases.py` |
| §10 原文例句（最多 3 条，全量保存） | `pipeline.py`、`learning/scheduler.py:load_examples` |
| §11 词形归一 | `backend/app/ai/lemmatizer.py` |
| §11.1 已有词自动合并 | `backend/app/services/vocabulary.py:add_to_library` |
| §12 提取确认 | `backend/app/routers/sources.py`、`mobile/.../ConfirmScreen.tsx` |
| §13 手动添加 | `services/vocabulary.py:manual_add`、`mobile/.../ManualAddScreen.tsx` |
| §34 AI 接口 | `backend/app/ai/providers/anthropic_vision.py` |

## 学习

| 规格 | 实现 |
|---|---|
| §14 今日任务组成 | `backend/app/learning/scheduler.py:plan_today` |
| §15 首次学习 | `learning/questions.py:_build_first_learn` |
| §16 不让孩子自评 | 全局：没有任何「会 / 不会」接口 |
| §17–23 五种题型 | `learning/questions.py`、`mobile/src/screens/study/QuestionViews.tsx` |
| §19 合理干扰项 | `learning/distractors.py` |
| §20 挖空比例随熟练度提高 | `questions.py:_mask_word` |
| §22 渐进式提示 | `questions.py:_progressive_hints` |
| §24 题型升级 / 降级 | `questions.py:choose_question_type` |
| §24A 自动推进、无回看 | `mobile/src/screens/study/StudyScreen.tsx` |
| §24A.8 埋点 | `backend/app/enums.py:EventName`、`routers/learning.py` |
| §25 答错处理 | `routers/learning.py`（requeue）、`StudyScreen.tsx`（WrongOverlay） |
| §26 例句展示时机 | `QuestionViews.tsx`、`ReviewOut.example` 仅在答错时返回 |
| §27 SRS | `backend/app/learning/srs.py` |
| §28 Mastery 与 SRS 分离 | `learning/mastery.py` + `learning/srs.py` |
| §29 学习完成 | `mobile/src/screens/CompleteScreen.tsx` |
| §30 单词 / 短语详情 | `mobile/src/screens/DetailScreen.tsx` |

## 数据与接口

| 规格 | 实现 |
|---|---|
| §33 数据模型 | `backend/app/models.py` |
| §33.7 ReviewLog 必须保留 | `models.py:ReviewLog`（只追加） |
| §35 MVP API | `backend/app/routers/` |
| §36 技术架构 | `docs/ARCHITECTURE.md` |

## 商业化

| 规格 | 实现 |
|---|---|
| §45.2 免费 / 付费边界 | `backend/app/billing/entitlements.py:DEFAULT_GRANTS` |
| §45.3 免费 3 次 | `config.py:free_ai_image_import_quota`（仅发放时读取一次） |
| §45.4 付费墙文案 | `routers/sources.py:paywall_payload`、`mobile/.../PaywallScreen.tsx` |
| §45.5 学习永不收费 | 测试 `test_learning_never_hits_the_paywall` |
| §46 Feature / Entitlement | `backend/app/billing/entitlements.py` |
| §47 扣减原则 | `pipeline.py:AnalysisOutcome.should_consume_quota` |
| §48 付费触发点 | 仅 `POST /sources` 与 `POST /sources/{id}/analyze` 会返回 402 |
| §49 内测验证方式 | `EventName.PAYWALL_*` 埋点 + `PaywallScreen` 的模拟价格 |
