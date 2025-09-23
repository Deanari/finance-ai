import { doc } from "./_shared/db.js";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { json, parseISO, inDateRange, add } from "./_shared/helpers.js";

const TABLE = process.env.TABLE_NAME;

async function scanAll() {
  let items = [];
  let ExclusiveStartKey;
  do {
    const { Items = [], LastEvaluatedKey } = await doc.send(
      new ScanCommand({ TableName: TABLE, ExclusiveStartKey })
    );
    items = items.concat(Items);
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export const handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const fromISO = parseISO(qs.from);
  const toISO = parseISO(qs.to);

  const all = await scanAll();
  const rows = all.filter((r) => inDateRange(parseISO(r.date), fromISO, toISO));

  const byDay = new Map();
  for (const it of rows) {
    const day = parseISO(it.date);
    if (!day) continue;
    const prev = byDay.get(day) || { date: day, income: 0, expense: 0 };
    if (String(it.type).toLowerCase() === "income") prev.income = add(prev.income, it.amount);
    else prev.expense = add(prev.expense, it.amount);
    byDay.set(day, prev);
  }

  const series = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  return json(200, {
    period: { from: fromISO, to: toISO },
    points: series.map((p) => ({
      date: p.date,
      income: Number(p.income),
      expense: Number(p.expense),
      net: Number(add(p.income, -p.expense))
    })),
    count: rows.length
  });
};