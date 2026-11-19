import type { Message } from "./types";

export const TURN_GOAL = 20;

/** 내가 한 번 말하고 페르소나가 한 번 답하면 1턴이다. */
export function countTurns(messages: Message[]): number {
  let turns = 0;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
      turns++;
    }
  }
  return turns;
}

export function hasReachedGoal(messages: Message[]): boolean {
  return countTurns(messages) >= TURN_GOAL;
}
