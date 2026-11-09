export const colleges = [
  { id: "CEA", name: "College of Engineering and Architecture", color: "#a7adb2", bg: "rgba(167,173,178,0.10)", border: "rgba(167,173,178,0.35)" },
  { id: "CAS", name: "College of Arts and Sciences", color: "#f25e59", bg: "rgba(242,94,89,0.10)", border: "rgba(242,94,89,0.35)" },
  { id: "CCS", name: "College of Computer Studies", color: "#f1d441", bg: "rgba(241,212,65,0.10)", border: "rgba(241,212,65,0.35)" },
  { id: "CHS", name: "College of Health and Sciences", color: "#b68ae6", bg: "rgba(182,138,230,0.10)", border: "rgba(182,138,230,0.35)" },
  { id: "CTHBM", name: "College of Tourism, Hospitality, and Business Management", color: "#5ac779", bg: "rgba(90,199,121,0.10)", border: "rgba(90,199,121,0.35)" },
  { id: "CTDE", name: "College of Technological Development Education", color: "#61a9f1", bg: "rgba(97,169,241,0.10)", border: "rgba(97,169,241,0.35)" },
  { id: "BUHI", name: "Buhi Campus", color: "#f18bb3", bg: "rgba(241,139,179,0.10)", border: "rgba(241,139,179,0.35)" },
] as const;

export const events = [
  // Major Sports (25 / 20 / 15 / 5)
  "Basketball",
  "Volleyball",
  "Athletics",
  "Arnis",
  "Taekwondo",

  // Secondary Sports, Dance, Academics & E-Games (20 / 15 / 10 / 5)
  "Badminton",
  "Sepak Takraw",
  "Table Tennis",
  "Lawn Tennis",
  "Hip-Hop",
  "Folkdance",
  "Contemporary Dance",
  "E-Games",
  "E-games — CODM",
  "E-games — MLBB",
  "Radio Drama",
  "Quiz Bowl/Academic Contest",
  "Quartet",

  // Dual, Vocal & Chess (8 / 6 / 4 / 2)
  "Dance Sports",
  "Vocal Duet",
  "Chess",

  // Literary, Musical & Visual Arts (5 / 4 / 3 / 1)
  "Extemporaneous Speaking",
  "Dagliang Talumpati",
  "Story Telling",
  "Pagkwekwento",
  "Pagsulat ng Sanaysay",
  "Essay Writing",
  "Pop Solo",
  "Kundiman",
  "Instrumental Solo",
  "Photography",
  "Charcoal Rendering",
  "Pencil Drawing",
  "On the Spot Poster Making",
  "Painting",

  // Pageant (8 / 7 / 6 / 5 / 4 / 2)
  "Mr. and Ms. Intrams",
] as const;

export const categories = ["Men", "Women", "Mixed / Open"] as const;

export const roundOptions = [
  "Eliminations",
  "Round Robin",
  "Quarter-Finals",
  "Semi-Finals",
  "3rd Place",
  "Finals",
  "Game 1",
  "Game 2",
  "Game 3",
] as const;

export const athleticsIndividualCategories = [
  "100m Dash",
  "200m Dash",
  "400m Dash",
  "800m Run",
  "1500m Run",
  "3000m Run",
  "5000m Run",
  "100m Hurdles",
  "110m Hurdles",
  "400m Hurdles",
  "Long Jump",
  "Triple Jump",
  "High Jump",
  "Shot Put",
  "Discus Throw",
  "Javelin Throw",
] as const;

export const athleticsRelayCategories = [
  "4x100m Relay",
  "4x400m Relay",
  "4x200m Relay",
  "Mixed 4x100m Relay",
  "Mixed 4x400m Relay",
] as const;

export const taekwondoWeightClasses = {
  Men: [
    "Finweight (Under 54 kg)",
    "Flyweight (54 - 58 kg)",
    "Bantamweight (58 - 63 kg)",
    "Featherweight (63 - 68 kg)",
    "Lightweight (68 - 74 kg)",
    "Welterweight (74 - 80 kg)",
    "Middleweight (80 - 87 kg)",
    "Heavyweight (Over 87 kg)",
    "Poomsae (Individual)",
    "Poomsae (Team)",
  ],
  Women: [
    "Finweight (Under 46 kg)",
    "Flyweight (46 - 49 kg)",
    "Bantamweight (49 - 53 kg)",
    "Featherweight (53 - 57 kg)",
    "Lightweight (57 - 62 kg)",
    "Welterweight (62 - 67 kg)",
    "Middleweight (67 - 73 kg)",
    "Heavyweight (Over 73 kg)",
    "Poomsae (Individual)",
    "Poomsae (Team)",
  ],
} as const;

export const arnisWeightClasses = {
  Men: [
    "Pinweight (Under 47 kg)",
    "Bantamweight (47 - 51 kg)",
    "Featherweight (51 - 55 kg)",
    "Extra Lightweight (55 - 60 kg)",
    "Half Lightweight (60 - 65 kg)",
    "Lightweight (Over 65 kg)",
    "Anyo (Forms - Individual)",
    "Anyo (Forms - Team)",
  ],
  Women: [
    "Pinweight (Under 43 kg)",
    "Bantamweight (43 - 47 kg)",
    "Featherweight (47 - 51 kg)",
    "Extra Lightweight (51 - 55 kg)",
    "Half Lightweight (55 - 60 kg)",
    "Lightweight (Over 60 kg)",
    "Anyo (Forms - Individual)",
    "Anyo (Forms - Team)",
  ],
} as const;

