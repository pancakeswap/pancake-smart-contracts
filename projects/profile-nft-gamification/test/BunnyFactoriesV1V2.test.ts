import { assert } from "chai";
import { expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { artifacts, contract, ethers } from "hardhat";

const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const BunnyFactoryV2 = artifacts.require("./archive/BunnyFactoryV2.sol");
const BunnyMintingFarm = artifacts.require("./BunnyMintingFarm.sol");
const PancakeBunnies = artifacts.require("./PancakeBunnies.sol");

contract("BunnyMintingFarm", ([alice, bob, carol, david, erin, frank, minterTester]) => {
  let mockCAKE,
    pancakeBunnies,
    pancakeBunniesAddress,
    bunnyMintingFarm,
    bunnyFactoryV2,
    bunnyMintingFarmAddress,
    result,
    result2;

  before(async () => {
    let _totalSupplyDistributed = 5;
    let _cakePerBurn = 20;
    let _testBaseURI = "ipfs://ipfs/";
    let _ipfsHash = "IPFSHASH/";
    let _endBlockTime = 150;

    mockCAKE = await MockBEP20.new("Pancake Mock Token", "CAKE", 10000, {
      from: minterTester,
    });

    bunnyMintingFarm = await BunnyMintingFarm.new(
      mockCAKE.address,
      _totalSupplyDistributed,
      _cakePerBurn,
      _testBaseURI,
      _ipfsHash,
      _endBlockTime,
      { from: alice }
    );

    bunnyMintingFarmAddress = bunnyMintingFarm.address;
    pancakeBunniesAddress = await bunnyMintingFarm.pancakeBunnies();
    pancakeBunnies = await PancakeBunnies.at(pancakeBunniesAddress);
  });

  // Check ticker, symbols, supply, and owner are correct
  describe("All contracts are deployed correctly", async () => {
    it("Symbol is correct", async () => {
      result = await pancakeBunnies.symbol();
      assert.equal(result, "PB");
    });
    it("Name is correct", async () => {
      result = await pancakeBunnies.name();
      assert.equal(result, "Pancake Bunnies");
    });
    it("Total supply + number of NFT distributed is 0", async () => {
      result = await pancakeBunnies.totalSupply();
      assert.equal(result, 0);
      result = await bunnyMintingFarm.totalSupplyDistributed();
      assert.equal(result, 5);
      result = await bunnyMintingFarm.currentDistributedSupply();
      assert.equal(result, 0);
    });
    it("Owner is the BunnyMintingFarm contract", async () => {
      result = await pancakeBunnies.owner();
      assert.equal(result, bunnyMintingFarmAddress);
      result = await bunnyMintingFarm.owner();
      assert.equal(result, alice);
    });
    it("MinterTester distributes tokens to accounts", async () => {
      result = await mockCAKE.totalSupply();
      assert.equal(result, 10000);
      result = await mockCAKE.balanceOf(minterTester);
      assert.equal(result, 10000);
      // transfer CAKE to 5 accounts
      await mockCAKE.transfer(alice, 500, { from: minterTester });
      await mockCAKE.transfer(bob, 300, { from: minterTester });
      await mockCAKE.transfer(carol, 500, { from: minterTester });
      await mockCAKE.transfer(david, 500, { from: minterTester });
      await mockCAKE.transfer(erin, 400, { from: minterTester });
      result = await mockCAKE.balanceOf(minterTester);
      assert.equal(result, 7800);
    });
  });

  // Check ticker and symbols are correct
  describe("Whitelisting works as intended", async () => {
    it("Only contract owner can whitelist", async () => {
      // Only contract owner can whitelist
      await expectRevert(
        bunnyMintingFarm.whitelistAddresses([alice, bob, carol, david, erin], { from: bob }),
        "Ownable: caller is not the owner"
      );

      // Whitelist addresses
      await bunnyMintingFarm.whitelistAddresses([alice, bob, carol, david, erin], { from: alice });
    });
  });

  describe("Tokens can be claimed", async () => {
    it("Only CAKE owner can mint once", async () => {
      result = await bunnyMintingFarm.hasClaimed(alice);
      assert.equal(result, false);

      result = await bunnyMintingFarm.canClaim(alice);
      assert.equal(result, true);

      result = await bunnyMintingFarm.mintNFT("3", { from: alice });

      // Obtain gas used from the receipt
      expectEvent(result, "BunnyMint", {
        to: alice,
        tokenId: "0",
        bunnyId: "3",
      });

      // check totalSupply and CAKE balance of Alice
      result = await pancakeBunnies.totalSupply();
      assert.equal(result, 1);
      result = await pancakeBunnies.balanceOf(alice);
      assert.equal(result, 1);
      result = await pancakeBunnies.ownerOf("0");
      assert.equal(result, alice);
      result = await bunnyMintingFarm.currentDistributedSupply();
      assert.equal(result, 1);
      result = await bunnyMintingFarm.hasClaimed(alice);
      assert.equal(result, true);

      // Check how many exists for a specific bunnyCount
      result = await pancakeBunnies.bunnyCount("3");
      assert.equal(result, 1);

      // Check token URI is ok
      result = await pancakeBunnies.tokenURI("0");
      assert.equal(result, "ipfs://ipfs/IPFSHASH/circular.json");

      // verify Alice cannot claim twice
      await expectRevert(bunnyMintingFarm.mintNFT("2", { from: alice }), "Has claimed");

      // verify someone needs to be whitelisted
      await expectRevert(bunnyMintingFarm.mintNFT("2", { from: frank }), "Cannot claim");

      result = await bunnyMintingFarm.canClaim(frank);
      assert.equal(result, false);

      // Frank is whitelisted by Alice
      await bunnyMintingFarm.whitelistAddresses([frank, minterTester], {
        from: alice,
      });

      result = await bunnyMintingFarm.canClaim(frank);
      assert.equal(result, true);

      // verify CAKE is required to mint the NFT
      await expectRevert(bunnyMintingFarm.mintNFT("2", { from: frank }), "Must own CAKE");
      // Verify that only bunnyIds strictly inferior to 5 are available (0, 1, 2, 3, 4)
      await expectRevert(bunnyMintingFarm.mintNFT("5", { from: bob }), "bunnyId unavailable");
    });

    it("It is not possible to mint more than expected", async () => {
      // 4 more accounts collect their NFTs
      await bunnyMintingFarm.mintNFT("1", { from: bob });
      await bunnyMintingFarm.mintNFT("2", { from: carol });
      await bunnyMintingFarm.mintNFT("2", { from: david });
      await bunnyMintingFarm.mintNFT("0", { from: erin });

      // Alice transfers 10 CAKE to Frank to verify he cannot participate
      await mockCAKE.transfer(frank, "10", { from: alice });
      await expectRevert(bunnyMintingFarm.mintNFT("2", { from: frank }), "Nothing left");

      // Check that currentDistributedSupply is equal to totalSupplyDistributed
      result = await bunnyMintingFarm.totalSupplyDistributed();
      result2 = await bunnyMintingFarm.currentDistributedSupply();
      assert.equal(result.toString(), result2.toString());

      // Check how many exists for a specific bunnyCount
      result = await pancakeBunnies.bunnyCount("0");
      assert.equal(result, 1);
      result = await pancakeBunnies.bunnyCount("1");
      assert.equal(result, 1);
      result = await pancakeBunnies.bunnyCount("2");
      assert.equal(result, 2);
      result = await pancakeBunnies.bunnyCount("3");
      assert.equal(result, 1);
      result = await pancakeBunnies.bunnyCount("4");
      assert.equal(result, 0);
      result = await pancakeBunnies.bunnyCount("5");
      assert.equal(result, 0);
    });

    it("Names and ids of Bunnies are appropriate", async () => {
      result = await pancakeBunnies.getBunnyName(0);
      assert.equal(result, "Swapsies");
      result = await pancakeBunnies.getBunnyName(1);
      assert.equal(result, "Drizzle");
      result = await pancakeBunnies.getBunnyName(2);
      assert.equal(result, "Blueberries");
      result = await pancakeBunnies.getBunnyName(3);
      assert.equal(result, "Circular");
      result = await pancakeBunnies.getBunnyName(4);
      assert.equal(result, "Sparkle");

      result = await pancakeBunnies.getBunnyId(0);
      assert.equal(result, 3);
      result = await pancakeBunnies.getBunnyId(1);
      assert.equal(result, 1);
      result = await pancakeBunnies.getBunnyId(2);
      assert.equal(result, 2);
      result = await pancakeBunnies.getBunnyId(3);
      assert.equal(result, 2);
      result = await pancakeBunnies.getBunnyId(4);
      assert.equal(result, 0);

      result = await pancakeBunnies.getBunnyNameOfTokenId(0);
      assert.equal(result, "Circular");
      result = await pancakeBunnies.getBunnyNameOfTokenId(1);
      assert.equal(result, "Drizzle");
      result = await pancakeBunnies.getBunnyNameOfTokenId(2);
      assert.equal(result, "Blueberries");
      result = await pancakeBunnies.getBunnyNameOfTokenId(3);
      assert.equal(result, "Blueberries");
      result = await pancakeBunnies.getBunnyNameOfTokenId(4);
      assert.equal(result, "Swapsies");
    });

    it("Users can only burns tokens they own", async () => {
      // Alice transfers number cakePerBurn * totalSupplyDistributed to the contract
      result = await mockCAKE.transfer(bunnyMintingFarmAddress, 100, {
        from: alice,
      });
      expectEvent(result, "Transfer", {
        from: alice,
        to: bunnyMintingFarmAddress,
        value: "100",
      });

      // Verify that nothing was burnt
      result = await bunnyMintingFarm.countBunniesBurnt();
      assert.equal(result, "0");

      // Test that it fails without owning the token
      await expectRevert(bunnyMintingFarm.burnNFT("1", { from: carol }), "Not the owner");

      result = await bunnyMintingFarm.burnNFT("2", { from: carol });

      expectEvent(result, "BunnyBurn", {
        from: carol,
        tokenId: "2",
      });

      // Check that one NFT was burnt
      result = await bunnyMintingFarm.countBunniesBurnt();
      assert.equal(result, "1");

      // Check Carol has no NFT
      result = await pancakeBunnies.balanceOf(carol);
      assert.equal(result, 0);

      // Check CAKE balance of the account decreases
      result = await mockCAKE.balanceOf(bunnyMintingFarmAddress);
      assert.equal(result, 80);
    });

    it("Alice only can withdraw after the time", async () => {
      // Alice tries to withdraw CAKE tokens before the end
      await expectRevert(bunnyMintingFarm.withdrawCake(80, { from: alice }), "too early");

      // move the current block to the _endBlockTime
      await time.advanceBlockTo(150);

      // Frank tries to steal it
      await expectRevert(bunnyMintingFarm.withdrawCake(80, { from: frank }), "Ownable: caller is not the owner");

      // Bob tries to burn his NFT (tokenId = 2)
      await expectRevert(bunnyMintingFarm.burnNFT("1", { from: bob }), "too late");

      // Alice tries to withdraw more
      await expectRevert(
        bunnyMintingFarm.withdrawCake(2000, { from: alice }),
        "BEP20: transfer amount exceeds balance"
      );

      await bunnyMintingFarm.withdrawCake(80, { from: alice });

      result = await mockCAKE.balanceOf(alice);

      // Verify CAKE balance of Alice is updated
      assert.equal(result.toString(), "470"); // she gave 10 to Frank - 20 burn

      // Verify CAKE balance of BunnyMintingFarm contract is 0
      result = await mockCAKE.balanceOf(bunnyMintingFarmAddress);
      assert.equal(result, 0);
    });
  });

  describe("BunnyFactoryV2", async () => {
    it("NFT contract cannot change owner by a third party", async () => {
      result2 = await pancakeBunnies.owner();

      // Check that only the owner of the bunnyMintingFarm can call it
      await expectRevert(
        bunnyMintingFarm.changeOwnershipNFTContract(carol, { from: bob }),
        "Ownable: caller is not the owner"
      );
    });

    it("NFT contract owner changes correctly", async () => {
      // Alice, the owner, calls to change the ownership of the PancakeBunnies contract to Bob
      result = await bunnyMintingFarm.changeOwnershipNFTContract(bob, {
        from: alice,
      });

      expectEvent(result, "OwnershipTransferred", {
        previousOwner: bunnyMintingFarmAddress,
        newOwner: bob,
      });

      // Check the new owner
      result = await pancakeBunnies.owner();

      // Verify that the old owner is not the new owner
      assert.notEqual(result, result2);
      // Verify that the new owner is Bob
      assert.equal(result, bob);
    });
  });

  describe("BunnyMintingFactoryV2", async () => {
    it("BunnyMintingFactoryV2 is deployed", async () => {
      const _ipfsHash = "testIpfsHash/";
      const _tokenPrice = "4000000000000000000";
      const _endBlockNumber = 350;
      const _startBlockNumber = 1;

      bunnyFactoryV2 = await BunnyFactoryV2.new(
        pancakeBunnies.address,
        mockCAKE.address,
        _tokenPrice,
        _ipfsHash,
        _startBlockNumber,
        _endBlockNumber,
        { from: alice }
      );

      // Transfer ownership to Alice
      result = await pancakeBunnies.transferOwnership(bunnyFactoryV2.address, { from: bob });

      expectEvent(result, "OwnershipTransferred", {
        previousOwner: bob,
        newOwner: bunnyFactoryV2.address,
      });

      // Check the new owner is BunnyFactoryV2
      assert.equal(await pancakeBunnies.owner(), bunnyFactoryV2.address);
      assert.equal(await bunnyFactoryV2.startBlockNumber(), _startBlockNumber);
      assert.equal(await bunnyFactoryV2.endBlockNumber(), _endBlockNumber);
      assert.equal(await bunnyFactoryV2.tokenPrice(), _tokenPrice);
    });

    it("Bunny Names and json extensions are set", async () => {
      result = await bunnyFactoryV2.setBunnyNames("MyBunny5", "MyBunny6", "MyBunny7", "MyBunny8", "MyBunny9", {
        from: alice,
      });

      result = await pancakeBunnies.getBunnyName("5");
      assert.equal(result, "MyBunny5");

      result = await pancakeBunnies.getBunnyName("6");
      assert.equal(result, "MyBunny6");

      result = await pancakeBunnies.getBunnyName("7");
      assert.equal(result, "MyBunny7");

      result = await pancakeBunnies.getBunnyName("8");
      assert.equal(result, "MyBunny8");

      result = await pancakeBunnies.getBunnyName("9");
      assert.equal(result, "MyBunny9");

      result = await bunnyFactoryV2.setBunnyJson("test5.json", "test6.json", "test7.json", "test8.json", "test9.json", {
        from: alice,
      });
    });

    it("Alice can mint", async () => {
      // Alice mints 10 CAKE
      await mockCAKE.mintTokens("10000000000000000000", { from: alice });

      // CAKE was not approved
      await expectRevert(bunnyFactoryV2.mintNFT("6", { from: alice }), "BEP20: transfer amount exceeds allowance");

      result = await mockCAKE.approve(bunnyFactoryV2.address, "10000000000000000000", { from: alice });

      expectEvent(result, "Approval");

      // Cannot mint old series
      await expectRevert(bunnyFactoryV2.mintNFT("4", { from: alice }), "bunnyId too low");

      // Cannot mint series that do not exist
      await expectRevert(bunnyFactoryV2.mintNFT("10", { from: alice }), "bunnyId too high");

      assert.equal(await bunnyFactoryV2.hasClaimed(alice), false);

      result = await bunnyFactoryV2.mintNFT("6", { from: alice });

      expectEvent(result, "BunnyMint", {
        to: alice,
        tokenId: "5",
        bunnyId: "6",
      });

      result = await pancakeBunnies.totalSupply();
      assert.equal(result.toString(), "5");
      assert.equal(await bunnyFactoryV2.hasClaimed(alice), true);

      result = await pancakeBunnies.bunnyCount("6");
      assert.equal(result.toString(), "1");

      result = await pancakeBunnies.getBunnyNameOfTokenId("5");
      assert.equal(result, "MyBunny6");

      result = await pancakeBunnies.getBunnyId("5");
      assert.equal(result, "6");

      result = await mockCAKE.balanceOf(bunnyFactoryV2.address);
      assert.equal(result, "4000000000000000000");
    });
    it("Alice cannot mint twice", async () => {
      await expectRevert(bunnyFactoryV2.mintNFT("7", { from: alice }), "Has claimed");
    });
    it("Alice cannot mint twice", async () => {
      await expectRevert(bunnyFactoryV2.mintNFT("7", { from: alice }), "Has claimed");
    });
    it("Bob cannot mint if too early or too late", async () => {
      // Bob mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCAKE.mintTokens("2000000000000000000", { from: bob });
      }

      await mockCAKE.approve(bunnyFactoryV2.address, "10000000000000000000", {
        from: bob,
      });

      await bunnyFactoryV2.setStartBlockNumber(352, { from: alice });

      // move the current block to the _endBlockTime
      await time.advanceBlockTo(350);

      await expectRevert(bunnyFactoryV2.mintNFT("7", { from: bob }), "too early");

      await bunnyFactoryV2.setEndBlockNumber(360, { from: alice });

      // move the current block to the _endBlockTime
      await time.advanceBlockTo(361);

      await expectRevert(bunnyFactoryV2.mintNFT("7", { from: bob }), "too late");
    });
    it("Block number functions revert as expected", async () => {
      // Admin function
      await expectRevert(bunnyFactoryV2.setStartBlockNumber(10, { from: alice }), "too short");

      await expectRevert(bunnyFactoryV2.setEndBlockNumber(10, { from: alice }), "too short");

      await bunnyFactoryV2.setStartBlockNumber(600, { from: alice });

      await expectRevert(bunnyFactoryV2.setEndBlockNumber(600, { from: alice }), "must be > startBlockNumber");

      // move the current block to 600
      await time.advanceBlockTo(600);

      await bunnyFactoryV2.setEndBlockNumber(1000, { from: alice });
    });

    it("Fee is changed and Bob mints", async () => {
      // 2 CAKE
      const _newPrice = "2000000000000000000";
      await bunnyFactoryV2.updateTokenPrice(_newPrice, { from: alice });

      result = await bunnyFactoryV2.mintNFT("8", { from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "6",
        bunnyId: "8",
      });

      result = await pancakeBunnies.totalSupply();
      assert.equal(result.toString(), "6");

      assert.equal(await bunnyFactoryV2.hasClaimed(bob), true);

      result = await pancakeBunnies.bunnyCount("8");
      assert.equal(result.toString(), "1");

      result = await pancakeBunnies.getBunnyNameOfTokenId("6");
      assert.equal(result, "MyBunny8");

      result = await pancakeBunnies.getBunnyId("6");
      assert.equal(result, "8");

      result = await mockCAKE.balanceOf(bunnyFactoryV2.address);
      assert.equal(result, "6000000000000000000");
    });

    it("Alice can claim fee", async () => {
      await bunnyFactoryV2.claimFee("6000000000000000000", { from: alice });
      result = await mockCAKE.balanceOf(bunnyFactoryV2.address);
      assert.equal(result, "0");
    });

    it("Frank cannot access functions as he is not owner", async () => {
      await expectRevert(
        bunnyFactoryV2.changeOwnershipNFTContract(frank, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.claimFee("1", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.setBunnyJson("a1", "a2", "a3", "a4", "a5", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.setBunnyNames("a1", "a2", "a3", "a4", "a5", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.setStartBlockNumber(1, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.setEndBlockNumber(1, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV2.updateTokenPrice(0, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Contract is transferred", async () => {
      // Transfer ownership to Bob
      result = await bunnyFactoryV2.changeOwnershipNFTContract(bob, {
        from: alice,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeBunnies, "OwnershipTransferred");
      // Check the new owner is Bob
      assert.equal(await pancakeBunnies.owner(), bob);
    });
  });
});
