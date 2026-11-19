export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface Persona {
  id: string;
  role: string;
  name: string;
  situation: string;
  personality: string;
  /** 화면에 보여 주는 한국어 역할. 영어 role은 AI에게 주는 지시에만 쓴다. */
  roleKo: string;
  /** 화면에 보여 주는 한국어 상황. */
  situationKo: string;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}
