// 클라이언트에서 쓰는 공개 API. 서버 전용 코드는 @/conversation/server로 따로 가져온다.
export { ConversationView } from "./conversation-view";
export type { SpeechPort } from "./speech";
export type { Correction, Message, Persona } from "./types";
