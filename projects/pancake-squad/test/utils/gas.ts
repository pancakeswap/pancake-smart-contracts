const PRICE_BNB = 300;

export const gasToBNB = (gas: number, gwei: number = 5) => {
  const num = gas * gwei * 10 ** -9;
  return num.toFixed(4);
};

export const gasToUSD = (gas: number, gwei: number = 5, priceBNB: number = PRICE_BNB) => {
  const num = gas * priceBNB * gwei * 10 ** -9;
  return num.toFixed(2);
};
