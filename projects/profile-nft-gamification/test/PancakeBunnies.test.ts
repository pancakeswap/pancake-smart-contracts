import { assert } from "chai";
import { constants, expectEvent, expectRevert } from "@openzeppelin/test-helpers";

import { artifacts, contract, ethers } from "hardhat";

const PancakeBunnies = artifacts.require("./PancakeBunnies.sol");

contract("PancakeBunnies", ([alice, bob, carol]) => {
  let pancakeBunnies;
  let result;

  before(async () => {
    const _testBaseURI = "ipfs://ipfs/";
    pancakeBunnies = await PancakeBunnies.new(_testBaseURI, { from: alice });
  });

  // Check ticker and symbols are correct
  describe("The NFT contract is properly deployed.", async () => {
    it("Symbol is correct", async () => {
      result = await pancakeBunnies.symbol();
      assert.equal(result, "PB");
    });
    it("Name is correct", async () => {
      result = await pancakeBunnies.name();
      assert.equal(result, "Pancake Bunnies");
    });
    it("Total supply is 0", async () => {
      result = await pancakeBunnies.totalSupply();
      assert.equal(result, "0");
      result = await pancakeBunnies.balanceOf(alice);
      assert.equal(result, "0");
    });
    it("Owner is Alice", async () => {
      result = await pancakeBunnies.owner();
      assert.equal(result, alice);
    });
  });

  // Verify that ERC721 tokens can be minted, deposited and transferred
  describe("ERC721 are correctly minted, deposited, transferred", async () => {
    let testTokenURI = "testURI";
    let testbunnyId1 = "3";
    let testbunnyId2 = "1";

    it("NFT token is minted properly", async () => {
      result = await pancakeBunnies.mint(alice, testTokenURI, testbunnyId1, {
        from: alice,
      });
      expectEvent(result, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: alice,
        tokenId: "0",
      });
      result = await pancakeBunnies.totalSupply();
      assert.equal(result, "1");
      result = await pancakeBunnies.tokenURI("0");
      assert.equal(result, "ipfs://ipfs/testURI");
      result = await pancakeBunnies.balanceOf(alice);
      assert.equal(result, "1");
      result = await pancakeBunnies.ownerOf("0");
      assert.equal(result, alice);
      result = await pancakeBunnies.getBunnyId("0");
      assert.equal(result, "3");
    });

    it("NFT token is transferred to Bob", async () => {
      result = await pancakeBunnies.safeTransferFrom(alice, bob, "0", {
        from: alice,
      });
      expectEvent(result, "Transfer", {
        from: alice,
        to: bob,
        tokenId: "0",
      });
      result = await pancakeBunnies.balanceOf(alice);
      assert.equal(result, "0");
      result = await pancakeBunnies.balanceOf(bob);
      assert.equal(result, "1");
      result = await pancakeBunnies.ownerOf("0");
      assert.equal(result, bob);
    });

    it("Second token is minted to Bob", async () => {
      result = await pancakeBunnies.mint(bob, testTokenURI, testbunnyId2, {
        from: alice,
      });
      expectEvent(result, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: bob,
        tokenId: "1",
      });
      result = await pancakeBunnies.totalSupply();
      assert.equal(result, "2");
      result = await pancakeBunnies.balanceOf(bob);
      assert.equal(result, "2");
      result = await pancakeBunnies.getBunnyId("1");
      assert.equal(result, "1");
      await expectRevert(
        pancakeBunnies.safeTransferFrom(alice, bob, "0", {
          from: alice,
        }),
        "ERC721: transfer caller is not owner nor approved"
      );
    });

    it("Alice let Carol spend her NFT", async () => {
      await expectRevert(
        pancakeBunnies.approve(carol, "1", { from: alice }),
        "ERC721: approve caller is not owner nor approved for all"
      );

      result = await pancakeBunnies.approve(carol, "1", { from: bob });
      expectEvent(result, "Approval", {
        owner: bob,
        approved: carol,
        tokenId: "1",
      });
    });
  });
});
