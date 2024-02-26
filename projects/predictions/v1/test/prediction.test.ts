import { artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, expectEvent, expectRevert, time, ether, balance } from "@openzeppelin/test-helpers";

const BnbPricePrediction = artifacts.require("BnbPricePrediction");
const Oracle = artifacts.require("MockAggregatorV3");

const GAS_PRICE = 8000000000; // hardhat default
// BLOCK_COUNT_MULTPLIER: Only for test, because testing trx causes block to increment which exceeds blockBuffer time checks
// Note that the higher this value is, the slower the test will run
const BLOCK_COUNT_MULTPLIER = 5;
const DECIMALS = 8; // Chainlink default for BNB/USD
const INITIAL_PRICE = 10000000000; // $100, 8 decimal places
const INTERVAL_BLOCKS = 20 * BLOCK_COUNT_MULTPLIER; // 20 blocks * multiplier
const BUFFER_BLOCKS = 5 * BLOCK_COUNT_MULTPLIER; // 5 blocks * multplier
const MIN_BET_AMOUNT = ether("1"); // 1 BNB
const UPDATE_ALLOWANCE = 30 * BLOCK_COUNT_MULTPLIER; // 30s * multiplier
const INITIAL_REWARD_RATE = 0.9; // 90%
const INITIAL_TREASURY_RATE = 0.1; // 10%
// Enum: 0 = Bull, 1 = Bear
const Position = {
  Bull: 0,
  Bear: 1,
};

const calcGasCost = (gasUsed) => new BN(GAS_PRICE * gasUsed);
const assertBNArray = (arr1, arr2) => {
  assert.equal(arr1.length, arr2.length);
  arr1.forEach((n1, index) => {
    assert.equal(n1.toString(), new BN(arr2[index]).toString());
  });
};

