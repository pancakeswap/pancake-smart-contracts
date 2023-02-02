import { formatUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { BigNumber } from "@ethersproject/bignumber";

const NEXTEP = artifacts.require("./NEXTEP.sol");

contract("PancakeZapV1", ([alice, bob, carol, dexPair]) => {
  let instance;

  function CONVERT_NEXTEP(x) {
    return BigNumber.from(x).mul(BigNumber.from(10).pow(18));
  }

  before(async () => {
    // Deploy Factory
    instance = await NEXTEP.new(bob, alice, { from: bob });
  });

  describe("Testing deployment", async () => {

    it("owner shall be alice", async function () {
      assert.equal(await instance.owner(), alice);
    });

    it("feeTo shall be bob", async function () {
      assert.equal(await instance.feeTo(), bob);
    });

    it("owner balance shall be 87.5 billions", async function () {
      const totalSupply = BigNumber.from(87500000000).mul(BigNumber.from(10).pow(18));
      assert.equal(await instance.balanceOf(alice), totalSupply.toString());
    });
  });

  describe("Testing admin functions", async () => {

    it("Setting trader", async function () {
      await instance.setTrader(dexPair, true, {from : alice});
      const isTrader = await instance.tradelist(dexPair);
      assert.equal(isTrader, true);
    });

    it("Setting whitelist", async function () {
      await instance.setWhitelist(dexPair, true, {from : alice});
      const isWhitelist = await instance.whitelist(dexPair);
      assert.equal(isWhitelist, true);
      await instance.setWhitelist(dexPair, false, {from : alice});
    });

    it("Setting sell and buy fees", async function () {
      await instance.setFees(500, 500, {from : alice});
      assert.equal(await instance.buyFee(), 500);
      assert.equal(await instance.sellFee(), 500);
      await instance.setFees(400, 400, {from : alice});
    });

    it("Sell and buy fees cannot be higher than 5%", async function () {
      await expectRevert(
        instance.setFees(10000, 500, {from : alice}),
        "NEXTEP: Maximum buy or sell fee is 5%"
      );
    });
  });

  describe("Testing transfers", async () => {

    it("normal transfer has no fees", async function () {
      await instance.transfer(carol, CONVERT_NEXTEP(100), {from: alice});
      const feeToBalance = await instance.balanceOf(bob);
      const fromBalance = await instance.balanceOf(alice);
      const toBalance = await instance.balanceOf(carol);
      assert.equal(feeToBalance, CONVERT_NEXTEP(0).toString());
      assert.equal(fromBalance, CONVERT_NEXTEP(87500000000-100).toString());
      assert.equal(toBalance, CONVERT_NEXTEP(100).toString());
    });

    it("transfer to trader has selling fees", async function () {
      await instance.transfer(dexPair, CONVERT_NEXTEP(100), {from: alice});
      const feeToBalance = await instance.balanceOf(bob);
      const fromBalance = await instance.balanceOf(alice);
      const toBalance = await instance.balanceOf(dexPair);
      assert.equal(feeToBalance, CONVERT_NEXTEP(4).toString());
      assert.equal(fromBalance, CONVERT_NEXTEP(87500000000-100-100-4).toString());
      assert.equal(toBalance, CONVERT_NEXTEP(100).toString());
    });

    it("transfer from trader has buying fees", async function () {
      await instance.transfer(carol, CONVERT_NEXTEP(100), {from: dexPair});
      const feeToBalance = await instance.balanceOf(bob);
      const fromBalance = await instance.balanceOf(dexPair);
      const toBalance = await instance.balanceOf(carol);
      assert.equal(feeToBalance.toString(), CONVERT_NEXTEP(4+4).toString());
      assert.equal(fromBalance, CONVERT_NEXTEP(0).toString());
      assert.equal(toBalance, CONVERT_NEXTEP(100+100-4).toString());
    });

    it("transfer to and from trader is forbidden", async function () {
      const carolBalance = await instance.balanceOf(carol);
      await instance.setTrader(carol, true);

      await expectRevert(
        instance.transfer(dexPair, carolBalance, {from: carol}),
        "NEXTEP: transfering between traders is forbidden"
      );
    });
  });
});
