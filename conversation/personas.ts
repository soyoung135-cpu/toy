import type { Persona } from "./types";

export const PERSONAS: Persona[] = [
  {
    id: "hotel-front-desk",
    role: "Hotel front desk clerk",
    name: "Emma",
    situation:
      "You arrive at a hotel on a business trip, but the clerk can't find your reservation.",
    personality:
      "Friendly but follows the rules. Hotel is almost full tonight. Has worked the night shift for two years.",
  },
  {
    id: "cafe-barista",
    role: "Cafe barista",
    name: "Jake",
    situation:
      "You order a drink at a busy cafe and need to ask about sizes, milk options and a pastry.",
    personality:
      "Cheerful and talkative. Loves recommending the seasonal drink. Is a part-time art student.",
  },
  {
    id: "coworker-small-talk",
    role: "Coworker from another team",
    name: "Priya",
    situation:
      "You meet a coworker in the elevator and have two minutes of small talk before a meeting.",
    personality:
      "Curious and warm. Just came back from a weekend trip to the mountains. Asks about your weekend too.",
  },
  {
    id: "clinic-receptionist",
    role: "Clinic receptionist",
    name: "Daniel",
    situation:
      "You visit a clinic with a bad cold and need to register, describe your symptoms and ask about waiting time.",
    personality:
      "Calm and patient. Speaks clearly and slowly. Always asks for the name and date of birth first.",
  },
  {
    id: "job-interviewer",
    role: "Job interviewer",
    name: "Sarah",
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
