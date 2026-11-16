/**
 * Voice rules for anything written to Fibery: no em dashes, no emoji,
 * collapsed whitespace, bounded length. Applied to every string the filer
 * writes, including what a person typed.
 */
const EM_DASH = new RegExp(String.fromCharCode(0x2014), "g");
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

export function toSubstrate(text: string, max = 600): string {
  const clean = text
    .replace(EM_DASH, ", ")
    .replace(EMOJI, "")
    .replace(/\s+/g, " ")
    .replace(/ ,/g, ",")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}

/** Same rules, keeping line breaks, for a markdown body. */
export function toSubstrateMd(text: string, max = 8000): string {
  const clean = text.replace(EM_DASH, ", ").replace(EMOJI, "").replace(/[ \t]+\n/g, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}
