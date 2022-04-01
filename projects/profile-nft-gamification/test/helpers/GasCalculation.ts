const PRICE_BNB = 270;

function gasToBNB(gas: number, gwei: number = 10) {
  const num = gas * gwei * 10 ** -9;
  return num.toFixed(4);
}

function gasToUSD(gas: number, gwei: number = 10, priceBNB: number = PRICE_BNB) {
  const num = gas * priceBNB * gwei * 10 ** -9;
  return num.toFixed(2);
}

export { gasToBNB, gasToUSD };
