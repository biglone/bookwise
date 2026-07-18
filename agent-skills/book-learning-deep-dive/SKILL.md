---
name: book-learning-deep-dive
description: Generate high-retention, low-compression study guides from technical books, PDFs, EPUBs, and chapter-based learning materials. Use this skill whenever the user wants to study a book faster, upload or analyze an ebook, turn chapters into learning notes, explain technical chapters in depth, preserve more of the original content than a normal summary, or build chapter-by-chapter study material for engineering books.
---

# Book Learning Deep Dive

Use this skill when the task is not just “summarize a document,” but “help the user actually learn a technical book quickly without collapsing away too much meaning.”

## Goal

Produce chapter learning content that is:

- dense enough to preserve important material
- structured enough to reduce reading friction
- explicit about terminology, reasoning steps, and code intent
- traceable back to chapter sections or pages when available

## Default workflow

1. Identify the source format.
   `PDF`, `EPUB`, `Markdown`, or chapter text dumps require different handling.
2. Recover structure before generating content.
   Find title, table of contents, chapter boundaries, section headings, figures, tables, and code blocks.
3. Work chapter first, then section.
   Avoid one-shot whole-book summarization.
4. Generate layered learning outputs.
   Always separate quick orientation from deep explanation.
5. Preserve fidelity.
   Do not compress away examples, definitions, caveats, or progression of ideas when they matter for learning.
6. Mark uncertainty.
   If OCR or structure extraction is noisy, say so and lower confidence on exact wording claims.

## Output contract

For each chapter, default to this structure unless the user asks for another format:

### 1. Chapter Snapshot

- What this chapter is about
- Why it matters in the whole book
- What prior knowledge helps

### 2. Section-by-Section Deep Explanation

For each major section:

- Main idea
- Terms and concepts
- Argument or mechanism being explained
- Example, diagram, formula, or code interpretation
- Common misunderstanding

### 3. Knowledge Retention Pack

- 5-10 review questions
- 3-5 key takeaways
- 2-4 practice ideas
- cross-links to related chapters if known

## Low-compression rules

When the source is a technical chapter:

- keep essential definitions
- keep the author’s reasoning order when it affects comprehension
- keep code intent, not only code outcome
- keep important caveats and tradeoffs
- do not reduce every section to one sentence

If space is constrained, compress in this order:

1. stylistic repetition
2. anecdotal filler
3. redundant examples
4. only then secondary details

Do not remove foundational definitions or prerequisite context first.

## Technical-book heuristics

### For code-heavy books

- explain what the code is demonstrating
- identify inputs, outputs, invariants, and failure modes
- point out why the author chose this example

### For systems books

- separate concepts, architecture, mechanism, and tradeoff
- include where the bottleneck or design tension appears

### For math-heavy or ML books

- explain notation in plain language
- explain what the equation means operationally
- do not pretend symbolic steps are obvious

## Fidelity and compliance

- Prefer explanation over long quotation.
- Quote only short, necessary excerpts.
- Do not reconstruct a book in a way that substitutes for redistributing the original.
- If the user asks for public sharing content, bias toward study notes, interpretation, and references rather than chapter recreation.

## If the user is building a product

When this skill is used for a software product, also provide:

- suggested pipeline stages
- data model suggestions for `book`, `chapter`, `section`, `study_note`
- prompts for chapter generation
- quality checks for omission and over-compression

## Example prompt patterns

### Example 1

Input: “帮我把这本英文技术书每一章做成可学习的导读，不要太短。”

Output intent:

- create per-chapter study guides
- avoid shallow summaries
- add terminology and review questions

### Example 2

Input: “解释这章关于 consensus protocol 的内容，重点解释图和代码片段。”

Output intent:

- explain section by section
- include diagram and code interpretation
- identify likely confusion points
