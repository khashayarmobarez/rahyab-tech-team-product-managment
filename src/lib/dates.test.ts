import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  formatDay,
  formatTehranDateTime,
  formatWeekLabel,
  formatWeekRange,
  isDateString,
  isFriday,
  isWeekStart,
  previousWeekStart,
  tehranClock,
  todayInTehran,
  weekDays,
  weekEnd,
  weekStartOf,
  weeklyDueAt,
} from "./dates";

// Calendar used below (November 2026):
//   Sat 7   Sun 8   Mon 9   Tue 10  Wed 11  Thu 12  Fri 13
//   Sat 14  Sun 15  Mon 16  Tue 17  Wed 18  Thu 19  Fri 20
//   Sat 21
describe("calendar basics", () => {
  it("knows the weekdays", () => {
    expect(dayOfWeek("2026-11-14")).toBe(6); // Saturday
    expect(dayOfWeek("2026-11-19")).toBe(4); // Thursday
    expect(isFriday("2026-11-20")).toBe(true);
    expect(isFriday("2026-11-19")).toBe(false);
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDays("2026-11-14", -14)).toBe("2026-10-31");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-11-14", "2026-11-14")).toBe(0);
    expect(daysBetween("2026-11-14", "2026-11-20")).toBe(6);
    expect(daysBetween("2026-11-20", "2026-11-14")).toBe(-6);
  });

  it("accepts only real calendar days", () => {
    expect(isDateString("2026-11-14")).toBe(true);
    expect(isDateString("2024-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-11-31")).toBe(false);
    expect(isDateString("14-11-2026")).toBe(false);
    expect(isDateString("")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });
});

describe("weekStartOf: weeks run Saturday to Thursday", () => {
  it("returns the Saturday itself", () => {
    expect(weekStartOf("2026-11-14")).toBe("2026-11-14");
  });

  it("returns the Saturday on or before any working day", () => {
    expect(weekStartOf("2026-11-15")).toBe("2026-11-14"); // Sunday
    expect(weekStartOf("2026-11-17")).toBe("2026-11-14"); // Tuesday
    expect(weekStartOf("2026-11-19")).toBe("2026-11-14"); // Thursday, last working day
  });

  it("keeps Friday, the day off, in the week that just ended", () => {
    expect(weekStartOf("2026-11-20")).toBe("2026-11-14");
    expect(weekStartOf("2026-11-13")).toBe("2026-11-07");
  });

  it("starts the next week on the following Saturday", () => {
    expect(weekStartOf("2026-11-21")).toBe("2026-11-21");
  });

  it("works across a year boundary", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-27");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-26"); // a Friday
  });

  it("works around the leap day", () => {
    expect(weekStartOf("2024-02-29")).toBe("2024-02-24");
    expect(weekStartOf("2024-03-02")).toBe("2024-03-02");
  });

  it("always returns a Saturday", () => {
    for (let i = 0; i < 400; i++) {
      expect(isWeekStart(weekStartOf(addDays("2025-06-01", i)))).toBe(true);
    }
  });

  it("is stable when applied twice", () => {
    for (let i = 0; i < 60; i++) {
      const start = weekStartOf(addDays("2026-01-01", i));
      expect(weekStartOf(start)).toBe(start);
    }
  });
});

describe("weekEnd and weekDays", () => {
  it("ends the week on Thursday", () => {
    expect(weekEnd("2026-11-14")).toBe("2026-11-19");
    expect(dayOfWeek(weekEnd("2026-11-14"))).toBe(4);
  });

  it("rejects a date that does not start a week", () => {
    expect(() => weekEnd("2026-11-15")).toThrow(RangeError);
    expect(() => weekEnd("2026-11-20")).toThrow(RangeError);
  });

  it("lists Saturday to Friday", () => {
    const days = weekDays("2026-11-14");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-11-14");
    expect(days[5]).toBe("2026-11-19"); // Thursday
    expect(days[6]).toBe("2026-11-20"); // Friday, the day off
  });

  it("steps back one week", () => {
    expect(previousWeekStart("2026-11-14")).toBe("2026-11-07");
  });
});

