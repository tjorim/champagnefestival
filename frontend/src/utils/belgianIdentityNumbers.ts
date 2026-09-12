/**
 * Belgian NISS (rijksregisternummer) and eID card number: format/validate.
 * Mirrors the checksum logic in `backend/app/services/identity_checksum.py` —
 * client-side validation here is just for instant feedback; the backend
 * re-validates before writing anything.
 */

const POST_2000_OFFSET = 2_000_000_000;

export function stripSeparators(value: string): string {
  return value.replace(/[\s.\-/]/g, "");
}

/** 11 digits: first 9 are YYMMDD + serial, last 2 are the check (97 - (N mod 97)). */
export function isValidNiss(rawValue: string): boolean {
  const digits = stripSeparators(rawValue);
  if (digits.length !== 11 || !/^\d+$/.test(digits)) return false;
  const base = Number(digits.slice(0, 9));
  const check = digits.slice(9);
  const before2000 = String(97 - (base % 97)).padStart(2, "0");
  if (before2000 === check) return true;
  const after2000 = String(97 - ((base + POST_2000_OFFSET) % 97)).padStart(2, "0");
  return after2000 === check;
}

/** 12 digits: first 10 are the card serial, last 2 are the check (N mod 97, no complement). */
export function isValidEidNumber(rawValue: string): boolean {
  const digits = stripSeparators(rawValue);
  if (digits.length !== 12 || !/^\d+$/.test(digits)) return false;
  const base = Number(digits.slice(0, 10));
  const check = digits.slice(10);
  return String(base % 97).padStart(2, "0") === check;
}

/** "95121423764" -> "95.12.14-237.64" */
export function formatNiss(rawValue: string): string {
  const digits = stripSeparators(rawValue);
  if (digits.length !== 11) return rawValue;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}-${digits.slice(6, 9)}.${digits.slice(9)}`;
}

/** "595657020828" -> "595-6570208-28" */
export function formatEidNumber(rawValue: string): string {
  const digits = stripSeparators(rawValue);
  if (digits.length !== 12) return rawValue;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
}
