import LZString from 'lz-string';

// Contrast text calculation for stacked bar segments
export function getContrastColor(hexColor: string) {
  if (!hexColor || hexColor.length < 6) return "#ffffff";
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 170) ? "#0f172a" : "#ffffff";
}

// Brand color scales
export const BRAND_SCALES: Record<number, string[]> = {
  2: ["#e4590f", "#f4b184"],
  3: ["#e4590f", "#ef7a4c", "#f4b184"],
  4: ["#e4590f", "#ef7a4c", "#9d9d9c", "#d6d6d7"],
  5: ["#ca0080", "#E295C5", "#D4C5E2", "#8EBAE5", "#FFC000"],
  6: ["#ca0080", "#E295C5", "#D4C5E2", "#8EBAE5", "#B3D1E8", "#FFC000"],
  7: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#FFC000"],
  8: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#FFC000"],
  9: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#40C7C7", "#FFC000"],
  10: ["#ca0080", "#E295C5", "#D4C5E2", "#0072B2", "#8EBAE5", "#B3D1E8", "#0099A8", "#40C7C7", "#A3E0E0", "#FFC000"]
};

export const BRAND_SWATCHES = [
  "#e4590f", "#ef7a4c", "#f4b184", "#b1b3b6", "#9d9d9c", "#d6d6d7",
  "#ca0080", "#E295C5", "#D4C5E2", "#0072B2",
  "#8EBAE5", "#B3D1E8", "#0099A8", "#40C7C7",
  "#A3E0E0", "#FFC000"
];

export const PRINT_COLUMNS: Record<string, { mm: number; label: string }> = {
  "1sp": { mm: 47.6, label: "1sp 47,6 mm" },
  "2sp": { mm: 99.2, label: "2sp 99,2 mm" },
  "3sp": { mm: 150.7, label: "3sp 150,7 mm" },
  "4sp": { mm: 202.2, label: "4sp 202,2 mm" },
  "5sp": { mm: 254.0, label: "5sp 254 mm" }
};

// --- SÄKERHET: SANERING & PROTOTYPE POLLUTION-SKYDD ---
export const SAFE_HEX_REGEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function sanitizeColor(col: any, fallback = "#e4590f") {
  if (typeof col !== "string") return fallback;
  const trimmed = col.trim();
  return SAFE_HEX_REGEX.test(trimmed) ? trimmed : fallback;
}

export function isSafeKey(key: any) {
  if (typeof key !== "string") return false;
  const k = key.trim().toLowerCase();
  return k !== "" && k !== "__proto__" && k !== "constructor" && k !== "prototype";
}

export function cleanFloat(num: number) {
  if (typeof num !== "number" || isNaN(num)) return 0;
  return parseFloat(num.toFixed(10));
}

