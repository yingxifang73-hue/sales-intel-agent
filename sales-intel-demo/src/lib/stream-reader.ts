import type { PipelineEvent } from "@/lib/types";

/**
 * 从 ReadableStream 中逐行读取 NDJSON 并 yield PipelineEvent
 * decode({ stream: true }) 确保跨 chunk 的 UTF-8 多字节字符不被截断
 */
export async function* readNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<PipelineEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }

      // 按换行分割已完成的 JSON 行
      const lines = buffer.split("\n");
      // 最后一段可能不完整，保留到下次 loop
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as PipelineEvent;
        } catch {
          // 跳过无法解析的行（防御性）
        }
      }

      if (done) {
        // 处理最后残留的一行
        if (buffer.trim()) {
          try {
            yield JSON.parse(buffer.trim()) as PipelineEvent;
          } catch {
            // ignore
          }
        }
        break;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* lock already released */ }
  }
}
