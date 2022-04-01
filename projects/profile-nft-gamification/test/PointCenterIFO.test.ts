import { assert } from "chai";
import { parseEther } from "ethers/lib/utils";
import { BN, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { artifacts, contract } from "hardhat";

import { gasToBNB, gasToUSD } from "./helpers/GasCalculation";

const MockBunnies = artifacts.require("./utils/MockBunnies.sol");
const IFO = artifacts.require("./interfaces/IFO.sol");
const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const PancakeProfile = artifacts.require("./PancakeProfile.sol");
const PointCenterIFO = artifacts.require("./PointCenterIFO.sol");

contract("IFO Point logic", ([alice, bob, carol, david, erin, frank]) => {
  const _totalInitSupply = parseEther("50"); // 50 CAKE
  const _numberCakeToReactivate = parseEther("5"); // 5 CAKE
  const _numberCakeToRegister = parseEther("5"); // 5 CAKE
  const _numberCakeToUpdate = parseEther("2"); // 2 CAKE

  let mockCake, mockBunnies, mockIFO, mockLP, mockOC, pancakeProfile, pointCenterIFO;

  let DEFAULT_ADMIN_ROLE, NFT_ROLE, POINT_ROLE;
  let result;
  let startBlock;
  let endBlock;

  before(async () => {
    // Deploy MockCAKE
    mockCake = await MockBEP20.new("Mock CAKE", "CAKE", _totalInitSupply, {
      from: alice,
    });

    // Deploy MockLP
    mockLP = await MockBEP20.new("Mock LP", "LP", _totalInitSupply, {
      from: alice,
    });

    // Deploy MockOfferingCoin
    mockOC = await MockBEP20.new("Mock Offering Coin", "OC", "500000000000000000", {
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

    DEFAULT_ADMIN_ROLE = await pancakeProfile.DEFAULT_ADMIN_ROLE();
    NFT_ROLE = await pancakeProfile.NFT_ROLE();
    POINT_ROLE = await pancakeProfile.POINT_ROLE();

    const latestBlock = await time.latestBlock();
    startBlock = latestBlock.add(new BN(10));
    endBlock = latestBlock.add(new BN(200));

    // Deploy Mock IFO
    mockIFO = await IFO.new(
      mockLP.address,
      mockOC.address,
      startBlock, // startBlock
      endBlock, // endBlock
      "500000000000000000", // offeringAmount
      "10000000000000000000", // raisingAmount
      alice,
      { from: alice }
    );

    // Deploy PointCenterIFO
    pointCenterIFO = await PointCenterIFO.new(pancakeProfile.address, "10", {
      from: alice,
    });

    await mockOC.transfer(mockIFO.address, "500000000000000000", {
      from: alice,
    });
  });

  // Check ticker, symbols, supply, and owners are correct
  describe("Initial contract parameters for all contracts", async () => {
    it("MockBunnies is correct", async () => {
      assert.equal(await mockBunnies.name(), "Mock Bunnies");
      assert.equal(await mockBunnies.symbol(), "MB");
      assert.equal(await mockBunnies.balanceOf(alice), "0");
      assert.equal(await mockBunnies.totalSupply(), "0");
      assert.equal(await mockBunnies.owner(), alice);
    });

    it("MockCAKE is correct", async () => {
      assert.equal(await mockCake.name(), "Mock CAKE");
      assert.equal(await mockCake.symbol(), "CAKE");
      assert.equal(String(await mockCake.balanceOf(alice)), String(parseEther("50")));
      assert.equal(String(await mockCake.totalSupply()), String(parseEther("50")));
    });

    it("PancakeProfile is correct", async () => {
      assert.equal(await pancakeProfile.cakeToken(), mockCake.address);
      assert.equal(String(await pancakeProfile.numberCakeToReactivate()), String(_numberCakeToReactivate));
      assert.equal(String(await pancakeProfile.numberCakeToRegister()), String(_numberCakeToRegister));
      assert.equal(String(await pancakeProfile.numberCakeToUpdate()), String(_numberCakeToUpdate));
      for (let role of [NFT_ROLE, POINT_ROLE]) {
        assert.equal(await pancakeProfile.getRoleMemberCount(role), "0");
      }
      assert.equal(await pancakeProfile.getRoleMemberCount(DEFAULT_ADMIN_ROLE), "1");
    });

    it("PointCenterIFO is correct", async () => {
      assert.equal(await pointCenterIFO.maxViewLength(), "10");
      assert.equal(await pointCenterIFO.owner(), alice);
    });
  });

  describe("Initial set up", async () => {
    it("Alice adds NFT in the system", async () => {
      result = await pancakeProfile.addNftAddress(mockBunnies.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: NFT_ROLE,
        account: mockBunnies.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(NFT_ROLE), "1");

      await pancakeProfile.addTeam("The Testers", "ipfs://hash/team1.json", {
        from: alice,
      });
    });

    it("Bob/Carol/David/Erin create a profile in the system", async () => {
      let i = 0;

      for (let thisUser of [bob, carol, david, erin]) {
        // Mints 100 CAKE
        await mockCake.mintTokens("100000000000000000000", { from: thisUser });

        // Mints 10 LP tokens
        await mockLP.mintTokens("10000000000000000000", { from: thisUser });

        // Bob mints a NFT
        result = await mockBunnies.mint({ from: thisUser });

        // Bob approves the contract to receive his NFT
        await mockBunnies.approve(pancakeProfile.address, i, {
          from: thisUser,
        });

        // Bob approves CAKE to be spent by PancakeProfile
        await mockCake.approve(pancakeProfile.address, "10000000000000000000", {
          from: thisUser,
        });

        // Approves LP to be spent by mockIFO
        await mockLP.approve(mockIFO.address, "10000000000000000000", {
          from: thisUser,
        });

        // Creates the profile
        await pancakeProfile.createProfile("1", mockBunnies.address, i, {
          from: thisUser,
        });
        i++;
      }
    });

    it("Bob/Carol/David/Erin participate in IFO", async () => {
      for (let thisUser of [bob, carol, david]) {
        result = await mockIFO.deposit("10000000000000000000", {
          from: thisUser,
        });
        expectEvent(result, "Deposit", {
          user: thisUser,
          amount: "10000000000000000000",
        });
      }

      result = await mockIFO.deposit("5000", {
        from: erin,
      });

      expectEvent(result, "Deposit", {
        user: erin,
        amount: "5000",
      });
    });

    it("Bob tries to get points with invalid IFO", async () => {
      assert.equal(await pointCenterIFO.checkClaimStatus(bob, mockIFO.address), false);

      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: bob,
        }),
        "not valid"
      );
    });

    it("Bob harvest and tries to get points", async () => {
      await time.advanceBlockTo(endBlock);

      result = await mockIFO.harvest({
        from: bob,
      });

      expectEvent(result, "Harvest", {
        user: bob,
        offeringAmount: "166666500000000000",
        excessAmount: "6666670000000000000",
      });

      assert.equal(await pointCenterIFO.checkClaimStatus(bob, mockIFO.address), false);
    });

    it("Alice adds current IFO to the list of supported contracts", async () => {
      result = await pointCenterIFO.addIFOAddress(mockIFO.address, "5001", "501012101", "30", {
        from: alice,
      });

      expectEvent(result, "IFOAdd", {
        contractAddress: mockIFO.address,
        thresholdToClaim: "5001",
        campaignId: "501012101",
        numberPoints: "30",
      });
    });

    it("Bob deactivates his profile and tries to get points", async () => {
      result = await pancakeProfile.pauseProfile({ from: bob });

      expectEvent(result, "UserPause", {
        userAddress: bob,
        teamId: "1",
      });

      // It should display true since the check is not done, part of the view function
      assert.equal(await pointCenterIFO.checkClaimStatus(bob, mockIFO.address), true);

      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: bob,
        }),
        "not active"
      );
    });

    it("Carol cannot get points if she hasn't claimed IFO rewards", async () => {
      assert.equal(await pointCenterIFO.checkClaimStatus(carol, mockIFO.address), false);

      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: carol,
        }),
        "has not claimed"
      );
    });

    it("Bob/Carol/David harvest", async () => {
      for (let thisUser of [carol, david]) {
        result = await mockIFO.harvest({
          from: thisUser,
        });

        expectEvent(result, "Harvest", {
          user: thisUser,
          offeringAmount: "166666500000000000",
          excessAmount: "6666670000000000000",
        });

        assert.equal(await pointCenterIFO.checkClaimStatus(thisUser, mockIFO.address), true);
      }
    });

    it("Erin cannot get points since she didn't reach the required amount", async () => {
      result = await mockIFO.harvest({
        from: erin,
      });

      expectEvent(result, "Harvest", {
        user: erin,
        offeringAmount: "0",
        excessAmount: "5000",
      });

      assert.equal(await pointCenterIFO.checkClaimStatus(erin, mockIFO.address), false);

      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: erin,
        }),
        "too small"
      );
    });

    it("Application cannot claim points until it becomes pointAdmin", async () => {
      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: carol,
        }),
        "Not a point admin"
      );
    });

    it("Alice makes this application a pointAdmin", async () => {
      result = await pancakeProfile.grantRole(POINT_ROLE, pointCenterIFO.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: pointCenterIFO.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(POINT_ROLE), "1");
    });

    it("Carol/David claim points", async () => {
      for (let thisUser of [carol, david]) {
        result = await pointCenterIFO.getPoints(mockIFO.address, {
          from: thisUser,
        });

        // Verify event
        expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
          userAddress: thisUser,
          numberPoints: "30",
          campaignId: "501012101",
        });

        assert.equal(await pointCenterIFO.checkClaimStatus(thisUser, mockIFO.address), false);

        result = await pancakeProfile.getUserProfile(thisUser);
        assert.equal(result[1], "30");
      }
    });

    it("Carol cannot claim twice points", async () => {
      await expectRevert(
        pointCenterIFO.getPoints(mockIFO.address, {
          from: carol,
        }),
        "has claimed for this IFO"
      );
    });

    it("Check multiple claim statuses work as expected", async () => {
      await expectRevert(pointCenterIFO.checkClaimStatus(alice, bob), "function call to a non-contract account");

      await expectRevert.unspecified(pointCenterIFO.checkClaimStatus(alice, mockLP.address));

      await expectRevert(
        pointCenterIFO.checkClaimStatuses(alice, [
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
          mockIFO.address,
        ]),
        "Length must be <= maxViewLength"
      );

      result = await pointCenterIFO.checkClaimStatuses(alice, [
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
        mockIFO.address,
      ]);

      assert.sameOrderedMembers(result, [false, false, false, false, false, false, false, false, false, false]);
    });

    it("The number of statuses that can be claimed is updated", async () => {
      await pointCenterIFO.updateMaxViewLength(3, { from: alice });
      assert.equal(await pointCenterIFO.maxViewLength(), "3");

      await expectRevert(
        pointCenterIFO.checkClaimStatuses(alice, [mockIFO.address, mockIFO.address, mockIFO.address, mockIFO.address]),
        "Length must be <= maxViewLength"
      );

      result = await pointCenterIFO.checkClaimStatuses(alice, [mockIFO.address, mockIFO.address, mockIFO.address]);

      assert.sameOrderedMembers(result, [false, false, false]);
    });

    it("Ownable functions are not callable by non-admin", async () => {
      await expectRevert(
        pointCenterIFO.addIFOAddress(mockIFO.address, "5001", "501012101", "30", {
          from: frank,
        }),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        pointCenterIFO.updateMaxViewLength("100", { from: frank }),
        "Ownable: caller is not the owner"
      );
    });
  });
});