export const MONTH_NAMES: Record<string, string[]> = {
  sv: ["jan", "feb", "mars", "april", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  num: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
};

export const FULL_MONTH_NAMES: Record<string, string[]> = {
  sv: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  num: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
};

export function formatDatapointDate(pDate: any, lang = "sv", mode = "full_readable", rawFallback = "") {
  if (!pDate) return rawFallback;
  const fullMonths = FULL_MONTH_NAMES[lang] || FULL_MONTH_NAMES.sv;
  const shortMonths = MONTH_NAMES[lang] || MONTH_NAMES.sv;
  const mIdx = (pDate.month && pDate.month >= 1 && pDate.month <= 12) ? pDate.month - 1 : null;
  const fullM = mIdx !== null ? fullMonths[mIdx] : "";
  const shortM = mIdx !== null ? shortMonths[mIdx] : "";
  const numM = pDate.month ? String(pDate.month).padStart(2, "0") : "";
  const d = pDate.day ? String(pDate.day) : null;
  const dPad = pDate.day ? String(pDate.day).padStart(2, "0") : null;
  const y = pDate.year ? String(pDate.year) : null;

  if (pDate.isQuarter) {
    const q = pDate.quarter || (pDate.month ? Math.ceil(pDate.month / 3) : 1);
    if (mode === "compact_numeric") return y ? (y + " Q" + q) : ("Q" + q);
    return y ? ("Kvartal " + q + " " + y) : ("Kvartal " + q);
  }

  if (mode === "compact_numeric") {
    if (d && pDate.month && y) return d + "." + pDate.month + "." + y;
    if (pDate.month && y) return pDate.month + "/" + y;
    if (d && pDate.month) return d + "." + pDate.month;
    return y || rawFallback;
  }

  if (mode === "iso") {
    if (d && pDate.month && y) return y + "-" + numM + "-" + dPad;
    if (pDate.month && y) return y + "-" + numM;
    return y || rawFallback;
  }

  if (mode === "month_year") {
    if (fullM && y) return fullM + " " + y;
    if (fullM) return fullM;
    return y || rawFallback;
  }

  if (mode === "day_month") {
    if (d && fullM) return d + " " + fullM;
    if (fullM) return fullM;
    return rawFallback;
  }

  // Standard: full_readable (t.ex. "15 mars 2024")
  if (d && fullM && y) {
    if (lang === "fi") return d + ". " + fullM + " " + y;
    return d + " " + fullM + " " + y;
  }
  if (d && shortM && y) return d + " " + shortM + " " + y;
  if (fullM && y) return fullM + " " + y;
  if (d && fullM) {
    if (lang === "fi") return d + ". " + fullM;
    return d + " " + fullM;
  }
  if (y) return y;
  return rawFallback;
}

export function tryParseDate(val: any, p1 = "auto", p2 = "auto", p3 = "auto") {
  if (val === undefined || val === null) return null;
  let s = String(val).trim().replace(/^["']|["']$/g, '');
  if (!s) return null;

  s = s.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '').trim();
  if (/[–—]/.test(s) || /\s+-\s+/.test(s) || /\s+till\s+/i.test(s) || /\s+to\s+/i.test(s)) return null;

  if (/^\d{4}$/.test(s)) {
    const yr = parseInt(s, 10);
    if (yr >= 1900 && yr <= 2100) return { year: yr, month: null, day: null, date: new Date(yr, 0, 1), isYearOnly: true };
  }

  // Kvartal (t.ex. 2024_Q1, 2024-Q2, Q3 2024, 2024K1)
  let qm = s.match(/^(\d{4})[\s\-/. _]*[QqKk](\d)$/);
  if (qm) {
    const y = parseInt(qm[1], 10), q = parseInt(qm[2], 10);
    if (q >= 1 && q <= 4) return { year: y, month: (q - 1) * 3 + 1, day: null, date: new Date(y, (q - 1) * 3, 1), isQuarter: true, quarter: q };
  }
  qm = s.match(/^[QqKk](\d)[\s\-/. _]*(\d{4})$/);
  if (qm) {
    const y = parseInt(qm[2], 10), q = parseInt(qm[1], 10);
    if (q >= 1 && q <= 4) return { year: y, month: (q - 1) * 3 + 1, day: null, date: new Date(y, (q - 1) * 3, 1), isQuarter: true, quarter: q };
  }

  const monthLookup: Record<string, number> = {
    jan: 1, januari: 1, january: 1, tammi: 1, tammikuu: 1,
    feb: 2, febr: 2, februari: 2, february: 2, helmi: 2, helmikuu: 2,
    mar: 3, mars: 3, march: 3, maalis: 3, maaliskuu: 3,
    apr: 4, april: 4, huhti: 4, huhtikuu: 4,
    maj: 5, may: 5, touko: 5, toukokuu: 5,
    jun: 6, juni: 6, june: 6, kesä: 6, kesäkuu: 6,
    jul: 7, juli: 7, july: 7, heinä: 7, heinäkuu: 7,
    aug: 8, augusti: 8, august: 8, elo: 8, elokuu: 8,
    sep: 9, sept: 9, september: 9, syys: 9, syyskuu: 9,
    okt: 10, oktober: 10, october: 10, loka: 10, lokakuu: 10,
    nov: 11, november: 11, marras: 11, marraskuu: 11,
    dec: 12, december: 12, joulu: 12, joulukuu: 12
  };

  const parseToken = (tok: string) => {
    if (!tok) return null;
    const low = tok.toLowerCase();
    if (monthLookup[low]) return { isMonthName: true, val: monthLookup[low] };
    if (/^\d+$/.test(tok)) return { isNum: true, val: parseInt(tok, 10) };
    return null;
  };

  // 2-delade format (t.ex. YYYY_MM, YYYY-MM, MM_DD, 15_03, mars 2024, 2024 mars)
  const parts2 = s.split(/[\s\-/. _]+/).filter(Boolean);
  if (parts2.length === 2) {
    const pt1 = parseToken(parts2[0]), pt2 = parseToken(parts2[1]);
    if (pt1 && pt2) {
      if (/^\d{4}$/.test(parts2[0])) {
        const y = parseInt(parts2[0], 10);
        const mo = pt2.val;
        if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12) {
          return { year: y, month: mo, day: null, date: new Date(y, mo - 1, 1), isYearMonth: true };
        }
      } else if (/^\d{4}$/.test(parts2[1])) {
        const y = parseInt(parts2[1], 10);
        const mo = pt1.val;
        if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12) {
          return { year: y, month: mo, day: null, date: new Date(y, mo - 1, 1), isYearMonth: true };
        }
      } else if (pt1.isMonthName || pt2.isMonthName) {
        const mo = pt1.isMonthName ? pt1.val : pt2.val;
        const d = pt1.isMonthName ? pt2.val : pt1.val;
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          const curYr = new Date().getFullYear();
          return { year: null, month: mo, day: d, date: new Date(curYr, mo - 1, d), isMonthDay: true };
        }
      } else {
        let d: number | null = null, mo: number | null = null, yr: number | null = null;
        if (p1 === "M" && p2 === "D") { mo = pt1.val; d = pt2.val; }
        else if (p1 === "D" && p2 === "M") { d = pt1.val; mo = pt2.val; }
        else if (p1 === "Y" && p2 === "M") { yr = pt1.val; mo = pt2.val; }
        else if (p1 === "M" && p2 === "Y") { mo = pt1.val; yr = pt2.val; }
        else {
          if (pt1.val > 12 && pt1.val <= 31 && pt2.val <= 12) { d = pt1.val; mo = pt2.val; }
          else if (pt2.val > 12 && pt2.val <= 31 && pt1.val <= 12) { d = pt2.val; mo = pt1.val; }
          else if (pt1.val <= 12 && pt2.val <= 12) { d = pt1.val; mo = pt2.val; }
        }
        if (yr !== null && yr < 100) yr = yr >= 50 ? 1900 + yr : 2000 + yr;
        if (yr && mo && mo >= 1 && mo <= 12) {
          return { year: yr, month: mo, day: null, date: new Date(yr, mo - 1, 1), isYearMonth: true };
        }
        if (mo && d && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          const curYr = new Date().getFullYear();
          return { year: null, month: mo, day: d, date: new Date(curYr, mo - 1, d), isMonthDay: true };
        }
      }
    }
  }

  // Anpassad 3-delad tolkning (inkl. understreck som delare)
  const hasCustomParts = (p1 !== "auto" && p2 !== "auto") || (p1 !== "auto" && p3 !== "auto") || (p2 !== "auto" && p3 !== "auto");
  const match3 = s.match(/^([^\s\-/. _]{1,10})[\s\-/. _]+([^\s\-/. _]{1,10})[\s\-/. _]+([^\s\-/. _]{1,10})$/);
  if (match3) {
    const rawTokens = [match3[1], match3[2], match3[3]];
    const parsedTokens = rawTokens.map(parseToken);

    if (parsedTokens.every(Boolean)) {
      let day: number | null = null, month: number | null = null, year: number | null = null;

      if (hasCustomParts) {
        const roles = [p1, p2, p3];
        roles.forEach((role, idx) => {
          const pt = parsedTokens[idx]!;
          if (role === "D") day = pt.val;
          else if (role === "M") month = pt.val;
          else if (role === "Y") year = pt.val;
        });

        if (!year && p1 !== "Y" && p2 !== "Y" && p3 !== "Y") {
          const unassignedIdx = [0, 1, 2].find(i => roles[i] === "auto");
          if (unassignedIdx !== undefined) year = parsedTokens[unassignedIdx]!.val;
        }
        if (!month && p1 !== "M" && p2 !== "M" && p3 !== "M") {
          const unassignedIdx = [0, 1, 2].find(i => roles[i] === "auto");
          if (unassignedIdx !== undefined) month = parsedTokens[unassignedIdx]!.val;
        }
        if (!day && p1 !== "D" && p2 !== "D" && p3 !== "D") {
          const unassignedIdx = [0, 1, 2].find(i => roles[i] === "auto");
          if (unassignedIdx !== undefined) day = parsedTokens[unassignedIdx]!.val;
        }

        if (year !== null && year < 100) {
          year = year >= 50 ? 1900 + year : 2000 + year;
        }

        if (year !== null && month !== null && day !== null && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return { year, month, day, date: new Date(year, month - 1, day) };
        }
      }
    }
  }

  // Standard fallback (stöd för -, /, ., _, mellanslag)
  let m = s.match(/^(\d{4})[\s\-/. _](\d{1,2})[\s\-/. _](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { year: y, month: mo, day: d, date: new Date(y, mo - 1, d) };
  }

  m = s.match(/^(\d{1,2})[\s\-/. _](\d{1,2})[\s\-/. _](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
    if (mo > 12 && d <= 12) { const tmp = d; d = mo; mo = tmp; }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { year: y, month: mo, day: d, date: new Date(y, mo - 1, d) };
  }

  m = s.match(/^(\d{4})[\s\-/. _](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) return { year: y, month: mo, day: null, date: new Date(y, mo - 1, 1), isYearMonth: true };
  }

  const tokens = s.toLowerCase().replace(/[,.\-_]/g, ' ').split(/\s+/).filter(Boolean);
  let foundY: number | null = null, foundMo: number | null = null, foundD: number | null = null;
  for (const tok of tokens) {
    if (/^\d{4}$/.test(tok)) foundY = parseInt(tok, 10);
    else if (monthLookup[tok]) foundMo = monthLookup[tok];
    else if (/^\d{1,2}$/.test(tok)) foundD = parseInt(tok, 10);
  }
  if (foundY && foundMo) {
    return { year: foundY, month: foundMo, day: foundD, date: new Date(foundY, foundMo - 1, foundD || 1) };
  }
  return null;
}

export function isEmptyValue(val: any) {
  if (val === undefined || val === null) return true;
  const s = String(val).trim().replace(/^["']|["']$/g, '').trim();
  return s === "" || s === "-" || s === "–" || s === "—" || s.toLowerCase() === "null" || s.toLowerCase() === "nan";
}

export function isPureNumericString(v: any, dataDecSep = "auto", dataThousandSep = "auto") {
  if (typeof v === "number") return !isNaN(v);
  if (v === undefined || v === null) return false;
  let s = String(v).trim().replace(/^["']|["']$/g, '').trim();
  if (!s || s === "-" || s === "–" || s === "−") return false;
  s = s.replace(/^[\u2013\u2014\u2212]/, '-');
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(s) || /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s) || /[–—]/.test(s)) return false;

  s = s.replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/[%€$£]|kr|sek|eur|usd/gi, '').trim();

  const decSep = dataDecSep || "auto";
  const thouSep = dataThousandSep || "auto";

  if (thouSep === " ") {
    s = s.replace(/\s+/g, '');
  } else if (thouSep === ",") {
    s = s.replace(/\s+/g, '').replace(/,/g, '');
  } else if (thouSep === ".") {
    s = s.replace(/\s+/g, '').replace(/\./g, '');
  } else if (thouSep === "none") {
    s = s.replace(/\s+/g, '');
  } else {
    s = s.replace(/\s+/g, '');
    if (decSep === ",") {
      s = s.replace(/\./g, '');
    } else if (decSep === ".") {
      s = s.replace(/,/g, '');
    } else {
      if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '');
        else s = s.replace(/,/g, '');
      } else if (s.includes(',')) {
        if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      } else if (s.includes('.')) {
        if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      }
    }
  }

  if (decSep === ",") {
    s = s.replace(',', '.');
  } else if (decSep === ".") {
    // already dot
  } else {
    if (s.includes(',')) s = s.replace(',', '.');
  }

  return /^-?\d+(\.\d+)?$/.test(s);
}

