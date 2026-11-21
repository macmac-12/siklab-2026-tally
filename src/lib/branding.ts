import type { CollegeId } from "./catalog";
import type { Entry } from "./model";

export type CollegeBranding = {
  id: CollegeId;
  displayCode: string;
  name: string;
  mascot: string;
  logo: string;
  accentToken: string;
};

/** Presentation metadata only: persisted college identifiers remain unchanged. */
export const COLLEGE_BRANDING: Record<CollegeId, CollegeBranding> = {
  BUHI: {
    id: "BUHI",
    displayCode: "BC",
    name: "Buhi Campus",
    mascot: "Fierce Foxes",
    logo: "/branding/buhi.webp",
    accentToken: "--college-buhi",
  },
  CAS: {
    id: "CAS",
    displayCode: "CAS",
    name: "College of Arts and Sciences",
    mascot: "Red Monarchs",
    logo: "/branding/cas.webp",
    accentToken: "--college-cas",
  },
  CCS: {
    id: "CCS",
    displayCode: "CCS",
    name: "College of Computer Studies",
    mascot: "Golden Cheetahs",
    logo: "/branding/ccs.webp",
    accentToken: "--college-ccs",
  },
  CEA: {
    id: "CEA",
    displayCode: "CEA",
    name: "College of Engineering and Architecture",
    mascot: "Raging Bulls",
    logo: "/branding/cea.webp",
    accentToken: "--college-cea",
  },
  CHS: {
    id: "CHS",
    displayCode: "CHS",
    name: "College of Health Sciences",
    mascot: "Venom Vipers",
    logo: "/branding/chs.webp",
    accentToken: "--college-chs",
  },
  CTDE: {
    id: "CTDE",
    displayCode: "CTDE",
    name: "College of Technological and Developmental Education",
    mascot: "Blue Sentinels",
    logo: "/branding/ctde.webp",
    accentToken: "--college-ctde",
  },
  CTHBM: {
    id: "CTHBM",
    displayCode: "CTHBM",
    name: "College of Tourism, Hospitality, and Business Management",
    mascot: "Soaring Vanguards",
    logo: "/branding/cthbm.webp",
    accentToken: "--college-cthbm",
  },
};

export const SIKLAB_LOGO = "/branding/siklab-2026.webp";

export function collegeBrand(id: string): CollegeBranding | undefined {
  const key = id === "BC" ? "BUHI" : id;
  return Object.prototype.hasOwnProperty.call(COLLEGE_BRANDING, key)
    ? COLLEGE_BRANDING[key as CollegeId]
    : undefined;
}

export function displayCode(id: string): string {
  return collegeBrand(id)?.displayCode || id;
}

/** Preserve athlete/team labels; translate only labels that are college codes. */
export function displayEntryLabel(
  entry: Pick<Entry, "label" | "collegeId">,
): string {
  const label = entry.label.trim();
  return label === entry.collegeId || label === displayCode(entry.collegeId)
    ? displayCode(entry.collegeId)
    : entry.label;
}