// Official Pointing System - CSPC Office of the Director of Student Affairs and Services
const majorSportsRules = {
  Champion: 25,
  "1st Runner-Up": 20,
  "2nd Runner-Up": 15,
  Participation: 5,
};

const secondaryEventsRules = {
  Champion: 20,
  "1st Runner-Up": 15,
  "2nd Runner-Up": 10,
  Participation: 5,
};

const dualAndChessRules = {
  Champion: 8,
  "1st Runner-Up": 6,
  "2nd Runner-Up": 4,
  Participation: 2,
};

const socioCulturalRules = {
  Champion: 5,
  "1st Runner-Up": 4,
  "2nd Runner-Up": 3,
  Participation: 1,
};

const pageantRules = {
  "Mr. and Ms. Intrams": 8,
  "1st Runner-Up": 7,
  "2nd Runner-Up": 6,
  "3rd Runner-Up": 5,
  "4th Runner Up": 4,
  Participation: 2,
};

export const defaultRules: Record<string, Record<string, number>> = {
  // Major Sports (25 / 20 / 15 / 5)
  Basketball: majorSportsRules,
  Volleyball: majorSportsRules,
  Athletics: majorSportsRules,
  "Athletics — Individual": majorSportsRules,
  "Athletics — Relay": majorSportsRules,
  Arnis: majorSportsRules,
  Taekwondo: majorSportsRules,

  // Secondary Sports, Dance, Academics & E-Games (20 / 15 / 10 / 5)
  Badminton: secondaryEventsRules,
  "Sepak Takraw": secondaryEventsRules,
  "Table Tennis": secondaryEventsRules,
  "Lawn Tennis": secondaryEventsRules,
  "Hip-Hop": secondaryEventsRules,
  Folkdance: secondaryEventsRules,
  "Contemporary Dance": secondaryEventsRules,
  "E-Games": secondaryEventsRules,
  "E-games — CODM": secondaryEventsRules,
  "E-games — MLBB": secondaryEventsRules,
  "Radio Drama": secondaryEventsRules,
  "Quiz Bowl/Academic Contest": secondaryEventsRules,
  Quartet: secondaryEventsRules,

  // Dual, Vocal & Chess (8 / 6 / 4 / 2)
  "Dance Sports": dualAndChessRules,
  "Vocal Duet": dualAndChessRules,
  Chess: dualAndChessRules,

  // Literary, Musical & Visual Arts (5 / 4 / 3 / 1)
  "Extemporaneous Speaking": socioCulturalRules,
  "Dagliang Talumpati": socioCulturalRules,
  "Story Telling": socioCulturalRules,
  Pagkwekwento: socioCulturalRules,
  "Pagsulat ng Sanaysay": socioCulturalRules,
  "Essay Writing": socioCulturalRules,
  "Pop Solo": socioCulturalRules,
  Kundiman: socioCulturalRules,
  "Instrumental Solo": socioCulturalRules,
  Photography: socioCulturalRules,
  "Charcoal Rendering": socioCulturalRules,
  "Pencil Drawing": socioCulturalRules,
  "On the Spot Poster Making": socioCulturalRules,
  Painting: socioCulturalRules,

  // Pageant (8 / 7 / 6 / 5 / 4 / 2)
  "Mr. and Ms. Intrams": pageantRules,
};

export function rulesKeyForEvent(event: string, format?: string) {
  return event === "Athletics" && format ? `Athletics — ${format}` : event;
}

export function eventNeedsDetail(event: string) {
  return event === "Athletics" || event === "Taekwondo" || event === "Arnis" || event.startsWith("E-games") || event === "E-Games";
}

export const danceSportsCategories = ["Latin", "Standard", "Third Kind"] as const;

export const culturalAndSpecialEvents = [
  "Hip-Hop",
  "Folkdance",
  "Contemporary Dance",
  "Dance Sports",
  "Extemporaneous Speaking",
  "Dagliang Talumpati",
  "Story Telling",
  "Pagkwekwento",
  "Pagsulat ng Sanaysay",
  "Essay Writing",
  "Pop Solo",
  "Kundiman",
  "Instrumental Solo",
  "Vocal Duet",
  "Quartet",
  "Radio Drama",
  "Photography",
  "Charcoal Rendering",
  "Pencil Drawing",
  "On the Spot Poster Making",
  "Painting",
  "Quiz Bowl/Academic Contest",
  "Mr. and Ms. Intrams",
] as const;

export const subPointSports = ["Athletics", "Taekwondo", "Arnis"] as const;

export function isAllCollegesEvent(event: string): boolean {
  if (event === "Athletics" || event.startsWith("Athletics —")) return true;
  return culturalAndSpecialEvents.some((e) => e === event);
}

export function isSubPointSport(event: string): boolean {
  return subPointSports.some((s) => s === event || event.startsWith(`${s} —`));
}

export function getCategoriesForEvent(event: string): readonly string[] {
  if (event === "Dance Sports") {
    return danceSportsCategories;
  }
  if (event === "Mr. and Ms. Intrams") {
    return ["Men", "Women"] as const;
  }
  if (isAllCollegesEvent(event) && event !== "Athletics") {
    return ["All Colleges / Open"] as const;
  }
  if (event === "Taekwondo" || event === "Arnis" || event === "Athletics") {
    return ["Men", "Women"] as const;
  }
  return ["Men", "Women", "Mixed / Open"] as const;
}

export function getRoundOptionsForEvent(event: string): readonly string[] {
  if (isAllCollegesEvent(event)) {
    return ["Showcase / Competition", "Finals", "Preliminaries"] as const;
  }
  return roundOptions;
}
