export type PeriodDisplay = {
  start: string;
  end: string;
  type: string;
};

const calendarLabels: Record<string, string> = {
  calendar_year: "自然年",
  fiscal_year: "公司财年",
};

export function periodHeading(period: PeriodDisplay, fiscalYearLabel: string | null): string {
  if (period.type === "quarter") {
    const end = new Date(`${period.end}T00:00:00Z`);
    if (!Number.isNaN(end.valueOf())) {
      return `${end.getUTCFullYear()} Q${Math.floor(end.getUTCMonth() / 3) + 1}`;
    }
  }
  return fiscalYearLabel ?? period.type;
}

export function periodContext(calendarBasis: string, period: PeriodDisplay): string {
  return `${calendarLabels[calendarBasis] ?? calendarBasis}｜${period.start} 至 ${period.end}`;
}
