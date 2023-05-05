import { formatUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { BigNumber } from "@ethersproject/bignumber";

const Distributor = artifacts.require("./Distributor.sol");
const DummyERC20 = artifacts.require("./test/DummyERC20.sol");
const NFT = artifacts.require("./NFT.sol");

contract("Distributor", ([alice, bob, carol, all]) => {
  let erc20Instance;
  let erc721Instance;
  let distributorInstance;

  function CONVERT_NEXTEP(x) {
    return BigNumber.from(x).mul(BigNumber.from(10).pow(18));
  }

  async function validateDistribution(index, total, remaining, perunit) {
    let [totalAmount, remainingUnits, amountPerUnit] = await distributorInstance.distributions(index);
    console.log(totalAmount.toString(), remainingUnits.toString(), amountPerUnit.toString());
    if(total)
    expect(totalAmount.toString()).to.be.equal(total);
    if(remaining)
    expect(remainingUnits.toString()).to.be.equal(remaining);
    if(perunit)
    expect(amountPerUnit.toString()).to.be.equal(perunit);
  }

  before(async () => {
    // Deploy Factory
    erc20Instance = await DummyERC20.new({ from: alice });
    erc721Instance = await NFT.new({from: alice});
    distributorInstance = await Distributor.new(erc721Instance.address, erc20Instance.address, {from: alice});

    let batch : string[] = [];
    // distribute one nft to bob and carol and rest to a common address
    batch.push(bob);
    batch.push(carol);
    for(let i = 0; i < 8; i++) {
      batch.push(all);
    }

    await erc721Instance.mintBatch(batch);
    
  });

  describe("Testing normal distribution", async () => {
    it("distributing 50 nextep", async function () {
      await erc20Instance.transfer(distributorInstance.address, CONVERT_NEXTEP(50), {from: alice});
      const result = await distributorInstance.distribute();
      expectEvent.inTransaction(result.receipt.transactionHash, distributorInstance, "Distributed", {
        index: "0"
      });
    })

    it("distributing 101 nextep", async function () {
      await erc20Instance.transfer(distributorInstance.address, CONVERT_NEXTEP(101), {from: alice});
      const result = await distributorInstance.distribute();
      expectEvent.inTransaction(result.receipt.transactionHash, distributorInstance, "Distributed", {
        index: "1"
      });
    })

    it("distribution data should be properly set", async function () {
      await validateDistribution(0, CONVERT_NEXTEP(50).toString(), "10", CONVERT_NEXTEP(50).div(10).toString());
      await validateDistribution(1, CONVERT_NEXTEP(101).toString(), "10", CONVERT_NEXTEP(101).div(10).toString());
    })

    it("claiming all", async function () {
      // shouldnt do anything since alice doesnt have any nfts
      await distributorInstance.claim({from : alice});
      // should claim 1/10 of both distributions
      await distributorInstance.claim({from : bob});
      // should claim 1/10 of both distributions
      await distributorInstance.claim({from : carol});

      await validateDistribution(0, null, "8", null);
      await validateDistribution(1, null, "8", null);

      // should claim all the remainder
      await distributorInstance.claim({from: all});
      await validateDistribution(0, null, "0", null);
      await validateDistribution(1, null, "0", null);
      expect((await erc20Instance.balanceOf(bob)).toString()).to.be.equal(CONVERT_NEXTEP(50+101).div(10).toString());
      expect((await erc20Instance.balanceOf(carol)).toString()).to.be.equal(CONVERT_NEXTEP(50+101).div(10).toString());
      expect((await erc20Instance.balanceOf(all)).toString()).to.be.equal(CONVERT_NEXTEP(50+101).div(10).mul(8).toString());
    })

    it("double claiming shouldnt work", async function () {
      // transfer all tokens to the same account
      await erc721Instance.transferFrom(bob, all, 0, {from: bob});
      await erc721Instance.transferFrom(carol, all, 1, {from: carol});
      // should claim all the remainder
      await distributorInstance.claim({from: all});
      // nothing happened
      expect((await erc20Instance.balanceOf(all)).toString()).to.be.equal(CONVERT_NEXTEP(50+101).div(10).mul(8).toString());
    })
  });
});