contract("BnbPricePrediction", ([operator, admin, owner, bullUser1, bullUser2, bearUser1]) => {
  let oracle: { address: any; updateAnswer: (arg0: number) => any };
  let prediction: any;

  async function nextEpoch() {
    await time.advanceBlockTo((await time.latestBlock()).toNumber() + INTERVAL_BLOCKS); // Elapse 20 blocks
  }

  beforeEach(async () => {
    oracle = await Oracle.new(DECIMALS, INITIAL_PRICE);

    prediction = await BnbPricePrediction.new(
      oracle.address,
      admin,
      operator,
      INTERVAL_BLOCKS,
      BUFFER_BLOCKS,
      MIN_BET_AMOUNT,
      UPDATE_ALLOWANCE,
      { from: owner }
    );
  });

  it("Initialize", async () => {
    assert.equal(await balance.current(prediction.address), 0);
    assert.equal(await prediction.currentEpoch(), 0);
    assert.equal(await prediction.intervalBlocks(), INTERVAL_BLOCKS);
    assert.equal(await prediction.adminAddress(), admin);
    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal(await prediction.minBetAmount(), MIN_BET_AMOUNT.toString());
    assert.equal(await prediction.oracleUpdateAllowance(), UPDATE_ALLOWANCE);
    assert.equal(await prediction.genesisStartOnce(), false);
    assert.equal(await prediction.genesisLockOnce(), false);
    assert.equal(await prediction.paused(), false);
  });

  // it("Should start genesis rounds (round 1, round 2, round 3)", async () => {
  //   // Manual block calculation
  //   let currentBlock = (await time.latestBlock()).toNumber();

  //   // Epoch 0
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   assert.equal(await prediction.currentEpoch(), 0);

  //   // Epoch 1: Start genesis round 1
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   let tx = await prediction.genesisStartRound();
  //   currentBlock++;
  //   expectEvent(tx, "StartRound", { epoch: new BN(1) });
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   assert.equal(await prediction.currentEpoch(), 1);

  //   // Start round 1
  //   assert.equal(await prediction.genesisStartOnce(), true);
  //   assert.equal(await prediction.genesisLockOnce(), false);
  //   assert.equal((await prediction.rounds(1)).startBlock, currentBlock);
  //   assert.equal((await prediction.rounds(1)).lockBlock, currentBlock + INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(1)).closeBlock, currentBlock + 2 * INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(1)).epoch, 1);
  //   assert.equal((await prediction.rounds(1)).totalAmount, 0);

  //   // Elapse 20 blocks
  //   currentBlock += INTERVAL_BLOCKS;
  //   await time.advanceBlockTo(currentBlock);

  //   // Epoch 2: Lock genesis round 1 and starts round 2
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   tx = await prediction.genesisLockRound();
  //   currentBlock++;
  //   expectEvent(tx, "LockRound", {
  //     epoch: new BN(1),
  //     roundId: new BN(1),
  //     price: new BN(INITIAL_PRICE),
  //   });
  //   expectEvent(tx, "StartRound", { epoch: new BN(2) });
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   assert.equal(await prediction.currentEpoch(), 2);

  //   // Lock round 1
  //   assert.equal(await prediction.genesisStartOnce(), true);
  //   assert.equal(await prediction.genesisLockOnce(), true);
  //   assert.equal((await prediction.rounds(1)).lockPrice, INITIAL_PRICE);

  //   // Start round 2
  //   assert.equal((await prediction.rounds(2)).startBlock, currentBlock);
  //   assert.equal((await prediction.rounds(2)).lockBlock, currentBlock + INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(2)).closeBlock, currentBlock + 2 * INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(2)).epoch, 2);
  //   assert.equal((await prediction.rounds(2)).totalAmount, 0);

  //   // Elapse 20 blocks
  //   currentBlock += INTERVAL_BLOCKS;
  //   await time.advanceBlockTo(currentBlock);

  //   // Epoch 3: End genesis round 1, locks round 2, starts round 3
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
  //   tx = await prediction.executeRound();
  //   currentBlock += 2; // Oracle update and execute round
  //   expectEvent(tx, "EndRound", {
  //     epoch: new BN(1),
  //     roundId: new BN(2),
  //     price: new BN(INITIAL_PRICE),
  //   });
  //   expectEvent(tx, "LockRound", {
  //     epoch: new BN(2),
  //     roundId: new BN(2),
  //     price: new BN(INITIAL_PRICE),
  //   });
  //   expectEvent(tx, "StartRound", { epoch: new BN(3) });
  //   assert.equal(await time.latestBlock(), currentBlock);
  //   assert.equal(await prediction.currentEpoch(), 3);

  //   // End round 1
  //   assert.equal((await prediction.rounds(1)).closePrice, INITIAL_PRICE);

  //   // Lock round 2
  //   assert.equal((await prediction.rounds(2)).lockPrice, INITIAL_PRICE);

  //   // Start round 3
  //   assert.equal((await prediction.rounds(3)).startBlock, currentBlock);
  //   assert.equal((await prediction.rounds(3)).lockBlock, currentBlock + INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(3)).closeBlock, currentBlock + 2 * INTERVAL_BLOCKS);
  //   assert.equal((await prediction.rounds(3)).epoch, 3);
  //   assert.equal((await prediction.rounds(3)).totalAmount, 0);
  // });

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

  it("Should not lock round before lockBlock and end round before closeBlock", async () => {
    await prediction.genesisStartRound();
    await expectRevert(prediction.genesisLockRound(), "Can only lock round after lockBlock");
    await nextEpoch();
    await prediction.genesisLockRound();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await expectRevert(prediction.executeRound(), "Can only lock round after lockBlock");

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

    await prediction.betBull({ from: bullUser1, value: ether("1.1") }); // 1.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("1.2") }); // 1.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("1.4") }); // 1.4 BNB

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

    // Epoch 2
    await nextEpoch();
    await prediction.genesisLockRound(); // For round 1

    await prediction.betBull({ from: bullUser1, value: ether("2.1") }); // 2.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2.2") }); // 2.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("2.4") }); // 2.4 BNB

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

    // Epoch 3
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    await prediction.betBull({ from: bullUser1, value: ether("3.1").toString() }); // 3.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("3.2").toString() }); // 3.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("3.4").toString() }); // 4.3 BNB

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

    // Epoch 4
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    await prediction.betBull({ from: bullUser1, value: ether("4.1").toString() }); // 4.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("4.2").toString() }); // 4.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4.4").toString() }); // 4.4 BNB

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
  });

  it("Should not allow multiple bets", async () => {
    // Epoch 1
    await prediction.genesisStartRound();

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await prediction.betBear({ from: bearUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bearUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bearUser1, value: ether("1") }), "Can only bet once per round");

    // Epoch 2
    await nextEpoch();
    await prediction.genesisLockRound(); // For round 1

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await prediction.betBear({ from: bearUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bearUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bearUser1, value: ether("1") }), "Can only bet once per round");

    // Epoch 3
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bullUser1, value: ether("1") }), "Can only bet once per round");
    await prediction.betBear({ from: bearUser1, value: ether("1") }); // Success
    await expectRevert(prediction.betBull({ from: bearUser1, value: ether("1") }), "Can only bet once per round");
    await expectRevert(prediction.betBear({ from: bearUser1, value: ether("1") }), "Can only bet once per round");
  });

  it("Should not allow bets lesser than minimum bet amount", async () => {
    // Epoch 1
    await prediction.genesisStartRound();

    await expectRevert(
      prediction.betBull({ from: bullUser1, value: ether("0.5") }),
      "Bet amount must be greater than minBetAmount"
    ); // 0.5 BNB
    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success

    // Epoch 2
    await nextEpoch();
    await prediction.genesisLockRound(); // For round 1

    await expectRevert(
      prediction.betBull({ from: bullUser1, value: ether("0.5") }),
      "Bet amount must be greater than minBetAmount"
    ); // 0.5 BNB
    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success

    // Epoch 3
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    await expectRevert(
      prediction.betBull({ from: bullUser1, value: ether("0.5") }),
      "Bet amount must be greater than minBetAmount"
    ); // 0.5 BNB
    await prediction.betBull({ from: bullUser1, value: ether("1") }); // Success
  });

  it("Should record rewards", async () => {
    // Epoch 1
    const price110 = 11000000000; // $110
    await oracle.updateAnswer(price110);
    await prediction.genesisStartRound();

    await prediction.betBull({ from: bullUser1, value: ether("1.1") }); // 1.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("1.2") }); // 1.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("1.4") }); // 1.4 BNB

    assert.equal((await prediction.rounds(1)).rewardBaseCalAmount, 0);
    assert.equal((await prediction.rounds(1)).rewardAmount, 0);
    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal((await balance.current(prediction.address)).toString(), ether("3.7").toString());

    // Epoch 2
    await nextEpoch();
    const price120 = 12000000000; // $120
    await oracle.updateAnswer(price120);
    await prediction.genesisLockRound(); // For round 1

    await prediction.betBull({ from: bullUser1, value: ether("2.1") }); // 2.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2.2") }); // 2.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("2.4") }); // 2.4 BNB

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

    await prediction.betBull({ from: bullUser1, value: ether("3.1").toString() }); // 3.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("3.2").toString() }); // 3.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("3.4").toString() }); // 3.4 BNB

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

    await prediction.betBull({ from: bullUser1, value: ether("4.1").toString() }); // 4.1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("4.2").toString() }); // 4.2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4.4").toString() }); // 4.4 BNB

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

  it("Should not lock round before lockBlock", async () => {
    await prediction.genesisStartRound();
    await nextEpoch();
    await prediction.genesisLockRound();
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await expectRevert(prediction.executeRound(), "Can only lock round after lockBlock");
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

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // 1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2") }); // 2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4") }); // 4 BNB

    assert.equal(await prediction.claimable(1, bullUser1), false);
    assert.equal(await prediction.claimable(1, bullUser2), false);
    assert.equal(await prediction.claimable(1, bearUser1), false);
    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(1, { from: bullUser2 }), "Round has not ended");
    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bullUser1 }), "Round has not started");
    await expectRevert(prediction.claim(2, { from: bullUser2 }), "Round has not started");
    await expectRevert(prediction.claim(2, { from: bearUser1 }), "Round has not started");

    // Epoch 2
    await nextEpoch();
    const price120 = 12000000000; // $120
    await oracle.updateAnswer(price120);
    await prediction.genesisLockRound(); // For round 1

    await prediction.betBull({ from: bullUser1, value: ether("21") }); // 21 BNB
    await prediction.betBull({ from: bullUser2, value: ether("22") }); // 22 BNB
    await prediction.betBear({ from: bearUser1, value: ether("24") }); // 24 BNB

    assert.equal(await prediction.claimable(1, bullUser1), false);
    assert.equal(await prediction.claimable(1, bullUser2), false);
    assert.equal(await prediction.claimable(1, bearUser1), false);
    assert.equal(await prediction.claimable(2, bullUser1), false);
    assert.equal(await prediction.claimable(2, bullUser2), false);
    assert.equal(await prediction.claimable(2, bearUser1), false);
    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(1, { from: bullUser2 }), "Round has not ended");
    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bullUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bullUser2 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bearUser1 }), "Round has not ended");

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

    let tx = await prediction.claim(1, { from: bullUser1 }); // Success
    let { gasUsed } = tx.receipt;
    expectEvent(tx, "Claim", { sender: bullUser1, currentEpoch: new BN(1), amount: ether("2.1") }); // 2.1 = 1/3 * (7*0.9)
    assert.equal((await bullUser1Tracker.delta()).toString(), ether("2.1").sub(calcGasCost(gasUsed)).toString());

    tx = await prediction.claim(1, { from: bullUser2 }); // Success
    gasUsed = tx.receipt.gasUsed;
    expectEvent(tx, "Claim", { sender: bullUser2, currentEpoch: new BN(1), amount: ether("4.2") }); // 4.2 = 2/3 * (7*0.9)
    assert.equal((await bullUser2Tracker.delta()).toString(), ether("4.2").sub(calcGasCost(gasUsed)).toString());

    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Not eligible for claim");
    await expectRevert(prediction.claim(2, { from: bullUser1 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bullUser2 }), "Round has not ended");
    await expectRevert(prediction.claim(2, { from: bearUser1 }), "Round has not ended");

    // Epoch 4, Round 2 is Bear (100 < 130)
    await nextEpoch();
    const price100 = 10000000000; // $100
    await oracle.updateAnswer(price100);
    await prediction.executeRound();

    assert.equal(await prediction.claimable(1, bullUser1), true);
    assert.equal(await prediction.claimable(1, bullUser2), true);
    assert.equal(await prediction.claimable(1, bearUser1), false);
    assert.equal(await prediction.claimable(2, bullUser1), false);
    assert.equal(await prediction.claimable(2, bullUser2), false);
    assert.equal(await prediction.claimable(2, bearUser1), true);

    // Claim for Round 2: Total rewards = 67, Bull = 43, Bear = 24
    await bearUser1Tracker.get();

    tx = await prediction.claim(2, { from: bearUser1 }); // Success
    gasUsed = tx.receipt.gasUsed;
    expectEvent(tx, "Claim", { sender: bearUser1, currentEpoch: new BN(2), amount: ether("60.3") }); // 24 = 24/24 * (67*0.9)
    assert.equal((await bearUser1Tracker.delta()).toString(), ether("60.3").sub(calcGasCost(gasUsed)).toString());

    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Rewards claimed");
    await expectRevert(prediction.claim(1, { from: bullUser2 }), "Rewards claimed");
    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Not eligible for claim");
    await expectRevert(prediction.claim(2, { from: bullUser1 }), "Not eligible for claim");
    await expectRevert(prediction.claim(2, { from: bullUser2 }), "Not eligible for claim");
    await expectRevert(prediction.claim(2, { from: bearUser1 }), "Rewards claimed");
  });

  it("Should record house wins", async () => {
    // Epoch 1
    const price110 = 11000000000; // $110
    await oracle.updateAnswer(price110);
    await prediction.genesisStartRound();

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // 1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2") }); // 2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4") }); // 4 BNB

    // Epoch 2
    await nextEpoch();
    await oracle.updateAnswer(price110);
    await prediction.genesisLockRound(); // For round 1

    // Epoch 3, Round 1 is Same (110 == 110), House wins
    await nextEpoch();
    await oracle.updateAnswer(price110);
    await prediction.executeRound();

    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Not eligible for claim");
    await expectRevert(prediction.claim(1, { from: bullUser2 }), "Not eligible for claim");
    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Not eligible for claim");
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

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // 1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2") }); // 2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4") }); // 4 BNB
    predictionCurrentBNB = predictionCurrentBNB.add(ether("7"));

    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());

    // Epoch 2
    await nextEpoch();
    const price120 = 12000000000; // $120
    await oracle.updateAnswer(price120);
    await prediction.genesisLockRound(); // For round 1

    await prediction.betBull({ from: bullUser1, value: ether("21") }); // 21 BNB
    await prediction.betBull({ from: bullUser2, value: ether("22") }); // 22 BNB
    await prediction.betBear({ from: bearUser1, value: ether("24") }); // 24 BNB
    predictionCurrentBNB = predictionCurrentBNB.add(ether("67"));

    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());

    // Epoch 3, Round 1 is Bull (130 > 120)
    await nextEpoch();
    const price130 = 13000000000; // $130
    await oracle.updateAnswer(price130);
    await prediction.executeRound();

    await prediction.betBull({ from: bullUser1, value: ether("31") }); // 31 BNB
    await prediction.betBull({ from: bullUser2, value: ether("32") }); // 32 BNB
    await prediction.betBear({ from: bearUser1, value: ether("34") }); // 34 BNB
    predictionCurrentBNB = predictionCurrentBNB.add(ether("97"));

    // Admin claim for Round 1
    await adminTracker.get();
    assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());
    assert.equal((await prediction.treasuryAmount()).toString(), ether("0.7").toString()); // 0.7 = 7 * 0.1
    let tx = await prediction.claimTreasury({ from: admin }); // Success
    let { gasUsed } = tx.receipt;
    expectEvent(tx, "ClaimTreasury", { amount: ether("0.7") });
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
    expectEvent(tx, "ClaimTreasury", { amount: ether("16.4") }); // 16.4 = 6.7 + 9.7
    assert.equal((await adminTracker.delta()).toString(), ether("16.4").sub(calcGasCost(gasUsed)).toString());
    assert.equal(await prediction.treasuryAmount(), 0); // Empty
    predictionCurrentBNB = predictionCurrentBNB.sub(ether("16.4"));
    assert.equal((await balance.current(prediction.address)).toString(), predictionCurrentBNB.toString());
  });

  it("Should reject claim treasury rewards when not admin", async () => {
    await expectRevert(prediction.claimTreasury({ from: bullUser1 }), "admin: wut?");
  });

  it("Should refund rewards", async () => {
    const bullUser1Tracker = await balance.tracker(bullUser1);
    const bullUser2Tracker = await balance.tracker(bullUser2);
    const bearUser1Tracker = await balance.tracker(bearUser1);

    // Epoch 1
    const price110 = 11000000000; // $110
    await oracle.updateAnswer(price110);
    await prediction.genesisStartRound();

    await prediction.betBull({ from: bullUser1, value: ether("1") }); // 1 BNB
    await prediction.betBull({ from: bullUser2, value: ether("2") }); // 2 BNB
    await prediction.betBear({ from: bearUser1, value: ether("4") }); // 4 BNB

    assert.equal(await prediction.refundable(1, bullUser1), false);
    assert.equal(await prediction.refundable(1, bullUser2), false);
    assert.equal(await prediction.refundable(1, bearUser1), false);
    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal((await balance.current(prediction.address)).toString(), ether("7").toString());

    // Epoch 2
    await nextEpoch();
    await prediction.genesisLockRound();

    assert.equal(await prediction.refundable(1, bullUser1), false);
    assert.equal(await prediction.refundable(1, bullUser2), false);
    assert.equal(await prediction.refundable(1, bearUser1), false);

    // Epoch 3 (missed)
    await nextEpoch();

    // Epoch 4
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await expectRevert(prediction.executeRound(), "Can only lock round within bufferBlocks");

    // Refund for Round 1
    await bullUser1Tracker.get();
    await bullUser2Tracker.get();
    await bearUser1Tracker.get();

    assert.equal(await prediction.refundable(1, bullUser1), true);
    assert.equal(await prediction.refundable(1, bullUser2), true);
    assert.equal(await prediction.refundable(1, bearUser1), true);

    let tx = await prediction.claim(1, { from: bullUser1 }); // Success
    let { gasUsed } = tx.receipt;
    expectEvent(tx, "Claim", { sender: bullUser1, currentEpoch: new BN(1), amount: ether("1") }); // 1, 100% of bet amount
    assert.equal((await bullUser1Tracker.delta()).toString(), ether("1").sub(calcGasCost(gasUsed)).toString());

    tx = await prediction.claim(1, { from: bullUser2 }); // Success
    gasUsed = tx.receipt.gasUsed;
    expectEvent(tx, "Claim", { sender: bullUser2, currentEpoch: new BN(1), amount: ether("2") }); // 2, 100% of bet amount
    assert.equal((await bullUser2Tracker.delta()).toString(), ether("2").sub(calcGasCost(gasUsed)).toString());

    tx = await prediction.claim(1, { from: bearUser1 }); // Success
    gasUsed = tx.receipt.gasUsed;
    expectEvent(tx, "Claim", { sender: bearUser1, currentEpoch: new BN(1), amount: ether("4") }); // 4, 100% of bet amount
    assert.equal((await bearUser1Tracker.delta()).toString(), ether("4").sub(calcGasCost(gasUsed)).toString());

    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Rewards claimed");
    await expectRevert(prediction.claim(1, { from: bullUser2 }), "Rewards claimed");
    await expectRevert(prediction.claim(1, { from: bearUser1 }), "Rewards claimed");

    // Treasury amount should be empty
    assert.equal(await prediction.treasuryAmount(), 0);
    assert.equal(await balance.current(prediction.address), 0);
  });

  // Covers end too as it is dependent on lock round
  it("Should reject when lockRound exceeds bufferBlock", async () => {
    // Epoch 1
    await prediction.genesisStartRound();
    await nextEpoch();
    await prediction.genesisLockRound();
    await nextEpoch();
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await expectRevert(prediction.executeRound(), "Can only lock round within bufferBlocks");
  });

  it("Should prevent betting when paused", async () => {
    await prediction.genesisStartRound();
    await nextEpoch();
    await prediction.genesisLockRound();
    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE); // To update Oracle roundId
    await prediction.executeRound();

    const tx = await prediction.pause({ from: admin });
    expectEvent(tx, "Pause", { epoch: new BN(3) });
    await expectRevert(prediction.betBull({ from: bullUser1, value: ether("1") }), "Pausable: paused");
    await expectRevert(prediction.betBear({ from: bearUser1, value: ether("1") }), "Pausable: paused");
    await expectRevert(prediction.claim(1, { from: bullUser1 }), "Not eligible for claim"); // Success
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
    await prediction.betBull({ from: bullUser1, value: ether("1") });
    await prediction.betBull({ from: bullUser2, value: ether("1") });
    await prediction.betBear({ from: bearUser1, value: ether("1") });

    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE);
    await prediction.genesisLockRound();
    await prediction.betBull({ from: bullUser1, value: ether("1") });
    await prediction.betBull({ from: bullUser2, value: ether("1") });
    await prediction.betBear({ from: bearUser1, value: ether("1") });

    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE);
    await prediction.executeRound();
    await prediction.betBull({ from: bullUser1, value: ether("1") });
    await prediction.betBull({ from: bullUser2, value: ether("1") });
    await prediction.betBear({ from: bearUser1, value: ether("1") });

    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE);
    await prediction.executeRound();
    await prediction.betBull({ from: bullUser1, value: ether("1") });
    await prediction.betBull({ from: bullUser2, value: ether("1") });

    await nextEpoch();
    await oracle.updateAnswer(INITIAL_PRICE);
    await prediction.executeRound();
    await prediction.betBull({ from: bullUser1, value: ether("1") });

    // Get by page size of 2
    const pageSize = 2;

    assertBNArray((await prediction.getUserRounds(bullUser1, 0, 5))[0], [1, 2, 3, 4, 5]);
    let result = await prediction.getUserRounds(bullUser1, 0, pageSize);
    let data = result[0],
      cursor = result[1];
    assertBNArray(data, [1, 2]);
    assert.equal(cursor, 2);
    result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [3, 4]);
    assert.equal(cursor, 4);
    result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [5]);
    assert.equal(cursor, 5);
    result = await prediction.getUserRounds(bullUser1, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, []);
    assert.equal(cursor, 5);

    assertBNArray((await prediction.getUserRounds(bullUser2, 0, 4))[0], [1, 2, 3, 4]);
    result = await prediction.getUserRounds(bullUser2, 0, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [1, 2]);
    assert.equal(cursor, 2);
    result = await prediction.getUserRounds(bullUser2, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [3, 4]);
    assert.equal(cursor, 4);
    result = await prediction.getUserRounds(bullUser2, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, []);
    assert.equal(cursor, 4);

    assertBNArray((await prediction.getUserRounds(bearUser1, 0, 3))[0], [1, 2, 3]);
    result = await prediction.getUserRounds(bearUser1, 0, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [1, 2]);
    assert.equal(cursor, 2);
    result = await prediction.getUserRounds(bearUser1, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, [3]);
    assert.equal(cursor, 3);
    result = await prediction.getUserRounds(bearUser1, cursor, pageSize);
    (data = result[0]), (cursor = result[1]);
    assertBNArray(data, []);
    assert.equal(cursor, 3);
  });
});
