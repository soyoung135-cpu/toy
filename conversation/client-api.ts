import type { Correction, Message } from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return (await response.json()) as T;
}

export async function requestReply(
  personaId: string,
  messages: Message[],
): Promise<string> {
  const data = await postJson<{ reply: string }>("/api/chat", {
    personaId,
    messages,
  });
  return data.reply;
}

export async function requestCorrections(
  messages: Message[],
): Promise<Correction[]> {
  const data = await postJson<{ corrections: Correction[] }>("/api/feedback", {
    messages,
  });
  return data.corrections;
}
