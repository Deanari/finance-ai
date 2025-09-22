export const handler = async () => {
  const advice = [
    "Tu tasa de ahorro está por debajo del 20%. Fijá una meta mensual.",
    "La categoría 'Food' supera el 30% de tus gastos; probá viandas 3x por semana."
  ].join(" ");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify({ advice })
  };
};