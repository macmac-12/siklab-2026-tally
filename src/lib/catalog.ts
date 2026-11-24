/** Authoritative source: 2026-INTRAMURAL-PROPOSAL-FINAL-1.pdf pp.2–4, 13.
 * Award units additionally confirmed by the organizer. Never seed fixtures from the proposal. */
export const COLLEGES = [
  { id: "BUHI", name: "Buhi Campus", color: "#d43d9e" },
  { id: "CAS", name: "College of Arts and Sciences", color: "#d94846" },
  { id: "CCS", name: "College of Computer Studies", color: "#e5b817" },
  {
    id: "CEA",
    name: "College of Engineering and Architecture",
    color: "#78838d",
  },
  { id: "CHS", name: "College of Health Sciences", color: "#9351c6" },
  {
    id: "CTDE",
    name: "College of Technological and Developmental Education",
    color: "#367ad4",
  },
  {
    id: "CTHBM",
    name: "College of Tourism, Hospitality and Business Management",
    color: "#278756",
  },
] as const;
export const COLLEGE_IDS = COLLEGES.map((c) => c.id);
export type CollegeId = (typeof COLLEGES)[number]["id"];
export type PointsRule = { podium: number[]; participation: number };
export type Category = {
  id: string;
  event: string;
  name: string;
  group: "Sports" | "Culture" | "Special" | "E-games";
  aggregation: "direct" | "subpoints";
  rule: PointsRule;
  confirmed: boolean;
  hold: string;
  policy: "college" | "per_entry" | "best_entry";
  version: number;
  source: string;
};
export type Discipline = {
  id: string;
  categoryId: string;
  name: string;
  rule: PointsRule;
  scheduleMode: "race" | "standard";
  active: boolean;
  reason: string;
  version: number;
};
const major = { podium: [25, 20, 15], participation: 5 };
const secondary = { podium: [20, 15, 10], participation: 5 };
const small = { podium: [5, 4, 3], participation: 1 };
const dual = { podium: [8, 6, 4], participation: 2 };
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const CATEGORIES: Category[] = [];
function add(
  event: string,
  names: string[],
  group: Category["group"],
  rule: PointsRule,
  aggregation: Category["aggregation"] = "direct",
  hold = "",
) {
  for (const name of names)
    CATEGORIES.push({
      id: slug(`${event}-${name}`),
      event,
      name,
      group,
      rule,
      aggregation,
      confirmed: !hold,
      hold,
      policy: "college",
      version: 1,
      source: `Proposal pp.2–4${aggregation === "subpoints" ? ", 13" : ""}; organizer category clarification`,
    });
}
for (const event of ["Basketball", "Volleyball"])
  add(event, ["Men", "Women"], "Sports", major);
for (const event of ["Athletics", "Arnis", "Taekwondo"])
  add(event, ["Men", "Women"], "Sports", major, "subpoints");
for (const event of ["Badminton", "Table Tennis", "Lawn Tennis"])
  add(event, ["Men", "Women"], "Sports", secondary);
add("Sepak Takraw", ["Men"], "Sports", secondary);
add("Chess", ["Men", "Women"], "Sports", dual);
for (const event of [
  "Hip-Hop",
  "Folkdance",
  "Contemporary Dance",
  "Radio Drama",
  "Quartet",
])
  add(event, ["Open"], "Culture", secondary);
add("Quiz Bowl", ["Open"], "Special", secondary);
for (const event of [
  "Extemporaneous Speaking",
  "Dagliang Talumpati",
  "Story Telling",
  "Pagkwekwento",
  "Pagsulat ng Sanaysay",
  "Essay Writing",
  "Pop Solo",
  "Kundiman",
  "Photography",
  "Charcoal Rendering",
  "Pencil Drawing",
  "On the Spot Poster Making",
  "Painting",
])
  add(event, ["Open"], "Culture", small);
add("Instrumental Solo", ["Bandurria", "Classical Guitar"], "Culture", small);
add("Dance Sports", ["Latin", "Standard", "Third Kind"], "Culture", dual);
add("Vocal Duet", ["Open"], "Culture", dual);
for (const event of ["CODM", "MLBB"])
  add(event, ["Open"], "E-games", secondary);
add(
  "Cheerdance",
  ["Open"],
  "Special",
  { podium: [], participation: 0 },
  "direct",
  "No general-point table in the proposal. Await an official scoring rule.",
);
add(
  "Mr. and Ms. Intrams",
  ["Men", "Women"],
  "Special",
  { podium: [8, 7, 6, 5, 4], participation: 2 },
  "direct",
  "Await official candidate-to-college aggregation policy.",
);
export const DISCIPLINES: Discipline[] = [];
const ATHLETICS_RACES = new Set([
  "100m Dash",
  "200m Dash",
  "400m Run",
  "800m Run",
  "1500m Run",
  "3000m Run",
  "4x100m Relay",
  "4x400m Relay",
]);
for (const category of CATEGORIES.filter(
  (c) => c.aggregation === "subpoints",
)) {
  let names: string[];
  if (category.event === "Athletics")
    names = [
      "100m Dash",
      "200m Dash",
      "400m Run",
      "800m Run",
      "1500m Run",
      "3000m Run",
      "Shot Put",
      "Discus",
      "Javelin",
      "4x100m Relay",
      "4x400m Relay",
      "Long Jump",
      "Triple Jump",
    ];
  else if (category.event === "Taekwondo")
    names =
      category.name === "Men"
        ? ["63kg", "68kg", "73kg", "79kg", "85kg", "86kg and above"]
        : ["53kg", "57kg", "62kg", "67kg", "73kg", "74kg and above"];
  else
    names =
      category.name === "Men"
        ? ["65kg", "72kg", "80kg", "89kg", "99kg", "100kg and above"]
        : ["56kg", "62kg", "69kg", "77kg", "86kg", "87kg and above"];
  for (const name of names) {
    const relay = name.includes("Relay"),
      tba = name.includes("Jump");
    DISCIPLINES.push({
      id: `${category.id}-${slug(name)}`,
      categoryId: category.id,
      name,
      rule: relay ? { podium: [10, 8, 6], participation: 2 } : small,
      scheduleMode:
        category.event === "Athletics" && ATHLETICS_RACES.has(name)
          ? "race"
          : "standard",
      active: !tba,
      reason: tba
          ? "TBA; confirm equipment and official inclusion (pp.13, 18–19)."
          : relay
            ? "Organizer confirmed the normalized relay discipline."
            : name === "Javelin"
              ? "Organizer confirmed Javelin as an Athletics discipline."
              : "",
      version: 1,
    });
  }
}
export const categoryLabel = (c: Pick<Category, "event" | "name">) =>
  `${c.event} · ${c.name}`;
