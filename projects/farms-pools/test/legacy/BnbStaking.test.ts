import { expectRevert, time } from "@openzeppelin/test-helpers";
import { artifacts, contract } from "hardhat";
import { assert } from "chai";

const CakeToken = artifacts.require("CakeToken");
const BnbStaking = artifacts.require("BnbStaking");
const WBNB = artifacts.require("libs/WBNB");

contract("BNB Staking", async ([alice, bob, admin, dev, minter]) => {
  let rewardToken, wBNB, bnbChef;

  beforeEach(async () => {
    rewardToken = await CakeToken.new({ from: minter });
    wBNB = await WBNB.new({ from: minter });
    bnbChef = await BnbStaking.new(wBNB.address, rewardToken.address, 1000, 10, 1010, admin, wBNB.address, {
      from: minter,
    });
    await rewardToken.mint(bnbChef.address, 100000, { from: minter });
  });

  it("deposit/withdraw", async () => {
    await time.advanceBlockTo("10");
    await bnbChef.deposit({ from: alice, value: 100 });
    await bnbChef.deposit({ from: bob, value: 200 });
    assert.equal((await wBNB.balanceOf(bnbChef.address)).toString(), "300");
    assert.equal((await bnbChef.pendingReward(alice)).toString(), "1000");
    await bnbChef.deposit({ from: alice, value: 300 });
    assert.equal((await bnbChef.pendingReward(alice)).toString(), "0");
    assert.equal((await rewardToken.balanceOf(alice)).toString(), "1333");
    await bnbChef.withdraw("100", { from: alice });
    assert.equal((await wBNB.balanceOf(bnbChef.address)).toString(), "500");
    await bnbChef.emergencyRewardWithdraw(1000, { from: minter });
    assert.equal((await bnbChef.pendingReward(bob)).toString(), "1399");
  });

  it("should block man who in blanklist", async () => {
    await bnbChef.setBlackList(alice, { from: admin });
    await expectRevert(bnbChef.deposit({ from: alice, value: 100 }), "in black list");
    await bnbChef.removeBlackList(alice, { from: admin });
    await bnbChef.deposit({ from: alice, value: 100 });
    await bnbChef.setAdmin(dev, { from: minter });
    await expectRevert(bnbChef.setBlackList(alice, { from: admin }), "admin: wut?");
  });

  it("emergencyWithdraw", async () => {
    await bnbChef.deposit({ from: alice, value: 100 });
    await bnbChef.deposit({ from: bob, value: 200 });
    assert.equal((await wBNB.balanceOf(bnbChef.address)).toString(), "300");
    await bnbChef.emergencyWithdraw({ from: alice });
    assert.equal((await wBNB.balanceOf(bnbChef.address)).toString(), "200");
    assert.equal((await wBNB.balanceOf(alice)).toString(), "100");
  });

  it("emergencyRewardWithdraw", async () => {
    await expectRevert(bnbChef.emergencyRewardWithdraw(100, { from: alice }), "caller is not the owner");
    await bnbChef.emergencyRewardWithdraw(1000, { from: minter });
    assert.equal((await rewardToken.balanceOf(minter)).toString(), "1000");
  });

  it("setLimitAmount", async () => {
    // set limit to 1e-12 BNB
    await bnbChef.setLimitAmount("1000000", { from: minter });
    await expectRevert(bnbChef.deposit({ from: alice, value: 100000000 }), "exceed the to");
  });
});
