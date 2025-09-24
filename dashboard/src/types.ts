export type ISODateString = string;

export interface Period {
  from: ISODateString | null;
  to: ISODateString | null;
}

export interface FinanceRow {
  id?: string;
  date: ISODateString;
  amount: number | string;
  type: 'income' | 'expense' | string;
  category?: string;
  description?: string;

  [k: string]: unknown;
}

export interface SummaryTotals {
  income: number;
  expense: number;
  net: number;
}

export interface SummaryCategoryBreakdown {
  category: string;
  amount: number;
  pct: number;
}

export interface SummaryResponse {
  period: Period;
  totals: SummaryTotals;
  byCategory: SummaryCategoryBreakdown[];
  top5: SummaryCategoryBreakdown[];
  count: number;
}

export interface TimelinePoint {
  date: ISODateString;
  income: number;
  expense: number;
  net: number;
}

export interface TimelineResponse {
  period: Period;
  points: TimelinePoint[];
  count: number;
}

export interface ApiErrorShape {
  status: number;
  message: string;
  cause?: string;
}

export interface SummaryQuery {
  from?: ISODateString;
  to?: ISODateString;
}
export interface TimelineQuery {
  from?: ISODateString;
  to?: ISODateString;
}

export type Tool = 'summary' | 'timeline' | 'advice';
export type ToolResponseMap = {
  summary: SummaryResponse;
  timeline: TimelineResponse;
  advice: unknown;
};
