import type { Persona } from "./types";

export const PERSONAS: Persona[] = [
  {
    id: "hotel-front-desk",
    role: "Hotel front desk clerk",
    name: "Emma",
    roleKo: "호텔 프런트 직원",
    situationKo: "출장으로 호텔에 도착했는데 직원이 예약을 찾지 못합니다.",
    situation:
      "You arrive at a hotel on a business trip, but the clerk can't find your reservation.",
    personality:
      "Friendly but follows the rules. Hotel is almost full tonight. Has worked the night shift for two years.",
  },
  {
    id: "cafe-barista",
    role: "Cafe barista",
    name: "Jake",
    roleKo: "카페 바리스타",
    situationKo: "붐비는 카페에서 음료와 빵을 주문하며 사이즈와 우유 옵션을 물어봅니다.",
    situation:
      "You order a drink at a busy cafe and need to ask about sizes, milk options and a pastry.",
    personality:
      "Cheerful and talkative. Loves recommending the seasonal drink. Is a part-time art student.",
  },
  {
    id: "coworker-small-talk",
    role: "Coworker from another team",
    name: "Priya",
    roleKo: "다른 팀 동료",
    situationKo: "회의 전 엘리베이터에서 동료를 만나 2분 정도 가벼운 대화를 나눕니다.",
    situation:
      "You meet a coworker in the elevator and have two minutes of small talk before a meeting.",
    personality:
      "Curious and warm. Just came back from a weekend trip to the mountains. Asks about your weekend too.",
  },
  {
    id: "clinic-receptionist",
    role: "Clinic receptionist",
    name: "Daniel",
    roleKo: "병원 접수 직원",
    situationKo: "심한 감기로 병원에 와서 접수하고 증상과 대기 시간을 이야기합니다.",
    situation:
      "You visit a clinic with a bad cold and need to register, describe your symptoms and ask about waiting time.",
    personality:
      "Calm and patient. Speaks clearly and slowly. Always asks for the name and date of birth first.",
  },
  {
    id: "job-interviewer",
    role: "Job interviewer",
    name: "Sarah",
    roleKo: "면접관",
    situationKo: "해외 기업 면접에서 면접관 Sarah가 경력에 대해 묻습니다.",
    situation:
      "You are in a job interview for a role at an international company, and Sarah asks about your experience.",
    personality:
      "Professional and kind. Likes concrete examples. Gives the candidate time to think.",
  },
];

export function pickPersona(random: () => number): Persona {
  const index = Math.min(
    PERSONAS.length - 1,
    Math.floor(random() * PERSONAS.length),
  );
  return PERSONAS[index];
}