describe("today in Tehran (UTC+3:30, no daylight saving)", () => {
  it("uses Tehran's date, not the server's", () => {
    // 22:00 UTC on the 13th is already 01:30 on the 14th in Tehran.
    expect(todayInTehran(new Date("2026-11-13T22:00:00Z"))).toBe("2026-11-14");
    // 02:00 UTC on the 14th is 05:30 on the 14th.
    expect(todayInTehran(new Date("2026-11-14T02:00:00Z"))).toBe("2026-11-14");
  });

  it("changes exactly at Tehran midnight", () => {
    expect(todayInTehran(new Date("2026-11-14T20:29:59.999Z"))).toBe("2026-11-14");
    expect(todayInTehran(new Date("2026-11-14T20:30:00.000Z"))).toBe("2026-11-15");
  });

  it("rolls from Thursday night into Friday", () => {
    // Thursday 23:59:59 Tehran = 20:29:59 UTC.
    const thursdayLast = new Date("2026-11-19T20:29:59Z");
    const fridayFirst = new Date("2026-11-19T20:30:00Z");
    expect(todayInTehran(thursdayLast)).toBe("2026-11-19");
    expect(todayInTehran(fridayFirst)).toBe("2026-11-20");
    expect(weekStartOf(todayInTehran(thursdayLast))).toBe("2026-11-14");
    // Friday is still the old week...
    expect(weekStartOf(todayInTehran(fridayFirst))).toBe("2026-11-14");
  });

  it("rolls from Friday night into the new week on Saturday", () => {
    const fridayLast = new Date("2026-11-20T20:29:59Z");
    const saturdayFirst = new Date("2026-11-20T20:30:00Z");
    expect(weekStartOf(todayInTehran(fridayLast))).toBe("2026-11-14");
    expect(todayInTehran(saturdayFirst)).toBe("2026-11-21");
    expect(weekStartOf(todayInTehran(saturdayFirst))).toBe("2026-11-21");
  });

  it("rolls over New Year", () => {
    expect(todayInTehran(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01-01");
  });

  it("is not affected by summer: the offset never changes", () => {
    expect(tehranClock(new Date("2026-07-01T00:00:00Z"))).toEqual({ date: "2026-07-01", hour: 3, minute: 30 });
    expect(tehranClock(new Date("2026-01-01T00:00:00Z"))).toEqual({ date: "2026-01-01", hour: 3, minute: 30 });
  });
});

describe("weekly due time", () => {
  it("is Thursday 23:59 Tehran time", () => {
    const due = weeklyDueAt("2026-11-14");
    expect(due.toISOString()).toBe("2026-11-19T20:29:00.000Z");
    expect(tehranClock(due)).toEqual({ date: "2026-11-19", hour: 23, minute: 59 });
  });
});

describe("display text", () => {
  it("formats days and weeks", () => {
    expect(formatDay("2026-11-14")).toBe("Sat 14 Nov");
    expect(formatWeekLabel("2026-11-14")).toBe("Sat 14 Nov – Thu 19 Nov 2026");
  });

  it("shows the year once, or twice when a week crosses New Year", () => {
    expect(formatWeekLabel("2026-12-26")).toBe("Sat 26 Dec – Thu 31 Dec 2026");
    expect(formatWeekLabel("2025-12-27")).toBe("Sat 27 Dec 2025 – Thu 1 Jan 2026");
  });

  it("formats a short week range for pickers", () => {
    expect(formatWeekRange("2026-11-14")).toBe("14 Nov – 19 Nov 2026");
    expect(formatWeekRange("2025-12-27")).toBe("27 Dec 2025 – 1 Jan 2026");
  });

  it("formats Tehran date and time", () => {
    expect(formatTehranDateTime(new Date("2026-11-14T14:12:00Z"))).toBe("14 Nov 2026, 17:42");
    expect(formatTehranDateTime(new Date("2026-11-14T20:45:00Z"))).toBe("15 Nov 2026, 00:15");
  });
});
