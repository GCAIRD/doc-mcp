# Chunk 上下文增强机制

## 当前实现

### 1. Indexing 阶段（写入 Qdrant）

每个 chunk 写入 Qdrant 时的 payload 结构：

```
point.payload = {
  content:      原文内容（含 header 前缀），同时作为 BM25 索引文本
  doc_id:       文档 ID（用于 fetch 整篇文档）
  chunk_index:  在文档中的序号
  chunk_id:     唯一标识 (doc_id + _chunk{N})
  metadata: {
    file_path, relative_path, file_name, path_hierarchy,
    category:      api | doc | demo
    chunk_index:   序号（冗余，方便过滤）
    total_chunks:  该文档的总 chunk 数
    chunk_type:    api_methods | doc | demo 等
    section_path:  当前 chunk 所属的 header 层级路径，如 ["基本用法", "绑定到数组"]
    doc_toc:       文档完整目录结构（所有 header 提取，缩进表示层级）
  }
}
```

### 2. Header 前缀注入（内容层面）

当一个 section 被切成多个 chunk 时，非首个 chunk 的 `content` 会被注入上级 header：

```
原始 chunk[1]: "一大段后续文字..."
实际存储:      "## 基本用法\n\n一大段后续文字..."
```

这段 header 同时参与 dense embedding 和 BM25 索引，搜索时能命中 section 级别的关键词。

三个 chunker 的注入逻辑一致：仅在 `i > 0 && !text.startsWith('#')` 时注入，避免重复。

### 3. Search 返回给 AI 的数据

`search` tool 返回 JSON，每条结果包含：

```json
{
  "rank": 1,
  "doc_id": "docs_bindingPath",
  "chunk_id": "docs_bindingPath_chunk2",
  "score": 0.87,
  "content": "完整 chunk 内容",
  "content_preview": "前 200 字符预览",
  "metadata": { ... 上述 metadata 全部字段 }
}
```

AI 可以从 `metadata` 中读取 `doc_toc` 了解全文结构，从 `section_path` 定位当前 chunk 的位置，从 `total_chunks` 判断文档规模，然后决定是否 `fetch` 完整文档。

### 4. Fetch 返回给 AI 的数据

`fetch` tool 按 `chunk_index` 排序返回该 `doc_id` 下所有 chunk，首个 chunk 带 header：

```
Document: {doc_id}
Total chunks: {N}

{chunk[0].content}
```

后续 chunk 直接返回 content。

---

## 未采用的可行方案

### A. Chunk Overlap（已删除）

在相邻 chunk 之间重叠一段尾部文字，提供前文衔接。

**未采用原因**：文档以结构化 header 分割为主，header 前缀机制已覆盖上下文衔接需求。`splitProtected` 中文本和代码块交替出现，实现 overlap 语义复杂且收益低。

### B. LLM 生成的文档摘要

indexing 时为每篇文档调用 LLM 生成 2-3 句摘要，写入 metadata。AI 在 search 结果中直接看到摘要，减少不必要的 fetch。

**未采用原因**：增加 indexing 成本和时间。当前 `doc_toc` + `content_preview` 组合已能让 AI 判断是否需要 fetch。如果后续发现 AI 频繁 fetch 后弃用内容，再考虑引入。

### C. 同目录兄弟文档列表

将同一 `path_hierarchy` 下的其他 `doc_id` 列表写入 metadata，让 AI 知道还有哪些相关文档可搜索。

**未采用原因**：部分目录下文档数量很大，列表会显著膨胀 payload 体积。可以考虑只存数量而不存列表，或限制为同级前后 N 篇。

### D. 语义相关文档（跨文档关联图）

基于文档 embedding 计算 top-K 相似文档，建立关联图存入 metadata。

**未采用原因**：需要额外的跨文档 embedding 计算和维护成本，属于独立的索引后处理流程，复杂度高。

### E. Contextual Retrieval（Anthropic 方案）

Anthropic 提出的方案：indexing 时为每个 chunk 调用 LLM，生成一段 50-100 token 的上下文描述前缀（如"本段来自 SpreadJS 数据绑定教程，介绍如何将 Sheet 绑定到 JSON 数组"），拼接到 chunk content 头部参与 embedding。

**未采用原因**：本质是 LLM 生成摘要的 chunk 级变体，indexing 成本按 chunk 数量线性增长。当前 header 前缀 + TOC 是该方案的零成本近似——用文档结构信息替代 LLM 生成的自然语言描述。如果搜索质量遇到瓶颈，这是最值得尝试的升级方向。
