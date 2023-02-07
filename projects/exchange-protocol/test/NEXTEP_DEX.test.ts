import { formatUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";

const NEXTEP = artifacts.require("./NEXTEP.sol");
const PancakeFactory = artifacts.require("./PancakeFactory.sol");
const PancakePair = artifacts.require("./PancakePair.sol");
const PancakeRouter = artifacts.require("./PancakeRouter.sol");
const WBNB = artifacts.require("./WBNB.sol");

contract("NEXTEP trading", ([alice, bob, carol, david, erin]) => {
  let pair;
  let token;
  let pancakeRouter;
  let pancakeFactory;
  let wrappedBNB;

  before(async () => {
    // Deploy Factory
    pancakeFactory = await PancakeFactory.new(alice, { from: alice });

    // Deploy Wrapped BNB
    wrappedBNB = await WBNB.new({ from: alice });

    // Deploy Router
    pancakeRouter = await PancakeRouter.new(pancakeFactory.address, wrappedBNB.address, { from: alice });

    // Deploy ERC20s
    token = await NEXTEP.new(bob, alice, { from: alice });

    // Create 3 LP tokens
    let result = await pancakeFactory.createPair(token.address, wrappedBNB.address, { from: alice });
    pair = await PancakePair.at(result.logs[0].args[2]);
    assert.equal(String(await pair.totalSupply()), parseEther("0").toString());
    await token.setTrader(pair.address, true, {from: alice});
    await token.setWhitelist(alice, true, {from: alice});

    await token.approve(pancakeRouter.address, constants.MAX_UINT256, {
      from: alice,
    });
  });

  describe("Normal cases", async () => {
    it("User adds liquidity to LP tokens", async function () {
      const deadline = new BN(await time.latest()).add(new BN("100"));

      // 1 BNB = 100 A
      const result = await pancakeRouter.addLiquidityETH(
        token.address,
        parseEther("100000"), // 100k token A
        parseEther("100000"), // 100k token A
        parseEther("1000"), // 1,000 BNB
        alice,
        deadline,
        { from: alice, value: parseEther("1000").toString() }
      );

      assert.equal(String(await pair.totalSupply()), parseEther("10000").toString());
      assert.equal(String(await wrappedBNB.balanceOf(pair.address)), parseEther("1000").toString());
      assert.equal(String(await token.balanceOf(pair.address)), parseEther("100000").toString());
    });

    it("Swap test selling fees", async function () {
      const deadline = new BN(await time.latest()).add(new BN("100"));
      await token.transfer(carol, parseEther("1000"), {from: alice});
      await token.approve(pancakeRouter.address, parseEther("1000"), {from: carol});

      // 1 BNB = 100 A
      const result = await pancakeRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        parseEther("500"),
        0,
        [token.address, wrappedBNB.address],
        carol,
        deadline,
        { from: carol }
      );

      console.log((await wrappedBNB.balanceOf(carol)).toString());
      console.log((await token.balanceOf(carol)).toString());
      console.log((await token.balanceOf(bob)).toString());

      assert.equal(await token.balanceOf(carol), "480000000000000000000");
      assert.equal(await token.balanceOf(bob), "20000000000000000000");
    });
  });
});
