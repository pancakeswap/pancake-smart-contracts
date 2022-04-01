import { artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, constants, expectEvent, expectRevert, time, ether, balance } from "@openzeppelin/test-helpers";

const PancakePredictionV2 = artifacts.require("PancakePredictionV2");
const Oracle = artifacts.require("MockAggregatorV3");

const GAS_PRICE = 8000000000; // hardhat default
// BLOCK_COUNT_MULTPLIER: Only for test, because testing trx causes block to increment which exceeds blockBuffer time checks
// Note that the higher this value is, the slower the test will run
const BLOCK_COUNT_MULTPLIER = 5;
const DECIMALS = 8; // Chainlink default for BNB/USD
const INITIAL_PRICE = 10000000000; // $100, 8 decimal places
const INTERVAL_SECONDS = 20 * BLOCK_COUNT_MULTPLIER; // 20 seconds * multiplier
const BUFFER_SECONDS = 5 * BLOCK_COUNT_MULTPLIER; // 5 seconds * multplier, round must lock/end within this buffer
const MIN_BET_AMOUNT = ether("1"); // 1 BNB
const UPDATE_ALLOWANCE = 30 * BLOCK_COUNT_MULTPLIER; // 30s * multiplier
const INITIAL_REWARD_RATE = 0.9; // 90%
const INITIAL_TREASURY_RATE = 0.1; // 10%

// Enum: 0 = Bull, 1 = Bear
const Position = {
  Bull: 0,
  Bear: 1,
};

const calcGasCost = (gasUsed: number) => new BN(GAS_PRICE * gasUsed);

const assertBNArray = (arr1: any[], arr2: any | any[]) => {
  assert.equal(arr1.length, arr2.length);
  arr1.forEach((n1, index) => {
    assert.equal(n1.toString(), new BN(arr2[index]).toString());
  });
};