export function parseVal(v: any, dataDecSep = "auto", dataThousandSep = "auto") {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (v === undefined || v === null) return 0;
  let str = v.toString().trim().replace(/^["']|["']$/g, '').trim();
  if (str === "" || str === "-" || str === "–" || str === "−") return 0;
  str = str.replace(/^[\u2013\u2014\u2212]/, '-');
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(str) || /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(str) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(str) || /[–—]/.test(str)) return 0;

  str = str.replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/[%€$£]|kr|sek|eur|usd/gi, '').trim();

  const decSep = dataDecSep || "auto";
  const thouSep = dataThousandSep || "auto";

  if (thouSep === " ") {
    str = str.replace(/\s+/g, '');
  } else if (thouSep === ",") {
    str = str.replace(/\s+/g, '').replace(/,/g, '');
  } else if (thouSep === ".") {
    str = str.replace(/\s+/g, '').replace(/\./g, '');
  } else if (thouSep === "none") {
    str = str.replace(/\s+/g, '');
  } else {
    str = str.replace(/\s+/g, '');
    if (decSep === ",") {
      str = str.replace(/\./g, '');
    } else if (decSep === ".") {
      str = str.replace(/,/g, '');
    } else {
      if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '');
        else str = str.replace(/,/g, '');
      } else if (str.includes(',')) {
        if (/^-?\d{1,3}(,\d{3})+$/.test(str)) str = str.replace(/,/g, '');
      } else if (str.includes('.')) {
        if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) str = str.replace(/\./g, '');
      }
    }
  }

  if (decSep === ",") {
    str = str.replace(',', '.');
  } else if (decSep === ".") {
    // already dot
  } else {
    if (str.includes(',')) str = str.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(str)) return 0;
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

export function cleanCell(val: any) {
  if (val === undefined || val === null) return "";
  let s = val.toString().trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1).trim();
  return s;
}

export function getItemColor(catName: any, seriesName: any, defaultColor: string, categoryColorOverrides?: any[]) {
  if (!categoryColorOverrides || !categoryColorOverrides.length) return defaultColor;
  const cNorm = String(catName !== undefined && catName !== null ? catName : "").trim();
  const sNorm = String(seriesName !== undefined && seriesName !== null ? seriesName : "").trim();
  if (!cNorm) return defaultColor;

  // 1. Match specific category + specific series
  if (sNorm) {
    const specific = categoryColorOverrides.find(o =>
      String(o.category || "").trim() === cNorm &&
      o.series && o.series !== "*" && o.series !== "Alla" && o.series !== "Alla serier" &&
      String(o.series).trim() === sNorm
    );
    if (specific && specific.color) return specific.color;
  }

  // 2. Match category across all series (*, "Alla", "Alla serier", or empty)
  const catMatch = categoryColorOverrides.find(o =>
    String(o.category || "").trim() === cNorm &&
    (!o.series || o.series === "*" || o.series === "Alla" || o.series === "Alla serier")
  );
  if (catMatch && catMatch.color) return catMatch.color;

  return defaultColor;
}

