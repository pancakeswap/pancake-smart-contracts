import { assert } from "chai";
import { BN, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { artifacts, contract } from "hardhat";
import { parseEther } from "ethers/lib/utils";

const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const MockBunnies = artifacts.require("./utils/MockBunnies.sol");
const AnniversaryAchievement = artifacts.require("./AnniversaryAchievement.sol");
const BunnyFactoryV2 = artifacts.require("./old/BunnyFactoryV2.sol");
const BunnyFactoryV3 = artifacts.require("./BunnyFactoryV3.sol");
const BunnySpecialV1 = artifacts.require("./BunnySpecialV1.sol");
const BunnySpecialV2 = artifacts.require("./BunnySpecialV2.sol");
const BunnyCakeVault = artifacts.require("./BunnySpecialCakeVault.sol");
const BunnyPrediction = artifacts.require("./BunnySpecialPrediction.sol");
const BunnyMintingStation = artifacts.require("./BunnyMintingStation.sol");
const PancakeBunnies = artifacts.require("./PancakeBunnies.sol");
const PancakeProfile = artifacts.require("./PancakeProfile.sol");
const BunnySpecialLottery = artifacts.require("./BunnySpecialLottery.sol");
const BunnySpecialAdmin = artifacts.require("./BunnySpecialAdmin.sol");

// CAKE VAULT
const CakeVault = artifacts.require("pancake-cake-vault/contracts/CakeVault.sol");
const CakeToken = artifacts.require("./test/CakeToken.sol");
const SyrupBar = artifacts.require("./test/SyrupBar.sol");
const MasterChef = artifacts.require("./test/MasterChef.sol");

// PREDICTION
const BnbPricePrediction = artifacts.require("predictions/contracts/BnbPricePrediction.sol");
const MockAggregatorV3 = artifacts.require("test/MockAggregatorV3.sol");

// LOTTERY
const MockPancakeSwapLottery = artifacts.require("test/MockPancakeSwapLottery.sol");

contract("BunnyFactoryV3 and above", ([alice, bob, carol, david, eve, frank]) => {
  let anniversaryAchievement;
  let bunnyFactoryV2;
  let bunnyFactoryV3;
  let bunnyMintingStation;
  let bunnySpecialV1;
  let bunnySpecialV2;
  let mockCAKE;
  let pancakeBunnies;
  let pancakeProfile;
  let mockBunnies;

  let vault;
  let masterchef;
  let cake;
  let syrup;
  let rewardsStartBlock;
  let bunnyCakeVault;

  let prediction;
  let mockAggregatorV3;
  let bunnyPrediction;

  let pancakeSwapLottery;
  let bunnySpecialLottery;

  let bunnySpecialAdmin;

  let result;
  let currentBlockNumber;
  let currentTimestamp;
  let DEFAULT_ADMIN_ROLE;
  let MINTER_ROLE;
  let POINT_ROLE;

  const _tokenPrice = parseEther("1"); // 1 CAKE
  const _ipfsHash = "test/";
  const _endBlockNumberV2 = "700";
  const _startBlockNumberV2 = "1";
  const _startBlockNumberV3 = "1000";

  // PancakeSwap Profile related.
  const _numberPoints = 100;
  const _campaignId = "123456789";

  before(async () => {
    mockCAKE = await MockBEP20.new("Pancake Mock Token", "CAKE", 0, {
      from: alice,
    });

    pancakeBunnies = await PancakeBunnies.new("ipfs://", { from: alice });

    // Deploy V2
    bunnyFactoryV2 = await BunnyFactoryV2.new(
      pancakeBunnies.address,
      mockCAKE.address,
      _tokenPrice,
      _ipfsHash,
      _startBlockNumberV2,
      _endBlockNumberV2,
      { from: alice }
    );

    // Transfer ownership to V2
    await pancakeBunnies.transferOwnership(bunnyFactoryV2.address, {
      from: alice,
    });

    await bunnyFactoryV2.setBunnyNames("MyBunny5", "MyBunny6", "MyBunny7", "MyBunny8", "MyBunny9", {
      from: alice,
    });

    await bunnyFactoryV2.setBunnyJson("test5.json", "test6.json", "test7.json", "test8.json", "test9.json", {
      from: alice,
    });

    await mockCAKE.mintTokens("1000000000000000000", { from: alice });

    await mockCAKE.approve(bunnyFactoryV2.address, "1000000000000000000", {
      from: alice,
    });

    await bunnyFactoryV2.mintNFT("6", { from: alice });

    bunnyMintingStation = await BunnyMintingStation.new(pancakeBunnies.address);

    bunnyFactoryV3 = await BunnyFactoryV3.new(
      bunnyFactoryV2.address,
      bunnyMintingStation.address,
      mockCAKE.address,
      _tokenPrice,
      _ipfsHash,
      _startBlockNumberV3,
      { from: alice }
    );

    await bunnyFactoryV2.changeOwnershipNFTContract(bunnyMintingStation.address, {
      from: alice,
    });

    DEFAULT_ADMIN_ROLE = await bunnyMintingStation.DEFAULT_ADMIN_ROLE();
    MINTER_ROLE = await bunnyMintingStation.MINTER_ROLE();

    // CAKE VAULT
    rewardsStartBlock = (await time.latestBlock()).toNumber();
    cake = await CakeToken.new({ from: alice });
    syrup = await SyrupBar.new(cake.address, { from: alice });
    masterchef = await MasterChef.new(cake.address, syrup.address, alice, parseEther("1"), rewardsStartBlock, {
      from: alice,
    }); // 1 cake per block, starts at +100 block of each test
    vault = await CakeVault.new(cake.address, syrup.address, masterchef.address, bob, carol, { from: alice });

    await cake.mint(alice, parseEther("100"), { from: alice });
    await cake.mint(bob, parseEther("100"), { from: alice });
    await cake.mint(carol, parseEther("100"), { from: alice });
    await cake.mint(frank, parseEther("100"), { from: alice });
    await cake.approve(vault.address, parseEther("1000"), { from: alice });
    await cake.approve(vault.address, parseEther("1000"), { from: bob });
    await cake.approve(vault.address, parseEther("1000"), { from: carol });
    await cake.approve(vault.address, parseEther("1000"), { from: frank });
    await cake.transferOwnership(masterchef.address, { from: alice });
    await syrup.transferOwnership(masterchef.address, { from: alice });

    // PREDICTION
    mockAggregatorV3 = await MockAggregatorV3.new("8", "10000000000", { from: alice });
    prediction = await BnbPricePrediction.new(mockAggregatorV3.address, alice, alice, 20, parseEther("1"), 1, 1, {
      from: alice,
    });

    // LOTTERY
    mockBunnies = await MockBunnies.new({ from: alice });
    pancakeSwapLottery = await MockPancakeSwapLottery.new(cake.address);
  });

  describe("All new contracts are deployed correctly", async () => {
    it("Symbol and names are correct", async () => {
      assert.equal(await pancakeBunnies.symbol(), "PB");
      assert.equal(await pancakeBunnies.name(), "Pancake Bunnies");
    });

    it("Owners & roles are ok", async () => {
      assert.equal(await pancakeBunnies.owner(), bunnyMintingStation.address);
      assert.equal(await bunnyFactoryV3.owner(), alice);
      assert.equal(await bunnyFactoryV3.canMint(alice), false);
      assert.equal(await bunnyFactoryV3.canMint(bob), true);
      assert.equal(await bunnyMintingStation.getRoleMemberCount(DEFAULT_ADMIN_ROLE), "1");
      assert.equal(await bunnyMintingStation.getRoleMemberCount(MINTER_ROLE), "0");
    });
  });

  describe("BunnyMintingStation works", async () => {
    it("Only approved admin can mint", async () => {
      await expectRevert(
        bunnyMintingStation.mintCollectible(alice, "aliceBunny.json", "10", {
          from: alice,
        }),
        "Not a minting role"
      );
    });

    it("Security checks are executed", async () => {
      await expectRevert(bunnyFactoryV3.mintNFT(1, { from: bob }), "too early");

      await time.advanceBlockTo(1001);

      await expectRevert(bunnyFactoryV3.mintNFT(4, { from: bob }), "bunnyId too low");

      await expectRevert(bunnyFactoryV3.mintNFT(10, { from: bob }), "bunnyId too high");

      await expectRevert(bunnyFactoryV3.mintNFT(5, { from: bob }), "BEP20: transfer amount exceeds balance");

      await mockCAKE.mintTokens("100000000000000000000", { from: bob });

      result = await mockCAKE.approve(bunnyFactoryV3.address, "100000000000000000000", { from: bob });

      expectEvent(result, "Approval");

      assert.equal(await bunnyFactoryV3.canMint(bob), true);

      await expectRevert(bunnyFactoryV3.mintNFT(9, { from: bob }), "Not a minting role");
    });

    it("Alice adds minting role for bunnyMintingStation", async () => {
      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnyFactoryV3.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnyFactoryV3.address,
        sender: alice,
      });

      await bunnyMintingStation.setBunnyName(5, "MyBunny5", { from: alice });
      await bunnyMintingStation.setBunnyName(6, "MyBunny6", { from: alice });
      await bunnyMintingStation.setBunnyName(7, "MyBunny7", { from: alice });
      await bunnyMintingStation.setBunnyName(8, "MyBunny8", { from: alice });
      await bunnyMintingStation.setBunnyName(9, "MyBunny9", { from: alice });

      result = await bunnyFactoryV3.setBunnyJson("test5.json", "test6.json", "test7.json", "test8.json", "test9.json", {
        from: alice,
      });

      assert.equal(await bunnyFactoryV3.hasClaimed(bob), false);
      assert.equal(await bunnyFactoryV3.canMint(bob), true);

      result = await bunnyFactoryV3.mintNFT(9, { from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "1",
        bunnyId: "9",
      });

      assert.equal(await bunnyFactoryV3.canMint(bob), false);
      assert.equal(await bunnyFactoryV3.hasClaimed(bob), true);

      assert.equal(await pancakeBunnies.totalSupply(), "2");
      assert.equal(await pancakeBunnies.tokenURI(1), "ipfs://test/test9.json");
    });

    it("Bob cannot claim twice", async () => {
      await expectRevert(bunnyFactoryV3.mintNFT(9, { from: bob }), "Has claimed");
    });

    it("Alice changes the block number", async () => {
      await expectRevert(bunnyFactoryV3.setStartBlockNumber("10", { from: alice }), "too short");

      await bunnyFactoryV3.setStartBlockNumber("1200", { from: alice });
      assert.equal(await bunnyFactoryV3.startBlockNumber(), "1200");

      await expectRevert(bunnyFactoryV3.mintNFT(6, { from: carol }), "too early");
    });

    it("Alice updates token price to 5 BUSD", async () => {
      await time.advanceBlockTo(1201);

      await bunnyFactoryV3.updateTokenPrice("5000000000000000000", {
        from: alice,
      });
      assert.equal(await bunnyFactoryV3.tokenPrice(), "5000000000000000000");
    });

    it("Carol mints a NFT for 5 BUSD", async () => {
      await mockCAKE.mintTokens("100000000000000000000", { from: carol });

      await mockCAKE.approve(bunnyFactoryV3.address, "100000000000000000000", {
        from: carol,
      });

      result = await bunnyFactoryV3.mintNFT(6, { from: carol });

      expectEvent(result, "BunnyMint", {
        to: carol,
        tokenId: "2",
        bunnyId: "6",
      });

      result = await mockCAKE.balanceOf(carol);

      assert.equal(result.toString(), "95000000000000000000"); // 95 CAKE

      assert.equal(await pancakeBunnies.totalSupply(), "3");
      assert.equal(await pancakeBunnies.tokenURI(2), "ipfs://test/test6.json");
    });

    it("Alice claims CAKE fees", async () => {
      await bunnyFactoryV3.claimFee("6000000000000000000", { from: alice });

      result = await mockCAKE.balanceOf(bunnyFactoryV3.address);
      assert.equal(result.toString(), "0");

      result = await mockCAKE.balanceOf(alice);
      assert.equal(result.toString(), "6000000000000000000");
    });
  });

  describe("Admin and ownership tests", async () => {
    it("Frank cannot access functions as he is not owner of BunnyFactoryV3", async () => {
      await expectRevert(
        bunnyFactoryV3.transferOwnership(frank, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV3.claimFee("1", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV3.setStartBlockNumber(1, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV3.updateTokenPrice(1, {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnyFactoryV3.setBunnyJson("a1", "a2", "a3", "a4", "a5", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Frank cannot access functions as he is not main admin of BunnyMintingFarm", async () => {
      await expectRevert(
        bunnyMintingStation.setBunnyName(1, "Poopies", {
          from: frank,
        }),
        "Not an admin role"
      );

      await expectRevert(
        bunnyMintingStation.changeOwnershipNFTContract(frank, {
          from: frank,
        }),
        "Not an admin role"
      );
    });

    it("Alice can transfer ownership of PancakeBunnies", async () => {
      result = await bunnyMintingStation.changeOwnershipNFTContract(alice, {
        from: alice,
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeBunnies, "OwnershipTransferred", {
        previousOwner: bunnyMintingStation.address,
        newOwner: alice,
      });

      assert.equal(await pancakeBunnies.owner(), alice);
    });

    it("Alice cannot mint anymore since she minted in V2", async () => {
      assert.equal(await bunnyFactoryV3.canMint(alice), false);
      await expectRevert(bunnyFactoryV3.mintNFT(9, { from: alice }), "Has claimed in v2");
    });

    it("David cannot mint anymore", async () => {
      await mockCAKE.mintTokens("100000000000000000000", { from: david });

      await mockCAKE.approve(bunnyFactoryV3.address, "100000000000000000000", { from: david });

      await expectRevert(bunnyFactoryV3.mintNFT(9, { from: david }), "Ownable: caller is not the owner");
    });

    it("Alice transfers ownership back to BunnyMintingStation", async () => {
      result = await pancakeBunnies.transferOwnership(bunnyMintingStation.address, {
        from: alice,
      });

      expectEvent(result, "OwnershipTransferred", {
        previousOwner: alice,
        newOwner: bunnyMintingStation.address,
      });

      assert.equal(await pancakeBunnies.owner(), bunnyMintingStation.address);
    });
  });
  describe("BunnySpecialV1", async () => {
    it("Alice deploys PancakeProfile and Bob creates a profile", async () => {
      const _numberCakeToReactivate = parseEther("2"); // 2 CAKE
      const _numberCakeToRegister = parseEther("1"); // 1 CAKE
      const _numberCakeToUpdate = parseEther("2"); // 2 CAKE

      pancakeProfile = await PancakeProfile.new(
        mockCAKE.address,
        _numberCakeToReactivate,
        _numberCakeToRegister,
        _numberCakeToUpdate,
        { from: alice }
      );

      // PancakeSwap Profile roles.
      POINT_ROLE = await pancakeProfile.POINT_ROLE();

      await pancakeProfile.addTeam("The Testers", "ipfs://hash/team1.json", {
        from: alice,
      });

      await pancakeProfile.addNftAddress(pancakeBunnies.address, {
        from: alice,
      });

      await pancakeBunnies.approve(pancakeProfile.address, "1", {
        from: bob,
      });

      await mockCAKE.approve(pancakeProfile.address, parseEther("500"), {
        from: bob,
      });

      await pancakeProfile.createProfile("1", pancakeBunnies.address, "1", {
        from: bob,
      });
    });

    it("Alice deploys BunnySpecialV1", async () => {
      bunnySpecialV1 = await BunnySpecialV1.new(
        bunnyMintingStation.address,
        mockCAKE.address,
        pancakeProfile.address,
        "10",
        { from: alice }
      );

      assert.equal(await bunnySpecialV1.maxViewLength(), "10");
      assert.equal(await bunnySpecialV1.owner(), alice);
    });

    it("It is not possible to claim if NFT doesn't exist", async () => {
      await expectRevert(bunnySpecialV1.mintNFT(9, { from: bob }), "ERR_ID_LOW");

      await expectRevert(bunnySpecialV1.mintNFT(10, { from: bob }), "ERR_ID_INVALID");
    });

    it("Alice adds a new bunnyId", async () => {
      await bunnyMintingStation.setBunnyName("10", "Hiccup", { from: alice });
      assert.equal(await pancakeBunnies.getBunnyName("10"), "Hiccup");
      result = await bunnySpecialV1.addBunny(10, "hash/hiccup.json", 2, 0, {
        from: alice,
      });

      expectEvent(result, "BunnyAdd", {
        bunnyId: "10",
        thresholdUser: "2",
        costCake: "0",
      });

      result = await bunnySpecialV1.bunnyCharacteristics("10");

      assert.equal(result[0], "hash/hiccup.json");
      assert.equal(result[1], "2");
      assert.equal(result[2], "0");
      assert.equal(result[3], true);
      assert.equal(result[4], true);

      result = await bunnySpecialV1.bunnyCharacteristics("11");

      assert.equal(result[0], "");
      assert.equal(result[1], "0");
      assert.equal(result[2], "0");
      assert.equal(result[3], false);
      assert.equal(result[4], false);
    });

    it("Bob cannot mint until it is supported as a minter", async () => {
      await expectRevert(bunnySpecialV1.mintNFT(10, { from: bob }), "Not a minting role");

      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnySpecialV1.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnySpecialV1.address,
        sender: alice,
      });
    });

    it("Bob can mint", async () => {
      assert.equal(await bunnySpecialV1.canClaimSingle(bob, "10"), true);
      assert.equal(await bunnySpecialV1.canClaimSingle(bob, "11"), false);
      assert.equal(await bunnySpecialV1.canClaimSingle(bob, "9"), false);

      result = await bunnySpecialV1.mintNFT(10, { from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "3",
        bunnyId: "10",
      });

      assert.equal(await pancakeBunnies.tokenURI("3"), "ipfs://hash/hiccup.json");
      assert.equal(await pancakeBunnies.getBunnyNameOfTokenId("3"), "Hiccup");
      assert.equal(await bunnySpecialV1.canClaimSingle(bob, "10"), false);
    });

    it("Bob cannot mint twice", async () => {
      await expectRevert(bunnySpecialV1.mintNFT(10, { from: bob }), "ERR_HAS_CLAIMED");
    });

    it("Carol cannot mint since has no profile", async () => {
      await expectRevert(bunnySpecialV1.mintNFT(10, { from: carol }), "Not registered");
    });

    it("Carol creates a profile but is below threshold", async () => {
      await pancakeBunnies.approve(pancakeProfile.address, "2", {
        from: carol,
      });

      await mockCAKE.approve(pancakeProfile.address, parseEther("500"), {
        from: carol,
      });

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), false);

      await pancakeProfile.createProfile("1", pancakeBunnies.address, "2", {
        from: carol,
      });

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), false);

      await expectRevert(bunnySpecialV1.mintNFT(10, { from: carol }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("Admin changes threshold for Carol to be eligible", async () => {
      await expectRevert(bunnySpecialV1.updateBunny("11", "3", "0", true, { from: alice }), "ERR_NOT_CREATED");

      await bunnySpecialV1.updateBunny("10", "5", "0", true, {
        from: alice,
      });

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), true);
    });

    it("Carol pauses her profile and cannot claim bunny", async () => {
      await pancakeProfile.pauseProfile({ from: carol });

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), false);

      assert.equal(await bunnySpecialV1.canClaimMultiple(carol, ["10", "11"]), "");

      await expectRevert(bunnySpecialV1.mintNFT(10, { from: carol }), "ERR_USER_NOT_ACTIVE");
    });

    it("Alice makes bunnyId=10 inactive while Carol re-activates her profile", async () => {
      await pancakeBunnies.approve(pancakeProfile.address, "2", {
        from: carol,
      });

      await pancakeProfile.reactivateProfile(pancakeBunnies.address, "2", {
        from: carol,
      });

      result = await bunnySpecialV1.updateBunny("10", "5", "0", false, {
        from: alice,
      });

      expectEvent(result, "BunnyChange", {
        bunnyId: "10",
        thresholdUser: "5",
        costCake: "0",
        isActive: false,
      });

      result = await bunnySpecialV1.bunnyCharacteristics("10");

      assert.equal(result[0], "hash/hiccup.json");
      assert.equal(result[1], "5");
      assert.equal(result[2], "0");
      assert.equal(result[3], false);

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), false);

      await expectRevert(bunnySpecialV1.mintNFT(10, { from: carol }), "ERR_ID_INVALID");
    });

    it("Alice makes bunny active again but adds a price", async () => {
      // Alice adds a price of 88 wei of CAKE
      await bunnySpecialV1.updateBunny("10", "5", "88", true, {
        from: alice,
      });

      result = await bunnySpecialV1.bunnyCharacteristics("10");

      assert.equal(result[0], "hash/hiccup.json");
      assert.equal(result[1], "5");
      assert.equal(result[2], "88");
      assert.equal(result[3], true);

      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), true);

      await expectRevert(bunnySpecialV1.mintNFT(10, { from: carol }), "BEP20: transfer amount exceeds allowance");
    });

    it("Carol approves the contract to spend CAKE and mints", async () => {
      await mockCAKE.approve(bunnySpecialV1.address, "88", {
        from: carol,
      });

      await bunnySpecialV1.mintNFT(10, { from: carol });

      assert.equal(await pancakeBunnies.tokenURI("4"), "ipfs://hash/hiccup.json");
      assert.equal(await pancakeBunnies.getBunnyNameOfTokenId("4"), "Hiccup");
      assert.equal(await bunnySpecialV1.canClaimSingle(carol, "10"), false);
      assert.equal(await mockCAKE.balanceOf(bunnySpecialV1.address), "88");
    });

    it("Alice claims the money", async () => {
      await bunnySpecialV1.claimFee("88", { from: alice });
      assert.equal(await mockCAKE.balanceOf(bunnySpecialV1.address), "0");
    });

    it("Alice adds a second new bunny", async () => {
      await bunnyMintingStation.setBunnyName("11", "Bullish", {
        from: alice,
      });

      assert.equal(await pancakeBunnies.getBunnyName("11"), "Bullish");

      // It already exists
      await expectRevert(
        bunnySpecialV1.addBunny(10, "hash2/bullish.json", 5, "8888", {
          from: alice,
        }),
        "ERR_CREATED"
      );

      // It is too low
      await expectRevert(
        bunnySpecialV1.addBunny(9, "hash2/bullish.json", 5, "8888", {
          from: alice,
        }),
        "ERR_ID_LOW_2"
      );

      result = await bunnySpecialV1.addBunny(11, "hash2/bullish.json", 5, "8888", {
        from: alice,
      });

      expectEvent(result, "BunnyAdd", {
        bunnyId: "11",
        thresholdUser: "5",
        costCake: "8888",
      });

      result = await bunnySpecialV1.bunnyCharacteristics("11");

      assert.equal(result[0], "hash2/bullish.json");
      assert.equal(result[1], "5");
      assert.equal(result[2], "8888");
      assert.equal(result[3], true);
    });

    it("Tests for canClaimMultiple and length", async () => {
      result = await bunnySpecialV1.canClaimMultiple(bob, ["11", "10", "3"]);

      assert.sameOrderedMembers(result, [true, false, false]);

      assert.equal(await bunnySpecialV1.canClaimSingle(frank, "2"), false);

      assert.equal(await bunnySpecialV1.canClaimMultiple(frank, ["2", "10"]), false);

      assert.equal(await bunnySpecialV1.maxViewLength(), "10");

      await bunnySpecialV1.updateMaxViewLength("2", { from: alice });
      assert.equal(await bunnySpecialV1.maxViewLength(), "2");

      await expectRevert(bunnySpecialV1.canClaimMultiple(bob, ["11", "10", "3"]), "ERR_LENGTH_VIEW");
    });

    it("Tests for ownership", async () => {
      await expectRevert(
        bunnySpecialV1.addBunny(9, "hash2/bullish.json", 5, "8888", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        bunnySpecialV1.updateBunny("11", "3", "0", true, { from: bob }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(bunnySpecialV1.claimFee("88", { from: bob }), "Ownable: caller is not the owner");
    });
  });
  describe("BunnySpecialV2", async () => {
    it("Contract is deployed", async () => {
      currentBlockNumber = await time.latestBlock();
      const _endBlockNumberS2 = currentBlockNumber.add(new BN(40));
      const _thresholdUserS2 = "3";

      // Deploy V2
      bunnySpecialV2 = await BunnySpecialV2.new(
        bunnyMintingStation.address,
        mockCAKE.address,
        pancakeProfile.address,
        _thresholdUserS2,
        _endBlockNumberS2,
        { from: alice }
      );
      // Grant minting role to the new contract
      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnySpecialV2.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnySpecialV2.address,
        sender: alice,
      });
    });

    it("Cannot mint if bunnies were not set", async () => {
      assert.equal(String(await bunnySpecialV2.teamIdToBunnyId("1")), "0");
      await expectRevert(bunnySpecialV2.mintNFT({ from: bob }), "NOT_VALID");
    });

    it("Owner adds bunnies", async () => {
      result = await bunnySpecialV2.addBunny("12", "1", "team1Bunny.json", {
        from: alice,
      });

      expectEvent(result, "BunnyAdd", { bunnyId: "12", teamId: "1" });

      assert.equal(String(await bunnySpecialV2.teamIdToBunnyId("1")), "12");

      result = await bunnySpecialV2.addBunny("13", "2", "team2Bunny.json", {
        from: alice,
      });

      expectEvent(result, "BunnyAdd", { bunnyId: "13", teamId: "2" });

      assert.equal(String(await bunnySpecialV2.teamIdToBunnyId("2")), "13");

      result = await bunnySpecialV2.addBunny("14", "3", "team2Bunny.json", {
        from: alice,
      });

      expectEvent(result, "BunnyAdd", { bunnyId: "14", teamId: "3" });

      assert.equal(String(await bunnySpecialV2.teamIdToBunnyId("3")), "14");
    });

    it("Bob can mint", async () => {
      assert.equal(await bunnySpecialV2.canClaim(bob), true);

      result = await bunnySpecialV2.mintNFT({ from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "5",
        bunnyId: "12",
      });

      assert.equal(await bunnySpecialV2.canClaim(bob), false);
    });

    it("Bob cannot mint twice", async () => {
      await expectRevert(bunnySpecialV2.mintNFT({ from: bob }), "ERR_HAS_CLAIMED");
    });

    it("Frank cannot mint as he doesn't have profile", async () => {
      assert.equal(await bunnySpecialV2.canClaim(frank), false);

      await expectRevert(bunnySpecialV2.mintNFT({ from: frank }), "Not registered");
    });

    it("Carol cannot mint without an active profile", async () => {
      assert.equal(await bunnySpecialV2.canClaim(carol), true);

      await pancakeProfile.pauseProfile({ from: carol });
      await expectRevert(bunnySpecialV2.mintNFT({ from: carol }), "ERR_USER_NOT_ACTIVE");

      assert.equal(await bunnySpecialV2.canClaim(carol), false);
    });

    it("Carol can mint with an active profile", async () => {
      await pancakeBunnies.approve(pancakeProfile.address, "2", {
        from: carol,
      });

      await pancakeProfile.reactivateProfile(pancakeBunnies.address, "2", {
        from: carol,
      });

      assert.equal(await bunnySpecialV2.canClaim(carol), true);

      result = await bunnySpecialV2.mintNFT({ from: carol });

      expectEvent(result, "BunnyMint", {
        to: carol,
        tokenId: "6",
        bunnyId: "12",
      });

      assert.equal(await bunnySpecialV2.canClaim(carol), false);
    });

    it("David cannot mint as end block has passed", async () => {
      await time.advanceBlockTo(currentBlockNumber.add(new BN(40)));
      await expectRevert(bunnySpecialV2.mintNFT({ from: david }), "TOO_LATE");
    });

    it("Owner changes end block", async () => {
      const newEndBlock = currentBlockNumber.add(new BN(60));
      result = await bunnySpecialV2.changeEndBlock(newEndBlock, {
        from: alice,
      });
      expectEvent(result, "NewEndBlock", {
        endBlock: String(newEndBlock),
      });
    });

    it("David cannot mint as he is outside of eligible threshold", async () => {
      // David mints CAKE/NFT/creates a profile (userId = 3)
      await mockCAKE.mintTokens(parseEther("100"), { from: david });
      assert.equal(await bunnySpecialV2.canClaim(david), false);

      await mockCAKE.approve(bunnyFactoryV3.address, parseEther("100"), {
        from: david,
      });

      result = await bunnyFactoryV3.mintNFT(9, { from: david });

      expectEvent(result, "BunnyMint", {
        to: david,
        tokenId: "7",
        bunnyId: "9",
      });

      await pancakeBunnies.approve(pancakeProfile.address, "7", {
        from: david,
      });

      await mockCAKE.approve(pancakeProfile.address, parseEther("100"), {
        from: david,
      });

      await pancakeProfile.createProfile("1", pancakeBunnies.address, "7", {
        from: david,
      });

      assert.equal(await bunnySpecialV2.canClaim(david), false);

      await expectRevert(bunnySpecialV2.mintNFT({ from: david }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("Only owner can call ownable functions changes end block", async () => {
      await expectRevert(
        bunnySpecialV2.changeEndBlock(105, {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Owner cannot add a bunnyId if below threshold", async () => {
      await expectRevert(
        bunnySpecialV2.addBunny("11", "3", "impossible.json", {
          from: alice,
        }),
        "ERR_ID_LOW_2"
      );
    });
  });
  describe("BunnySpecialCakeVault", async () => {
    it("Contract is deployed", async () => {
      currentBlockNumber = await time.latestBlock();
      const _endBlockNumberS3 = currentBlockNumber.add(new BN(75));
      currentTimestamp = await time.latest();
      const _thresholdTimestampS3 = currentTimestamp.add(new BN(10));

      // Deploy CakeVault
      bunnyCakeVault = await BunnyCakeVault.new(
        vault.address,
        bunnyMintingStation.address,
        pancakeProfile.address,
        _endBlockNumberS3,
        _thresholdTimestampS3,
        _numberPoints,
        _campaignId,
        "kekBunny.json",
        { from: alice }
      );

      // Grants point role to the new contract
      result = await pancakeProfile.grantRole(POINT_ROLE, bunnyCakeVault.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: bunnyCakeVault.address,
        sender: alice,
      });

      // Grant minting role to the new contract
      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnyCakeVault.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnyCakeVault.address,
        sender: alice,
      });
    });

    it("Bob can mint", async () => {
      // Participate in vault
      await vault.deposit(parseEther("10"), { from: bob });

      assert.equal(await bunnyCakeVault.canClaim(bob), true);

      result = await bunnyCakeVault.mintNFT({ from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "8",
        bunnyId: "16",
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: bob,
        numberPoints: String(_numberPoints),
        campaignId: String(_campaignId),
      });

      assert.equal(await bunnyCakeVault.canClaim(bob), false);
    });

    it("Bob cannot mint twice", async () => {
      await expectRevert(bunnyCakeVault.mintNFT({ from: bob }), "ERR_HAS_CLAIMED");
    });

    it("Frank cannot mint as he doesn't have profile", async () => {
      assert.equal(await bunnyCakeVault.canClaim(frank), false);

      await expectRevert(bunnyCakeVault.mintNFT({ from: frank }), "Not registered");
    });

    it("Carol cannot mint without an active profile", async () => {
      // Participate in vault
      await vault.deposit(parseEther("10"), { from: carol });

      assert.equal(await bunnyCakeVault.canClaim(carol), true);

      await pancakeProfile.pauseProfile({ from: carol });
      await expectRevert(bunnyCakeVault.mintNFT({ from: carol }), "ERR_USER_NOT_ACTIVE");

      assert.equal(await bunnyCakeVault.canClaim(carol), false);
    });

    it("Carol can mint with an active profile", async () => {
      await pancakeBunnies.approve(pancakeProfile.address, "2", {
        from: carol,
      });

      await pancakeProfile.reactivateProfile(pancakeBunnies.address, "2", {
        from: carol,
      });

      assert.equal(await bunnyCakeVault.canClaim(carol), true);

      result = await bunnyCakeVault.mintNFT({ from: carol });

      expectEvent(result, "BunnyMint", {
        to: carol,
        tokenId: "9",
        bunnyId: "16",
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: carol,
        numberPoints: String(_numberPoints),
        campaignId: String(_campaignId),
      });

      assert.equal(await bunnyCakeVault.canClaim(carol), false);
    });

    it("Frank cannot mint as he did not participate in cake vault", async () => {
      // Frank mints CAKE/NFT/creates a profile (userId = 4)
      await mockCAKE.mintTokens(parseEther("100"), { from: frank });

      assert.equal(await bunnyCakeVault.canClaim(frank), false);

      await mockCAKE.approve(bunnyFactoryV3.address, parseEther("100"), {
        from: frank,
      });

      result = await bunnyFactoryV3.mintNFT(9, { from: frank });

      expectEvent(result, "BunnyMint", {
        to: frank,
        tokenId: "10",
        bunnyId: "9",
      });

      await pancakeBunnies.approve(pancakeProfile.address, "10", {
        from: frank,
      });

      await mockCAKE.approve(pancakeProfile.address, parseEther("100"), {
        from: frank,
      });

      await pancakeProfile.createProfile("1", pancakeBunnies.address, "10", {
        from: frank,
      });

      assert.equal(await bunnyCakeVault.canClaim(frank), false);

      await expectRevert(bunnyCakeVault.mintNFT({ from: frank }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("Frank cannot mint as he participated too late in the vault", async () => {
      // Advance blocks in order to go out of range
      await time.increaseTo(currentTimestamp.add(new BN(5000000000)));

      // Participate in vault
      await vault.deposit(parseEther("10"), { from: frank });

      assert.equal(await bunnyCakeVault.canClaim(frank), false);

      await expectRevert(bunnyCakeVault.mintNFT({ from: frank }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("David cannot mint as end block has passed", async () => {
      await time.advanceBlockTo(currentBlockNumber.add(new BN(80)));
      await expectRevert(bunnyCakeVault.mintNFT({ from: david }), "TOO_LATE");
    });

    it("Owner changes end block", async () => {
      const newEndBlock = currentBlockNumber.add(new BN(25));
      result = await bunnyCakeVault.changeEndBlock(newEndBlock, {
        from: alice,
      });
      expectEvent(result, "NewEndBlock", {
        endBlock: String(newEndBlock),
      });
    });

    it("Owner changes treshold timestamp", async () => {
      const newTresholdTimestamp = currentTimestamp.add(new BN(20));
      result = await bunnyCakeVault.changeThresholdTimestamp(newTresholdTimestamp, {
        from: alice,
      });
      expectEvent(result, "NewThresholdTimestamp", {
        thresholdTimestamp: String(newTresholdTimestamp),
      });
    });

    it("Owner changes number points", async () => {
      const newNumberPoints = 30092020;
      result = await bunnyCakeVault.changeNumberPoints(String(newNumberPoints), {
        from: alice,
      });
      expectEvent(result, "NewNumberPoints", {
        numberPoints: String(newNumberPoints),
      });
    });

    it("Owner changes campaignId", async () => {
      const newCampaignId = "987654321";
      result = await bunnyCakeVault.changeCampaignId(newCampaignId, {
        from: alice,
      });
      expectEvent(result, "NewCampaignId", {
        campaignId: String(newCampaignId),
      });
    });

    it("Only owner can call ownable functions changes end block", async () => {
      await expectRevert(
        bunnyCakeVault.changeEndBlock(105, {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes treshold timestamp", async () => {
      await expectRevert(
        bunnyCakeVault.changeThresholdTimestamp("123456789", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes number points", async () => {
      await expectRevert(
        bunnyCakeVault.changeNumberPoints("30092020", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes campaignId", async () => {
      await expectRevert(
        bunnyCakeVault.changeCampaignId("987654321", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("BunnySpecialPrediction", async () => {
    it("Contract is deployed", async () => {
      currentBlockNumber = await time.latestBlock();
      currentTimestamp = await time.latest();
      const _endBlockNumberS4 = currentBlockNumber.add(new BN(250));

      // Deploy BunnyPrediction
      bunnyPrediction = await BunnyPrediction.new(
        prediction.address,
        bunnyMintingStation.address,
        pancakeProfile.address,
        _endBlockNumberS4,
        1,
        _numberPoints,
        _campaignId,
        "predictionBunny.json",
        { from: alice }
      );

      // Grants point role to the new contract
      result = await pancakeProfile.grantRole(POINT_ROLE, bunnyPrediction.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: bunnyPrediction.address,
        sender: alice,
      });

      // Grant minting role to the new contract
      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnyPrediction.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnyPrediction.address,
        sender: alice,
      });

      // Start first round of Prediction.
      await prediction.genesisStartRound();
    });

    it("Bob can mint", async () => {
      // Participate in prediction
      await prediction.betBull({ from: bob, value: parseEther("2").toString() });

      assert.equal(await bunnyPrediction.canClaim(bob), true);

      result = await bunnyPrediction.mintNFT({ from: bob });

      expectEvent(result, "BunnyMint", {
        to: bob,
        tokenId: "11",
        bunnyId: "17",
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: bob,
        numberPoints: String(_numberPoints),
        campaignId: String(_campaignId),
      });

      assert.equal(await bunnyPrediction.canClaim(bob), false);
    });

    it("Bob cannot mint twice", async () => {
      await expectRevert(bunnyPrediction.mintNFT({ from: bob }), "ERR_HAS_CLAIMED");
    });

    it("Eve cannot mint as she doesn't have profile", async () => {
      assert.equal(await bunnyPrediction.canClaim(eve), false);

      await expectRevert(bunnyPrediction.mintNFT({ from: eve }), "Not registered");
    });

    it("Carol cannot mint without an active profile", async () => {
      // Participate in prediction
      await prediction.betBull({ from: carol, value: parseEther("2").toString() });

      assert.equal(await bunnyPrediction.canClaim(carol), true);

      await pancakeProfile.pauseProfile({ from: carol });

      await expectRevert(bunnyPrediction.mintNFT({ from: carol }), "ERR_USER_NOT_ACTIVE");

      assert.equal(await bunnyPrediction.canClaim(carol), false);
    });

    it("Carol can mint with an active profile", async () => {
      await pancakeBunnies.approve(pancakeProfile.address, "2", {
        from: carol,
      });

      await pancakeProfile.reactivateProfile(pancakeBunnies.address, "2", {
        from: carol,
      });

      assert.equal(await bunnyPrediction.canClaim(carol), true);

      result = await bunnyPrediction.mintNFT({ from: carol });

      expectEvent(result, "BunnyMint", {
        to: carol,
        tokenId: "12",
        bunnyId: "17",
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: carol,
        numberPoints: String(_numberPoints),
        campaignId: String(_campaignId),
      });

      assert.equal(await bunnyPrediction.canClaim(carol), false);
    });

    it("Eve cannot mint as she did not participate in prediction", async () => {
      // Eve mints CAKE/NFT/creates a profile (userId = 5)
      await mockCAKE.mintTokens(parseEther("100"), { from: eve });

      assert.equal(await bunnyPrediction.canClaim(eve), false);

      await mockCAKE.approve(bunnyFactoryV3.address, parseEther("100"), {
        from: eve,
      });

      result = await bunnyFactoryV3.mintNFT(9, { from: eve });

      expectEvent(result, "BunnyMint", {
        to: eve,
        tokenId: "13",
        bunnyId: "9",
      });

      await pancakeBunnies.approve(pancakeProfile.address, "13", {
        from: eve,
      });

      await mockCAKE.approve(pancakeProfile.address, parseEther("100"), {
        from: eve,
      });

      await pancakeProfile.createProfile("1", pancakeBunnies.address, "13", {
        from: eve,
      });

      assert.equal(await bunnyPrediction.canClaim(eve), false);

      await expectRevert(bunnyPrediction.mintNFT({ from: eve }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("Eve cannot mint as he participated too late in the prediction", async () => {
      // Advance blocks in order to go out of range
      await time.advanceBlockTo(currentBlockNumber.add(new BN(101)));

      // Launch new rounds in order not to be eligible
      // Note: Pausing/Relaunching is the fastest way so we do not need to Mock Oracle, etc...
      await prediction.pause({ from: alice });
      await prediction.unpause({ from: alice });
      await prediction.genesisStartRound({ from: alice });

      // Participate in Prediction
      await prediction.betBear({ from: eve, value: parseEther("1").toString() });

      assert.equal(await bunnyPrediction.canClaim(eve), false);

      await expectRevert(bunnyPrediction.mintNFT({ from: eve }), "ERR_USER_NOT_ELIGIBLE");
    });

    it("David cannot mint as end block has passed", async () => {
      currentBlockNumber = await time.latestBlock();
      await time.advanceBlockTo(currentBlockNumber.add(new BN(150)));
      await expectRevert(bunnyPrediction.mintNFT({ from: david }), "TOO_LATE");
    });

    it("Owner changes end block", async () => {
      const newEndBlock = currentBlockNumber.add(new BN(25));
      result = await bunnyPrediction.changeEndBlock(newEndBlock, {
        from: alice,
      });
      expectEvent(result, "NewEndBlock", {
        endBlock: String(newEndBlock),
      });
    });

    it("Owner changes treshold round", async () => {
      const newTresholdRound = new BN(25);
      result = await bunnyPrediction.changeThresholdRound(newTresholdRound, {
        from: alice,
      });
      expectEvent(result, "NewThresholdRound", {
        thresholdRound: String(newTresholdRound),
      });
    });

    it("Owner changes number points", async () => {
      const newNumberPoints = 30092020;
      result = await bunnyPrediction.changeNumberPoints(String(newNumberPoints), {
        from: alice,
      });
      expectEvent(result, "NewNumberPoints", {
        numberPoints: String(newNumberPoints),
      });
    });

    it("Owner changes campaignId", async () => {
      const newCampaignId = "987654321";
      result = await bunnyPrediction.changeCampaignId(newCampaignId, {
        from: alice,
      });
      expectEvent(result, "NewCampaignId", {
        campaignId: String(newCampaignId),
      });
    });

    it("Only owner can call ownable functions changes end block", async () => {
      await expectRevert(
        bunnyPrediction.changeEndBlock(105, {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes treshold round", async () => {
      await expectRevert(
        bunnyPrediction.changeThresholdRound("123456789", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes number points", async () => {
      await expectRevert(
        bunnyPrediction.changeNumberPoints("30092020", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Only owner can call ownable functions changes campaignId", async () => {
      await expectRevert(
        bunnyPrediction.changeCampaignId("987654321", {
          from: bob,
        }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("BunnySpecialLottery", async () => {
    const NFT_ID_1 = 18;
    const NFT_ID_2 = 19;
    const NFT_ID_3 = 20;
    const LOTTERY_ID = 1;

    it("Contract is deployed", async () => {
      currentBlockNumber = await time.latestBlock();
      currentTimestamp = await time.latest();

      // Setup profile contract
      const _numberCakeToReactivate = parseEther("2"); // 2 CAKE
      const _numberCakeToRegister = parseEther("1"); // 1 CAKE
      const _numberCakeToUpdate = parseEther("2"); // 2 CAKE

      pancakeProfile = await PancakeProfile.new(
        mockCAKE.address,
        _numberCakeToReactivate,
        _numberCakeToRegister,
        _numberCakeToUpdate,
        { from: alice }
      );

      // PancakeSwap Profile roles.
      POINT_ROLE = await pancakeProfile.POINT_ROLE();
      await pancakeProfile.addTeam("The Testers", "ipfs://hash/team1.json", {
        from: alice,
      });
      await pancakeProfile.addNftAddress(mockBunnies.address, {
        from: alice,
      });

      // Bob's profile
      await mockBunnies.mint({ from: bob });
      const bobProfileNftId = "0";
      await mockBunnies.approve(pancakeProfile.address, bobProfileNftId, {
        from: bob,
      });
      await mockCAKE.approve(pancakeProfile.address, parseEther("500"), {
        from: bob,
      });
      await pancakeProfile.createProfile("1", mockBunnies.address, bobProfileNftId, {
        from: bob,
      });

      // Carol's profile
      await mockBunnies.mint({ from: carol });
      const carolProfileNftId = "1";
      await mockBunnies.approve(pancakeProfile.address, carolProfileNftId, {
        from: carol,
      });
      await mockCAKE.approve(pancakeProfile.address, parseEther("500"), {
        from: carol,
      });
      await pancakeProfile.createProfile("1", mockBunnies.address, carolProfileNftId, {
        from: carol,
      });

      // David's profile
      await mockBunnies.mint({ from: david });
      const davidProfileNftId = "2";
      await mockBunnies.approve(pancakeProfile.address, davidProfileNftId, {
        from: david,
      });
      await mockCAKE.approve(pancakeProfile.address, parseEther("500"), {
        from: david,
      });
      await pancakeProfile.createProfile("1", mockBunnies.address, davidProfileNftId, {
        from: david,
      });

      // Lottery setup
      bunnySpecialLottery = await BunnySpecialLottery.new(
        pancakeSwapLottery.address,
        bunnyMintingStation.address,
        pancakeProfile.address,
        currentBlockNumber + 10000,
        "bunnyLottery1.json",
        "bunnyLottery2.json",
        "bunnyLottery3.json",
        _numberPoints,
        _numberPoints + 1,
        _numberPoints + 2,
        _campaignId,
        _campaignId + 1,
        _campaignId + 2,
        1,
        10
      );

      // Grants point role to the new contract
      result = await pancakeProfile.grantRole(POINT_ROLE, bunnySpecialLottery.address, {
        from: alice,
      });
      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: bunnySpecialLottery.address,
        sender: alice,
      });
      // Grant minting role to the new contract
      result = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnySpecialLottery.address, {
        from: alice,
      });
      expectEvent(result, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnySpecialLottery.address,
        sender: alice,
      });

      await pancakeSwapLottery.setOperatorAndTreasuryAndInjectorAddresses(alice, alice, alice, { from: alice });

      const _lengthLottery = new BN("60"); // In Sec
      const _priceTicketInCake = parseEther("0.1");
      const _discountDivisor = "2000";
      const _rewardsBreakdown = ["200", "300", "500", "1500", "2500", "5000"];
      const _treasuryFee = "2000";
      await pancakeSwapLottery.startLottery(
        new BN(await time.latest()).add(_lengthLottery),
        _priceTicketInCake,
        _discountDivisor,
        _rewardsBreakdown,
        _treasuryFee,
        { from: alice }
      );

      // bob didn't played
      // carol played
      // david won
      // frank won without a profile
      await pancakeSwapLottery.buyTickets(LOTTERY_ID, [1634660, 1999998], { from: carol });
      await pancakeSwapLottery.buyTickets(LOTTERY_ID, [1634660, 1999999], { from: david });
      await pancakeSwapLottery.buyTickets(LOTTERY_ID, [1999999], { from: frank });

      await pancakeSwapLottery.closeLottery(LOTTERY_ID, { from: alice });
      await pancakeSwapLottery.drawFinalNumberAndMakeLotteryClaimable(LOTTERY_ID, true, { from: alice });
      await pancakeSwapLottery.claimTickets(LOTTERY_ID, ["3"], ["5"], { from: david });
      await pancakeSwapLottery.claimTickets(LOTTERY_ID, ["4"], ["5"], { from: frank });
    });

    it("Owner can whitelist for NFT3", async () => {
      const whitelist = [eve];
      const res = await bunnySpecialLottery.whitelistAddresses(whitelist, {
        from: alice,
      });
      expectEvent(res, "NewAddressWhitelisted", {
        users: whitelist,
      });
    });

    // Can claim

    it("Bob can't claim any NFT", async () => {
      const canClaimNft1 = await bunnySpecialLottery.canClaimNft1(bob, LOTTERY_ID, { from: bob });
      const canClaimNft2 = await bunnySpecialLottery.canClaimNft2(bob, LOTTERY_ID, 0, { from: bob });
      const canClaimNft3 = await bunnySpecialLottery.canClaimNft3(bob, { from: bob });

      assert.isFalse(canClaimNft1);
      assert.isFalse(canClaimNft2);
      assert.isFalse(canClaimNft3);
    });

    it("Carol can only claim NFT1", async () => {
      const canClaimNft1 = await bunnySpecialLottery.canClaimNft1(carol, LOTTERY_ID, { from: carol });
      const canClaimNft2 = await bunnySpecialLottery.canClaimNft2(carol, LOTTERY_ID, 0, { from: carol });
      const canClaimNft3 = await bunnySpecialLottery.canClaimNft3(carol, { from: carol });

      assert.isTrue(canClaimNft1);
      assert.isFalse(canClaimNft2);
      assert.isFalse(canClaimNft3);
    });

    it("David can only claim NFT1 and NFT2", async () => {
      const canClaimNft1 = await bunnySpecialLottery.canClaimNft1(david, LOTTERY_ID, { from: david });
      const canClaimNft2 = await bunnySpecialLottery.canClaimNft2(david, LOTTERY_ID, 1, { from: david });
      const canClaimNft3 = await bunnySpecialLottery.canClaimNft3(david, { from: david });

      assert.isTrue(canClaimNft1);
      assert.isTrue(canClaimNft2);
      assert.isFalse(canClaimNft3);
    });

    it("Frank can't claim any NFT", async () => {
      const canClaimNft1 = await bunnySpecialLottery.canClaimNft1(frank, LOTTERY_ID, { from: frank });
      const canClaimNft2 = await bunnySpecialLottery.canClaimNft2(frank, LOTTERY_ID, 0, { from: frank });
      const canClaimNft3 = await bunnySpecialLottery.canClaimNft3(frank, { from: frank });

      assert.isFalse(canClaimNft1);
      assert.isFalse(canClaimNft2);
      assert.isFalse(canClaimNft3);
    });

    it("Carol can claim NFT3", async () => {
      await bunnySpecialLottery.whitelistAddresses([carol], {
        from: alice,
      });
      const canClaimNft3 = await bunnySpecialLottery.canClaimNft3(carol, { from: carol });
      assert.isTrue(canClaimNft3);
    });

    // Mint
    it("Can't mint if the lottery is out of range", async () => {
      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_1, 2, 0, { from: carol }), "User: Not eligible");
    });

    it("Can't mint if the nft id is out of range", async () => {
      await expectRevert(bunnySpecialLottery.mintNFT(1, LOTTERY_ID, 0, { from: carol }), "NFT: Id out of range");
    });

    it("Carol can mint NFT1 and NFT3", async () => {
      const res1 = await bunnySpecialLottery.mintNFT(NFT_ID_1, LOTTERY_ID, 0, { from: carol });
      expectEvent(res1, "BunnyMint", {
        to: carol,
        tokenId: "14",
        bunnyId: NFT_ID_1.toString(),
      });

      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_2, LOTTERY_ID, 0, { from: carol }), "User: Not eligible");

      const res2 = await bunnySpecialLottery.mintNFT(NFT_ID_3, LOTTERY_ID, 0, { from: carol });
      expectEvent(res2, "BunnyMint", {
        to: carol,
        tokenId: "15",
        bunnyId: NFT_ID_3.toString(),
      });
    });

    it("David can mint NFT1 and NFT2", async () => {
      const res1 = await bunnySpecialLottery.mintNFT(NFT_ID_1, LOTTERY_ID, 1, { from: david });
      expectEvent(res1, "BunnyMint", {
        to: david,
        tokenId: "16",
        bunnyId: NFT_ID_1.toString(),
      });

      const res2 = await bunnySpecialLottery.mintNFT(NFT_ID_2, LOTTERY_ID, 1, { from: david });
      expectEvent(res2, "BunnyMint", {
        to: david,
        tokenId: "17",
        bunnyId: NFT_ID_2.toString(),
      });

      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_3, LOTTERY_ID, 1, { from: david }), "User: Not eligible");
    });

    it("Frank can't mint any NFT", async () => {
      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_1, LOTTERY_ID, 1, { from: frank }), "User: Not eligible");
      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_2, LOTTERY_ID, 1, { from: frank }), "User: Not eligible");
      await expectRevert(bunnySpecialLottery.mintNFT(NFT_ID_3, LOTTERY_ID, 1, { from: frank }), "User: Not eligible");
    });

    // Owner tests

    it("Owner can change the end block", async () => {
      const newEndBlock = 1000000000;
      const res = await bunnySpecialLottery.changeEndBlock(newEndBlock, {
        from: alice,
      });
      expectEvent(res, "NewEndBlock", {
        endBlock: newEndBlock.toString(),
      });
      const block = await bunnySpecialLottery.endBlock();
      assert.equal(block, newEndBlock);
    });

    it("Owner can change the campaign id", async () => {
      const newBunnyId = 18;
      const newCampaignId = 2;
      const res = await bunnySpecialLottery.changeCampaignId(newBunnyId, newCampaignId, {
        from: alice,
      });
      expectEvent(res, "NewCampaignId", {
        bunnyId: newBunnyId.toString(),
        campaignId: newCampaignId.toString(),
      });
      const id = await bunnySpecialLottery.campaignIds(newBunnyId);
      assert.equal(id, newCampaignId);
    });

    it("Owner can change the number of points", async () => {
      const newBunnyId = 19;
      const newNumberPoints = 2;
      const res = await bunnySpecialLottery.changeNumberPoints(newBunnyId, newNumberPoints, {
        from: alice,
      });
      expectEvent(res, "NewNumberPoints", {
        bunnyId: newBunnyId.toString(),
        numberPoints: newNumberPoints.toString(),
      });
      const nbPoints = await bunnySpecialLottery.numberPoints(newBunnyId);
      assert.equal(nbPoints, newNumberPoints);
    });

    it("Owner can change the token URI", async () => {
      const NEW_URI = "shit_uri";
      const res = await bunnySpecialLottery.changeTokenURI(NFT_ID_1, NEW_URI, {
        from: alice,
      });
      expectEvent(res, "NewTokenURI", {
        bunnyId: NFT_ID_1.toString(),
        tokenURI: NEW_URI.toString(),
      });
      const uri = await bunnySpecialLottery.tokenURIs(NFT_ID_1);
      assert.equal(uri, NEW_URI);
    });

    it("Owner can change the lottery rounds", async () => {
      const newStartRound = 2;
      const newEndRound = 9;
      await expectRevert(
        bunnySpecialLottery.changeLotteryRounds(newEndRound, newStartRound, { from: alice }),
        "Round: startLotteryRound > finalLotteryRound"
      );

      const res = await bunnySpecialLottery.changeLotteryRounds(newStartRound, newEndRound, {
        from: alice,
      });
      expectEvent(res, "NewLotteryRounds", {
        startLotteryRound: newStartRound.toString(),
        finalLotteryRound: newEndRound.toString(),
      });

      const startRound = await bunnySpecialLottery.startLotteryRound();
      assert.equal(startRound, newStartRound);
      const endRound = await bunnySpecialLottery.finalLotteryRound();
      assert.equal(endRound, newEndRound);
    });
  });

  describe("BunnySpecialLottery", async () => {
    const NFT_ID = 21;

    it("Contract is deployed and role given", async () => {
      currentBlockNumber = await time.latestBlock();

      bunnySpecialAdmin = await BunnySpecialAdmin.new(
        bunnyMintingStation.address,
        currentBlockNumber + 100,
        "bunnyAdmin.json",
        { from: alice }
      );

      const res = await bunnyMintingStation.grantRole(MINTER_ROLE, bunnySpecialAdmin.address, {
        from: alice,
      });

      expectEvent(res, "RoleGranted", {
        role: MINTER_ROLE,
        account: bunnySpecialAdmin.address,
        sender: alice,
      });
    });

    it("Owner can whitelist for NFT", async () => {
      assert.equal(await bunnySpecialAdmin.canClaim(bob), false);
      assert.equal(await bunnySpecialAdmin.canClaim(carol), false);
      assert.equal(await bunnySpecialAdmin.canClaim(david), false);

      const whitelist = [bob, carol, david];
      const res = await bunnySpecialAdmin.whitelistAddresses(whitelist, {
        from: alice,
      });
      expectEvent(res, "NewAddressesWhitelisted", {
        users: whitelist,
      });

      assert.equal(await bunnySpecialAdmin.canClaim(bob), true);
      assert.equal(await bunnySpecialAdmin.canClaim(carol), true);
      assert.equal(await bunnySpecialAdmin.canClaim(david), true);
    });

    it("Owner can unwhitelist for NFT", async () => {
      const whitelist = [david];
      const res = await bunnySpecialAdmin.unwhitelistAddresses(whitelist, {
        from: alice,
      });

      expectEvent(res, "NewAddressesUnwhitelisted", {
        users: whitelist,
      });

      assert.equal(await bunnySpecialAdmin.canClaim(david), false);
    });

    it("Bob can mint", async () => {
      const res = await bunnySpecialAdmin.mintNFT({ from: bob });

      expectEvent(res, "BunnyMint", {
        to: bob,
        tokenId: "18",
        bunnyId: "21",
      });

      assert.equal(await pancakeBunnies.tokenURI("18"), "ipfs://bunnyAdmin.json");
      assert.equal(await bunnySpecialAdmin.canClaim(bob), false);
      assert.equal(await bunnySpecialAdmin.hasClaimed(bob), true);
    });

    it("Bob cannot mint twice", async () => {
      await expectRevert(bunnySpecialAdmin.mintNFT({ from: bob }), "Claim: Already claimed");
    });

    it("David cannot mint as he is not whitelisted", async () => {
      await expectRevert(bunnySpecialAdmin.mintNFT({ from: david }), "Claim: Not eligible");
    });

    it("Owner changes endBlock", async () => {
      currentBlockNumber = await time.latestBlock();

      const newEndBlock = currentBlockNumber.sub(new BN("2"));

      assert.equal(await bunnySpecialAdmin.canClaim(carol), true);

      const res = await bunnySpecialAdmin.changeEndBlock(newEndBlock, {
        from: alice,
      });

      expectEvent(res, "NewEndBlock", {
        endBlock: newEndBlock,
      });

      assert.equal(await bunnySpecialAdmin.canClaim(carol), false);
    });

    it("Carol cannot mint as it is too late", async () => {
      await expectRevert(bunnySpecialAdmin.mintNFT({ from: carol }), "Claim: Too late");
    });
  });

  describe("AnniversaryAchievement", async () => {
    it("Contract is deployed and role given", async () => {
      currentBlockNumber = await time.latestBlock();

      anniversaryAchievement = await AnniversaryAchievement.new(
        pancakeProfile.address,
        "100",
        "5",
        "511010101",
        currentBlockNumber + 100,
        { from: alice }
      );

      // Grants point role to the new contract
      result = await pancakeProfile.grantRole(POINT_ROLE, anniversaryAchievement.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: anniversaryAchievement.address,
        sender: alice,
      });
    });

    it("Cannot claim anniversary if no profile or not enough point", async () => {
      assert.equal(await anniversaryAchievement.canClaim(alice), false);
      assert.equal(await anniversaryAchievement.canClaim(bob), false);
      assert.equal(await anniversaryAchievement.canClaim(carol), true);

      await expectRevert(anniversaryAchievement.claimAnniversaryPoints({ from: alice }), "Claim: Cannot claim");
      await expectRevert(anniversaryAchievement.claimAnniversaryPoints({ from: bob }), "Claim: Cannot claim");
    });

    it("Can claim anniversary", async () => {
      assert.equal(await anniversaryAchievement.canClaim(carol), true);

      result = await anniversaryAchievement.claimAnniversaryPoints({ from: carol });

      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: carol,
        numberPoints: "100",
        campaignId: "511010101",
      });

      assert.equal(await anniversaryAchievement.hasClaimed(carol), true);
      assert.equal(await anniversaryAchievement.canClaim(carol), false);
    });

    it("Cannot claim twice", async () => {
      await expectRevert(anniversaryAchievement.claimAnniversaryPoints({ from: carol }), "Claim: Cannot claim");
    });

    it("Only owner can call owner function", async () => {
      await expectRevert(
        anniversaryAchievement.changeNumberPointsAndThreshold("1", "1", { from: bob }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(anniversaryAchievement.changeEndBlock("1", { from: bob }), "Ownable: caller is not the owner");

      await expectRevert(
        anniversaryAchievement.changeCampaignId("1", { from: bob }),
        "Ownable: caller is not the owner"
      );
    });

    it("Owner updates points threshold", async () => {
      result = await anniversaryAchievement.changeNumberPointsAndThreshold("100", "0", { from: alice });
      expectEvent(result, "NewNumberPointsAndThreshold", { numberPoints: "100", thresholdPoints: "0" });
      assert.equal(await anniversaryAchievement.canClaim(alice), false);
      assert.equal(await anniversaryAchievement.canClaim(bob), true);
    });

    it("Owner can update end block", async () => {
      result = await anniversaryAchievement.changeEndBlock(currentBlockNumber, { from: alice });
      expectEvent(result, "NewEndBlock", { endBlock: currentBlockNumber.toString() });
      assert.equal(await anniversaryAchievement.canClaim(bob), false);
    });

    it("Owner can change campaignId", async () => {
      result = await anniversaryAchievement.changeCampaignId("511", { from: alice });
      expectEvent(result, "NewCampaignId", { campaignId: "511" });
    });
  });
});
