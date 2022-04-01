import { expectRevert, time } from "@openzeppelin/test-helpers";
import { artifacts, contract } from "hardhat";
import { assert } from "chai";

const CakeToken = artifacts.require("CakeToken");
const SyrupBar = artifacts.require("SyrupBar");
const MasterChef = artifacts.require("MasterChef");
const MockBEP20 = artifacts.require("libs/MockBEP20");

contract("MasterChef", ([alice, bob, dev, minter]) => {
  let cake, syrup, lp1, lp2, lp3, chef;

  beforeEach(async () => {
    cake = await CakeToken.new({ from: minter });
    syrup = await SyrupBar.new(cake.address, { from: minter });
    lp1 = await MockBEP20.new("LPToken", "LP1", "1000000", { from: minter });
    lp2 = await MockBEP20.new("LPToken", "LP2", "1000000", { from: minter });
    lp3 = await MockBEP20.new("LPToken", "LP3", "1000000", { from: minter });
    chef = await MasterChef.new(cake.address, syrup.address, dev, "1000", "100", { from: minter });
    await cake.transferOwnership(chef.address, { from: minter });
    await syrup.transferOwnership(chef.address, { from: minter });

    await lp1.transfer(bob, "2000", { from: minter });
    await lp2.transfer(bob, "2000", { from: minter });
    await lp3.transfer(bob, "2000", { from: minter });

    await lp1.transfer(alice, "2000", { from: minter });
    await lp2.transfer(alice, "2000", { from: minter });
    await lp3.transfer(alice, "2000", { from: minter });
  });
  it("real case", async () => {
    await chef.add("2000", lp1.address, true, { from: minter });
    await chef.add("1000", lp2.address, true, { from: minter });
    await chef.add("500", lp3.address, true, { from: minter });
    await chef.add("500", lp3.address, true, { from: minter });
    await chef.add("500", lp3.address, true, { from: minter });
    await chef.add("500", lp3.address, true, { from: minter });
    await chef.add("500", lp3.address, true, { from: minter });
    await chef.add("100", lp3.address, true, { from: minter });
    await chef.add("100", lp3.address, true, { from: minter });
    assert.equal((await chef.poolLength()).toString(), "10");

    await time.advanceBlockTo("170");
    await lp1.approve(chef.address, "1000", { from: alice });
    assert.equal((await cake.balanceOf(alice)).toString(), "0");
    await chef.deposit(1, "20", { from: alice });
    await chef.withdraw(1, "20", { from: alice });
    assert.equal((await cake.balanceOf(alice)).toString(), "263");

    await cake.approve(chef.address, "1000", { from: alice });
    await chef.enterStaking("20", { from: alice });
    await chef.enterStaking("0", { from: alice });
    await chef.enterStaking("0", { from: alice });
    await chef.enterStaking("0", { from: alice });
    assert.equal((await cake.balanceOf(alice)).toString(), "993");
  });

  it("deposit/withdraw", async () => {
    await chef.add("1000", lp1.address, true, { from: minter });
    await chef.add("1000", lp2.address, true, { from: minter });
    await chef.add("1000", lp3.address, true, { from: minter });

    await lp1.approve(chef.address, "100", { from: alice });
    await chef.deposit(1, "20", { from: alice });
    await chef.deposit(1, "0", { from: alice });
    await chef.deposit(1, "40", { from: alice });
    await chef.deposit(1, "0", { from: alice });
    assert.equal((await lp1.balanceOf(alice)).toString(), "1940");
    await chef.withdraw(1, "10", { from: alice });
    assert.equal((await lp1.balanceOf(alice)).toString(), "1950");
    assert.equal((await cake.balanceOf(alice)).toString(), "999");
    assert.equal((await cake.balanceOf(dev)).toString(), "100");

    await lp1.approve(chef.address, "100", { from: bob });
    assert.equal((await lp1.balanceOf(bob)).toString(), "2000");
    await chef.deposit(1, "50", { from: bob });
    assert.equal((await lp1.balanceOf(bob)).toString(), "1950");
    await chef.deposit(1, "0", { from: bob });
    assert.equal((await cake.balanceOf(bob)).toString(), "125");
    await chef.emergencyWithdraw(1, { from: bob });
    assert.equal((await lp1.balanceOf(bob)).toString(), "2000");
  });

  it("staking/unstaking", async () => {
    await chef.add("1000", lp1.address, true, { from: minter });
    await chef.add("1000", lp2.address, true, { from: minter });
    await chef.add("1000", lp3.address, true, { from: minter });

    await lp1.approve(chef.address, "10", { from: alice });
    await chef.deposit(1, "2", { from: alice }); //0
    await chef.withdraw(1, "2", { from: alice }); //1

    await cake.approve(chef.address, "250", { from: alice });
    await chef.enterStaking("240", { from: alice }); //3
    assert.equal((await syrup.balanceOf(alice)).toString(), "240");
    assert.equal((await cake.balanceOf(alice)).toString(), "10");
    await chef.enterStaking("10", { from: alice }); //4
    assert.equal((await syrup.balanceOf(alice)).toString(), "250");
    assert.equal((await cake.balanceOf(alice)).toString(), "249");
    await chef.leaveStaking(250);
    assert.equal((await syrup.balanceOf(alice)).toString(), "0");
    assert.equal((await cake.balanceOf(alice)).toString(), "749");
  });

  it("updaate multiplier", async () => {
    await chef.add("1000", lp1.address, true, { from: minter });
    await chef.add("1000", lp2.address, true, { from: minter });
    await chef.add("1000", lp3.address, true, { from: minter });

    await lp1.approve(chef.address, "100", { from: alice });
    await lp1.approve(chef.address, "100", { from: bob });
    await chef.deposit(1, "100", { from: alice });
    await chef.deposit(1, "100", { from: bob });
    await chef.deposit(1, "0", { from: alice });
    await chef.deposit(1, "0", { from: bob });

    await cake.approve(chef.address, "100", { from: alice });
    await cake.approve(chef.address, "100", { from: bob });
    await chef.enterStaking("50", { from: alice });
    await chef.enterStaking("100", { from: bob });

    await chef.updateMultiplier("0", { from: minter });

    await chef.enterStaking("0", { from: alice });
    await chef.enterStaking("0", { from: bob });
    await chef.deposit(1, "0", { from: alice });
    await chef.deposit(1, "0", { from: bob });

    assert.equal((await cake.balanceOf(alice)).toString(), "700");
    assert.equal((await cake.balanceOf(bob)).toString(), "150");

    await time.advanceBlockTo("265");

    await chef.enterStaking("0", { from: alice });
    await chef.enterStaking("0", { from: bob });
    await chef.deposit(1, "0", { from: alice });
    await chef.deposit(1, "0", { from: bob });

    assert.equal((await cake.balanceOf(alice)).toString(), "700");
    assert.equal((await cake.balanceOf(bob)).toString(), "150");

    await chef.leaveStaking("50", { from: alice });
    await chef.leaveStaking("100", { from: bob });
    await chef.withdraw(1, "100", { from: alice });
    await chef.withdraw(1, "100", { from: bob });
  });

  it("should allow dev and only dev to update dev", async () => {
    assert.equal((await chef.devaddr()).valueOf(), dev);
    await expectRevert(chef.dev(bob, { from: bob }), "dev: wut?");
    await chef.dev(bob, { from: dev });
    assert.equal((await chef.devaddr()).valueOf(), bob);
    await chef.dev(alice, { from: bob });
    assert.equal((await chef.devaddr()).valueOf(), alice);
  });
});
