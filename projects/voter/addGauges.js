const fs = require("fs");
const { parse } = require("csv-parse");

let gauge_addrs = [];
let gauge_types = [];
let weights = [];
let pids = [];
let mastchefs = [];
let chainIds = [];
let boostMultipliers = [];
let maxVoteCaps = [];

fs.createReadStream("./addGauges.csv")
  .pipe(parse({ delimiter: ",", from_line: 2 }))
  .on("data", function (row) {
    //console.log(row);
    gauge_addrs.push(row[2]);
    gauge_types.push(row[3]);
    weights.push(row[4]);
    pids.push(row[5]);
    mastchefs.push(row[6]);
    chainIds.push(row[7]);
    boostMultipliers.push(row[8]);
    maxVoteCaps.push(row[9]);
  });

(async () => {
  setTimeout(async () => {
    console.log("#########################################################");
    console.log("gauge_addrs length: ", gauge_addrs.length);
    console.log("gauge_types length: ", gauge_types.length);
    console.log("weights length: ", weights.length);
    console.log("pids length: ", pids.length);
    console.log("mastchefs length: ", mastchefs.length);
    console.log("chainIds length: ", chainIds.length);
    console.log("boostMultipliers length: ", boostMultipliers.length);
    console.log("maxVoteCaps length: ", maxVoteCaps.length);
  }, 3000);
})();
