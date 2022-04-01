import { parseUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract, ethers } from "hardhat";

import { assert } from "chai";
import { BN, expectEvent, expectRevert, time, ether } from "@openzeppelin/test-helpers";

const IFOInitializableV3 = artifacts.require("./IFOInitializableV3.sol");
const IFODeployerV3 = artifacts.require("./IFODeployerV3.sol");

const PancakeProfile = artifacts.require("profile-nft-gamification/contracts/PancakeProfile.sol");
const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const MockERC20 = artifacts.require("./utils/MockERC20.sol");
const MockBunnies = artifacts.require("./utils/MockBunnies.sol");

const CakeToken = artifacts.require("cake-vault/contracts/test/CakeToken.sol");
const SyrupBar = artifacts.require("cake-vault/contracts/test/SyrupBar.sol");
const MasterChef = artifacts.require("cake-vault/contracts/test/MasterChef.sol");
const IFOPool = artifacts.require("cake-vault/contracts/IFOPool.sol");

const REWARDS_START_BLOCK = 100;

contract("IFO DeployerV3", ([alice, bob, carol, david, erin, frank, ...accounts]) => {
  // PancakeProfile
  const _totalInitSupply = parseEther("5000000"); // 50 CAKE
  const _numberCakeToReactivate = parseEther("5"); // 5 CAKE
  const _numberCakeToRegister = parseEther("5"); // 5 CAKE
  const _numberCakeToUpdate = parseEther("2"); // 2 CAKE

  // IFO block times
  let _startBlock;
  let _endBlock;

  // IFO Pool 0
  let offeringAmountPool0 = parseEther("50");
  let raisingAmountPool0 = parseEther("5");
  let limitPerUserInLp = parseEther("0.5");

  // IFO Pool 1
  let offeringAmountPool1 = parseEther("1000");
  let raisingAmountPool1 = parseEther("100");

  // offeringAmountPool0 + offeringAmountPool1
  let offeringTotalAmount = offeringAmountPool0.add(offeringAmountPool1);
  let raisingAmountTotal = parseEther("105");

  // Gamification parameters
  let campaignId = "12345678";
  let numberPoints = "100";
  let thresholdPoints = parseEther("0.035");

  // VARIABLES

  // Contracts
  let mockBunnies,
    mockCake,
    mockIFO,
    mockOC,
    mockLP,
    pancakeProfile,
    deployer,
    ifopool,
    cake,
    syrup,
    masterchef,
    rewardsStartBlock;

  // Roles in PancakeProfile
  let DEFAULT_ADMIN_ROLE, NFT_ROLE, POINT_ROLE;
  // Generic result variable
  let result;

  before(async () => {
    // Deploy MockCAKE
    mockCake = await MockBEP20.new("Mock CAKE", "CAKE", _totalInitSupply);

    // Deploy MockLP
    mockLP = await MockBEP20.new("Mock LP", "LP", _totalInitSupply, {
      from: alice,
    });

    // Deploy MockOfferingCoin (100M initial supply)
    mockOC = await MockBEP20.new("Mock Offering Coin", "OC", parseEther("100000000"), {
      from: alice,
    });

    // Deploy Mock Bunnies
    mockBunnies = await MockBunnies.new({ from: alice });

    // Deploy Pancake Profile
    pancakeProfile = await PancakeProfile.new(
      mockCake.address,
      _numberCakeToReactivate,
      _numberCakeToRegister,
      _numberCakeToUpdate,
      { from: alice }
    );

    // Deploy IFOPool
    cake = await CakeToken.new({ from: frank });
    syrup = await SyrupBar.new(cake.address, { from: frank });
    rewardsStartBlock = (await time.latestBlock()).toNumber() + REWARDS_START_BLOCK;
    masterchef = await MasterChef.new(cake.address, syrup.address, frank, ether("1"), rewardsStartBlock, {
      from: frank,
    });

    ifopool = await IFOPool.new(cake.address, syrup.address, masterchef.address, frank, frank, 2000, 2050, {
      from: frank,
    });

    await syrup.transferOwnership(masterchef.address, { from: frank });
    // grant all users credits
    for (let user of [alice, bob, carol, david, erin, frank, frank, ...accounts]) {
      // Mint cakes to all users
      await cake.mint(user, ether("1000000"), { from: frank });
      // Approves cake to be spent by IFOPool
      await cake.approve(ifopool.address, parseEther("1000000"), {
        from: user,
      });

      await ifopool.deposit(ether("100"), { from: user });
    }
    await cake.transferOwnership(masterchef.address, { from: frank });

    await time.advanceBlockTo(2060);

    // Assign the roles
    DEFAULT_ADMIN_ROLE = await pancakeProfile.DEFAULT_ADMIN_ROLE();
    NFT_ROLE = await pancakeProfile.NFT_ROLE();
    POINT_ROLE = await pancakeProfile.POINT_ROLE();
  });

  describe("Initial contract parameters for all contracts", async () => {
    it("PancakeProfile is correct", async () => {
      assert.equal(await pancakeProfile.cakeToken(), mockCake.address);
      assert.equal(String(await pancakeProfile.numberCakeToReactivate()), String(_numberCakeToReactivate));
      assert.equal(String(await pancakeProfile.numberCakeToRegister()), String(_numberCakeToRegister));
      assert.equal(String(await pancakeProfile.numberCakeToUpdate()), String(_numberCakeToUpdate));

      assert.equal(await pancakeProfile.getRoleMemberCount(DEFAULT_ADMIN_ROLE), "1");
    });

    it("Alice adds NFT and a team in the system", async () => {
      await pancakeProfile.addNftAddress(mockBunnies.address, {
        from: alice,
      });
      await pancakeProfile.addTeam("The Testers", "ipfs://hash/team1.json", {
        from: alice,
      });
    });

    it("Bob/Carol/David/Erin create a profile in the system", async () => {
      let i = 0;

      for (let thisUser of [bob, carol, david, erin]) {
        // Mints 100 CAKE
        await mockCake.mintTokens(parseEther("100"), { from: thisUser });

        // Mints 10,000 LP tokens
        await mockLP.mintTokens(parseEther("10000"), { from: thisUser });

        // Mints a NFT
        result = await mockBunnies.mint({ from: thisUser });

        // Approves the contract to receive his NFT
        await mockBunnies.approve(pancakeProfile.address, i, {
          from: thisUser,
        });

        // Approves CAKE to be spent by PancakeProfile
        await mockCake.approve(pancakeProfile.address, parseEther("100"), {
          from: thisUser,
        });

        // Creates the profile
        await pancakeProfile.createProfile("1", mockBunnies.address, i, {
          from: thisUser,
        });
        i++;
      }

      // 4 generic accounts too
      for (let thisUser of accounts) {
        // Mints 100 CAKE
        await mockCake.mintTokens(parseEther("100"), { from: thisUser });

        // Mints 1,000 LP tokens
        await mockLP.mintTokens(parseEther("1000"), { from: thisUser });

        // Mnts a NFT
        result = await mockBunnies.mint({ from: thisUser });

        // Approves the contract to receive his NFT
        await mockBunnies.approve(pancakeProfile.address, i, {
          from: thisUser,
        });

        // Approves CAKE to be spent by PancakeProfile
        await mockCake.approve(pancakeProfile.address, parseEther("100"), {
          from: thisUser,
        });

        // Creates the profile
        await pancakeProfile.createProfile("1", mockBunnies.address, i, {
          from: thisUser,
        });
        i++;
      }
    });
  });

  describe("IFO DeployerV3 #0 - Initial set up", async () => {
    it("The IFODeployerV3 is deployed and initialized", async () => {
      deployer = await IFODeployerV3.new(pancakeProfile.address, {
        from: alice,
      });
    });
  });
  /*
   * IFO 1 - OVERFLOW
   * Pool 0 : Overflow with 1.6x overflow
   * Pool 1: Overflow with 10x overflow
   */

  describe("IFO #1 - Initial set up", async () => {
    it("The IFO #1 is deployed and initialized", async () => {
      _startBlock = new BN(await time.latestBlock()).add(new BN("50"));
      _endBlock = new BN(await time.latestBlock()).add(new BN("250"));

      // Alice deploys the IFO setting herself as the contract admin
      let result = await deployer.createIFO(
        mockLP.address,
        mockOC.address,
        _startBlock,
        _endBlock,
        alice,
        ifopool.address,
        {
          from: alice,
        }
      );

      let ifoAddress = result.receipt.logs[2].args[0];

      expectEvent(result, "NewIFOContract", { ifoAddress: ifoAddress });

      mockIFO = await IFOInitializableV3.at(ifoAddress);

      result = await mockIFO.updateStartAndEndBlocks(_startBlock, _endBlock, { from: alice });

      expectEvent(result, "NewStartAndEndBlocks", { startBlock: _startBlock, endBlock: _endBlock });

      // Grants point role to the IFO contract
      await pancakeProfile.grantRole(POINT_ROLE, mockIFO.address);
    });

    it("Mock IFO is deployed without pools set", async () => {
      result = await mockIFO.viewUserAllocationPools(alice, ["0", "1"]);
      assert.equal(result[0].toString(), "0");
      assert.equal(result[1].toString(), "0");

      result = await mockIFO.viewUserInfo(alice, ["0", "1"]);
      assert.equal(result[0][0].toString(), "0");
      assert.equal(result[0][1].toString(), "0");
      assert.equal(result[1][0], false);
      assert.equal(result[1][1], false);

      assert.equal(String(await mockIFO.viewPoolTaxRateOverflow("0")), "0");
      assert.equal(String(await mockIFO.viewPoolTaxRateOverflow("1")), "0"); // Pool isn't set yet, nor in overflow

      result = await mockIFO.viewUserOfferingAndRefundingAmountsForPools(alice, [0, 1]);

      assert.equal(result[0][0].toString(), "0");
      assert.equal(result[0][1].toString(), "0");
      assert.equal(result[0][2].toString(), "0");
      assert.equal(result[1][0].toString(), "0");
      assert.equal(result[1][1].toString(), "0");
      assert.equal(result[1][2].toString(), "0");
    });

    it("Pools are set", async () => {
      assert.deepEqual(
        raisingAmountPool0.div(offeringAmountPool0),
        raisingAmountPool1.div(offeringAmountPool1),
        "MUST_BE_EQUAL_PRICES"
      );

      result = await mockIFO.setPool(
        offeringAmountPool0,
        raisingAmountPool0,
        limitPerUserInLp,
        false, // tax
        "0",
        { from: alice }
      );

      expectEvent(result, "PoolParametersSet", {
        offeringAmountPool: String(offeringAmountPool0),
        raisingAmountPool: String(raisingAmountPool0),
        pid: String(0),
      });

      assert.equal(String(await mockIFO.totalTokensOffered()), String(offeringAmountPool0));

      assert.equal(String(await mockIFO.viewPoolTaxRateOverflow("0")), "0");

      result = await mockIFO.setPool(
        offeringAmountPool1,
        raisingAmountPool1,
        "0",
        true, // tax
        "1",
        { from: alice }
      );

      assert.equal(String(await mockIFO.viewPoolTaxRateOverflow("1")), "10000000000");

      expectEvent(result, "PoolParametersSet", {
        offeringAmountPool: String(offeringAmountPool1),
        raisingAmountPool: String(raisingAmountPool1),
        pid: String(1),
      });

      assert.equal(String(await mockIFO.totalTokensOffered()), String(offeringTotalAmount));

      result = await mockIFO.updatePointParameters(campaignId, numberPoints, thresholdPoints, { from: alice });

      expectEvent(result, "PointParametersSet", {
        campaignId: String(campaignId),
        numberPoints: String(numberPoints),
        thresholdPoints: String(thresholdPoints),
      });
    });

    it("All users are approving the tokens to be spent by the IFO", async () => {
      // Bob, Carol, David, Erin
      for (let thisUser of [bob, carol, david, erin]) {
        await mockLP.approve(mockIFO.address, parseEther("1000"), {
          from: thisUser,
        });
      }

      // 14 generic accounts too
      for (let thisUser of accounts) {
        // Approves LP to be spent by mockIFO
        await mockLP.approve(mockIFO.address, parseEther("1000"), {
          from: thisUser,
        });
      }
    });
  });

  describe("IFO with credit", async () => {
    it("User (Bob) cannot deposit when credit used up", async () => {
      // console.log("bob's credit is %s", await ethers.utils.formatEther((await ifopool.getUserCredit(bob)).toString()));

      // Transfer the offering total amount to the IFO contract
      await mockOC.transfer(mockIFO.address, await mockIFO.totalTokensOffered(), {
        from: alice,
      });

      await time.advanceBlockTo(2200);

      let updateBlockResult = await mockIFO.updateStartAndEndBlocks(
        (await time.latestBlock()).toNumber() + 20,
        (await time.latestBlock()).toNumber() + 50,
        { from: alice }
      );

      await time.advanceBlockTo(2222);

      await expectRevert(
        mockIFO.depositPool(parseEther("0.6"), "0", { from: bob }),
        "Deposit: New amount above user limit"
      );

      await expectRevert(mockIFO.depositPool(parseEther("101"), "0", { from: bob }), "Not enough IFO credit left");

      await expectRevert(mockIFO.depositPool(parseEther("101"), "1", { from: bob }), "Not enough IFO credit left");

      result = await mockIFO.depositPool(parseEther("50"), "1", { from: bob });

      await expectRevert(mockIFO.depositPool(parseEther("51"), "1", { from: bob }), "Not enough IFO credit left");

      result = await mockIFO.depositPool(parseEther("50"), "1", { from: bob });

      await expectRevert(mockIFO.depositPool(parseEther("0.6"), "0", { from: bob }), "Not enough IFO credit left");
    });
  });
});
