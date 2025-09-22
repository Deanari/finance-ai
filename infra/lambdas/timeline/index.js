export const handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const from = qs.from || null;
  const to = qs.to || null;

  const items = [
    { date: "2024-03-01", type: "income",  category: "Salary",    amount: 2000 },
    { date: "2024-03-02", type: "expense", category: "Food",      amount: -120.50 },
    { date: "2024-03-03", type: "expense", category: "Transport", amount: -40.00 }
  ].filter(e => (!from || e.date >= from) && (!to || e.date <= to));

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify({ items })
  };
};