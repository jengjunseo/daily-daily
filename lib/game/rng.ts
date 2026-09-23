export function stableHash(...parts: Array<string | number>): number {
  const text = parts.join("\u001f");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededRandom(...parts: Array<string | number>): number {
  let value = stableHash(...parts);
  value = (value + 0x6d2b79f5) | 0;
  let result = Math.imul(value ^ (value >>> 15), 1 | value);
  result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
  return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export function stableDigest(value: unknown): string {
  return stableHash(stableStringify(value)).toString(16).padStart(8, "0");
}
