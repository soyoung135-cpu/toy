import type { Message, Persona } from "./types";
import { countTurns, TURN_GOAL } from "./turns";

/** 대화를 시작할 때 모델에 붙이는 숨은 사용자 메시지. 화면에는 보이지 않는다. */
export const START_SIGNAL = "[The conversation starts now. Speak first, in character.]";

export function buildPersonaPrompt(persona: Persona, history: Message[]): string {
  const lines = [
    `You are ${persona.name}, a ${persona.role}. You are role-playing a real-life English conversation with a Korean adult who is practicing speaking.`,
    `Scene: ${persona.situation}`,
    `Your personality: ${persona.personality}`,
    "Rules:",
    "- Stay in role at all times. Never mention that you are an AI or that this is practice.",
    "- Never correct the learner's grammar, vocabulary or pronunciation, and never comment on their English. Just keep the conversation going naturally.",
    "- Use simple everyday English (about CEFR B1): short sentences, common words, no idioms that are hard to guess.",
    "- Reply in 1 to 3 short sentences, then usually ask one question so the learner keeps talking.",
    "- The learner's words come from speech recognition, so ignore missing punctuation or capitalization.",
  ];
  // 이번 답이 목표 턴을 채우는 답이면 마무리를 제안하게 한다. 대화는 계속될 수 있다.
  if (countTurns(history) + 1 >= TURN_GOAL) {
    lines.push(
      `- This reply completes turn ${TURN_GOAL}. In character, naturally suggest that you could wrap up here, but if the learner keeps talking, keep chatting normally.`,
    );
  }
  return lines.join("\n");
}

export function buildFeedbackPrompt(): string {
  return [
    "You are an English tutor reviewing a conversation between a Korean learner (Learner) and a role-play partner (Partner).",
    "Find sentences the Learner said that contain real grammar or word-choice mistakes, and fix them.",
    "The Learner's words come from speech recognition: ignore punctuation, capitalization and obvious transcription noise.",
    "Do not correct the Partner. Do not list sentences that are already correct. If there are no mistakes, return an empty list.",
    'Reply with ONLY a JSON object, no other text, in this exact shape: {"corrections":[{"original":"<the Learner sentence exactly as said>","corrected":"<the fixed sentence>","explanation":"<1-2 sentences in Korean explaining the fix>"}]}',
  ].join("\n");
}

export function formatTranscript(messages: Message[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.content}`)
    .join("\n");
}
