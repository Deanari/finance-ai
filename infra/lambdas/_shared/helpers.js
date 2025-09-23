export const json = (code, data) => ({
  statusCode: code,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data)
});

export function parseISO(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

export function inDateRange(itemISO, fromISO, toISO) {
  if (!fromISO && !toISO) return true;
  if (fromISO && itemISO < fromISO) return false;
  if (toISO && itemISO > toISO) return false;
  return true;
}

export const add = (a, b) => Number(a || 0) + Number(b || 0);