export function serializeToCSV(headers: any[], rows: any[][], chosenDelim: any = null) {
  let delim = chosenDelim;
  if (!delim || delim === "auto") {
    const hasComma = (headers && headers.some(h => String(h).includes(","))) ||
      (rows && rows.some(r => Array.isArray(r) && r.some(c => String(c).includes(","))));
    delim = hasComma ? ";" : ",";
  }
  const escapeCell = (val: any) => {
    if (val === undefined || val === null) return "";
    const s = String(val);
    if (s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escapeCell).join(delim)];
  rows.forEach(r => { if (Array.isArray(r)) lines.push(r.map(escapeCell).join(delim)); });
  return lines.join("\n");
}

export function parseCSV(text: string, forcedDelim: any = null, skipCount = 0) {
  if (!text) return [];
  let cleanText = text.replace(/^\uFEFF/, '').replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');
  if (!cleanText.trim()) return [];

  let rawLines = cleanText.split(/\r?\n|\r/);
  if (skipCount && skipCount > 0 && skipCount < rawLines.length) rawLines = rawLines.slice(skipCount);
  cleanText = rawLines.join('\n');
  if (!cleanText.trim()) return [];

  let delim = (forcedDelim && forcedDelim !== "auto") ? forcedDelim : null;

  const lines = cleanText.split(/\r?\n|\r/);
  let startIndex = 0;
  if (!delim && /^sep=\s*([,;\t|])/i.test(lines[0])) {
    const match = lines[0].match(/^sep=\s*([,;\t|])/i);
    if (match) { delim = match[1]; startIndex = 1; }
  }

  if (!delim) {
    const sampleLines = lines.slice(startIndex, startIndex + 25).filter(l => l.trim().length > 0);
    const candidates = ['\t', ';', ',', '|'];
    let bestScore = -1, bestCandidate = ',';
    for (const cand of candidates) {
      const counts = sampleLines.map(line => {
        let inQuotes = false, count = 0;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') inQuotes = !inQuotes;
          else if (line[i] === cand && !inQuotes) count++;
        }
        return count;
      });
      const positiveCounts = counts.filter(c => c > 0);
      if (positiveCounts.length === 0) continue;
      const frequency: Record<number, number> = {};
      let maxFreq = 0, modalCount = 0;
      for (const c of positiveCounts) {
        frequency[c] = (frequency[c] || 0) + 1;
        if (frequency[c] > maxFreq) { maxFreq = frequency[c]; modalCount = c; }
      }
      const consistency = maxFreq / sampleLines.length;
      const weight = cand === '\t' ? 1.4 : (cand === ';' ? 1.3 : 1.0);
      const score = (modalCount + 1) * consistency * weight;
      if (score > bestScore) { bestScore = score; bestCandidate = cand; }
    }
    delim = bestCandidate;
  }

  const rows: string[][] = [];
  let currentRow: string[] = [], currentCell = '', insideQuotes = false;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      const nextChar = line[c + 1];
      if (char === '"') {
        if (insideQuotes && nextChar === '"') { currentCell += '"'; c++; }
        else insideQuotes = !insideQuotes;
      } else if (char === delim && !insideQuotes) {
        currentRow.push(cleanCell(currentCell)); currentCell = '';
      } else currentCell += char;
    }
    if (!insideQuotes) {
      currentRow.push(cleanCell(currentCell));
      if (currentRow.some(cell => cell !== "")) rows.push(currentRow);
      currentRow = []; currentCell = '';
    } else currentCell += '\n';
  }
  if (currentRow.length > 0 && currentRow.some(cell => cell !== "")) {
    currentRow.push(cleanCell(currentCell)); rows.push(currentRow);
  }
  return rows;
}

export function isYear(value: any, columnName = "") {
  const col = (columnName || "").toLowerCase();
  if (col.includes("år") || col.includes("year") || col.includes("vuosi")) return true;
  const trimmed = String(value || "").trim();
  if (/^\d{4}$/.test(trimmed)) {
    const yr = parseInt(trimmed, 10);
    if (yr >= 1900 && yr <= 2100) return true;
  }
  return false;
}

export function encodeChartState(payload: any) {
  try {
    const jsonStr = JSON.stringify(payload);
    if (LZString) return "lz:" + LZString.compressToEncodedURIComponent(jsonStr);
    return "b64:" + btoa(encodeURIComponent(jsonStr));
  } catch (err) { return ""; }
}

