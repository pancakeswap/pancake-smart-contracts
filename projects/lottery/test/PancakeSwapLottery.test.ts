import { parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";

const MockERC20 = artifacts.require("./utils/MockERC20.sol");
const MockRandomNumberGenerator = artifacts.require("./utils/MockRandomNumberGenerator.sol");
const PancakeSwapLottery = artifacts.require("./PancakeSwapLottery.sol");

const PRICE_BNB = 400;

function gasToBNB(gas: number, gwei: number = 5) {
  const num = gas * gwei * 10 ** -9;
  return num.toFixed(4);
}

function gasToUSD(gas: number, gwei: number = 5, priceBNB: number = PRICE_BNB) {
  const num = gas * priceBNB * gwei * 10 ** -9;
  return num.toFixed(2);
}

contract("Lottery V2", ([alice, bob, carol, david, erin, operator, treasury, injector]) => {
  // VARIABLES
  const _totalInitSupply = parseEther("10000");

  let _lengthLottery = new BN("14400"); // 4h
  let _priceTicketInCake = parseEther("0.5");
  let _discountDivisor = "2000";

  let _rewardsBreakdown = ["200", "300", "500", "1500", "2500", "5000"];
  let _treasuryFee = "2000";

  // Contracts
  let lottery, mockCake, randomNumberGenerator;

  // Generic variables
  let result: any;
  let endTime;

  before(async () => {
    // Deploy MockCake
    mockCake = await MockERC20.new("Mock CAKE", "CAKE", _totalInitSupply);

    // Deploy MockRandomNumberGenerator
    randomNumberGenerator = await MockRandomNumberGenerator.new({ from: alice });

    // Deploy PancakeSwapLottery
    lottery = await PancakeSwapLottery.new(mockCake.address, randomNumberGenerator.address, { from: alice });

    await randomNumberGenerator.setLotteryAddress(lottery.address, { from: alice });
  });

  describe("LOTTERY #1 - CUSTOM RANDOMNESS", async () => {
    it("Admin sets up treasury/operator address", async () => {
      result = await lottery.setOperatorAndTreasuryAndInjectorAddresses(operator, treasury, injector, { from: alice });
      expectEvent(result, "NewOperatorAndTreasuryAndInjectorAddresses", {
        operator: operator,
        treasury: treasury,
        injector: injector,
      });
    });

    it("Users mint and approve CAKE to be used in the lottery", async () => {
      for (let thisUser of [alice, bob, carol, david, erin, injector]) {
        await mockCake.mintTokens(parseEther("100000"), { from: thisUser });
        await mockCake.approve(lottery.address, parseEther("100000"), {
          from: thisUser,
        });
      }
    });

    it("Operator starts lottery", async () => {
      endTime = new BN(await time.latest()).add(_lengthLottery);

      result = await lottery.startLottery(
        endTime,
        _priceTicketInCake,
        _discountDivisor,
        _rewardsBreakdown,
        _treasuryFee,
        { from: operator }
      );

      expectEvent(result, "LotteryOpen", {
        lotteryId: "1",
        startTime: (await time.latest()).toString(),
        endTime: endTime.toString(),
        priceTicketInCake: _priceTicketInCake.toString(),
        firstTicketId: "0",
        injectedAmount: "0",
      });

      console.info(
        `        --> Cost to start the lottery: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );
    });

    it("Bob buys 100 tickets", async () => {
      const _ticketsBought = [
        "1234561",
        "1234562",
        "1234563",
        "1234564",
        "1234565",
        "1234566",
        "1234567",
        "1234568",
        "1234569",
        "1234570",
        "1334571",
        "1334572",
        "1334573",
        "1334574",
        "1334575",
        "1334576",
        "1334577",
        "1334578",
        "1334579",
        "1334580",
        "1434581",
        "1434582",
        "1434583",
        "1434584",
        "1434585",
        "1434586",
        "1434587",
        "1434588",
        "1434589",
        "1534590",
        "1534591",
        "1534592",
        "1534593",
        "1534594",
        "1534595",
        "1534596",
        "1534597",
        "1534598",
        "1534599",
        "1634600",
        "1634601",
        "1634602",
        "1634603",
        "1634604",
        "1634605",
        "1634606",
        "1634607",
        "1634608",
        "1634609",
        "1634610",
        "1634611",
        "1634612",
        "1634613",
        "1634614",
        "1634615",
        "1634616",
        "1634617",
        "1634618",
        "1634619",
        "1634620",
        "1634621",
        "1634622",
        "1634623",
        "1634624",
        "1634625",
        "1634626",
        "1634627",
        "1634628",
        "1634629",
        "1634630",
        "1634631",
        "1634632",
        "1634633",
        "1634634",
        "1634635",
        "1634636",
        "1634637",
        "1634638",
        "1634639",
        "1634640",
        "1634641",
        "1634642",
        "1634643",
        "1634644",
        "1634645",
        "1634646",
        "1634647",
        "1634648",
        "1634649",
        "1634650",
        "1634651",
        "1634652",
        "1634653",
        "1634654",
        "1634655",
        "1634656",
        "1634657",
        "1634658",
        "1634659",
        "1634660",
      ];

      result = await lottery.buyTickets("1", _ticketsBought, { from: bob });

      expectEvent(result, "TicketsPurchase", { buyer: bob, lotteryId: "1", numberTickets: "100" });

      console.info(
        `        --> Cost to buy the first 100 tickets: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: bob,
        to: lottery.address,
        value: parseEther("47.525").toString(),
      });

      result = await lottery.viewLottery("1");
      assert.equal(result[11].toString(), parseEther("47.525").toString());

      result = await lottery.viewUserInfoForLotteryId(bob, "1", 0, 100);
      const bobTicketIds = [];

      result[0].forEach(function (value) {
        bobTicketIds.push(value.toString());
      });

      const expectedTicketIds = Array.from({ length: 100 }, (_, v) => v.toString());
      assert.includeOrderedMembers(bobTicketIds, expectedTicketIds);

      result = await lottery.viewNumbersAndStatusesForTicketIds(bobTicketIds);
      assert.includeOrderedMembers(result[0].map(String), _ticketsBought);
    });

    it("Carol buys 1 ticket", async () => {
      const _ticketsBought = ["1111111"];
      // Carol buys 1/1/1/1/1/1
      result = await lottery.buyTickets("1", _ticketsBought, { from: carol });
      expectEvent(result, "TicketsPurchase", { buyer: carol, lotteryId: "1", numberTickets: "1" });

      console.info(
        `        --> Cost to buy a stand-alone ticket: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: carol,
        to: lottery.address,
        value: parseEther("0.5").toString(),
      });
    });

    it("David buys 10 tickets", async () => {
      const _ticketsBought = [
        "1111111",
        "1222222",
        "1333333",
        "1444444",
        "1555555",
        "1666666",
        "1777777",
        "1888888",
        "1000000",
        "1999999",
      ];

      const expectedPricePerBatch = await lottery.calculateTotalPriceForBulkTickets("2000", parseEther("0.5"), "10");

      result = await lottery.buyTickets("1", _ticketsBought, { from: david });
      expectEvent(result, "TicketsPurchase", { buyer: david, lotteryId: "1", numberTickets: "10" });

      console.info(
        `        --> Cost to buy 10 tickets: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: david,
        to: lottery.address,
        value: parseEther("4.9775").toString(),
      });

      assert.equal(expectedPricePerBatch.toString(), parseEther("4.9775").toString());
    });

    it("Owner does 10k CAKE injection", async () => {
      result = await lottery.injectFunds("1", parseEther("10000"), { from: alice });
      expectEvent(result, "LotteryInjection", { lotteryId: "1", injectedAmount: parseEther("10000").toString() });

      console.info(
        `        --> Cost to do injection: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: alice,
        to: lottery.address,
        value: parseEther("10000").toString(),
      });
    });

    it("Operator closes lottery", async () => {
      await randomNumberGenerator.setNextRandomResult("199999999", { from: alice });
      await randomNumberGenerator.changeLatestLotteryId({ from: alice });

      // Time travel
      await time.increaseTo(endTime);
      result = await lottery.closeLottery("1", { from: operator });
      expectEvent(result, "LotteryClose", { lotteryId: "1", firstTicketIdNextLottery: "111" });

      console.info(
        `        --> Cost to close lottery: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );
    });

    it("Numbers are drawn (9/9/9/9/9/9)", async () => {
      // 11 winning tickets
      result = await lottery.drawFinalNumberAndMakeLotteryClaimable("1", true, { from: operator });

      expectEvent(result, "LotteryNumberDrawn", {
        lotteryId: "1",
        finalNumber: "1999999",
        countWinningTickets: "11",
      });

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: lottery.address,
        to: treasury,
        value: parseEther("2010.6005").toString(),
      });

      console.info(
        `        --> Cost to draw numbers (w/o ChainLink): ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );
    });

    it("David claims the jackpot", async () => {
      // 10,000 + 47.525 + 0.5 + 4.9775 = 10053.0025 CAKE collected
      // 10053.0025 * (1-0.20) * 0.5 = 4021.201 CAKE

      result = await lottery.claimTickets("1", ["110"], ["5"], { from: david });

      expectEvent(result, "TicketsClaim", {
        claimer: david,
        amount: parseEther("4021.201").toString(),
        lotteryId: "1",
        numberTickets: "1",
      });

      console.info(
        `        --> Cost to claim ticket: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: lottery.address,
        to: david,
        value: parseEther("4021.201").toString(),
      });

      result = await lottery.viewNumbersAndStatusesForTicketIds(["110"]);
      assert.equal(result[1][0], true);
    });

    it("Bob claims 10 winning tickets he bought", async () => {
      // 10,000 + 47.525 + 0.5 + 4.9775 = 10053.0025 CAKE collected
      // 10053.0025 * (1-0.20) * 0.02 = 160.84804 CAKE
      // 10053.0025 * (1-0.20) * 0.03 = 241.27206 CAKE
      // SUM (approximate) = 402.1201

      result = await lottery.claimTickets(
        "1",
        ["8", "18", "28", "48", "58", "68", "78", "88", "98", "38"],
        ["0", "0", "0", "0", "0", "0", "0", "0", "0", "1"],
        { from: bob }
      );

      expectEvent(result, "TicketsClaim", {
        claimer: bob,
        amount: parseEther("402.120099999999999996").toString(),
        lotteryId: "1",
        numberTickets: "10",
      });

      console.info(
        `        --> Cost to claim 9 tickets: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )})`
      );

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: lottery.address,
        to: bob,
        value: parseEther("402.120099999999999996").toString(),
      });

      // 10053.0025 * (1- 0.2) - 402.1201 - 4021.201 = 3619.0809
    });

    describe("LOTTERY #2 - CUSTOM RANDOMNESS - Exceptions", async () => {
      it("Operator cannot close lottery that is in claiming", async () => {
        await expectRevert(lottery.closeLottery("1", { from: operator }), "Lottery not open");
      });

      it("Operator cannot inject funds in a lottery that is Open status", async () => {
        await expectRevert(lottery.injectFunds("1", parseEther("10"), { from: alice }), "Lottery not open");
        await expectRevert(lottery.injectFunds("2", parseEther("10"), { from: alice }), "Lottery not open");
      });

      it("Operator cannot draw numbers for previous lottery", async () => {
        await expectRevert(
          lottery.drawFinalNumberAndMakeLotteryClaimable("1", true, { from: operator }),
          "Lottery not close"
        );
      });

      it("User cannot buy 1 ticket for old lottery", async () => {
        await expectRevert(lottery.buyTickets("1", ["1999999"], { from: bob }), "Lottery is not open");
      });

      it("User cannot buy 1 ticket for future lottery", async () => {
        await expectRevert(lottery.buyTickets("2", ["1999999"], { from: bob }), "Lottery is not open");
      });

      it("User cannot claim a ticket with wrong bracket", async () => {
        await expectRevert(lottery.claimTickets("1", ["104"], ["6"], { from: david }), "Bracket out of range");
        await expectRevert(lottery.claimTickets("1", ["104"], ["5"], { from: david }), "No prize for this bracket");
        await expectRevert(lottery.claimTickets("1", ["104"], ["4"], { from: david }), "No prize for this bracket");
        await expectRevert(lottery.claimTickets("1", ["104"], ["3"], { from: david }), "No prize for this bracket");
        await expectRevert(lottery.claimTickets("1", ["104"], ["2"], { from: david }), "No prize for this bracket");
        await expectRevert(lottery.claimTickets("1", ["104"], ["1"], { from: david }), "No prize for this bracket");
        await expectRevert(lottery.claimTickets("1", ["104"], ["0"], { from: david }), "No prize for this bracket");
      });

      it("User cannot claim twice a winning ticket", async () => {
        await expectRevert(lottery.claimTickets("1", ["110"], ["5"], { from: david }), "Not the owner");
      });

      it("Operator cannot start lottery if length is too short/long", async () => {
        const currentLengthLottery = _lengthLottery;

        _lengthLottery = await lottery.MIN_LENGTH_LOTTERY();

        let endTimeTarget = new BN(await time.latest()).add(_lengthLottery).sub(new BN("10"));

        await expectRevert(
          lottery.startLottery(endTimeTarget, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Lottery length outside of range"
        );

        _lengthLottery = await lottery.MAX_LENGTH_LOTTERY();

        endTimeTarget = new BN(await time.latest()).add(_lengthLottery).add(new BN("100"));

        await expectRevert(
          lottery.startLottery(endTimeTarget, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Lottery length outside of range"
        );

        // Set it back to previous value
        _lengthLottery = currentLengthLottery;

        endTime = new BN(await time.latest()).add(_lengthLottery);
      });

      it("Operator cannot start lottery if discount divisor is too low", async () => {
        const currentDiscountDivisor = _discountDivisor;

        _discountDivisor = new BN(await lottery.MIN_DISCOUNT_DIVISOR()).sub(new BN("1"));

        await expectRevert(
          lottery.startLottery(endTime, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Discount divisor too low"
        );

        // Set it back to previous value
        _discountDivisor = currentDiscountDivisor;
      });

      it("Operator cannot start lottery if treasury fee too high", async () => {
        const currentTreasuryFee = _treasuryFee;
        _treasuryFee = new BN(await lottery.MAX_TREASURY_FEE()).add(new BN("1"));

        await expectRevert(
          lottery.startLottery(endTime, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Treasury fee too high"
        );

        // Set it back to previous value
        _treasuryFee = currentTreasuryFee;
      });

      it("Operator cannot start lottery if ticket price too low or too high", async () => {
        let newPriceTicketInCake = parseEther("0.0049999999");

        await expectRevert(
          lottery.startLottery(endTime, newPriceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Outside of limits"
        );

        newPriceTicketInCake = parseEther("0.0049999999");

        await expectRevert(
          lottery.startLottery(endTime, newPriceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Outside of limits"
        );
      });

      it("Operator cannot start lottery if wrong reward breakdown", async () => {
        const currentRewardBreakdown = _rewardsBreakdown;

        _rewardsBreakdown = ["0", "300", "500", "1500", "2500", "5000"]; // less than 10,000

        await expectRevert(
          lottery.startLottery(endTime, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Rewards must equal 10000"
        );

        _rewardsBreakdown = ["10000", "300", "500", "1500", "2500", "5000"]; // less than 10,000

        await expectRevert(
          lottery.startLottery(endTime, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Rewards must equal 10000"
        );

        // Set it back to previous value
        _rewardsBreakdown = currentRewardBreakdown;
      });

      it("Operator cannot close lottery that is not started", async () => {
        await expectRevert(lottery.closeLottery("2", { from: operator }), "Lottery not open");
      });

      it("Operator starts lottery", async () => {
        endTime = new BN(await time.latest()).add(_lengthLottery);

        result = await lottery.startLottery(
          endTime,
          _priceTicketInCake,
          _discountDivisor,
          _rewardsBreakdown,
          _treasuryFee,
          { from: operator }
        );

        expectEvent(result, "LotteryOpen", {
          lotteryId: "2",
          startTime: (await time.latest()).toString(),
          endTime: endTime.toString(),
          priceTicketInCake: _priceTicketInCake.toString(),
          firstTicketId: "111",
          injectedAmount: parseEther("3619.0809").toString(),
        });
      });

      it("Operator cannot close lottery", async () => {
        await expectRevert(lottery.closeLottery("2", { from: operator }), "Lottery not over");
      });

      it("Operator cannot draw numbers", async () => {
        await expectRevert(
          lottery.drawFinalNumberAndMakeLotteryClaimable("2", true, { from: operator }),
          "Lottery not close"
        );
      });

      it("Operator cannot start a second lottery", async () => {
        await expectRevert(
          lottery.startLottery(_lengthLottery, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: operator,
          }),
          "Not time to start lottery"
        );
      });

      it("User cannot buy 0 ticket", async () => {
        await expectRevert(lottery.buyTickets("2", [], { from: bob }), "No ticket specified");
      });

      it("User cannot buy more than the limit of tickets per transaction", async () => {
        const _maxNumberTickets = "5"; // 6 --> rejected // 5 --> accepted
        await lottery.setMaxNumberTicketsPerBuy(_maxNumberTickets, { from: alice });

        await expectRevert(
          lottery.buyTickets("2", ["1999999", "1999998", "1999999", "1999999", "1999998", "1999999"], { from: bob }),
          "Too many tickets"
        );

        // Sets limit at 100 tickets
        await lottery.setMaxNumberTicketsPerBuy("100", { from: alice });
      });

      it("User cannot buy tickets if one of the numbers is outside of range", async () => {
        await expectRevert(
          lottery.buyTickets("2", ["1999999", "2199998", "1999999", "1999999", "1999998", "1999999"], { from: bob }),
          "Outside range"
        );

        await expectRevert(
          lottery.buyTickets("2", ["1999999", "1929998", "1999999", "1999999", "1999998", "59999"], { from: bob }),
          "Outside range"
        );
      });

      it("Bob buys 2 tickets", async () => {
        await lottery.buyTickets("2", ["1999999", "1569955"], { from: bob });
      });

      it("User cannot claim tickets if same length for array arguments", async () => {
        await expectRevert(lottery.claimTickets("1", ["1999999", "1569999"], ["1"], { from: bob }), "Not same length");
      });

      it("User cannot claim tickets if not over", async () => {
        await expectRevert(
          lottery.claimTickets("2", ["1999995", "1569995"], ["1", "1"], { from: bob }),
          "Lottery not claimable"
        );
      });

      it("Cannot buy ticket when it is end time", async () => {
        // Time travel
        await time.increaseTo(endTime);
        await expectRevert(lottery.buyTickets("2", ["1269956", "1269955"], { from: bob }), "Lottery is over");
      });

      it("Cannot change generator number", async () => {
        await expectRevert(
          lottery.changeRandomGenerator(randomNumberGenerator.address, { from: alice }),
          "Lottery not in claimable"
        );
      });

      it("Operator cannot draw numbers if the lotteryId isn't updated in RandomGenerator", async () => {
        await randomNumberGenerator.setNextRandomResult("199999994", { from: alice });

        result = await lottery.closeLottery("2", { from: operator });
        expectEvent(result, "LotteryClose", { lotteryId: "2", firstTicketIdNextLottery: "113" });

        await expectRevert(
          lottery.drawFinalNumberAndMakeLotteryClaimable("2", false, { from: operator }),
          "Numbers not drawn"
        );

        await randomNumberGenerator.changeLatestLotteryId({ from: alice });

        // 0 winning ticket, funds are not rolled over
        result = await lottery.drawFinalNumberAndMakeLotteryClaimable("2", false, { from: operator });

        expectEvent(result, "LotteryNumberDrawn", {
          lotteryId: "2",
          finalNumber: "1999994",
          countWinningTickets: "0",
        });

        expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
          from: lottery.address,
          to: treasury,
          value: parseEther("3620.0804").toString(),
        });
      });

      it("Cannot claim for wrong lottery (too high)", async () => {
        await expectRevert(lottery.claimTickets("1", ["111"], ["5"], { from: david }), "TicketId too high");
      });

      it("Cannot claim for wrong lottery (too low)", async () => {
        await expectRevert(lottery.claimTickets("2", ["110"], ["5"], { from: david }), "TicketId too low");
      });

      it("Cannot claim for wrong lottery (too high)", async () => {
        await expectRevert(lottery.claimTickets("2", ["113"], ["5"], { from: david }), "TicketId too high");
      });

      it("Lottery starts, close, and numbers get drawn without a participant", async () => {
        endTime = new BN(await time.latest()).add(_lengthLottery);

        result = await lottery.startLottery(
          endTime,
          _priceTicketInCake,
          _discountDivisor,
          _rewardsBreakdown,
          _treasuryFee,
          { from: operator }
        );

        expectEvent(result, "LotteryOpen", {
          lotteryId: "3",
          startTime: (await time.latest()).toString(),
          endTime: endTime.toString(),
          priceTicketInCake: _priceTicketInCake.toString(),
          firstTicketId: "113",
          injectedAmount: "0",
        });

        await time.increaseTo(endTime);
        result = await lottery.closeLottery("3", { from: operator });
        expectEvent(result, "LotteryClose", { lotteryId: "3", firstTicketIdNextLottery: "113" });

        await randomNumberGenerator.changeLatestLotteryId({ from: alice });

        // 0 winner
        result = await lottery.drawFinalNumberAndMakeLotteryClaimable("3", true, { from: operator });

        expectEvent(result, "LotteryNumberDrawn", {
          lotteryId: "3",
          finalNumber: "1999994",
          countWinningTickets: "0",
        });

        await expectRevert(lottery.claimTickets("3", ["113"], ["1"], { from: david }), "TicketId too high");
      });

      it("Change the random generator (to existing one)", async () => {
        result = await lottery.changeRandomGenerator(randomNumberGenerator.address, { from: alice });
        expectEvent(result, "NewRandomGenerator", { randomGenerator: randomNumberGenerator.address });
      });

      it("Lottery starts with only 4 brackets with a prize, one user buys tickets", async () => {
        await randomNumberGenerator.setNextRandomResult("188888888", { from: alice });

        endTime = new BN(await time.latest()).add(_lengthLottery);

        const newRewardsBreakdown = ["1000", "0", "1500", "2500", "0", "5000"];

        result = await lottery.startLottery(
          endTime,
          _priceTicketInCake,
          _discountDivisor,
          newRewardsBreakdown,
          _treasuryFee,
          { from: operator }
        );

        expectEvent(result, "LotteryOpen", {
          lotteryId: "4",
          startTime: (await time.latest()).toString(),
          endTime: endTime.toString(),
          priceTicketInCake: _priceTicketInCake.toString(),
          firstTicketId: "113",
          injectedAmount: "0",
        });

        await lottery.injectFunds("4", parseEther("1000"), { from: injector });

        const _ticketsBought = ["1111118", "1222288", "1333888", "1448888", "1588888", "1888888"];

        // Total cost: 2.9925 CAKE
        result = await lottery.buyTickets("4", _ticketsBought, { from: carol });

        expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
          from: carol,
          to: lottery.address,
          value: parseEther("2.9925").toString(),
        });
      });

      it("Lottery close and numbers get drawn with only 4 brackets with a prize", async () => {
        await time.increaseTo(endTime);
        result = await lottery.closeLottery("4", { from: operator });
        expectEvent(result, "LotteryClose", { lotteryId: "4", firstTicketIdNextLottery: "119" });

        await randomNumberGenerator.changeLatestLotteryId({ from: alice });

        // 6 winning tickets
        result = await lottery.drawFinalNumberAndMakeLotteryClaimable("4", true, { from: operator });

        // 20% * 1002.9925 = 200.5985 CAKE
        expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
          from: lottery.address,
          to: treasury,
          value: parseEther("200.5985").toString(),
        });

        expectEvent(result, "LotteryNumberDrawn", {
          lotteryId: "4",
          finalNumber: "1888888",
          countWinningTickets: "6",
        });
      });

      it("User claims first ticket", async () => {
        // 802.394 CAKE to collect
        // Rewards: ["1000", "0", "1500", "2500", "0", "5000"];
        // 2 tickets with 1 matching --> 10% * 802.394 --> 80.2394 total --> 40.1197/ticket
        // 1 ticket with 3 matching --> 15% * 802.394 --> 120.3591 total --> 120.3591/ticket
        // 2 tickets with 4 matching --> 25% * 802.394 --> 200.5985 total --> 100.29925/ticket
        // 1 ticket with 6 matching --> 50% * 802.394 --> 401.197 total --> 401.197/ticket

        result = await lottery.claimTickets("4", ["113"], ["0"], { from: carol });

        expectEvent(result, "TicketsClaim", {
          claimer: carol,
          amount: parseEther("40.1197").toString(),
          lotteryId: "4",
          numberTickets: "1",
        });
      });

      it("User cannot claim ticket in a bracket if equals to 0", async () => {
        await expectRevert(lottery.claimTickets("4", ["114"], ["1"], { from: carol }), "No prize for this bracket");
        result = await lottery.claimTickets("4", ["114"], ["0"], { from: carol });

        expectEvent(result, "TicketsClaim", {
          claimer: carol,
          amount: parseEther("40.1197").toString(),
          lotteryId: "4",
          numberTickets: "1",
        });
      });

      it("User claims 2 more tickets", async () => {
        result = await lottery.claimTickets("4", ["115", "118"], ["2", "5"], { from: carol });

        expectEvent(result, "TicketsClaim", {
          claimer: carol,
          amount: parseEther("521.5561").toString(), // 120.3591 + 401.197 = 521.5561
          lotteryId: "4",
          numberTickets: "2",
        });
      });

      it("User cannot claim ticket in a lower bracket if bracket above is not 0", async () => {
        await expectRevert(lottery.claimTickets("4", ["116"], ["2"], { from: carol }), "Bracket must be higher");
        result = await lottery.claimTickets("4", ["116", "117"], ["3", "3"], { from: carol });

        expectEvent(result, "TicketsClaim", {
          claimer: carol,
          amount: parseEther("200.5985").toString(),
          lotteryId: "4",
          numberTickets: "2",
        });
      });
    });

    describe("Role exceptions", async () => {
      it("Owner can recover funds only if not CAKE token", async () => {
        // Deploy Random Token
        const randomToken = await MockERC20.new("Random Token", "RT", parseEther("100"), {
          from: alice,
        });

        // Transfer token by "accident"
        await randomToken.transfer(lottery.address, parseEther("1"));

        result = await lottery.recoverWrongTokens(randomToken.address, parseEther("1"), { from: alice });

        expectEvent(result, "AdminTokenRecovery", { token: randomToken.address, amount: parseEther("1").toString() });

        await expectRevert(
          lottery.recoverWrongTokens(mockCake.address, parseEther("1"), { from: alice }),
          "Cannot be CAKE token"
        );
      });

      it("Only operator can call operator functions", async () => {
        await expectRevert(
          lottery.startLottery(_lengthLottery, _priceTicketInCake, _discountDivisor, _rewardsBreakdown, _treasuryFee, {
            from: alice,
          }),
          "Not operator"
        );

        await expectRevert(lottery.closeLottery("2", { from: alice }), "Not operator");
        await expectRevert(lottery.drawFinalNumberAndMakeLotteryClaimable("2", false, { from: alice }), "Not operator");
      });

      it("Only owner/injector can call owner functions", async () => {
        await expectRevert(
          lottery.setMaxNumberTicketsPerBuy("1", { from: operator }),
          "Ownable: caller is not the owner"
        );

        await expectRevert(lottery.injectFunds("1", parseEther("10"), { from: operator }), "Not owner or injector");

        await expectRevert(
          lottery.setOperatorAndTreasuryAndInjectorAddresses(operator, treasury, injector, { from: operator }),
          "Ownable: caller is not the owner"
        );

        await expectRevert(
          lottery.recoverWrongTokens(mockCake.address, parseEther("10"), { from: operator }),
          "Ownable: caller is not the owner"
        );

        await expectRevert(
          lottery.changeRandomGenerator(randomNumberGenerator.address, { from: operator }),
          "Ownable: caller is not the owner"
        );
      });

      it("Revert statements work in owner functions", async () => {
        await expectRevert(lottery.setMaxNumberTicketsPerBuy("0", { from: alice }), "Must be > 0");
        await expectRevert(
          lottery.setOperatorAndTreasuryAndInjectorAddresses(operator, constants.ZERO_ADDRESS, injector, {
            from: alice,
          }),
          "Cannot be zero address"
        );
        await expectRevert(
          lottery.setOperatorAndTreasuryAndInjectorAddresses(constants.ZERO_ADDRESS, treasury, injector, {
            from: alice,
          }),
          "Cannot be zero address"
        );
        await expectRevert(
          lottery.setOperatorAndTreasuryAndInjectorAddresses(operator, treasury, constants.ZERO_ADDRESS, {
            from: alice,
          }),
          "Cannot be zero address"
        );
      });
    });
  });
});
