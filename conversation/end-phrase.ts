const END_PHRASES = new Set(["let's stop here", "i'm done", "let's finish"]);

/** 영어 종료 문구는 문장 전체가 그 문구일 때만 인정한다. */
export function isEndPhrase(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?\s]+$/g, "")
    .trim();
  return END_PHRASES.has(normalized);
}