// --- SÄKERHET: STRUKTUR- OCH SCHEMAVALIDERING AV TILLSTÅND ---
export const DEFAULT_CONFIG: any = {
  importDelimiter: "auto",
  skipRows: 0,
  dataDecSep: "auto",
  dataThousandSep: "auto",
  title: "Rubrik",
  ingress: "Antal",
  footers: [
    { id: 1, prefix: "Källa", prefixWeight: 900, text: "Statistikcentralen", textWeight: 400, layout: "below" }
  ],
  titleWeight: 900,
  ingressWeight: 400,
  categoryWeight: 400,
  subCategoryWeight: 400,
  valueWeight: 700,
  axisWeight: 400,
  legendWeight: 400,
  valueOrientation: "auto",
  chartType: "Bar",
  chartHeight: 480,
  barOrientation: "Vertical",
  isStacked: false,
  isStacked100: false,
  showStackedSegmentLabels: false,
  showStackedTotal: true,
  useHierarchy: false,
  hierarchySource: "columns",
  hierarchyParentCol: 0,
  hierarchySubCol: 1,
  hierarchyParentRow: "header",
  hierarchySubRow: 0,
  hierarchySeriesCol: 0,
  categoryColIndex: 0,
  barWidthPct: 68,
  barGapPct: 24,
  innerBarGapPct: 4,
  skipEmptyBars: true,
  hCatAlign: "right",
  strokeLines: true,
  drawDots: false,
  fillLines: false,
  isStackedArea: false,
  fillOpacity: 25,
  lineWidth: 3,
  drawLineValues: false,
  lineGapMode: "break",
  isDonut: true,
  holePct: 52,
  showPct: true,
  isSemiCircle: false,
  pieGrouping: "rows",
  pieProportionalSize: true,
  drawTotalSum: true,
  donutCenterText: "",
  donutCenterSubtext: "",
  drawLegend: false,
  legendPosition: "Below Ingress",
  legendLayout: "Horizontal",
  hiddenLegendItems: [],
  drawXAxis: true,
  drawXLabels: true,
  axisPosition: "zero",
  xAxisWidth: 2.5,
  xTickStyle: "None",
  dateFormatMode: "Auto",
  dateSimplifyLevel: "auto",
  dateStep: 1,
  dateDensity: "auto",
  datePart1: "auto",
  datePart2: "auto",
  datePart3: "auto",
  popupDateFormat: "full_readable",
  dateDecimationMode: "auto",
  skipWeekends: false,
  drawYLabels: false,
  yTickStyle: "None",
  gridLineStyle: "Dashed",
  gridColor: "#cbd5e1",
  gridLineWidth: 1,
  gridOpacity: 100,
  yDivisions: 5,
  yScaleRounding: "auto",
  forceRoundScale: false,
  customYRange: false,
  customMinY: 0,
  customMaxY: 100,
  customYStep: "auto",
  yBaseline: true,
  showValueLabels: true,
  valueLabelMode: "all",
  customValueLabels: [],
  valueDivisor: 1,
  customDivisorVal: 1000,
  valuePrefix: "",
  valueSuffix: "",
  valDecimals: "auto",
  thousandSep: "space",
  decSep: "comma",
  unitOnLabels: true,
  unitOnAxis: false,
  unitOnTooltips: true,
  enableTooltip: true,
  tooltipMode: "Standard",
  tooltipTemplate: "",
  tooltipColumns: null,
  showPopupCategory: true,
  showPopupSwatch: true,
  printWidth: "1sp",
  colorTheme: "default",
  dataSortOrder: "original",
  refLines: [],
  categoryColorOverrides: []
};

export const safeUrl = (url: any) => {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  return /^https:\/\//i.test(u) ? u : "";
};

