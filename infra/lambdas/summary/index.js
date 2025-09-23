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

  const totals = rows.reduce(
    (acc, it) => {
      const amt = Number(it.amount) || 0;
      if (String(it.type).toLowerCase() === "income") acc.income = add(acc.income, amt);
      else acc.expense = add(acc.expense, amt);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  totals.net = add(totals.income, -totals.expense);

  const byCategoryMap = new Map();
  for (const it of rows) {
    if (String(it.type).toLowerCase() === "income") continue;
    const key = it.category || "Uncategorized";
    byCategoryMap.set(key, add(byCategoryMap.get(key) || 0, Number(it.amount) || 0));
  }
  const expensesTotal = totals.expense || 1;
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      pct: Math.round((amount / expensesTotal) * 1000) / 10
    }))
    .sort((a, b) => b.amount - a.amount);

  const top5 = byCategory.slice(0, 5);

  return json(200, {
    period: { from: fromISO, to: toISO },
    totals,
    byCategory,
    top5,
    count: rows.length
  });
};