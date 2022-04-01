import { parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";

import { assert } from "chai";
import { BN, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";

const MockBEP20 = artifacts.require("./libs/MockBEP20.sol");
const SmartChefInitializable = artifacts.require("./SmartChefInitializable.sol");
const SmartChefFactory = artifacts.require("./SmartChefFactory.sol");

contract("Smart Chef Factory", ([alice, bob, carol, david, erin, ...accounts]) => {
  let blockNumber;
  let startBlock;
  let endBlock;

  let poolLimitPerUser = parseEther("0");
  let rewardPerBlock = parseEther("10");

  // Contracts
  let mockCAKE, mockPT, smartChef, smartChefFactory;

  // Generic result variable
  let result: any;

  before(async () => {
    blockNumber = await time.latestBlock();
    startBlock = new BN(blockNumber).add(new BN(100));
    endBlock = new BN(blockNumber).add(new BN(500));

    mockCAKE = await MockBEP20.new("Mock CAKE", "CAKE", parseEther("1000000"), {
      from: alice,
    });

    mockPT = await MockBEP20.new("Mock Pool Token 1", "PT1", parseEther("4000"), {
      from: alice,
    });

    smartChefFactory = await SmartChefFactory.new({ from: alice });
  });

  describe("SMART CHEF #1 - NO POOL LIMIT", async () => {
    it("Deploy pool with SmartChefFactory", async () => {
      result = await smartChefFactory.deployPool(
        mockCAKE.address,
        mockPT.address,
        rewardPerBlock,
        startBlock,
        endBlock,
        poolLimitPerUser,
        alice
      );

      const poolAddress = result.receipt.logs[2].args[0];

      expectEvent(result, "NewSmartChefContract", { smartChef: poolAddress });

      smartChef = await SmartChefInitializable.at(poolAddress);
    });

    it("Initial parameters are correct", async () => {
      assert.equal(String(await smartChef.PRECISION_FACTOR()), "1000000000000");
      assert.equal(String(await smartChef.lastRewardBlock()), startBlock);
      assert.equal(String(await smartChef.rewardPerBlock()), rewardPerBlock.toString());
      assert.equal(String(await smartChef.poolLimitPerUser()), poolLimitPerUser.toString());
      assert.equal(String(await smartChef.startBlock()), startBlock.toString());
      assert.equal(String(await smartChef.bonusEndBlock()), endBlock.toString());
      assert.equal(await smartChef.hasUserLimit(), false);
      assert.equal(await smartChef.owner(), alice);

      // Transfer 4000 PT token to the contract (400 blocks with 10 PT/block)
      await mockPT.transfer(smartChef.address, parseEther("4000"), { from: alice });
    });

    it("Users deposit", async () => {
      for (let thisUser of [bob, carol, david, erin]) {
        await mockCAKE.mintTokens(parseEther("1000"), { from: thisUser });
        await mockCAKE.approve(smartChef.address, parseEther("1000"), {
          from: thisUser,
        });
        result = await smartChef.deposit(parseEther("100"), { from: thisUser });
        expectEvent(result, "Deposit", { user: thisUser, amount: String(parseEther("100")) });
        assert.equal(String(await smartChef.pendingReward(thisUser)), "0");
      }
    });

    it("Advance to startBlock", async () => {
      await time.advanceBlockTo(startBlock);
      assert.equal(String(await smartChef.pendingReward(bob)), "0");
    });

    it("Advance to startBlock + 1", async () => {
      await time.advanceBlockTo(startBlock.add(new BN(1)));
      assert.equal(String(await smartChef.pendingReward(bob)), String(parseEther("2.5")));
    });

    it("Advance to startBlock + 10", async () => {
      await time.advanceBlockTo(startBlock.add(new BN(10)));
      assert.equal(String(await smartChef.pendingReward(carol)), String(parseEther("25")));
    });

    it("Carol can withdraw", async () => {
      result = await smartChef.withdraw(parseEther("50"), { from: carol });
      expectEvent(result, "Withdraw", { user: carol, amount: String(parseEther("50")) });
      // She harvests 11 blocks --> 10/4 * 11 = 27.5 PT tokens
      assert.equal(String(await mockPT.balanceOf(carol)), String(parseEther("27.5")));
      assert.equal(String(await smartChef.pendingReward(carol)), String(parseEther("0")));
    });

    it("Can collect rewards by calling deposit with amount = 0", async () => {
      result = await smartChef.deposit(parseEther("0"), { from: carol });
      expectEvent(result, "Deposit", { user: carol, amount: String(parseEther("0")) });
      assert.equal(String(await mockPT.balanceOf(carol)), String(parseEther("28.92857142855")));
    });

    it("Can collect rewards by calling withdraw with amount = 0", async () => {
      result = await smartChef.withdraw(parseEther("0"), { from: carol });
      expectEvent(result, "Withdraw", { user: carol, amount: String(parseEther("0")) });
      assert.equal(String(await mockPT.balanceOf(carol)), String(parseEther("30.3571428571")));
    });

    it("Carol cannot withdraw more than she had", async () => {
      await expectRevert(smartChef.withdraw(parseEther("70"), { from: carol }), "Amount to withdraw too high");
    });

    it("Admin cannot set a limit", async () => {
      await expectRevert(smartChef.updatePoolLimitPerUser(true, parseEther("1"), { from: alice }), "Must be set");
    });

    it("Cannot change after start reward per block, nor start block or end block", async () => {
      await expectRevert(smartChef.updateRewardPerBlock(parseEther("1"), { from: alice }), "Pool has started");
      await expectRevert(smartChef.updateStartAndEndBlocks("1", "10", { from: alice }), "Pool has started");
    });

    it("Advance to end of IFO", async () => {
      await time.advanceBlockTo(endBlock);

      for (let thisUser of [bob, david, erin]) {
        await smartChef.withdraw(parseEther("100"), { from: thisUser });
      }
      await smartChef.withdraw(parseEther("50"), { from: carol });

      // 0.000000001 PT token
      assert.isAtMost(Number(await mockPT.balanceOf(smartChef.address)), 1000000000);
    });

    it("Cannot deploy a pool with SmartChefFactory if not owner", async () => {
      await expectRevert(
        smartChefFactory.deployPool(
          mockCAKE.address,
          mockPT.address,
          rewardPerBlock,
          startBlock,
          endBlock,
          poolLimitPerUser,
          bob,
          { from: bob }
        ),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot deploy a pool with wrong tokens", async () => {
      await expectRevert(
        smartChefFactory.deployPool(
          mockCAKE.address,
          mockCAKE.address,
          rewardPerBlock,
          startBlock,
          endBlock,
          poolLimitPerUser,
          alice,
          { from: alice }
        ),
        "Tokens must be be different"
      );

      await expectRevert(
        smartChefFactory.deployPool(
          mockCAKE.address,
          smartChef.address,
          rewardPerBlock,
          startBlock,
          endBlock,
          poolLimitPerUser,
          alice,
          { from: alice }
        ),
        "function selector was not recognized and there's no fallback function"
      );

      await expectRevert(
        smartChefFactory.deployPool(
          alice,
          mockCAKE.address,
          rewardPerBlock,
          startBlock,
          endBlock,
          poolLimitPerUser,
          alice,
          { from: alice }
        ),
        "function call to a non-contract account"
      );
    });
  });
});