export function sanitizeChartState(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  let tableHeaders = ["Kolumn 1", "Kolumn 2"];
  if (Array.isArray(raw.tableHeaders)) {
    tableHeaders = raw.tableHeaders
      .slice(0, 50)
      .map((h: any, i: number) => {
        const s = String(h ?? "").trim();
        return isSafeKey(s) ? s.slice(0, 100) : `Kolumn ${i + 1}`;
      });
    if (tableHeaders.length === 0) tableHeaders = ["Kolumn 1", "Kolumn 2"];
  }

  let tableRows: string[][] = [["", ""]];
  if (Array.isArray(raw.tableRows)) {
    tableRows = raw.tableRows
      .slice(0, 2000)
      .map((row: any) => {
        if (!Array.isArray(row)) return new Array(tableHeaders.length).fill("");
        return row.slice(0, tableHeaders.length).map((cell: any) => String(cell ?? "").slice(0, 250));
      });
    if (tableRows.length === 0) tableRows = [new Array(tableHeaders.length).fill("")];
  }

  const seriesColors: Record<string, string> = {};
  if (raw.seriesColors && typeof raw.seriesColors === "object" && !Array.isArray(raw.seriesColors)) {
    for (const [k, v] of Object.entries(raw.seriesColors)) {
      if (isSafeKey(k) && typeof v === "string") {
        seriesColors[k] = sanitizeColor(v, "#e4590f");
      }
    }
  }

  const rawCfg = (raw.config && typeof raw.config === "object") ? raw.config : {};
  const numInRange = (val: any, min: number, max: number, def: number) => {
    const n = Number(val);
    return (!isNaN(n) && n >= min && n <= max) ? n : def;
  };
  const strSafe = (val: any, maxLen: number, def = "") => (typeof val === "string" ? val.slice(0, maxLen) : def);

  const config: any = {
    ...DEFAULT_CONFIG,
    ...rawCfg,
    title: strSafe(rawCfg.title, 300, DEFAULT_CONFIG.title),
    ingress: strSafe(rawCfg.ingress, 500, DEFAULT_CONFIG.ingress),
    chartType: ["Bar", "Line", "Pie"].includes(rawCfg.chartType) ? rawCfg.chartType : DEFAULT_CONFIG.chartType,
    barOrientation: ["Vertical", "Horizontal"].includes(rawCfg.barOrientation) ? rawCfg.barOrientation : DEFAULT_CONFIG.barOrientation,
    axisPosition: ["zero", "bottom"].includes(rawCfg.axisPosition) ? rawCfg.axisPosition : DEFAULT_CONFIG.axisPosition,
    isStacked: Boolean(rawCfg.isStacked),
    isStacked100: Boolean(rawCfg.isStacked100),
    showStackedSegmentLabels: Boolean(rawCfg.showStackedSegmentLabels),
    showStackedTotal: rawCfg.showStackedTotal !== undefined ? Boolean(rawCfg.showStackedTotal) : DEFAULT_CONFIG.showStackedTotal,
    useHierarchy: Boolean(rawCfg.useHierarchy),
    hierarchySource: ["rows", "columns"].includes(rawCfg.hierarchySource) ? rawCfg.hierarchySource : DEFAULT_CONFIG.hierarchySource,
    hierarchyParentCol: typeof rawCfg.hierarchyParentCol === "number" ? rawCfg.hierarchyParentCol : DEFAULT_CONFIG.hierarchyParentCol,
    hierarchySubCol: typeof rawCfg.hierarchySubCol === "number" ? rawCfg.hierarchySubCol : DEFAULT_CONFIG.hierarchySubCol,
    hierarchyParentRow: (rawCfg.hierarchyParentRow === "header" || typeof rawCfg.hierarchyParentRow === "number") ? rawCfg.hierarchyParentRow : DEFAULT_CONFIG.hierarchyParentRow,
    hierarchySubRow: (rawCfg.hierarchySubRow === "header" || typeof rawCfg.hierarchySubRow === "number") ? rawCfg.hierarchySubRow : DEFAULT_CONFIG.hierarchySubRow,
    hierarchySeriesCol: typeof rawCfg.hierarchySeriesCol === "number" ? rawCfg.hierarchySeriesCol : DEFAULT_CONFIG.hierarchySeriesCol,
    chartHeight: numInRange(rawCfg.chartHeight, 150, 1500, DEFAULT_CONFIG.chartHeight),
    lineWidth: numInRange(rawCfg.lineWidth, 0.5, 12, DEFAULT_CONFIG.lineWidth),
    fillOpacity: numInRange(rawCfg.fillOpacity, 0, 100, DEFAULT_CONFIG.fillOpacity),
    gridOpacity: numInRange(rawCfg.gridOpacity, 0, 100, DEFAULT_CONFIG.gridOpacity),
    gridColor: sanitizeColor(rawCfg.gridColor, DEFAULT_CONFIG.gridColor),
    gridLineWidth: numInRange(rawCfg.gridLineWidth, 0.5, 6, DEFAULT_CONFIG.gridLineWidth),
    xAxisWidth: numInRange(rawCfg.xAxisWidth, 0.5, 8, DEFAULT_CONFIG.xAxisWidth),
    barWidthPct: numInRange(rawCfg.barWidthPct, 10, 100, DEFAULT_CONFIG.barWidthPct),
    barGapPct: numInRange(rawCfg.barGapPct, 0, 80, DEFAULT_CONFIG.barGapPct),
    innerBarGapPct: numInRange(rawCfg.innerBarGapPct, 0, 50, DEFAULT_CONFIG.innerBarGapPct),
    titleWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.titleWeight)) ? Number(rawCfg.titleWeight) : DEFAULT_CONFIG.titleWeight,
    ingressWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.ingressWeight)) ? Number(rawCfg.ingressWeight) : DEFAULT_CONFIG.ingressWeight,
    categoryWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.categoryWeight)) ? Number(rawCfg.categoryWeight) : DEFAULT_CONFIG.categoryWeight,
    subCategoryWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.subCategoryWeight)) ? Number(rawCfg.subCategoryWeight) : DEFAULT_CONFIG.subCategoryWeight,
    valueWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.valueWeight)) ? Number(rawCfg.valueWeight) : DEFAULT_CONFIG.valueWeight,
    axisWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.axisWeight)) ? Number(rawCfg.axisWeight) : DEFAULT_CONFIG.axisWeight,
    legendWeight: [300, 400, 500, 700, 900].includes(Number(rawCfg.legendWeight)) ? Number(rawCfg.legendWeight) : DEFAULT_CONFIG.legendWeight,
    holePct: numInRange(rawCfg.holePct, 10, 90, DEFAULT_CONFIG.holePct),
    valueDivisor: (rawCfg.valueDivisor === "custom" || !isNaN(Number(rawCfg.valueDivisor))) ? rawCfg.valueDivisor : DEFAULT_CONFIG.valueDivisor,
    customDivisorVal: numInRange(rawCfg.customDivisorVal, 0.000001, 1e15, DEFAULT_CONFIG.customDivisorVal),
    customYRange: Boolean(rawCfg.customYRange),
    customMinY: typeof rawCfg.customMinY === "number" ? rawCfg.customMinY : (!isNaN(parseFloat(rawCfg.customMinY)) ? parseFloat(rawCfg.customMinY) : 0),
    customMaxY: typeof rawCfg.customMaxY === "number" ? rawCfg.customMaxY : (!isNaN(parseFloat(rawCfg.customMaxY)) ? parseFloat(rawCfg.customMaxY) : 100),
    customYStep: (typeof rawCfg.customYStep === "number" && rawCfg.customYStep > 0) ? rawCfg.customYStep : (rawCfg.customYStep === "auto" || !rawCfg.customYStep ? "auto" : (!isNaN(parseFloat(rawCfg.customYStep)) ? parseFloat(rawCfg.customYStep) : "auto")),
    valueSuffix: strSafe(rawCfg.valueSuffix, 30, DEFAULT_CONFIG.valueSuffix),
    valuePrefix: strSafe(rawCfg.valuePrefix, 30, DEFAULT_CONFIG.valuePrefix),
    donutCenterText: strSafe(rawCfg.donutCenterText, 60, ""),
    donutCenterSubtext: strSafe(rawCfg.donutCenterSubtext, 60, ""),
    tooltipTemplate: strSafe(rawCfg.tooltipTemplate, 500, ""),
    refLines: Array.isArray(rawCfg.refLines) ? rawCfg.refLines.slice(0, 20).map((r: any) => ({
      ...r,
      color: sanitizeColor(r.color, "#64748b"),
      textColor: sanitizeColor(r.textColor, "#0f172a"),
      label: strSafe(r.label, 80, ""),
      width: numInRange(r.width, 0.5, 8, 1.5),
      opacity: numInRange(r.opacity, 0, 100, 100)
    })) : [],
    categoryColorOverrides: Array.isArray(rawCfg.categoryColorOverrides) ? rawCfg.categoryColorOverrides.slice(0, 50).map((c: any) => ({
      id: strSafe(c.id, 40, String(Date.now())),
      category: strSafe(c.category, 100, ""),
      series: strSafe(c.series, 100, "*"),
      color: sanitizeColor(c.color, "#e4590f"),
      legendLabel: strSafe(c.legendLabel, 60, "")
    })) : [],
    footers: Array.isArray(rawCfg.footers) ? rawCfg.footers.slice(0, 10).map((f: any) => ({
      ...f,
      prefix: strSafe(f.prefix, 60, ""),
      text: strSafe(f.text, 300, ""),
      url: safeUrl(f.url)
    })) : DEFAULT_CONFIG.footers
  };

  if (config.hierarchyParentCol === config.hierarchySubCol) {
    config.hierarchySubCol = config.hierarchyParentCol === 0 ? 1 : 0;
  }
  if (config.hierarchyParentRow === config.hierarchySubRow) {
    config.hierarchySubRow = config.hierarchyParentRow === "header" ? 0 : "header";
  }

  return { tableHeaders, tableRows, config, seriesColors };
}