contract(
  "PancakePredictionV2",
  ([operator, admin, owner, bullUser1, bullUser2, bullUser3, bearUser1, bearUser2, bearUser3]) => {
    let currentEpoch: any;
    let oracle: { address: any; updateAnswer: (arg0: number) => any };
    let prediction: any;

    async function nextEpoch() {
      await time.increaseTo((await time.latest()).toNumber() + INTERVAL_SECONDS); // Elapse 20 seconds
    }

    beforeEach(async () => {
      oracle = await Oracle.new(DECIMALS, INITIAL_PRICE);

      prediction = await PancakePredictionV2.new(
        oracle.address,
        admin,
        operator,
        INTERVAL_SECONDS,
        BUFFER_SECONDS,
        MIN_BET_AMOUNT,
        UPDATE_ALLOWANCE,
        String(INITIAL_TREASURY_RATE * 10000),
        { from: owner }
      );
    });

    it("Initialize", async () => {
      assert.equal(await balance.current(prediction.address), 0);
      assert.equal(await prediction.currentEpoch(), 0);
      assert.equal(await prediction.intervalSeconds(), INTERVAL_SECONDS);
      assert.equal(await prediction.adminAddress(), admin);
      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal(await prediction.minBetAmount(), MIN_BET_AMOUNT.toString());
      assert.equal(await prediction.oracleUpdateAllowance(), UPDATE_ALLOWANCE);
      assert.equal(await prediction.genesisStartOnce(), false);
      assert.equal(await prediction.genesisLockOnce(), false);
      assert.equal(await prediction.paused(), false);
    });

    it("Should start genesis rounds (round 1, round 2, round 3)", async () => {
      // Manual block calculation
      let currentTimestamp = (await time.latest()).toNumber();

      // Epoch 0
      assert.equal((await time.latest()).toNumber(), currentTimestamp);
      assert.equal(await prediction.currentEpoch(), 0);

      // Epoch 1: Start genesis round 1
      let tx = await prediction.genesisStartRound();
      currentTimestamp++;
      expectEvent(tx, "StartRound", { epoch: new BN(1) });
      assert.equal(await prediction.currentEpoch(), 1);

      // Start round 1
      assert.equal(await prediction.genesisStartOnce(), true);
      assert.equal(await prediction.genesisLockOnce(), false);
      assert.equal((await prediction.rounds(1)).startTimestamp, currentTimestamp);
      assert.equal((await prediction.rounds(1)).lockTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await prediction.rounds(1)).closeTimestamp, currentTimestamp + INTERVAL_SECONDS * 2);
      assert.equal((await prediction.rounds(1)).epoch, 1);
      assert.equal((await prediction.rounds(1)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      // Epoch 2: Lock genesis round 1 and starts round 2
      tx = await prediction.genesisLockRound();
      currentTimestamp++;

      expectEvent(tx, "LockRound", {
        epoch: new BN(1),
        roundId: new BN(1),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "StartRound", { epoch: new BN(2) });
      assert.equal(await prediction.currentEpoch(), 2);

      // Lock round 1
      assert.equal(await prediction.genesisStartOnce(), true);
      assert.equal(await prediction.genesisLockOnce(), true);
      assert.equal((await prediction.rounds(1)).lockPrice, INITIAL_PRICE);

      // Start round 2
      assert.equal((await prediction.rounds(2)).startTimestamp, currentTimestamp);
      assert.equal((await prediction.rounds(2)).lockTimestamp, currentTimestamp + INTERVAL_SECONDS);
      assert.equal((await prediction.rounds(2)).closeTimestamp, currentTimestamp + 2 * INTERVAL_SECONDS);
      assert.equal((await prediction.rounds(2)).epoch, 2);
      assert.equal((await prediction.rounds(2)).totalAmount, 0);

      // Elapse 20 blocks
      currentTimestamp += INTERVAL_SECONDS;
      await time.increaseTo(currentTimestamp);

      // Epoch 3: End genesis round 1, locks round 2, starts round 3
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      tx = await prediction.executeRound();
      currentTimestamp += 2; // Oracle update and execute round

      expectEvent(tx, "EndRound", {
        epoch: new BN(1),
        roundId: new BN(2),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "LockRound", {
        epoch: new BN(2),
        roundId: new BN(2),
        price: new BN(INITIAL_PRICE),
      });

      expectEvent(tx, "StartRound", { epoch: new BN(3) });
      assert.equal(await prediction.currentEpoch(), 3);

      // End round 1
      assert.equal((await prediction.rounds(1)).closePrice, INITIAL_PRICE);

      // Lock round 2
      assert.equal((await prediction.rounds(2)).lockPrice, INITIAL_PRICE);
    });

    it("Should not start rounds before genesis start and lock round has triggered", async () => {
      await expectRevert(prediction.genesisLockRound(), "Can only run after genesisStartRound is triggered");
      await expectRevert(
        prediction.executeRound(),
        "Can only run after genesisStartRound and genesisLockRound is triggered"
      );

      await prediction.genesisStartRound();
      await expectRevert(
        prediction.executeRound(),
        "Can only run after genesisStartRound and genesisLockRound is triggered"
      );

      await nextEpoch();
      await prediction.genesisLockRound(); // Success

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound(); // Success
    });

    it("Should not lock round before lockTimestamp and end round before closeTimestamp", async () => {
      await prediction.genesisStartRound();
      await expectRevert(prediction.genesisLockRound(), "Can only lock round after lockTimestamp");
      await nextEpoch();
      await prediction.genesisLockRound();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(prediction.executeRound(), "Can only lock round after lockTimestamp");

      await nextEpoch();
      await prediction.executeRound(); // Success
    });

    it("Should record oracle price", async () => {
      // Epoch 1
      await prediction.genesisStartRound();
      assert.equal((await prediction.rounds(1)).lockPrice, 0);
      assert.equal((await prediction.rounds(1)).closePrice, 0);

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await prediction.genesisLockRound(); // For round 1
      assert.equal((await prediction.rounds(1)).lockPrice, price120);
      assert.equal((await prediction.rounds(1)).closePrice, 0);
      assert.equal((await prediction.rounds(2)).lockPrice, 0);
      assert.equal((await prediction.rounds(2)).closePrice, 0);

      // Epoch 3
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await prediction.executeRound();
      assert.equal((await prediction.rounds(1)).lockPrice, price120);
      assert.equal((await prediction.rounds(1)).closePrice, price130);
      assert.equal((await prediction.rounds(2)).lockPrice, price130);
      assert.equal((await prediction.rounds(2)).closePrice, 0);
      assert.equal((await prediction.rounds(3)).lockPrice, 0);
      assert.equal((await prediction.rounds(3)).closePrice, 0);

      // Epoch 4
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140);
      await prediction.executeRound();
      assert.equal((await prediction.rounds(1)).lockPrice, price120);
      assert.equal((await prediction.rounds(1)).closePrice, price130);
      assert.equal((await prediction.rounds(2)).lockPrice, price130);
      assert.equal((await prediction.rounds(2)).closePrice, price140);
      assert.equal((await prediction.rounds(3)).lockPrice, price140);
      assert.equal((await prediction.rounds(3)).closePrice, 0);
      assert.equal((await prediction.rounds(4)).lockPrice, 0);
      assert.equal((await prediction.rounds(4)).closePrice, 0);
    });

    it("Should reject oracle data if data is stale", async () => {
      await prediction.genesisStartRound();
      await nextEpoch();
      await prediction.genesisLockRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();

      // Oracle not updated, so roundId is same as previously recorded
      await nextEpoch();
      await expectRevert(prediction.executeRound(), "Oracle update roundId must be larger than oracleLatestRoundId");
    });

    it("Should record data and user bets", async () => {
      // Epoch 1
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1.1") }); // 1.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1.2") }); // 1.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1.4") }); // 1.4 BNB

      assert.equal((await balance.current(prediction.address)).toString(), ether("3.7").toString()); // 3.7 BNB
      assert.equal((await prediction.rounds(1)).totalAmount, ether("3.7").toString()); // 3.7 BNB
      assert.equal((await prediction.rounds(1)).bullAmount, ether("2.3").toString()); // 2.3 BNB
      assert.equal((await prediction.rounds(1)).bearAmount, ether("1.4").toString()); // 1.4 BNB
      assert.equal((await prediction.ledger(1, bullUser1)).position, Position.Bull);
      assert.equal((await prediction.ledger(1, bullUser1)).amount, ether("1.1").toString());
      assert.equal((await prediction.ledger(1, bullUser2)).position, Position.Bull);
      assert.equal((await prediction.ledger(1, bullUser2)).amount, ether("1.2").toString());
      assert.equal((await prediction.ledger(1, bearUser1)).position, Position.Bear);
      assert.equal((await prediction.ledger(1, bearUser1)).amount, ether("1.4").toString());
      assertBNArray((await prediction.getUserRounds(bullUser1, 0, 1))[0], [1]);
      assertBNArray((await prediction.getUserRounds(bullUser2, 0, 1))[0], [1]);
      assertBNArray((await prediction.getUserRounds(bearUser1, 0, 1))[0], [1]);
      assert.equal(await prediction.getUserRoundsLength(bullUser1), 1);

      // Epoch 2
      await nextEpoch();
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("2.1") }); // 2.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2.2") }); // 2.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("2.4") }); // 2.4 BNB

      assert.equal((await balance.current(prediction.address)).toString(), ether("10.4").toString()); // 10.4 BNB (3.7+6.7)
      assert.equal((await prediction.rounds(2)).totalAmount, ether("6.7").toString()); // 6.7 BNB
      assert.equal((await prediction.rounds(2)).bullAmount, ether("4.3").toString()); // 4.3 BNB
      assert.equal((await prediction.rounds(2)).bearAmount, ether("2.4").toString()); // 2.4 BNB
      assert.equal((await prediction.ledger(2, bullUser1)).position, Position.Bull);
      assert.equal((await prediction.ledger(2, bullUser1)).amount, ether("2.1").toString());
      assert.equal((await prediction.ledger(2, bullUser2)).position, Position.Bull);
      assert.equal((await prediction.ledger(2, bullUser2)).amount, ether("2.2").toString());
      assert.equal((await prediction.ledger(2, bearUser1)).position, Position.Bear);
      assert.equal((await prediction.ledger(2, bearUser1)).amount, ether("2.4").toString());
      assertBNArray((await prediction.getUserRounds(bullUser1, 0, 2))[0], [1, 2]);
      assertBNArray((await prediction.getUserRounds(bullUser2, 0, 2))[0], [1, 2]);
      assertBNArray((await prediction.getUserRounds(bearUser1, 0, 2))[0], [1, 2]);
      assert.equal(await prediction.getUserRoundsLength(bullUser1), 2);

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("3.1").toString() }); // 3.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("3.2").toString() }); // 3.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("3.4").toString() }); // 4.3 BNB

      assert.equal((await balance.current(prediction.address)).toString(), ether("20.1").toString()); // 20.1 BNB (3.7+6.7+9.7)
      assert.equal((await prediction.rounds(3)).totalAmount, ether("9.7").toString()); // 9.7 BNB
      assert.equal((await prediction.rounds(3)).bullAmount, ether("6.3").toString()); // 6.3 BNB
      assert.equal((await prediction.rounds(3)).bearAmount, ether("3.4").toString()); // 3.4 BNB
      assert.equal((await prediction.ledger(3, bullUser1)).position, Position.Bull);
      assert.equal((await prediction.ledger(3, bullUser1)).amount, ether("3.1").toString());
      assert.equal((await prediction.ledger(3, bullUser2)).position, Position.Bull);
      assert.equal((await prediction.ledger(3, bullUser2)).amount, ether("3.2").toString());
      assert.equal((await prediction.ledger(3, bearUser1)).position, Position.Bear);
      assert.equal((await prediction.ledger(3, bearUser1)).amount, ether("3.4").toString());
      assertBNArray((await prediction.getUserRounds(bullUser1, 0, 3))[0], [1, 2, 3]);
      assertBNArray((await prediction.getUserRounds(bullUser2, 0, 3))[0], [1, 2, 3]);
      assertBNArray((await prediction.getUserRounds(bearUser1, 0, 3))[0], [1, 2, 3]);
      assert.equal(await prediction.getUserRoundsLength(bullUser1), 3);

      // Epoch 4
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("4.1").toString() }); // 4.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("4.2").toString() }); // 4.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4.4").toString() }); // 4.4 BNB

      assert.equal((await balance.current(prediction.address)).toString(), ether("32.8").toString()); // 32.8 BNB (3.7+6.7+9.7+12.7)
      assert.equal((await prediction.rounds(4)).totalAmount, ether("12.7").toString()); // 12.7 BNB
      assert.equal((await prediction.rounds(4)).bullAmount, ether("8.3").toString()); // 8.3 BNB
      assert.equal((await prediction.rounds(4)).bearAmount, ether("4.4").toString()); // 4.4 BNB
      assert.equal((await prediction.ledger(4, bullUser1)).position, Position.Bull);
      assert.equal((await prediction.ledger(4, bullUser1)).amount, ether("4.1").toString());
      assert.equal((await prediction.ledger(4, bullUser2)).position, Position.Bull);
      assert.equal((await prediction.ledger(4, bullUser2)).amount, ether("4.2").toString());
      assert.equal((await prediction.ledger(4, bearUser1)).position, Position.Bear);
      assert.equal((await prediction.ledger(4, bearUser1)).amount, ether("4.4").toString());
      assertBNArray((await prediction.getUserRounds(bullUser1, 0, 4))[0], [1, 2, 3, 4]);
      assertBNArray((await prediction.getUserRounds(bullUser2, 0, 4))[0], [1, 2, 3, 4]);
      assertBNArray((await prediction.getUserRounds(bearUser1, 0, 4))[0], [1, 2, 3, 4]);
      assert.equal(await prediction.getUserRoundsLength(bullUser1), 4);
    });

    it("Should not allow multiple bets", async () => {
      // Epoch 1
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );

      // Epoch 2
      await nextEpoch();
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bullUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }); // Success
      await expectRevert(
        prediction.betBull(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );
      await expectRevert(
        prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }),
        "Can only bet once per round"
      );
    });

    it("Should not allow bets lesser than minimum bet amount", async () => {
      // Epoch 1
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("0.5") }),
        "Bet amount must be greater than minBetAmount"
      ); // 0.5 BNB
      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success

      // Epoch 2
      await nextEpoch();
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("0.5") }),
        "Bet amount must be greater than minBetAmount"
      ); // 0.5 BNB
      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success

      // Epoch 3
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await expectRevert(
        prediction.betBull(currentEpoch, { from: bullUser1, value: ether("0.5") }),
        "Bet amount must be greater than minBetAmount"
      ); // 0.5 BNB
      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // Success
    });

    it("Should record rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1.1") }); // 1.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1.2") }); // 1.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1.4") }); // 1.4 BNB

      assert.equal((await prediction.rounds(1)).rewardBaseCalAmount, 0);
      assert.equal((await prediction.rounds(1)).rewardAmount, 0);
      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal((await balance.current(prediction.address)).toString(), ether("3.7").toString());

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("2.1") }); // 2.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2.2") }); // 2.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("2.4") }); // 2.4 BNB

      assert.equal((await prediction.rounds(1)).rewardBaseCalAmount, 0);
      assert.equal((await prediction.rounds(1)).rewardAmount, 0);
      assert.equal((await prediction.rounds(2)).rewardBaseCalAmount, 0);
      assert.equal((await prediction.rounds(2)).rewardAmount, 0);
      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal((await balance.current(prediction.address)).toString(), ether("3.7").add(ether("6.7")).toString());

      // Epoch 3, Round 1 is Bull (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("3.1").toString() }); // 3.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("3.2").toString() }); // 3.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("3.4").toString() }); // 3.4 BNB

      assert.equal((await prediction.rounds(1)).rewardBaseCalAmount, ether("2.3").toString()); // 2.3 BNB, Bull total
      assert.equal((await prediction.rounds(1)).rewardAmount, ether("3.7") * INITIAL_REWARD_RATE); // 3.33 BNB, Total * rewardRate
      assert.equal((await prediction.rounds(2)).rewardBaseCalAmount, 0);
      assert.equal((await prediction.rounds(2)).rewardAmount, 0);
      assert.equal(await prediction.treasuryAmount(), ether("3.7") * INITIAL_TREASURY_RATE); // 3.7 BNB, Total * treasuryRate
      assert.equal(
        (await balance.current(prediction.address)).toString(),
        ether("3.7").add(ether("6.7")).add(ether("9.7")).toString()
      );

      // Epoch 4, Round 2 is Bear (100 < 130)
      await nextEpoch();
      const price100 = 10000000000; // $100
      await oracle.updateAnswer(price100);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("4.1").toString() }); // 4.1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("4.2").toString() }); // 4.2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4.4").toString() }); // 4.4 BNB

      assert.equal((await prediction.rounds(1)).rewardBaseCalAmount, ether("2.3").toString()); // 2.3 BNB, Bull total
      assert.equal((await prediction.rounds(1)).rewardAmount, ether("3.7") * INITIAL_REWARD_RATE); // 3.33 BNB, Total * rewardRate
      assert.equal((await prediction.rounds(2)).rewardBaseCalAmount, ether("2.4").toString()); // 2.4 BNB, Bear total
      assert.equal((await prediction.rounds(2)).rewardAmount, ether("6.7") * INITIAL_REWARD_RATE); // 6.7 BNB, Total * rewardRate
      assert.equal(await prediction.treasuryAmount(), ether("3.7").add(ether("6.7")) * INITIAL_TREASURY_RATE); // 10.4, Accumulative treasury
      assert.equal(
        (await balance.current(prediction.address)).toString(),
        ether("3.7").add(ether("6.7")).add(ether("9.7")).add(ether("12.7")).toString()
      );
    });

    it("Should not lock round before lockTimestamp", async () => {
      await prediction.genesisStartRound();
      await nextEpoch();
      await prediction.genesisLockRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();

      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(prediction.executeRound(), "Can only lock round after lockTimestamp");
      await nextEpoch();
      await prediction.executeRound(); // Success
    });

    it("Should claim rewards", async () => {
      const bullUser1Tracker = await balance.tracker(bullUser1);
      const bullUser2Tracker = await balance.tracker(bullUser2);
      const bearUser1Tracker = await balance.tracker(bearUser1);

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // 1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2") }); // 2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4") }); // 4 BNB

      assert.equal(await prediction.claimable(1, bullUser1), false);
      assert.equal(await prediction.claimable(1, bullUser2), false);
      assert.equal(await prediction.claimable(1, bearUser1), false);
      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([1], { from: bullUser2 }), "Round has not ended");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bullUser1 }), "Round has not started");
      await expectRevert(prediction.claim([2], { from: bullUser2 }), "Round has not started");
      await expectRevert(prediction.claim([2], { from: bearUser1 }), "Round has not started");

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("21") }); // 21 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("22") }); // 22 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("24") }); // 24 BNB

      assert.equal(await prediction.claimable(1, bullUser1), false);
      assert.equal(await prediction.claimable(1, bullUser2), false);
      assert.equal(await prediction.claimable(1, bearUser1), false);
      assert.equal(await prediction.claimable(2, bullUser1), false);
      assert.equal(await prediction.claimable(2, bullUser2), false);
      assert.equal(await prediction.claimable(2, bearUser1), false);
      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([1], { from: bullUser2 }), "Round has not ended");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bullUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bullUser2 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bearUser1 }), "Round has not ended");

      // Epoch 3, Round 1 is Bull (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await prediction.executeRound();

      assert.equal(await prediction.claimable(1, bullUser1), true);
      assert.equal(await prediction.claimable(1, bullUser2), true);
      assert.equal(await prediction.claimable(1, bearUser1), false);
      assert.equal(await prediction.claimable(2, bullUser1), false);
      assert.equal(await prediction.claimable(2, bullUser2), false);
      assert.equal(await prediction.claimable(2, bearUser1), false);

      // Claim for Round 1: Total rewards = 3.7, Bull = 2.3, Bear = 1.4
      await bullUser1Tracker.get();
      await bullUser2Tracker.get();

      let tx = await prediction.claim([1], { from: bullUser1 }); // Success
      let gasUsed = tx.receipt.gasUsed;

      expectEvent(tx, "Claim", { sender: bullUser1, epoch: new BN("1"), amount: ether("2.1") }); // 2.1 = 1/3 * (7*0.9)
      assert.equal((await bullUser1Tracker.delta()).toString(), ether("2.1").sub(calcGasCost(gasUsed)).toString());

      tx = await prediction.claim([1], { from: bullUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;

      expectEvent(tx, "Claim", { sender: bullUser2, epoch: new BN("1"), amount: ether("4.2") }); // 4.2 = 2/3 * (7*0.9)
      assert.equal((await bullUser2Tracker.delta()).toString(), ether("4.2").sub(calcGasCost(gasUsed)).toString());

      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2], { from: bullUser1 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bullUser2 }), "Round has not ended");
      await expectRevert(prediction.claim([2], { from: bearUser1 }), "Round has not ended");

      // Epoch 4, Round 2 is Bear (100 < 130)
      await nextEpoch();
      const price100 = 10000000000; // $100
      await oracle.updateAnswer(price100);
      await prediction.executeRound();

      assert.equal(await prediction.claimable(1, bullUser1), false); // User has claimed
      assert.equal(await prediction.claimable(1, bullUser2), false); // User has claimed
      assert.equal(await prediction.claimable(1, bearUser1), false);
      assert.equal(await prediction.claimable(2, bullUser1), false);
      assert.equal(await prediction.claimable(2, bullUser2), false);
      assert.equal(await prediction.claimable(2, bearUser1), true);

      // Claim for Round 2: Total rewards = 67, Bull = 43, Bear = 24
      await bearUser1Tracker.get();

      tx = await prediction.claim([2], { from: bearUser1 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: bearUser1, epoch: new BN("2"), amount: ether("60.3") }); // 24 = 24/24 * (67*0.9)
      assert.equal((await bearUser1Tracker.delta()).toString(), ether("60.3").sub(calcGasCost(gasUsed)).toString());

      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1], { from: bullUser2 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2], { from: bullUser2 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2], { from: bearUser1 }), "Not eligible for claim");
    });

    it("Should multi claim rewards", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // 1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2") }); // 2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4") }); // 4 BNB

      assert.equal(await prediction.claimable(1, bullUser1), false);
      assert.equal(await prediction.claimable(1, bullUser2), false);
      assert.equal(await prediction.claimable(1, bearUser1), false);

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("21") }); // 21 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("22") }); // 22 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("24") }); // 24 BNB

      // Epoch 3, Round 1 is Bull (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await prediction.executeRound();

      assert.equal(await prediction.claimable(1, bullUser1), true);
      assert.equal(await prediction.claimable(1, bullUser2), true);
      assert.equal(await prediction.claimable(1, bearUser1), false);
      assert.equal(await prediction.claimable(2, bullUser1), false);
      assert.equal(await prediction.claimable(2, bullUser2), false);
      assert.equal(await prediction.claimable(2, bearUser1), false);

      // Epoch 4, Round 2 is Bull (140 > 130)
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140);
      await prediction.executeRound();

      assert.equal(await prediction.claimable(1, bullUser1), true);
      assert.equal(await prediction.claimable(1, bullUser2), true);
      assert.equal(await prediction.claimable(1, bearUser1), false);
      assert.equal(await prediction.claimable(2, bullUser1), true);
      assert.equal(await prediction.claimable(2, bullUser2), true);
      assert.equal(await prediction.claimable(2, bearUser1), false);

      await expectRevert(prediction.claim([2, 2], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1, 1], { from: bullUser1 }), "Not eligible for claim");

      const bullUser1Tracker = await balance.tracker(bullUser1);
      const bullUser2Tracker = await balance.tracker(bullUser2);

      let tx = await prediction.claim([1, 2], { from: bullUser1 }); // Success
      let gasUsed = tx.receipt.gasUsed;

      // 2.1 = 1/3 * (7*0.9) + // 29.4488372093 = 21 / 43 * (67 * 0.9) = 29.448837209302325581
      expectEvent(tx, "Claim", { sender: bullUser1, epoch: new BN("1"), amount: ether("2.1") });

      // Manual event handling for second event with same name from the same contract
      assert.equal(tx.logs[1].args.sender, bullUser1);
      assert.equal(tx.logs[1].args.epoch, "2");
      assert.equal(tx.logs[1].args.amount.toString(), ether("29.448837209302325581").toString());

      assert.equal(
        (await bullUser1Tracker.delta()).toString(),
        ether("31.548837209302325581").sub(calcGasCost(gasUsed)).toString()
      );

      tx = await prediction.claim([1, 2], { from: bullUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;

      // 4.2 = 2/3 * (7*0.9) + // 30.851162790697674418 = 22 / 43 * (67 * 0.9) = 35.051162790697674418 BNB
      expectEvent(tx, "Claim", { sender: bullUser2, epoch: new BN("1"), amount: ether("4.2") });

      // Manual event handling for second event with same name from the same contract
      assert.equal(tx.logs[1].args.sender, bullUser2);
      assert.equal(tx.logs[1].args.epoch, "2");
      assert.equal(tx.logs[1].args.amount.toString(), ether("30.851162790697674418").toString());

      assert.equal(
        (await bullUser2Tracker.delta()).toString(),
        ether("35.051162790697674418").sub(calcGasCost(gasUsed)).toString()
      );

      await expectRevert(prediction.claim([1, 2], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2, 1], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1, 2], { from: bullUser2 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2, 1], { from: bullUser2 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([2], { from: bearUser1 }), "Not eligible for claim");
    });

    it("Should record house wins", async () => {
      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // 1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2") }); // 2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4") }); // 4 BNB

      // Epoch 2
      await nextEpoch();
      await oracle.updateAnswer(price110);
      await prediction.genesisLockRound(); // For round 1

      // Epoch 3, Round 1 is Same (110 == 110), House wins
      await nextEpoch();
      await oracle.updateAnswer(price110);
      await prediction.executeRound();

      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1], { from: bullUser2 }), "Not eligible for claim");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Not eligible for claim");
      assert.equal((await prediction.treasuryAmount()).toString(), ether("7").toString()); // 7 = 1+2+4
    });

    it("Should claim treasury rewards", async () => {
      const adminTracker = await balance.tracker(admin);
      let predictionCurrentBNB = ether("0");
      assert.equal(await balance.current(prediction.address), 0);

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // 1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2") }); // 2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4") }); // 4 BNB
      predictionCurrentBNB = predictionCurrentBNB.add(ether("7"));

      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());

      // Epoch 2
      await nextEpoch();
      const price120 = 12000000000; // $120
      await oracle.updateAnswer(price120);
      await prediction.genesisLockRound(); // For round 1
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("21") }); // 21 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("22") }); // 22 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("24") }); // 24 BNB
      predictionCurrentBNB = predictionCurrentBNB.add(ether("67"));

      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());

      // Epoch 3, Round 1 is Bull (130 > 120)
      await nextEpoch();
      const price130 = 13000000000; // $130
      await oracle.updateAnswer(price130);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("31") }); // 31 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("32") }); // 32 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("34") }); // 34 BNB
      predictionCurrentBNB = predictionCurrentBNB.add(ether("97"));

      // Admin claim for Round 1
      await adminTracker.get();
      assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());
      assert.equal((await prediction.treasuryAmount()).toString(), ether("0.7").toString()); // 0.7 = 7 * 0.1
      let tx = await prediction.claimTreasury({ from: admin }); // Success
      let gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "TreasuryClaim", { amount: ether("0.7") });
      assert.equal((await adminTracker.delta()).toString(), ether("0.7").sub(calcGasCost(gasUsed)).toString());
      assert.equal(await prediction.treasuryAmount(), 0); // Empty
      predictionCurrentBNB = predictionCurrentBNB.sub(ether("0.7"));
      assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());

      // Epoch 4
      await nextEpoch();
      const price140 = 14000000000; // $140
      await oracle.updateAnswer(price140); // Prevent house from winning
      await prediction.executeRound();
      assert.equal((await prediction.treasuryAmount()).toString(), ether("6.7").toString()); // 6.7 = (21+22+24) * 0.1

      // Epoch 5
      await nextEpoch();
      const price150 = 15000000000; // $150
      await oracle.updateAnswer(price150); // Prevent house from winning
      await prediction.executeRound();

      // Admin claim for Round 1 and 2
      await adminTracker.get();
      assert.equal((await prediction.treasuryAmount()).toString(), ether("6.7").add(ether("9.7")).toString()); // 9.7 = (31+32+34) * 0.1
      tx = await prediction.claimTreasury({ from: admin }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "TreasuryClaim", { amount: ether("16.4") }); // 16.4 = 6.7 + 9.7
      assert.equal((await adminTracker.delta()).toString(), ether("16.4").sub(calcGasCost(gasUsed)).toString());
      assert.equal(await prediction.treasuryAmount(), 0); // Empty
      predictionCurrentBNB = predictionCurrentBNB.sub(ether("16.4"));
      assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());
    });

    it("Admin/Owner function work as expected", async () => {
      await prediction.pause({ from: admin });
      let tx = await prediction.setBufferAndIntervalSeconds("50", "100", { from: admin });

      expectEvent(tx, "NewBufferAndIntervalSeconds", { bufferSeconds: "50", intervalSeconds: "100" });

      await expectRevert(
        prediction.setBufferAndIntervalSeconds("100", "99", { from: admin }),
        "bufferSeconds must be inferior to intervalSeconds"
      );

      await expectRevert(
        prediction.setBufferAndIntervalSeconds("100", "100", { from: admin }),
        "bufferSeconds must be inferior to intervalSeconds"
      );

      tx = await prediction.setMinBetAmount("50", { from: admin });
      expectEvent(tx, "NewMinBetAmount", { minBetAmount: "50" });
      await expectRevert(prediction.setMinBetAmount("0", { from: admin }), "Must be superior to 0");

      tx = await prediction.setOperator(admin, { from: admin });
      expectEvent(tx, "NewOperatorAddress", { operator: admin });
      await expectRevert(prediction.setOperator(constants.ZERO_ADDRESS, { from: admin }), "Cannot be zero address");

      tx = await prediction.setOracle(oracle.address, { from: admin });
      expectEvent(tx, "NewOracle", { oracle: oracle.address });
      await expectRevert(prediction.setOracle(constants.ZERO_ADDRESS, { from: admin }), "Cannot be zero address");

      // Sanity checks for oracle interface implementation
      // EOA
      await expectRevert(prediction.setOracle(admin, { from: admin }), "function call to a non-contract account");
      // Other contract
      await expectRevert(
        prediction.setOracle(prediction.address, { from: admin }),
        "function selector was not recognized and there's no fallback function"
      );

      tx = await prediction.setOracleUpdateAllowance("30", { from: admin });
      expectEvent(tx, "NewOracleUpdateAllowance", { oracleUpdateAllowance: "30" });

      tx = await prediction.setTreasuryFee("300", { from: admin });
      expectEvent(tx, "NewTreasuryFee", { epoch: "0", treasuryFee: "300" });

      await expectRevert(prediction.setTreasuryFee("3000", { from: admin }), "Treasury fee too high");

      tx = await prediction.setAdmin(owner, { from: owner });
      expectEvent(tx, "NewAdminAddress", { admin: owner });
      await expectRevert(prediction.setAdmin(constants.ZERO_ADDRESS, { from: owner }), "Cannot be zero address");
    });

    it("Should reject operator functions when not operator", async () => {
      await expectRevert(prediction.genesisLockRound({ from: admin }), "Not operator");
      await expectRevert(prediction.genesisStartRound({ from: admin }), "Not operator");
      await expectRevert(prediction.executeRound({ from: admin }), "Not operator");
    });

    it("Should reject admin/owner functions when not admin/owner", async () => {
      await expectRevert(prediction.claimTreasury({ from: bullUser1 }), "Not admin");
      await expectRevert(prediction.pause({ from: bullUser1 }), "Not operator/admin");
      await prediction.pause({ from: admin });
      await expectRevert(prediction.unpause({ from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setBufferAndIntervalSeconds("50", "100", { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setMinBetAmount("0", { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setOperator(bearUser1, { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setOracle(bearUser1, { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setOracleUpdateAllowance("0", { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.setTreasuryFee("100", { from: bullUser1 }), "Not admin");
      await expectRevert(prediction.unpause({ from: bullUser1 }), "Not admin");
      await prediction.unpause({ from: admin });
      await expectRevert(prediction.setAdmin(admin, { from: admin }), "Ownable: caller is not the owner");
      await expectRevert(prediction.setAdmin(bullUser1, { from: bullUser1 }), "Ownable: caller is not the owner");
    });

    it("Should reject admin/owner functions when not paused", async () => {
      await expectRevert(prediction.setBufferAndIntervalSeconds("50", "100", { from: admin }), "Pausable: not paused");
      await expectRevert(prediction.setMinBetAmount("0", { from: admin }), "Pausable: not paused");
      await expectRevert(prediction.setOracle(bearUser1, { from: admin }), "Pausable: not paused");
      await expectRevert(prediction.setOracleUpdateAllowance("0", { from: admin }), "Pausable: not paused");
      await expectRevert(prediction.setTreasuryFee("100", { from: admin }), "Pausable: not paused");
      await expectRevert(prediction.unpause({ from: admin }), "Pausable: not paused");
    });

    it("Should refund rewards", async () => {
      const bullUser1Tracker = await balance.tracker(bullUser1);
      const bullUser2Tracker = await balance.tracker(bullUser2);
      const bearUser1Tracker = await balance.tracker(bearUser1);

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }); // 1 BNB
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("2") }); // 2 BNB
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("4") }); // 4 BNB

      assert.equal(await prediction.refundable(1, bullUser1), false);
      assert.equal(await prediction.refundable(1, bullUser2), false);
      assert.equal(await prediction.refundable(1, bearUser1), false);
      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal((await balance.current(prediction.address)).toString(), ether("7").toString());

      // Epoch 2
      await nextEpoch();
      await prediction.genesisLockRound();
      currentEpoch = await prediction.currentEpoch();

      assert.equal(await prediction.refundable(1, bullUser1), false);
      assert.equal(await prediction.refundable(1, bullUser2), false);
      assert.equal(await prediction.refundable(1, bearUser1), false);

      // Epoch 3 (missed)
      await nextEpoch();

      // Epoch 4
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(prediction.executeRound(), "Can only lock round within bufferSeconds");

      // Refund for Round 1
      await bullUser1Tracker.get();
      await bullUser2Tracker.get();
      await bearUser1Tracker.get();

      assert.equal(await prediction.refundable(1, bullUser1), true);
      assert.equal(await prediction.refundable(1, bullUser2), true);
      assert.equal(await prediction.refundable(1, bearUser1), true);

      let tx = await prediction.claim([1], { from: bullUser1 }); // Success
      let gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: bullUser1, epoch: new BN("1"), amount: ether("1") }); // 1, 100% of bet amount
      assert.equal((await bullUser1Tracker.delta()).toString(), ether("1").sub(calcGasCost(gasUsed)).toString());

      tx = await prediction.claim([1], { from: bullUser2 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: bullUser2, epoch: new BN(1), amount: ether("2") }); // 2, 100% of bet amount
      assert.equal((await bullUser2Tracker.delta()).toString(), ether("2").sub(calcGasCost(gasUsed)).toString());

      tx = await prediction.claim([1], { from: bearUser1 }); // Success
      gasUsed = tx.receipt.gasUsed;
      expectEvent(tx, "Claim", { sender: bearUser1, epoch: new BN(1), amount: ether("4") }); // 4, 100% of bet amount
      assert.equal((await bearUser1Tracker.delta()).toString(), ether("4").sub(calcGasCost(gasUsed)).toString());

      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Not eligible for refund");
      await expectRevert(prediction.claim([1], { from: bullUser2 }), "Not eligible for refund");
      await expectRevert(prediction.claim([1], { from: bearUser1 }), "Not eligible for refund");

      // Treasury amount should be empty
      assert.equal(await prediction.treasuryAmount(), 0);
      assert.equal(await balance.current(prediction.address), 0);
    });

    it("Rejections for bet bulls/bears work as expected", async () => {
      // Epoch 0
      await expectRevert(prediction.betBull("0", { from: bullUser1, value: ether("1") }), "Round not bettable");
      await expectRevert(prediction.betBear("0", { from: bullUser1, value: ether("1") }), "Round not bettable");
      await expectRevert(prediction.betBull("1", { from: bullUser1, value: ether("1") }), "Bet is too early/late");
      await expectRevert(prediction.betBear("1", { from: bullUser1, value: ether("1") }), "Bet is too early/late");

      // Epoch 1
      const price110 = 11000000000; // $110
      await oracle.updateAnswer(price110);
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();
      await expectRevert(prediction.betBull("2", { from: bullUser1, value: ether("1") }), "Bet is too early/late");
      await expectRevert(prediction.betBear("2", { from: bullUser1, value: ether("1") }), "Bet is too early/late");

      // Bets must be higher (or equal) than minBetAmount
      await expectRevert(
        prediction.betBear("1", { from: bullUser1, value: ether("0.999999") }),
        "Bet amount must be greater than minBetAmount"
      );
      await expectRevert(
        prediction.betBull("1", { from: bullUser1, value: ether("0.999999") }),
        "Bet amount must be greater than minBetAmount"
      );
    });
    it("Rejections for genesis start and lock rounds work as expected", async () => {
      await expectRevert(
        prediction.executeRound(),
        "Can only run after genesisStartRound and genesisLockRound is triggered"
      );

      // Epoch 1
      await prediction.genesisStartRound();
      await expectRevert(prediction.genesisStartRound(), "Can only run genesisStartRound once");
      await expectRevert(prediction.genesisLockRound(), "Can only lock round after lockTimestamp");

      // Advance to next epoch
      await nextEpoch();
      await nextEpoch();

      await expectRevert(prediction.genesisLockRound(), "Can only lock round within bufferSeconds");

      await expectRevert(
        prediction.executeRound(),
        "Can only run after genesisStartRound and genesisLockRound is triggered"
      );

      // Cannot restart genesis round
      await expectRevert(prediction.genesisStartRound(), "Can only run genesisStartRound once");

      // Admin needs to pause, then unpause
      await prediction.pause({ from: admin });
      await prediction.unpause({ from: admin });

      // Prediction restart
      await prediction.genesisStartRound();

      await nextEpoch();

      // Lock the round
      await prediction.genesisLockRound();
      await nextEpoch();
      await expectRevert(prediction.genesisLockRound(), "Can only run genesisLockRound once");

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await expectRevert(prediction.executeRound(), "Can only lock round within bufferSeconds");
    });

    it("Should prevent betting when paused", async () => {
      await prediction.genesisStartRound();
      await nextEpoch();
      await prediction.genesisLockRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
      await prediction.executeRound();

      let tx = await prediction.pause({ from: admin });
      expectEvent(tx, "Pause", { epoch: new BN(3) });
      await expectRevert(prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") }), "Pausable: paused");
      await expectRevert(prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") }), "Pausable: paused");
      await expectRevert(prediction.claim([1], { from: bullUser1 }), "Not eligible for claim"); // Success
    });

    it("Should prevent round operations when paused", async () => {
      await prediction.genesisStartRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.genesisLockRound();
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.executeRound();

      let tx = await prediction.pause({ from: admin });
      expectEvent(tx, "Pause", { epoch: new BN(3) });
      await expectRevert(prediction.executeRound(), "Pausable: paused");
      await expectRevert(prediction.genesisStartRound(), "Pausable: paused");
      await expectRevert(prediction.genesisLockRound(), "Pausable: paused");

      // Unpause and resume
      await nextEpoch(); // Goes to next epoch block number, but doesn't increase currentEpoch
      tx = await prediction.unpause({ from: admin });
      expectEvent(tx, "Unpause", { epoch: new BN(3) }); // Although nextEpoch is called, currentEpoch doesn't change
      await prediction.genesisStartRound(); // Success
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.genesisLockRound(); // Success
      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.executeRound(); // Success
    });

    it("Should paginate user rounds", async () => {
      await prediction.genesisStartRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") });
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1") });
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.genesisLockRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") });
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1") });
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") });
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1") });
      await prediction.betBear(currentEpoch, { from: bearUser1, value: ether("1") });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") });
      await prediction.betBull(currentEpoch, { from: bullUser2, value: ether("1") });

      await nextEpoch();
      await oracle.updateAnswer(INITIAL_PRICE);
      await prediction.executeRound();
      currentEpoch = await prediction.currentEpoch();

      await prediction.betBull(currentEpoch, { from: bullUser1, value: ether("1") });

      // Get by page size of 2
      const pageSize = 2;

      assertBNArray((await prediction.getUserRounds(bullUser1, 0, 5))[0], [1, 2, 3, 4, 5]);

      let result = await prediction.getUserRounds(bullUser1, 0, pageSize);
      let epochData = result[0];
      let positionData = result[1];
      let cursor = result[2];

      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(positionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(positionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [3, 4]);
      assert.includeOrderedMembers(positionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(positionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 4);

      result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [5]);
      assert.includeOrderedMembers(positionData[0], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 5);

      result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, []);
      assert.isEmpty(positionData);
      assert.equal(cursor, 5);

      assertBNArray((await prediction.getUserRounds(bullUser2, 0, 4))[0], [1, 2, 3, 4]);
      result = await prediction.getUserRounds(bullUser2, 0, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(positionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(positionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await prediction.getUserRounds(bullUser2, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [3, 4]);
      assert.includeOrderedMembers(positionData[0], ["0", "1000000000000000000", false]);
      assert.includeOrderedMembers(positionData[1], ["0", "1000000000000000000", false]);
      assert.equal(cursor, 4);

      result = await prediction.getUserRounds(bullUser2, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, []);
      assert.isEmpty(positionData);
      assert.equal(cursor, 4);

      assertBNArray((await prediction.getUserRounds(bearUser1, 0, 3))[0], [1, 2, 3]);
      result = await prediction.getUserRounds(bearUser1, 0, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [1, 2]);
      assert.includeOrderedMembers(positionData[0], ["1", "1000000000000000000", false]);
      assert.includeOrderedMembers(positionData[1], ["1", "1000000000000000000", false]);
      assert.equal(cursor, 2);

      result = await prediction.getUserRounds(bearUser1, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, [3]);
      assert.includeOrderedMembers(positionData[0], ["1", "1000000000000000000", false]);
      assert.equal(cursor, 3);

      result = await prediction.getUserRounds(bearUser1, cursor, pageSize);
      (epochData = result[0]), (positionData = result[1]), (cursor = result[2]);
      assertBNArray(epochData, []);
      assert.isEmpty(positionData);
      assert.equal(cursor, 3);
    });
  }
);
