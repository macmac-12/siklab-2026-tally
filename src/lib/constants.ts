export const colleges = [
  { id: "CEA", name: "College of Engineering and Architecture", color: "#a7adb2" },
  { id: "CAS", name: "College of Arts and Sciences", color: "#f25e59" },
  { id: "CCS", name: "College of Computer Studies", color: "#f1d441" },
  { id: "CHS", name: "College of Health and Sciences", color: "#b68ae6" },
  { id: "CTHBM", name: "College of Tourism, Hospitality, and Business Management", color: "#5ac779" },
  { id: "CTDE", name: "College of Technological Development Education", color: "#61a9f1" },
  { id: "BUHI", name: "Buhi Campus", color: "#f18bb3" },
] as const;

export const events = ["Basketball", "Volleyball", "Athletics", "Sepak Takraw", "Badminton", "Lawn Tennis", "Table Tennis", "Taekwondo", "Arnis", "Chess", "E-games — CODM", "E-games — MLBB"] as const;
export const categories = ["Men", "Women"] as const;
const placingRules = { "1st": 10, "2nd": 7, "3rd": 5, "4th": 3, "5th": 2, "6th": 1, "7th": 0 };
const athleticsIndividualRules = { "1st": 5, "2nd": 4, "3rd": 3, Participation: 1 };
const athleticsRelayRules = { "1st": 10, "2nd": 8, "3rd": 6, Participation: 2 };
const combatRules = { "1st": 5, "2nd": 4, "3rd": 3, Participation: 1 };
const sepakTakrawRules = { Champion: 20, "1st Runner Up": 15, "2nd Runner Up": 10, Participation: 5 };
const eGamesRules = { "Win 2:0": 3, "Win 2:1": 2, "Loss 1:2": 1, "Loss 0:2": 0 };

export const defaultRules: Record<string, Record<string, number>> = {
  Basketball: placingRules,
  Volleyball: placingRules,
  "Athletics — Individual": athleticsIndividualRules,
  "Athletics — Relay": athleticsRelayRules,
  "Sepak Takraw": sepakTakrawRules,
  Badminton: placingRules,
  "Lawn Tennis": placingRules,
  "Table Tennis": placingRules,
  Taekwondo: combatRules,
  Arnis: combatRules,
  Chess: placingRules,
  "E-games — CODM": eGamesRules,
  "E-games — MLBB": eGamesRules,
};

export function rulesKeyForEvent(event: string, format?: string) {
  return event === "Athletics" ? `Athletics — ${format}` : event;
}

export function eventNeedsDetail(event: string) {
  return event === "Athletics" || event === "Taekwondo" || event === "Arnis" || event.startsWith("E-games");
}
