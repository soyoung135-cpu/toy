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
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}
