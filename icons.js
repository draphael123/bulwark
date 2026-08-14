// BULWARK woodcut icon set — ink-line engravings on parchment tiles.
// Each entry is inner-SVG for a 64x64 viewBox; stroke ink, minimal fills.
const INK = '#2a1f12';
const SC = (w = 2.6) => `stroke="currentColor" stroke-width="${w}" fill="none" stroke-linecap="round"`;
const S = (w = 2.6) => `stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round"`;

export const ICON = {
  // ---- walls & gates
  palisade: `<g ${S()}>
    <path d="M12 52 V22 L16 16 L20 22 V52 M28 52 V20 L32 14 L36 20 V52 M44 52 V22 L48 16 L52 22 V52"/>
    <path d="M8 40 H56" stroke-width="1.8"/></g>`,
  wall: `<g ${S()}>
    <path d="M8 52 V26 H16 V20 H24 V26 H30 V20 H38 V26 H44 V20 H52 V26 H56 V52 Z"/>
    <path d="M8 38 H56 M22 26 V38 M42 26 V38 M14 38 V52 M32 38 V52 M50 38 V52" stroke-width="1.6"/></g>`,
  highwall: `<g ${S()}>
    <path d="M10 54 V18 H16 V12 H22 V18 H28 V12 H36 V18 H42 V12 H48 V18 H54 V54 Z"/>
    <path d="M10 30 H54 M10 42 H54 M24 18 V30 M40 18 V30 M17 30 V42 M32 30 V42 M47 30 V42" stroke-width="1.5"/>
    <circle cx="32" cy="48" r="2.4" stroke-width="1.8"/></g>`,
  woodgate: `<g ${S()}>
    <path d="M12 52 V22 Q32 10 52 22 V52"/>
    <path d="M18 52 V26 Q32 17 46 26 V52"/>
    <path d="M18 34 H46 M18 43 H46 M32 22 V52" stroke-width="1.8"/></g>`,
  gate: `<g ${S()}>
    <path d="M10 52 V24 Q32 8 54 24 V52"/>
    <path d="M18 52 V30 Q32 18 46 30 V52"/>
    <path d="M24 32 V52 M32 28 V52 M40 32 V52 M20 40 H44" stroke-width="1.6"/></g>`,
  greatgate: `<g ${S()}>
    <path d="M6 52 V20 H14 V14 H20 V20 H26 V52 M38 52 V20 H44 V14 H50 V20 H58 V52"/>
    <path d="M26 24 H38 M26 52 V30 Q32 24 38 30 V52"/>
    <path d="M30 34 V52 M34 34 V52" stroke-width="1.6"/></g>`,
  // ---- roads
  dirtroad: `<g ${S(2.2)}>
    <path d="M10 54 Q26 40 22 26 Q20 16 30 10"/>
    <path d="M22 54 Q36 42 32 28 Q30 18 40 12"/>
    <path d="M14 46 L18 46 M24 34 L28 34 M32 20 L36 20" stroke-width="1.6"/></g>`,
  road: `<g ${S(2.2)}>
    <path d="M12 54 L28 10 M36 10 L52 54"/>
    <path d="M20 44 H46 M24 32 H43 M27 21 H40" stroke-width="1.8"/>
    <circle cx="30" cy="49" r="1.6" stroke-width="1.4"/><circle cx="36" cy="38" r="1.6" stroke-width="1.4"/><circle cx="33" cy="27" r="1.6" stroke-width="1.4"/></g>`,
  flagroad: `<g ${S(2.2)}>
    <path d="M10 54 L26 10 M38 10 L54 54"/>
    <path d="M18 44 H50 M22 32 H46 M26 21 H42" stroke-width="1.8"/>
    <path d="M26 44 V54 M34 44 V54 M30 32 V44 M38 32 V44 M32 21 V32" stroke-width="1.5"/></g>`,
  // ---- town
  hovel: `<g ${S()}>
    <path d="M14 52 V34 L32 20 L50 34 V52 Z"/>
    <path d="M27 52 V40 H37 V52" stroke-width="2"/>
    <path d="M14 40 L22 34 M50 40 L42 34" stroke-width="1.5"/></g>`,
  house: `<g ${S()}>
    <path d="M12 30 L32 12 L52 30 V52 H12 Z"/>
    <path d="M12 30 H52 M26 52 V38 H38 V52 M16 34 L24 34 M40 34 L48 34" stroke-width="1.6"/></g>`,
  longhouse: `<g ${S()}>
    <path d="M8 34 L16 20 H48 L56 34 V52 H8 Z"/>
    <path d="M8 34 H56 M16 52 V42 H24 V52 M40 52 V42 H48 V52" stroke-width="1.6"/>
    <path d="M16 20 L12 13 M16 20 L21 13 M48 20 L43 13 M48 20 L52 13" stroke-width="1.8"/></g>`,
  rowhouse: `<g ${S()}>
    <path d="M16 52 V26 H22 V20 H28 V13 H36 V20 H42 V26 H48 V52 Z"/>
    <path d="M16 37 H48 M27 52 V43 H37 V52 M21 31 H27 M37 31 H43 M28 20 H36" stroke-width="1.6"/></g>`,
  townhouse: `<g ${S()}>
    <path d="M14 30 L32 13 L50 30 V52 H14 Z"/>
    <path d="M10 30 H54 M14 41 H50 M26 52 V45 H38 V52 M19 35 H26 M38 35 H45 M22 24 H28 M36 24 H42" stroke-width="1.6"/></g>`,
  well: `<g ${S()}>
    <path d="M16 36 A16 8 0 1 0 48 36 A16 8 0 1 0 16 36 M16 36 V46 A16 8 0 0 0 48 46 V36"/>
    <path d="M22 30 V14 H42 V30 M32 14 V26" stroke-width="2"/>
    <path d="M18 12 H46" stroke-width="2.2"/></g>`,
  granary: `<g ${S()}>
    <path d="M14 52 V30 Q32 14 50 30 V52 Z"/>
    <path d="M14 38 H50 M26 52 V44 H38 V52" stroke-width="1.6"/>
    <path d="M18 52 V56 M46 52 V56" stroke-width="2.2"/></g>`,
  greatstore: `<g ${S()}>
    <path d="M8 52 V28 Q32 10 56 28 V52 Z"/>
    <path d="M8 36 H56 M20 52 V42 H30 V52 M36 52 V42 H46 V52" stroke-width="1.6"/>
    <path d="M12 52 V56 M52 52 V56 M32 52 V56" stroke-width="2.2"/></g>`,
  market: `<g ${S()}>
    <path d="M10 26 L14 14 H50 L54 26 Q54 32 48 32 Q43 32 43 26 Q43 32 37 32 Q32 32 32 26 Q32 32 26 32 Q21 32 21 26 Q21 32 15 32 Q10 32 10 26 Z"/>
    <path d="M14 32 V52 H50 V32 M26 52 V40 H38 V52" stroke-width="1.8"/></g>`,
  tavern: `<g ${S()}>
    <path d="M12 30 L32 14 L52 30 V52 H12 Z"/>
    <path d="M26 52 V38 H38 V52" stroke-width="1.8"/>
    <path d="M46 24 H58 V32 H46 Z M52 24 V20" stroke-width="1.8"/>
    <circle cx="52" cy="28" r="1.8" stroke-width="1.4"/></g>`,
  chapel: `<g ${S()}>
    <path d="M16 52 V32 L32 20 L48 32 V52 Z"/>
    <path d="M32 20 V8 M28 12 H36" stroke-width="2"/>
    <path d="M27 52 V40 Q32 35 37 40 V52 M20 36 A2.5 2.5 0 1 0 25 36 A2.5 2.5 0 1 0 20 36" stroke-width="1.7"/></g>`,
  // ---- industry
  farm: `<g ${S(2.2)}>
    <path d="M16 52 V30 M32 52 V26 M48 52 V30"/>
    <path d="M16 34 Q10 30 10 24 M16 34 Q22 30 22 24 M32 30 Q26 26 26 20 M32 30 Q38 26 38 20 M48 34 Q42 30 42 24 M48 34 Q54 30 54 24"/>
    <path d="M8 52 H56" stroke-width="2.6"/></g>`,
  mill: `<g ${S()}>
    <path d="M24 52 L28 24 H36 L40 52 Z"/>
    <path d="M32 24 L18 10 M32 24 L46 10 M32 24 L18 38 M32 24 L46 38" stroke-width="2.2"/>
    <path d="M15 7 L21 13 M43 7 L49 13 M15 41 L21 35 M43 41 L49 35" stroke-width="1.7"/></g>`,
  woodcutter: `<g ${S()}>
    <path d="M14 52 L34 32 M30 22 L44 36"/>
    <path d="M28 18 L48 14 L52 26 L38 32 Z"/>
    <path d="M12 44 A6 6 0 1 0 24 44 A6 6 0 1 0 12 44" stroke-width="1.8"/></g>`,
  sawmill: `<g ${S()}>
    <path d="M10 46 H54 M10 52 H54" stroke-width="2.2"/>
    <path d="M32 44 A12 12 0 1 1 32 20 A12 12 0 0 1 32 44"/>
    <path d="M32 16 V20 M43 22 L40 25 M48 32 H44 M43 42 L40 39 M21 22 L24 25 M16 32 H20 M21 42 L24 39" stroke-width="1.7"/></g>`,
  quarry: `<g ${S()}>
    <path d="M12 52 L20 30 H44 L52 52 Z"/>
    <path d="M26 38 H38 M22 46 H42" stroke-width="1.7"/>
    <path d="M40 26 L52 14 M46 26 L52 20" stroke-width="2.2"/></g>`,
  tradepost: `<g ${S()}>
    <path d="M12 24 H52 L48 14 H16 Z M16 24 V52 M48 24 V52"/>
    <path d="M22 52 V34 H32 V52 M36 40 H46 V52 H36 Z" stroke-width="1.8"/>
    <path d="M36 46 H46" stroke-width="1.4"/></g>`,
  // ---- defense
  watchpost: `<g ${S()}>
    <path d="M18 52 L22 24 M46 52 L42 24 M18 24 H46"/>
    <path d="M22 24 V16 H42 V24 M28 16 V10 H36 V16" stroke-width="2"/>
    <path d="M26 34 H38" stroke-width="1.6"/></g>`,
  tower: `<g ${S()}>
    <path d="M22 52 V20 H26 V16 H30 V20 H34 V16 H38 V20 H42 V52 Z"/>
    <path d="M22 34 H42 M28 40 H36 M28 40 V52 H36 V40" stroke-width="1.6"/>
    <path d="M42 22 L54 26 L42 30"/></g>`,
  barracks: `<g ${S()}>
    <path d="M10 52 V30 L32 16 L54 30 V52 Z"/>
    <path d="M20 36 L28 44 M28 36 L20 44 M36 36 L44 44 M44 36 L36 44" stroke-width="2"/>
    <path d="M10 30 H54" stroke-width="1.6"/></g>`,
  // ---- decor
  garden: `<g ${S(2)}>
    <path d="M10 52 H54 M14 52 V44 M22 52 V40 M32 52 V44 M42 52 V40 M50 52 V44"/>
    <circle cx="22" cy="34" r="5"/><circle cx="42" cy="34" r="5"/><circle cx="32" cy="26" r="5"/>
    <path d="M22 39 V44 M42 39 V44 M32 31 V38" stroke-width="1.6"/></g>`,
  fountain: `<g ${S()}>
    <path d="M12 44 H52 L48 52 H16 Z"/>
    <path d="M24 44 V36 H40 V44 M32 36 V24"/>
    <path d="M32 24 Q24 20 24 12 M32 24 Q40 20 40 12 M32 24 V10" stroke-width="1.8"/></g>`,
  bannerpole: `<g ${S()}>
    <path d="M28 56 V10 M22 56 H34"/>
    <path d="M28 12 H50 L42 19 L50 26 H28" stroke-width="2.2"/></g>`,
  statue: `<g ${S()}>
    <path d="M18 52 H46 M22 52 V44 H42 V52"/>
    <path d="M32 20 A5 5 0 1 0 32 10 A5 5 0 0 0 32 20 M26 44 V30 Q26 24 32 24 Q38 24 38 30 V44"/>
    <path d="M26 30 L20 36 M38 28 L44 24" stroke-width="2"/></g>`,
  stakes: `<g ${S()}>
    <path d="M12 52 L20 24 M20 52 L28 20 M32 52 L40 22 M44 52 L52 26"/>
    <path d="M17 33 L25 30 M37 31 L45 29" stroke-width="1.7"/>
    <path d="M8 52 H56" stroke-width="2.4"/></g>`,
  hoardings: `<g ${S()}>
    <path d="M10 52 V34 H54 V52"/>
    <path d="M8 34 H56 M8 26 H56 M12 26 V34 M22 26 V34 M32 26 V34 M42 26 V34 M52 26 V34"/>
    <path d="M16 26 L20 18 M28 26 L32 18 M40 26 L44 18" stroke-width="1.8"/></g>`,
  moat: `<g ${S(2.2)}>
    <path d="M8 24 Q16 18 24 24 Q32 30 40 24 Q48 18 56 24"/>
    <path d="M8 36 Q16 30 24 36 Q32 42 40 36 Q48 30 56 36"/>
    <path d="M8 48 Q16 42 24 48 Q32 54 40 48 Q48 42 56 48"/></g>`,
  ballista: `<g ${S()}>
    <path d="M14 52 L32 34 M50 52 L32 34"/>
    <path d="M12 20 Q32 34 52 20"/>
    <path d="M32 34 L32 12 M28 16 L32 10 L36 16" stroke-width="2.2"/>
    <path d="M22 52 H42" stroke-width="2.6"/></g>`,
  infirmary: `<g ${S()}>
    <path d="M12 30 L32 14 L52 30 V52 H12 Z"/>
    <path d="M32 26 V42 M24 34 H40" stroke-width="3"/>
    <path d="M12 30 H52" stroke-width="1.6"/></g>`,
  bathhouse: `<g ${S()}>
    <path d="M12 34 H52 V40 Q52 50 42 50 H22 Q12 50 12 40 Z"/>
    <path d="M18 28 Q20 24 18 20 M28 28 Q30 24 28 20 M38 28 Q40 24 38 20 M48 28 Q50 24 48 20" stroke-width="2"/>
    <path d="M20 54 V50 M44 54 V50" stroke-width="2.2"/></g>`,
  school: `<g ${S()}>
    <path d="M14 52 V30 L32 18 L50 30 V52 Z"/>
    <path d="M32 18 V10 H40 V14 H32" stroke-width="2"/>
    <path d="M22 38 H42 M22 44 H42 M22 41 H42" stroke-width="1.5"/>
    <path d="M20 52 V34 H44 V52" stroke-width="1.8"/></g>`,
  orchard: `<g ${S(2.2)}>
    <path d="M18 52 V38 M46 52 V38 M32 52 V34"/>
    <circle cx="18" cy="31" r="7"/><circle cx="46" cy="31" r="7"/><circle cx="32" cy="26" r="8"/>
    <circle cx="15" cy="30" r="1.4" stroke-width="1.2"/><circle cx="35" cy="24" r="1.4" stroke-width="1.2"/><circle cx="48" cy="33" r="1.4" stroke-width="1.2"/>
    <path d="M8 52 H56" stroke-width="2.4"/></g>`,
  beacon: `<g ${S()}>
    <path d="M24 52 L28 24 H36 L40 52 Z M20 52 H44"/>
    <path d="M28 24 H36 M26 18 Q32 8 38 18 Q35 16 32 18 Q29 16 26 18" stroke-width="2"/>
    <path d="M18 12 L22 16 M46 12 L42 16 M32 4 V9" stroke-width="1.8"/></g>`,
  townhall: `<g ${S()}>
    <path d="M10 52 V26 H54 V52 Z M8 26 L32 12 L56 26"/>
    <path d="M16 52 V34 H24 V52 M40 52 V34 H48 V52 M28 40 H36 V52 H28 Z" stroke-width="1.7"/>
    <path d="M32 12 V6 M32 6 H42 L37 9 L42 12 H32" stroke-width="1.8"/></g>`,
  promenade: `<g ${S(2.2)}>
    <path d="M10 44 H54 M10 52 H54 M14 44 V52 M28 44 V52 M42 44 V52 M52 44 V52"/>
    <path d="M14 44 V36 M28 44 V36 M42 44 V36 M52 44 V36 M10 36 H54" stroke-width="1.8"/>
    <path d="M20 36 V26 M20 24 h0.1" stroke-width="1.8"/>
    <circle cx="20" cy="24" r="2.4" stroke-width="1.6"/>
    <path d="M36 36 V32 M32 32 H40 L38 26 H34 Z" stroke-width="1.6"/></g>`,
  bridge: `<g ${S(2.4)}>
    <path d="M8 40 Q32 20 56 40"/>
    <path d="M8 46 Q32 26 56 46"/>
    <path d="M16 43 V52 M28 37 V48 M40 37 V48 M52 43 V52" stroke-width="2"/>
    <path d="M4 52 H60" stroke-width="1.6"/></g>`,
  fisher: `<g ${S(2.2)}>
    <path d="M12 44 Q20 36 30 40 Q40 44 48 38 Q44 44 40 46 Q46 48 50 52 Q40 52 32 48 Q22 44 12 50 Z"/>
    <circle cx="20" cy="43" r="1.6" stroke-width="1.4"/>
    <path d="M40 12 Q52 16 50 30 M50 30 L46 26 M50 30 L54 25" stroke-width="1.8"/>
    <path d="M40 12 V8" stroke-width="1.8"/></g>`,
  paint: `<g ${S(2.4)}>
    <path d="M40 10 L54 24 L30 48 Q22 52 18 48 Q14 44 18 36 Z"/>
    <path d="M36 14 L50 28" stroke-width="1.8"/>
    <path d="M18 48 Q10 52 8 56 Q14 56 20 52" stroke-width="2"/></g>`,
  fence: `<g ${S(2.4)}>
    <path d="M14 54 V26 L18 20 L22 26 V54 M42 54 V26 L46 20 L50 26 V54"/>
    <path d="M8 34 H56 M8 46 H56" stroke-width="2.2"/></g>`,
  planttree: `<g ${S(2.4)}>
    <path d="M32 54 V34"/>
    <circle cx="32" cy="24" r="14"/>
    <circle cx="22" cy="30" r="8"/><circle cx="42" cy="30" r="8"/>
    <path d="M32 42 L26 36 M32 46 L38 40" stroke-width="1.8"/></g>`,
  maypole: `<g ${S(2.2)}>
    <path d="M32 54 V10"/>
    <circle cx="32" cy="10" r="3" stroke-width="1.8"/>
    <path d="M32 12 Q18 26 12 46 M32 12 Q26 30 26 50 M32 12 Q46 26 52 46 M32 12 Q38 30 38 50" stroke-width="1.7"/></g>`,
  shrine: `<g ${S()}>
    <path d="M16 54 V24 Q32 10 48 24 V54 Z"/>
    <path d="M26 54 V34 Q32 28 38 34 V54" stroke-width="2"/>
    <path d="M32 40 V46 M29 43 H35" stroke-width="1.8"/></g>`,
  beehives: `<g ${S(2.2)}>
    <path d="M18 52 Q10 52 12 42 Q10 34 16 30 Q14 22 24 20 Q26 12 32 14 Q40 12 40 20 Q48 22 46 30 Q52 34 50 42 Q52 52 44 52 Z"/>
    <path d="M16 44 H48 M18 36 H46 M22 28 H42" stroke-width="1.7"/>
    <circle cx="32" cy="46" r="2.6" stroke-width="1.6"/></g>`,
  stall: `<g ${S()}>
    <path d="M10 24 L16 12 H48 L54 24 Q54 30 48 30 Q43 30 43 24 Q43 30 37 30 Q32 30 32 24 Q32 30 26 30 Q21 30 21 24 Q21 30 15 30 Q10 30 10 24 Z"/>
    <path d="M16 30 V44 H48 V30 M16 44 H48" stroke-width="1.8"/>
    <circle cx="26" cy="38" r="2.4" stroke-width="1.5"/><circle cx="38" cy="38" r="2.4" stroke-width="1.5"/></g>`,
  graveyard: `<g ${S(2.2)}>
    <path d="M16 54 V32 Q16 24 22 24 Q28 24 28 32 V54"/>
    <path d="M38 54 V30 M32 36 H44" stroke-width="2.4"/>
    <path d="M8 54 H56" stroke-width="2"/>
    <path d="M48 50 Q52 46 50 42" stroke-width="1.5"/></g>`,
  woodpile: `<g ${S(2.2)}>
    <circle cx="20" cy="46" r="6"/><circle cx="33" cy="46" r="6"/><circle cx="46" cy="46" r="6"/>
    <circle cx="26" cy="35" r="6"/><circle cx="39" cy="35" r="6"/><circle cx="33" cy="24" r="6"/></g>`,
  cart: `<g ${S(2.2)}>
    <path d="M12 30 H42 V40 H12 Z M42 32 L56 22"/>
    <circle cx="20" cy="46" r="6"/><circle cx="36" cy="46" r="6"/>
    <path d="M16 30 V25 M24 30 V25 M32 30 V25" stroke-width="1.6"/></g>`,
  signpost: `<g ${S(2.4)}>
    <path d="M30 54 V12"/>
    <path d="M30 19 H50 L55 23 L50 27 H30 M30 33 H14 L9 37 L14 41 H30" stroke-width="2.2"/></g>`,
  lamppost: `<g ${S(2.4)}>
    <path d="M28 54 V14 Q28 9 36 9"/>
    <path d="M33 13 H43 L41 25 H35 Z" stroke-width="2"/>
    <circle cx="38" cy="19" r="2.2" stroke-width="1.6"/>
    <path d="M22 54 H36" stroke-width="2.2"/></g>`,
  almanac: `<g ${S()}>
    <path d="M32 14 Q22 8 12 10 V48 Q22 46 32 52 Q42 46 52 48 V10 Q42 8 32 14 Z M32 14 V52"/>
    <path d="M17 20 H27 M17 26 H27 M37 20 H47 M37 26 H47 M17 32 H27" stroke-width="1.5"/></g>`,
  // ---- tools
  demolish: `<g ${S()}>
    <path d="M20 44 L40 24"/>
    <path d="M34 14 L50 30 L44 36 L28 20 Z"/>
    <path d="M16 48 L24 40" stroke-width="4"/></g>`,
  keep: `<g ${S()}>
    <path d="M14 52 V24 H20 V18 H26 V24 H38 V18 H44 V24 H50 V52 Z"/>
    <path d="M28 52 V38 H36 V52 M32 24 V10 M32 10 H44 L38 14 L44 18 H32" stroke-width="1.8"/></g>`,
};

