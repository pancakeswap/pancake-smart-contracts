import config from "../config";

const name = "testnet";

module.exports = [
  config.LPToken[name],
  config.OfferingToken[name],
  config.StartBlock[name],
  config.EndBlock[name],
  config.AdminAddress[name],
];
