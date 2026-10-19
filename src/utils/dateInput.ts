/**
 * 到期日输入解析
 *
 * 面板里的日期选择器（原生 date 输入）对键盘输入很不友好：既不能直接敲
 * `20261104`，逐段输入也很慢。这里提供一组纯函数，把用户随手敲的日期解析成
 * 规范的 `YYYY-MM-DD`，供输入框和表单提交共用。
 */

const SEPARATOR_PATTERN = /[\s\-/._年月日]/g;
const SEPARATOR_TEST_PATTERN = /[\s\-/._年月日]/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** 两位年份按 70 分界：69 → 2069，70 → 1970。 */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (year < 1 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * 把多种写法的日期解析为 `YYYY-MM-DD`。
 *
 * 支持：
 * - `20261104`、`261104`（纯数字，6 位按两位年份解析）
 * - `2026-11-04`、`2026/11/4`、`2026.11.04`、`2026年11月4日`
 * - 带空格的同上
 *
 * 无法识别或日期非法时返回 `null`；空字符串返回 `null`（表示清空）。
 */
export function normalizeDateInput(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // 纯数字写法：8 位 YYYYMMDD，6 位 YYMMDD
  if (!SEPARATOR_TEST_PATTERN.test(trimmed)) {
    if (/^\d+$/.test(trimmed)) {
      if (trimmed.length === 8) {
        return buildDate(
          Number(trimmed.slice(0, 4)),
          Number(trimmed.slice(4, 6)),
          Number(trimmed.slice(6, 8)),
        );
      }
      if (trimmed.length === 6) {
        return buildDate(
          expandYear(Number(trimmed.slice(0, 2))),
          Number(trimmed.slice(2, 4)),
          Number(trimmed.slice(4, 6)),
        );
      }
    }
    return null;
  }

  // 带分隔符写法：年 月 日
  const parts = trimmed.split(SEPARATOR_PATTERN).filter(part => part !== "");
  if (parts.length !== 3) return null;
  if (!parts.every(part => /^\d+$/.test(part))) return null;

  const year = parts[0].length <= 2
    ? expandYear(Number(parts[0]))
    : Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return buildDate(year, month, day);
}

/** 把 ISO 时间串转成 `YYYY-MM-DD`，用于初始化输入框；无效则返回空串。 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  // 零值时间（0001-01-01）代表未设置到期日，按约定视为空
  if (year < 3) return "";
  return `${pad(year, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 把 `YYYY-MM-DD` 转成后端需要的 RFC3339（UTC 零点）；空值返回 null。 */
export function dateInputToISOString(value: string | null | undefined): string | null {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00Z`).toISOString();
}