export function decodeChartState(rawStr: string) {
  if (!rawStr || typeof rawStr !== "string") return null;
  if (rawStr.length > 100000) return null;
  let clean = rawStr.trim().replace(/^["']|["']$/g, '');

  try {
    clean = decodeURIComponent(clean);
  } catch (e) {}

  let parsed: any = null;

  if (clean.startsWith("lz:") && LZString) {
    const payloadStr = clean.slice(3).replace(/ /g, '+');
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(payloadStr);
      if (decompressed && decompressed.length < 500000) parsed = JSON.parse(decompressed);
    } catch (e) {}
  }
  if (!parsed && clean.startsWith("b64:")) {
    const payloadStr = clean.slice(4).replace(/ /g, '+');
    try {
      const jsonStr = decodeURIComponent(atob(payloadStr));
      if (jsonStr && jsonStr.length < 500000) parsed = JSON.parse(jsonStr);
    } catch (e) {}
  }
  if (!parsed && LZString) {
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(clean.replace(/ /g, '+'));
      if (decompressed && decompressed.length < 500000) parsed = JSON.parse(decompressed);
    } catch (e) {}
  }
  return sanitizeChartState(parsed);
}

export async function copyTextToClipboard(text: string) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let success = false;
  try { success = document.execCommand("copy"); } catch (err) { success = false; }
  document.body.removeChild(ta);
  return success;
}

export function formatValue(value: any, columnName = "", decimals: any = "Auto", thousandSep = " ", decSep = ",", dataDecSep = "auto", dataThousandSep = "auto", prefix = "", suffix = "") {
  if (value === undefined || value === null || value === "") return "";
  const trimmed = value.toString().trim();
  if (isYear(trimmed, columnName)) return trimmed;
  if (!isPureNumericString(trimmed, dataDecSep, dataThousandSep)) return trimmed;

  const numVal = parseVal(trimmed, dataDecSep, dataThousandSep);
  if (isNaN(numVal) || (numVal === 0 && trimmed !== "0" && trimmed !== "0,0" && trimmed !== "0.0")) return trimmed;
  const cleanNum = cleanFloat(numVal);

  const numStr = (decimals !== "Auto" && decimals !== null && decimals !== undefined && decimals !== "")
    ? cleanNum.toFixed(parseInt(decimals, 10)) : cleanNum.toString();

  const parts = numStr.split(".");
  const intPart = parts[0];
  const decPart = parts.length > 1 ? decSep + parts[1] : "";
  let formattedInt = "";
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0 && intPart.charAt(i) !== "-") formattedInt += thousandSep;
    formattedInt += intPart.charAt(i);
  }
  return prefix + formattedInt + decPart + suffix;
}

export function computeYScale(dataMin: number, dataMax: number, yDivisionsSetting: any, yScaleRoundingSetting: any, customYRange: boolean, customMinY: any, customMaxY: any, customYStep: any) {
  let minY = 0, maxY = 10;
  if (customYRange) {
    const rawMin = parseFloat(customMinY);
    const rawMax = parseFloat(customMaxY);
    minY = !isNaN(rawMin) ? rawMin : 0;
    maxY = !isNaN(rawMax) ? rawMax : 100;
    if (maxY <= minY) maxY = minY + 10;
  } else {
    if (dataMin < 0) {
      minY = dataMin;
      maxY = Math.max(0, (typeof dataMax === "number" && !isNaN(dataMax)) ? dataMax : 0);
    } else {
      minY = 0;
      maxY = Math.max(1, (typeof dataMax === "number" && !isNaN(dataMax)) ? dataMax : 10);
    }
  }

  let divCount = yDivisionsSetting && yDivisionsSetting.includes("steg") ? parseInt(yDivisionsSetting, 10) : 5;
  const rawRange = Math.max(0.0001, maxY - minY);
  const roughStep = Math.max(0.0001, rawRange / divCount);

  let roundUnit: number | null = null, fixedDecimals: number | null = null;
  const mode = yScaleRoundingSetting || "Auto";
  if (mode === "integer" || mode === "1") { roundUnit = 1; fixedDecimals = 0; }
  else if (mode === "round_2" || mode === "2") { roundUnit = 2; fixedDecimals = 0; }
  else if (mode === "round_5" || mode === "5") { roundUnit = 5; fixedDecimals = 0; }
  else if (mode === "round_10" || mode === "10") { roundUnit = 10; fixedDecimals = 0; }
  else if (mode === "round_50" || mode === "50") { roundUnit = 50; fixedDecimals = 0; }
  else if (mode === "round_100" || mode === "100") { roundUnit = 100; fixedDecimals = 0; }
  else if (mode === "round_500" || mode === "500") { roundUnit = 500; fixedDecimals = 0; }
  else if (mode === "round_1000" || mode === "1000") { roundUnit = 1000; fixedDecimals = 0; }
  else if (mode === "round_0_5" || mode === "0.5") { roundUnit = 0.5; fixedDecimals = 1; }
  else if (mode === "round_0_1" || mode === "0.1") { roundUnit = 0.1; fixedDecimals = 1; }
  else if (mode === "dec_1") { fixedDecimals = 1; }
  else if (mode === "dec_2") { fixedDecimals = 2; }
  else if (mode === "dec_3") { fixedDecimals = 3; }

  let step: number;
  if (!customYRange) {
    if (roundUnit !== null) {
      step = Math.max(roundUnit, Math.ceil(roughStep / roundUnit) * roundUnit);
    } else {
      const exponent = Math.floor(Math.log10(roughStep));
      const fraction = roughStep / Math.pow(10, exponent);
      const niceFraction = fraction <= 1 ? 1 : fraction <= 1.5 ? 1.5 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
      step = cleanFloat(niceFraction * Math.pow(10, exponent));
    }

    if (step <= 0) step = 1;

    if (minY === 0) {
      maxY = cleanFloat(step * divCount);
      let guard = 0;
      while (maxY < dataMax && guard++ < 100) {
        step = cleanFloat(step + (roundUnit || (step * 0.2)));
        maxY = cleanFloat(step * divCount);
      }
    } else {
      let negSteps = Math.max(1, Math.ceil(Math.abs(minY) / step));
      let posSteps = dataMax > 0 ? Math.max(1, Math.ceil(dataMax / step)) : 0;
      let guard = 0;
      while (negSteps * step < Math.abs(minY) && guard++ < 100) negSteps++;
      guard = 0;
      while (posSteps * step < dataMax && guard++ < 100) posSteps++;
      minY = cleanFloat(-negSteps * step);
      maxY = cleanFloat(posSteps * step);
      divCount = negSteps + posSteps;
    }
  } else {
    const rawStep = parseFloat(customYStep);
    if (!isNaN(rawStep) && rawStep > 0) {
      step = rawStep;
    } else if (roundUnit !== null) {
      step = Math.max(roundUnit, Math.round(roughStep / roundUnit) * roundUnit) || roughStep;
    } else {
      step = (maxY - minY) / divCount;
    }
  }

  if (step <= 0) step = 1;
  const totalSteps = Math.min(50, Math.max(1, Math.round((maxY - minY) / step)));
  const ticks: { pct: number; val: number }[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    ticks.push({ pct: i / totalSteps, val: cleanFloat(maxY - i * step) });
  }

  const autoDecimals = fixedDecimals !== null ? fixedDecimals : (ticks.some(t => t.val % 1 !== 0) ? 1 : 0);
  return { minY, maxY, divCount, step, ticks, decimals: autoDecimals };
}