// small resource glyphs for the top bar (viewBox 64, drawn bolder)
export const RES_ICON = {
  gold: `<g ${SC(3)}><circle cx="32" cy="32" r="18"/><path d="M32 22 V42 M25 27 H39 M25 37 H39" stroke-width="2.2"/></g>`,
  wood: `<g ${SC(3)}><path d="M14 40 L44 18 Q50 14 54 20 Q58 26 50 28 L22 46 Z"/><circle cx="50" cy="23" r="3" stroke-width="1.8"/><path d="M22 36 L30 40 M30 30 L38 34" stroke-width="1.6"/></g>`,
  stone: `<g ${SC(3)}><path d="M14 46 L20 26 L38 20 L50 32 L46 46 Z"/><path d="M28 34 L38 30" stroke-width="1.8"/></g>`,
  food: `<g ${SC(2.6)}><path d="M32 54 V22"/><path d="M32 30 Q24 26 24 16 M32 30 Q40 26 40 16 M32 40 Q24 36 24 26 M32 40 Q40 36 40 26" stroke-width="2.2"/></g>`,
  folk: `<g ${SC(3)}><circle cx="32" cy="18" r="8"/><path d="M18 52 Q18 34 32 34 Q46 34 46 52 Z"/></g>`,
  work: `<g ${SC(3)}><path d="M16 48 L34 30"/><path d="M30 16 L48 34 L42 40 L24 22 Z"/></g>`,
};

export function iconSVG(name, size = 26) {
  const body = ICON[name] || ICON.house;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}">${body}</svg>`;
}
export function resSVG(name, size = 17) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" style="vertical-align:-3px">${RES_ICON[name]}</svg>`;
}
