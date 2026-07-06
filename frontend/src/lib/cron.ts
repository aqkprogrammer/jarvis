/**
 * Tiny cron utilities — no dependencies.
 * Supports standard 5-field crontab expressions: minute hour day-of-month month day-of-week
 */

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 = Sunday)
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday", // 7 aliases 0
];

function isValidField(field: string, min: number, max: number): boolean {
  if (field.length === 0) return false;
  return field.split(",").every((piece) => {
    if (piece.length === 0) return false;
    const [rangePart, stepPart, ...rest] = piece.split("/");
    if (rest.length > 0) return false;
    if (stepPart !== undefined && (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) === 0)) {
      return false;
    }
    if (rangePart === "*") return true;
    const match = rangePart.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return false;
    const start = parseInt(match[1], 10);
    const end = match[2] !== undefined ? parseInt(match[2], 10) : start;
    return start >= min && start <= max && end >= min && end <= max && start <= end;
  });
}

/** Basic validation of a 5-field cron expression. */
export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((part, i) => isValidField(part, FIELD_RANGES[i][0], FIELD_RANGES[i][1]));
}

function formatTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function asInt(field: string): number | null {
  return /^\d+$/.test(field) ? parseInt(field, 10) : null;
}

/**
 * Human-readable summary for common cron patterns.
 * Falls back to "Custom schedule" for anything exotic.
 */
export function describeCron(cron: string): string {
  if (!isValidCron(cron)) return "Invalid expression";

  const [minute, hour, dom, month, dow] = cron.trim().split(/\s+/);
  const m = asInt(minute);
  const h = asInt(hour);

  // Every minute
  if (minute === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "Every minute";
  }

  // Minute intervals: */N * * * *
  const minStep = minute.match(/^\*\/(\d+)$/);
  if (minStep && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const n = parseInt(minStep[1], 10);
    return n === 1 ? "Every minute" : `Every ${n} minutes`;
  }

  // Hour intervals: M */N * * *
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (m !== null && hourStep && dom === "*" && month === "*" && dow === "*") {
    const n = parseInt(hourStep[1], 10);
    const at = m === 0 ? "" : ` at :${minute.padStart(2, "0")}`;
    return n === 1 ? `Every hour${at}` : `Every ${n} hours${at}`;
  }

  // Hourly: M * * * *
  if (m !== null && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return m === 0 ? "Every hour" : `Every hour at :${minute.padStart(2, "0")}`;
  }

  // Time-of-day based patterns
  if (m !== null && h !== null && month === "*") {
    const time = formatTime(h, m);

    // Daily: M H * * *
    if (dom === "*" && dow === "*") return `Daily at ${time}`;

    // Weekdays: M H * * 1-5
    if (dom === "*" && dow === "1-5") return `Weekdays at ${time}`;

    // Weekends: M H * * 0,6 or 6,0
    if (dom === "*" && (dow === "0,6" || dow === "6,0" || dow === "6,7")) {
      return `Weekends at ${time}`;
    }

    // Weekly on a single day: M H * * D
    const d = asInt(dow);
    if (dom === "*" && d !== null && d >= 0 && d <= 7) {
      return `Weekly on ${DAY_NAMES[d]} at ${time}`;
    }

    // Multiple named days: M H * * 1,3,5
    if (dom === "*" && /^\d(,\d)+$/.test(dow)) {
      const days = dow
        .split(",")
        .map((x) => parseInt(x, 10))
        .filter((x) => x >= 0 && x <= 7)
        .map((x) => DAY_NAMES[x]);
      if (days.length > 0) return `${days.join(", ")} at ${time}`;
    }

    // Monthly: M H D * *
    const day = asInt(dom);
    if (day !== null && dow === "*") {
      const ord =
        day % 10 === 1 && day !== 11
          ? "st"
          : day % 10 === 2 && day !== 12
            ? "nd"
            : day % 10 === 3 && day !== 13
              ? "rd"
              : "th";
      return `Monthly on the ${day}${ord} at ${time}`;
    }
  }

  return "Custom schedule";
}
