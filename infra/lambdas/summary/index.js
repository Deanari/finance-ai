export const handler = async (event) => {
  const res = {
    byCategory: [
      { category: "Food", amount: 210.5 },
      { category: "Transport", amount: 80.0 }
    ],
    totalExpenses: 290.5,
    totalIncome: 2000,
    savingsRate: 0.8548
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(res)
  };
};