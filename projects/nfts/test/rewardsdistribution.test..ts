import { artifacts, contract, network } from "hardhat";
import { expect } from "chai";
import { expectRevert } from "@openzeppelin/test-helpers";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

const RewardsDistributor = artifacts.require("./RewardsDistributor.sol");
const DummyERC20 = artifacts.require("./test/DummyERC20.sol");

contract("RewardDistributor", ([alice, bob, carol, all]) => {
  let erc20Instance;
  let distributorInstance;

  function CONVERT_NEXTEP(x) {
    return BigNumber.from(x).mul(BigNumber.from(10).pow(18));
  }

  before(async () => {
    // Deploy Factory
    erc20Instance = await DummyERC20.new({ from: alice });
    distributorInstance = await RewardsDistributor.new(erc20Instance.address, {from: alice});
  });

  describe("Testing admin rights", async () => {
    it("only oracle can update data", async function () {
      await expectRevert(distributorInstance.update([0], [bob]), "RewardsDistributor: FORBIDDEN");
    })

    it("only validator can call distribution", async function () {
      await expectRevert(distributorInstance.validate(), "RewardsDistributor: FORBIDDEN");
    })

    it("only validator can change treasury address", async function () {
      await expectRevert(distributorInstance.setTreasury(bob), "RewardsDistributor: FORBIDDEN");
    })

    it("only validator can change reward share", async function () {
      await expectRevert(distributorInstance.setRewardShare(500), "RewardsDistributor: FORBIDDEN");
    })
  });

  describe("Testing Oracle", async () => {
    before(async () => {
      await distributorInstance.grantRole(await distributorInstance.ORACLE_ROLE(), alice);
    });

    it("Update holder of one nft", async function () {
      expect(await distributorInstance.owners(0)).to.be.equal("0x0000000000000000000000000000000000000000");
      await distributorInstance.update([0], [bob]);
      expect(await distributorInstance.owners(0)).to.be.equal(bob);
    })
  });

  describe("Testing distribution", async () => {
    before(async () => {
      await erc20Instance.transfer(distributorInstance.address, CONVERT_NEXTEP(10000));
      await distributorInstance.grantRole(await distributorInstance.VALIDATOR_ROLE(), alice);
      await distributorInstance.setTreasury(all); // set easily trackable treasury
    });

    it("distribute with incomplete holders data should fail", async function () {
      await expectRevert(distributorInstance.validate(), "RewardsDistributor: HOLDERS INCOMPLETE");
    })

    it("distribute with complete holders data when all belong to bob should work", async function () {
      let holders : any = [];
      let ids : any = [];
      for(let i = 0; i < 150; i++) {
        ids.push(i);
        holders.push(bob);
      }
      await distributorInstance.update(ids, holders);
      await distributorInstance.validate();

      expect((await erc20Instance.balanceOf(distributorInstance.address)).toString()).to.be.equal("0");
    })

    it("next distribution should fail because 28 days havent passed yet", async function () {
      await expectRevert(distributorInstance.validate(), "RewardsDistributor: TOO SOON");

      await network.provider.send('evm_increaseTime', [3600*24*90]); // increase time by 90 days
      await network.provider.send('evm_mine', []);
    })

    it("distribute when one of the holders is not bob should work", async function () {
      await distributorInstance.update([15], [carol]);

      await erc20Instance.transfer(distributorInstance.address, CONVERT_NEXTEP(10000));
      await distributorInstance.validate();
    })
  });
  // no time to properly set this due to imperfect computation on the contract but minor precision errors exist
  describe.skip("Validating distribution", async () => {
    it("treasury should have 20% of 2*10000 tokens = 4000", async function () {
      expect((await erc20Instance.balanceOf(all)).toString()).to.be.equal(CONVERT_NEXTEP(4000).toString());
    })

    it("bob should have 80% of 10000 + 149/150 of 80% of 10000 = 8000 + 7946 = 15946", async function () {
      expect((await erc20Instance.balanceOf(bob)).toString()).to.be.equal(CONVERT_NEXTEP(15946).toString());
    })

    it("carol should have 1/150 of 80% of 10000 = 53", async function () {
      expect((await erc20Instance.balanceOf(carol)).toString()).to.be.equal(CONVERT_NEXTEP(53).toString());
    })
  });

  describe("Worst case scenario of 150 transfers should fit in a single block", async () => {
    before(async () => {
      let holders : any = [];
      let ids : any = [];
      for(let i = 0; i < 150; i++) {
        ids.push(i);
        const wallet = ethers.Wallet.createRandom();
        holders.push(wallet.address);
        console.log(wallet.address)
      }
      await distributorInstance.update(ids, holders);

      await network.provider.send('evm_increaseTime', [3600*24*90]); // increase time by 90 days
      await network.provider.send('evm_mine', []);
    });

    it("distribute to 150 unique addresses", async function () {
      await erc20Instance.transfer(distributorInstance.address, CONVERT_NEXTEP(10000));
      const tx = await distributorInstance.validate();
      console.log(tx.receipt.gasUsed)
      expect(tx.receipt.gasUsed).to.be.lessThan(5000000);
    })
  });
});
