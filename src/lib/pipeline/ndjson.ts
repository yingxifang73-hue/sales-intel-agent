import type { PipelineEvent } from "@/lib/types";

const encoder = new TextEncoder();

/**
 * 将单个 PipelineEvent 编码为 NDJSON 行
 * 格式: JSON.stringify(event) + "\n"
 */
export function encodeNdjson(event: PipelineEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + "\n");
}