export function deriveChartMeta(tableHeaders: any[], tableRows: any[][], config: any, cardWidth: number) {
  let isRowSeries = false;
  if (tableRows && tableRows.length >= 2 && tableHeaders && tableHeaders.length >= 3) {
    let pRowIdx = config.hierarchyParentRow === "header" ? -1 : (typeof config.hierarchyParentRow === "number" ? config.hierarchyParentRow : -1);
    let sRowIdx = config.hierarchySubRow === "header" ? -1 : (typeof config.hierarchySubRow === "number" ? config.hierarchySubRow : 0);
    if (pRowIdx === sRowIdx) {
      if (pRowIdx === -1) sRowIdx = 0;
      else sRowIdx = pRowIdx === 0 ? 1 : 0;
    }
    const checkIdx = sRowIdx >= 0 ? sRowIdx : (pRowIdx >= 0 ? pRowIdx : 0);
    const subRow = tableRows[checkIdx];
    if (subRow) {
      const r0Cells = subRow.slice(1).filter(c => c !== undefined && c !== null && String(c).trim() !== "");
      if (r0Cells.length > 0) {
        const r0TextCount = r0Cells.filter(c => !isPureNumericString(c, config.dataDecSep, config.dataThousandSep)).length;
        const r0IsMostlyText = (r0TextCount / r0Cells.length) >= 0.5;
        const subsequentRows = tableRows.filter((r, idx) => idx !== pRowIdx && idx !== sRowIdx && Array.isArray(r) && r.slice(1).some(c => c && String(c).trim() !== ""));
        if (subsequentRows.length > 0) {
          const numSubsequent = subsequentRows.filter(r => {
            const cells = r.slice(1).filter(c => c && String(c).trim() !== "");
            const numCells = cells.filter(c => isPureNumericString(c, config.dataDecSep, config.dataThousandSep));
            return cells.length > 0 && (numCells.length / cells.length >= 0.5);
          }).length;
          isRowSeries = r0IsMostlyText && (numSubsequent / subsequentRows.length >= 0.5);
        }
      }
    }
  }

  let seriesList: string[] = [];
  if (config.chartType === "Bar") {
    const useRowMode = config.useHierarchy
      ? config.hierarchySource === "rows"
      : (isRowSeries || config.hierarchySource === "rows");

    if (useRowMode) {
      const pRowSetting = config.hierarchyParentRow ?? "header";
      let sRowSetting = config.hierarchySubRow ?? 0;
      if (pRowSetting === sRowSetting) {
        sRowSetting = pRowSetting === "header" ? 0 : "header";
      }
      const parentRowIdx = pRowSetting === "header" ? -1 : (typeof pRowSetting === "number" ? pRowSetting : -1);
      const subRowIdx = sRowSetting === "header" ? -1 : (typeof sRowSetting === "number" ? sRowSetting : 0);
      const sColIdx = typeof config.hierarchySeriesCol === "number" ? config.hierarchySeriesCol : 0;
      const uniqueSeries = new Set<string>();
      for (let r = 0; r < tableRows.length; r++) {
        if (r === parentRowIdx || r === subRowIdx) continue;
        const row = tableRows[r];
        if (Array.isArray(row)) {
          const name = String(row[sColIdx] || "").trim();
          if (name && !/^(totalt?|sum(ma)?|total|yhteens[aä])/i.test(name)) {
            uniqueSeries.add(name);
          }
        }
      }
      const list = Array.from(uniqueSeries);
      if (list.length > 0) seriesList = list;
    } else if (config.useHierarchy) {
      const pIdx = config.hierarchyParentCol ?? 0;
      let sIdx = config.hierarchySubCol ?? 1;
      if (pIdx === sIdx) sIdx = pIdx === 0 ? 1 : 0;
      const list = tableHeaders.filter((_, idx) => idx !== pIdx && idx !== sIdx);
      const uniqueList = Array.from(new Set(list));
      if (uniqueList.length > 0) seriesList = uniqueList;
    }
  }
  if (seriesList.length === 0) {
    const catIdx = config.categoryColIndex ?? 0;
    const list = tableHeaders.filter((_, idx) => idx !== catIdx);
    const uniqueList = Array.from(new Set(list));
    seriesList = uniqueList.length > 0 ? uniqueList : ["Serie 1"];
  }

  const catIdx = config.categoryColIndex ?? 0;
  const seenCats = new Set<string>();
  const cats: string[] = [];
  tableRows.forEach(r => {
    if (Array.isArray(r)) {
      const name = String(r[catIdx] || "").trim();
      if (name && !seenCats.has(name)) {
        seenCats.add(name);
        cats.push(name);
      }
    }
  });
  const pieCategories = cats.length > 0 ? cats : ["Kategori 1"];

  const isPieByRow = config.chartType === "Pie" && (
    config.pieGrouping === "rows" ||
    (config.pieGrouping !== "columns" && seriesList.length > 1 && tableRows.length > 1)
  );

  let chartContainerHeight = config.chartHeight || 480;
  if (config.chartType === "Pie") {
    const numPies = Math.max(1, isPieByRow ? tableRows.length : seriesList.length);
    const isMobile = cardWidth < 560;
    const pieCols = isMobile ? 1 : (numPies <= 4 ? numPies : (numPies <= 6 ? 3 : 4));
    const pieRowsCount = Math.ceil(numPies / pieCols);
    const singlePieH = config.chartHeight || 360;
    chartContainerHeight = pieRowsCount * singlePieH;
  }

  const footerLines: any[][] = [];
  (config.footers || []).forEach((item: any, idx: number) => {
    if (idx === 0 || item.layout === "below") footerLines.push([item]);
    else {
      if (!footerLines.length) footerLines.push([]);
      footerLines[footerLines.length - 1].push(item);
    }
  });

  return { isRowSeries, seriesList, pieCategories, isPieByRow, chartContainerHeight, footerLines };
}
