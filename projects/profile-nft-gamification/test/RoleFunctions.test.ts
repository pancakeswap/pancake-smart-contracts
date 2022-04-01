import { assert } from "chai";
import { expectEvent, expectRevert } from "@openzeppelin/test-helpers";
import { gasToBNB, gasToUSD } from "./helpers/GasCalculation";

import { artifacts, contract } from "hardhat";

const MockAdmin = artifacts.require("./utils/MockAdmin.sol");
const MockBunnies = artifacts.require("./utils/MockBunnies.sol");
const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const MockCats = artifacts.require("./utils/MockCats.sol");
const PancakeProfile = artifacts.require("./PancakeProfile.sol");

contract("Admin and point system logic", ([alice, bob, carol, david, erin, frank]) => {
  const _totalInitSupply = "50000000000000000000"; // 50 CAKE
  const _numberCakeToReactivate = "5000000000000000000";
  const _numberCakeToRegister = "5000000000000000000"; // 5 CAKE
  const _numberCakeToUpdate = "2000000000000000000"; // 2 CAKE

  let mockAdmin, mockBunnies, mockCats, mockCake, pancakeProfile;
  let DEFAULT_ADMIN_ROLE, NFT_ROLE, POINT_ROLE, SPECIAL_ROLE;
  let result;

  before(async () => {
    mockCake = await MockBEP20.new("Mock CAKE", "CAKE", _totalInitSupply, {
      from: alice,
    });

    mockBunnies = await MockBunnies.new({ from: alice });

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
    SPECIAL_ROLE = await pancakeProfile.SPECIAL_ROLE();
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
      assert.equal(await mockCake.balanceOf(alice), "50000000000000000000");
      assert.equal(await mockCake.totalSupply(), "50000000000000000000");
    });
    it("PancakeProfile is correct", async () => {
      assert.equal(await pancakeProfile.cakeToken(), mockCake.address);
      assert.equal(await pancakeProfile.numberCakeToReactivate(), _numberCakeToReactivate);
      assert.equal(await pancakeProfile.numberCakeToRegister(), _numberCakeToRegister);
      assert.equal(await pancakeProfile.numberCakeToUpdate(), _numberCakeToUpdate);

      for (let role of [SPECIAL_ROLE, NFT_ROLE, POINT_ROLE]) {
        assert.equal(await pancakeProfile.getRoleMemberCount(role), "0");
      }

      assert.equal(await pancakeProfile.getRoleMemberCount(DEFAULT_ADMIN_ROLE), "1");
    });
  });
  describe("Admin logic and team point increases", async () => {
    it("Bob creates a profile in the system", async () => {
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

      // Bob mints a NFT
      await mockBunnies.mint({ from: bob });

      // Bob approves the contract to receive his NFT
      await mockBunnies.approve(pancakeProfile.address, "0", {
        from: bob,
      });

      // Bob mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: bob });
      }

      // Bob approves CAKE to be spent
      await mockCake.approve(pancakeProfile.address, "5000000000000000000", {
        from: bob,
      });

      // Bob can create his profile
      await pancakeProfile.createProfile("1", mockBunnies.address, "0", {
        from: bob,
      });

      // Verify the team profile data is accurate
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[0], "The Testers");
      assert.equal(result[1], "ipfs://hash/team1.json");
      assert.equal(result[2].toString(), "1");
      assert.equal(result[3].toString(), "0"); // Number of points for the team
      assert.equal(result[4], true);
    });

    it("MockAdmin is deployed with correct parameters", async () => {
      mockAdmin = await MockAdmin.new(pancakeProfile.address, {
        from: alice,
      });

      assert.equal(await mockAdmin.numberFreePoints(), "88");
      assert.equal(await mockAdmin.pancakeProfileAddress(), pancakeProfile.address);
    });

    it("Alice cannot increase points if she is not a point admin", async () => {
      // Alice cannot increase number of points of the first team
      await expectRevert(
        mockAdmin.increaseTeamPointsPP("1", "100", {
          from: alice,
        }),
        "Not a point admin"
      );
    });

    it("Alice adds MockAdmin as point admin in PancakeProfile", async () => {
      result = await pancakeProfile.grantRole(POINT_ROLE, mockAdmin.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: mockAdmin.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(POINT_ROLE), "1");
    });

    it("Alice increases number of points through the MockAdmin", async () => {
      result = await mockAdmin.increaseTeamPointsPP("1", "100", {
        from: alice,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "TeamPointIncrease", {
        teamId: "1",
        numberPoints: "100",
        campaignId: "511012101",
      });

      // Verify the number of team points is 100
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[3], "100");
    });
  });

  describe("Point functions for a single user", async () => {
    it("Bob can only claim user points and it is reflected in his profile", async () => {
      result = await pancakeProfile.getUserProfile(bob);
      assert.equal(result[1], "0");
      result = await mockAdmin.increaseUserPointsPP({ from: bob });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: bob,
        numberPoints: "88",
        campaignId: "711012101",
      });

      // Check it was updated properly
      result = await pancakeProfile.getUserProfile(bob);
      assert.equal(result[1], "88");
    });

    it("Bob can only claim user points once", async () => {
      await expectRevert(mockAdmin.increaseUserPointsPP({ from: bob }), "has claimed");
    });

    it("Carol cannot increase her points if not active", async () => {
      await expectRevert(mockAdmin.increaseUserPointsPP({ from: carol }), "not active");
    });

    it("Carol cannot receive points if her user status is paused", async () => {
      // Carol mints a NFT
      await mockBunnies.mint({ from: carol });

      // Carol approves the contract to receive her NFT
      await mockBunnies.approve(pancakeProfile.address, "1", {
        from: carol,
      });

      // Carol mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: carol });
      }

      // Carol approves CAKE to be spent
      await mockCake.approve(pancakeProfile.address, "10000000000000000000", {
        from: carol,
      });

      // Carol creates her profile
      await pancakeProfile.createProfile("1", mockBunnies.address, "1", {
        from: carol,
      });

      // Carol pauses her profile
      result = await pancakeProfile.pauseProfile({
        from: carol,
      });

      expectEvent(result, "UserPause", {
        userAddress: carol,
        teamId: "1",
      });

      // Carol cannot increase her number of points since she is unactive
      await expectRevert(
        mockAdmin.increaseUserPointsPP({
          from: carol,
        }),
        "not active"
      );
    });

    it("Carol can receive points after she reactivates her profile", async () => {
      // Carol re-approves the contract to receive his NFT
      await mockBunnies.approve(pancakeProfile.address, "1", {
        from: carol,
      });

      // Carol reactivates her profile
      await pancakeProfile.reactivateProfile(mockBunnies.address, "1", {
        from: carol,
      });

      // Carol gets her points
      result = await mockAdmin.increaseUserPointsPP({
        from: carol,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: carol,
        numberPoints: "88",
        campaignId: "711012101",
      });

      // Check it was updated properly
      result = await pancakeProfile.getUserProfile(carol);
      assert.equal(result[1], "88");
    });

    it("Only an active admin can conduct point operations", async () => {
      // David mints a NFT
      await mockBunnies.mint({ from: david });

      // David approves the contract to receive his NFT
      await mockBunnies.approve(pancakeProfile.address, "2", {
        from: david,
      });

      // David mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: david });
      }

      // David approves CAKE to be spent
      await mockCake.approve(pancakeProfile.address, "5000000000000000000", {
        from: david,
      });

      // David creates her profile
      await pancakeProfile.createProfile("1", mockBunnies.address, "2", {
        from: david,
      });

      // Alice removes the admin contract as valid
      result = await pancakeProfile.revokeRole(POINT_ROLE, mockAdmin.address, {
        from: alice,
      });

      expectEvent(result, "RoleRevoked", {
        role: POINT_ROLE,
        account: mockAdmin.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(POINT_ROLE), "0");

      // David cannot increase his points since contract is not admin
      await expectRevert(
        mockAdmin.increaseUserPointsPP({
          from: david,
        }),
        "Not a point admin"
      );

      // Alice cannot increase team points despite being contract owner (she is not admin)
      await expectRevert(
        mockAdmin.increaseTeamPointsPP("1", "100", {
          from: alice,
        }),
        "Not a point admin"
      );

      // Alice cannot increase points of multiple users because she is owner, not admin
      await expectRevert(
        mockAdmin.increaseUserPointsMultiplePP([bob, carol, david], "100", {
          from: alice,
        }),
        "Not a point admin"
      );
    });

    it("Multi-point increases works as expected", async () => {
      // Alice re-adds the contract as admin
      result = await pancakeProfile.grantRole(POINT_ROLE, mockAdmin.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: mockAdmin.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(POINT_ROLE), "1");

      // David increases his points
      result = await mockAdmin.increaseUserPointsPP({
        from: david,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncrease", {
        userAddress: david,
        numberPoints: "88",
        campaignId: "711012101",
      });

      // Check it was updated properly
      result = await pancakeProfile.getUserProfile(david);
      assert.equal(result[1], "88");

      // Alice increases number of points of Bob, Carol, David by 100 points
      result = await mockAdmin.increaseUserPointsMultiplePP([bob, carol, david], "100", {
        from: alice,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncreaseMultiple", {
        userAddresses: [bob, carol, david],
        numberPoints: "100",
        campaignId: "811012101",
      });

      // Check points were updated for all 3 users (method 2)
      for (let thisUser of [bob, carol, david]) {
        result = await pancakeProfile.getUserProfile(thisUser);
        assert.equal(result[1], "188");
      }
    });
  });

  describe("Owner functions", async () => {
    it("Only the owner can call owner functions", async () => {
      // addNftAddress
      await expectRevert(
        pancakeProfile.addNftAddress(alice, {
          from: bob,
        }),
        "Not the main admin"
      );

      // addTeam
      await expectRevert(
        pancakeProfile.addTeam("The Cheaters", "ipfs://hash/team2.json", {
          from: bob,
        }),
        "Not the main admin"
      );

      // claimFee
      await expectRevert(
        pancakeProfile.claimFee("10000000000", {
          from: bob,
        }),
        "Not the main admin"
      );

      // makeTeamJoinable
      await expectRevert(
        pancakeProfile.makeTeamJoinable("1", {
          from: bob,
        }),
        "Not the main admin"
      );

      // makeTeamNotJoinable
      await expectRevert(
        pancakeProfile.makeTeamNotJoinable("1", {
          from: bob,
        }),
        "Not the main admin"
      );

      // renameTeam
      await expectRevert(
        pancakeProfile.renameTeam("1", "The Cheaters", "ipfs://hash/team2.json", {
          from: bob,
        }),
        "Not the main admin"
      );

      // updateNumberCake
      await expectRevert(
        pancakeProfile.updateNumberCake("10000000000", "10000000000", "10000000000", {
          from: bob,
        }),
        "Not the main admin"
      );
    });

    it("Functions to rename teams work", async () => {
      await expectRevert(
        pancakeProfile.renameTeam("0", "Team Not There", "ipfs://hash/team3.json", {
          from: alice,
        }),
        "teamId invalid"
      );

      await expectRevert(
        pancakeProfile.renameTeam("3", "Team Not There", "ipfs://hash/team3.json", {
          from: alice,
        }),
        "teamId invalid"
      );

      await expectRevert(pancakeProfile.renameTeam("1", "BOB", { from: alice }), "Must be > 3");

      await expectRevert(
        pancakeProfile.renameTeam("1", "ABCDEFGHIJKLMNOPQRST", {
          from: alice,
        }),
        "Must be < 20"
      );

      result = await pancakeProfile.renameTeam("1", "The Bosses", "ipfs://newHash/team1.json", {
        from: alice,
      });

      result = await pancakeProfile.getTeamProfile("1");

      assert.equal(result[0], "The Bosses");
      assert.equal(result[1], "ipfs://newHash/team1.json");
    });

    it("Function to remove user points works", async () => {
      result = await pancakeProfile.grantRole(POINT_ROLE, frank, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: POINT_ROLE,
        account: frank,
        sender: alice,
      });

      await expectRevert(
        pancakeProfile.removeUserPoints(frank, "10", {
          from: alice,
        }),
        "Not a point admin"
      );

      // Frank has 0 point
      await expectRevert(
        pancakeProfile.removeUserPoints(frank, "10", {
          from: frank,
        }),
        "SafeMath: subtraction overflow"
      );

      await pancakeProfile.removeUserPoints(david, "10", {
        from: frank,
      });

      // David has 188 - 10  = 178 points
      result = await pancakeProfile.getUserProfile(david);
      assert.equal(result[1].toString(), "178");
    });

    it("Function to remove multiple user points works", async () => {
      await expectRevert(
        pancakeProfile.removeUserPoints(frank, "10", {
          from: alice,
        }),
        "Not a point admin"
      );

      // They all have less than 200
      await expectRevert(
        pancakeProfile.removeUserPointsMultiple([bob, carol, david], "200", {
          from: frank,
        }),
        "SafeMath: subtraction overflow"
      );

      // Only David has less than 180
      await expectRevert(
        pancakeProfile.removeUserPointsMultiple([bob, carol, david], "180", {
          from: frank,
        }),
        "SafeMath: subtraction overflow"
      );

      await pancakeProfile.removeUserPointsMultiple([bob, carol, david], "10", {
        from: frank,
      });

      // David has 178 - 10  = 168 points
      result = await pancakeProfile.getUserProfile(david);
      assert.equal(result[1].toString(), "168");

      // Bob has 188 - 10  = 178 points
      result = await pancakeProfile.getUserProfile(bob);
      assert.equal(result[1].toString(), "178");

      // Carol has 188 - 10  = 178 points
      result = await pancakeProfile.getUserProfile(carol);
      assert.equal(result[1].toString(), "178");
    });

    it("Function to remove multiple user points works", async () => {
      await expectRevert(
        pancakeProfile.removeTeamPoints("1", "10", {
          from: alice,
        }),
        "Not a point admin"
      );

      // Team 1 has less than 20,000 points
      await expectRevert(
        pancakeProfile.removeTeamPoints("1", "20000", {
          from: frank,
        }),
        "SafeMath: subtraction overflow"
      );

      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[3].toString(), "100");

      await pancakeProfile.removeTeamPoints("1", "50", {
        from: frank,
      });

      // 100 - 50 = 50 points
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[3].toString(), "50");
    });
    it("Functions to make a team not joinable works", async () => {
      // Erin mints a NFT
      await mockBunnies.mint({ from: erin });

      // Erinn approves the contract to receive her NFT
      await mockBunnies.approve(pancakeProfile.address, "3", {
        from: erin,
      });

      // Erin mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: erin });
      }

      // Erin approves CAKE to be spent
      await mockCake.approve(pancakeProfile.address, "10000000000000000000", {
        from: erin,
      });

      // Alice makes the team not joinable
      await pancakeProfile.makeTeamNotJoinable("1", {
        from: alice,
      });

      // It stays the same if a team is not joinable
      assert.equal(await pancakeProfile.numberTeams(), "1");

      // Verify the team profile data is accurate
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[4], false); // Team is not joinable

      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "3", {
          from: erin,
        }),
        "Team not joinable"
      );

      await expectRevert(pancakeProfile.makeTeamNotJoinable("0", { from: alice }), "teamId invalid");

      await expectRevert(pancakeProfile.makeTeamNotJoinable("4", { from: alice }), "teamId invalid");
    });

    it("Function to make a team joinable works", async () => {
      await pancakeProfile.makeTeamJoinable("1", {
        from: alice,
      });

      await expectRevert(pancakeProfile.makeTeamJoinable("0", { from: alice }), "teamId invalid");

      await expectRevert(pancakeProfile.makeTeamJoinable("4", { from: alice }), "teamId invalid");

      // It stays the same if a team is not joinable
      assert.equal(await pancakeProfile.numberTeams(), "1");

      // Verify the team profile data is accurate
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[4], true); // Team is not joinable

      // Erin creates her profile
      await pancakeProfile.createProfile("1", mockBunnies.address, "3", {
        from: erin,
      });
    });

    it("Function to remove a NFT address works and does not prevent pausing profiles", async () => {
      result = await pancakeProfile.revokeRole(NFT_ROLE, mockBunnies.address, {
        from: alice,
      });

      expectEvent(result, "RoleRevoked", {
        role: NFT_ROLE,
        account: mockBunnies.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(NFT_ROLE), "0");

      result = await pancakeProfile.pauseProfile({ from: david });

      expectEvent(result, "UserPause", {
        userAddress: david,
        teamId: "1",
      });
    });

    it("Function to add a team works", async () => {
      await expectRevert(pancakeProfile.addTeam("BOB", { from: alice }), "Must be > 3");

      await expectRevert(pancakeProfile.addTeam("ABCDEFGHIJKLMNOPQRST", { from: alice }), "Must be < 20");

      result = await pancakeProfile.addTeam("The Admins", "ipfs://hash/team2.json", {
        from: alice,
      });

      assert.equal(await pancakeProfile.numberTeams(), "2");

      // Verify the team profile data is accurate
      result = await pancakeProfile.getTeamProfile("2");
      assert.equal(result[0], "The Admins");
      assert.equal(result[1], "ipfs://hash/team2.json");
    });

    it("Function to claim fees work", async () => {
      result = await mockCake.balanceOf(pancakeProfile.address);
      await pancakeProfile.claimFee(result, {
        from: alice,
      });

      result = await mockCake.balanceOf(alice);

      assert.equal(result.toString(), "75000000000000000000");
    });

    it("Functions to change fees work", async () => {
      // 5 CAKE
      assert.equal(await pancakeProfile.numberCakeToRegister(), "5000000000000000000");

      // Set to 1/4/2 CAKE
      await pancakeProfile.updateNumberCake("1000000000000000000", "4000000000000000000", "2000000000000000000", {
        from: alice,
      });

      result = await pancakeProfile.numberCakeToReactivate();

      // 1 CAKE
      assert.equal(result.toString(), "1000000000000000000");

      result = await pancakeProfile.numberCakeToRegister();

      // 4 CAKE
      assert.equal(result.toString(), "4000000000000000000");

      result = await pancakeProfile.numberCakeToUpdate();

      // 2 CAKE
      assert.equal(await pancakeProfile.numberCakeToUpdate(), "2000000000000000000");
    });

    it("Only ERC721 contracts can be added", async () => {
      // Alice cannot add a user
      await expectRevert(
        pancakeProfile.addNftAddress(bob, {
          from: alice,
        }),
        "function call to a non-contract account"
      );

      // Alice cannot add a contract that doesn't support the interface
      await expectRevert(
        pancakeProfile.addNftAddress(mockAdmin.address, {
          from: alice,
        }),
        "function selector was not recognized and there's no fallback function"
      );

      // Bob deploys MockCats
      mockCats = await MockCats.new({ from: bob });

      // Alice can add a new NFT contract deployed by Bob
      result = await pancakeProfile.addNftAddress(mockCats.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: NFT_ROLE,
        account: mockCats.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(NFT_ROLE), "1");
    });

    it("Exceptions for out-of-gas loops for points work", async () => {
      // Initialize an array with 1000 entries that are bob's address
      var _usersLoop = [];
      for (let i = 0; i < 1000; i++) {
        _usersLoop.push(bob);
      }

      // Verify array length is 1000
      assert.equal(_usersLoop.length, 1000);

      // Frank has point role and increases Bob's point 1000 times
      result = await pancakeProfile.increaseUserPointsMultiple(_usersLoop, "1", "1011111111", {
        from: frank,
      });

      // Verify events
      expectEvent.inTransaction(result.receipt.transactionHash, pancakeProfile, "UserPointIncreaseMultiple", {
        userAddresses: _usersLoop,
        numberPoints: "1",
        campaignId: "1011111111",
      });

      // Check it was updated properly
      result = await pancakeProfile.getUserProfile(bob);
      assert.equal(result[1], "1178");

      // Frank has made a mistake and corrects it
      result = await pancakeProfile.removeUserPointsMultiple(_usersLoop, "1", {
        from: frank,
      });

      // Check it was updated properly
      result = await pancakeProfile.getUserProfile(bob);
      assert.equal(result[1], "178");

      // Make the array length equal to 1001
      _usersLoop.push(bob);
      assert.equal(_usersLoop.length, 1001);

      // Array length is too long
      await expectRevert(
        pancakeProfile.increaseUserPointsMultiple(_usersLoop, "1", "1011111111", {
          from: frank,
        }),
        "Length must be < 1001"
      );

      // Array length is too long
      await expectRevert(
        pancakeProfile.removeUserPointsMultiple(_usersLoop, "1", {
          from: frank,
        }),
        "Length must be < 1001"
      );
    });

    describe("Special functions", async () => {
      it("Change team is only callable by special role", async () => {
        assert.equal(await pancakeProfile.getRoleMemberCount(SPECIAL_ROLE), "0");
        // changeTeam
        await expectRevert(
          pancakeProfile.changeTeam(bob, "1", {
            from: alice,
          }),
          "Not a special admin"
        );
      });

      it("Frank is added as a special admin", async () => {
        result = await pancakeProfile.grantRole(SPECIAL_ROLE, frank, {
          from: alice,
        });

        expectEvent(result, "RoleGranted", {
          role: SPECIAL_ROLE,
          account: frank,
          sender: alice,
        });

        assert.equal(await pancakeProfile.getRoleMemberCount(SPECIAL_ROLE), "1");
      });

      it("Frank can change team for user", async () => {
        result = await pancakeProfile.getTeamProfile("1");
        assert.equal(result[2].toString(), "3");

        result = await pancakeProfile.getTeamProfile("2");
        assert.equal(result[2].toString(), "0");

        result = await pancakeProfile.changeTeam(bob, "2", {
          from: frank,
        });

        expectEvent(result, "UserChangeTeam", {
          userAddress: bob,
          oldTeamId: "1",
          newTeamId: "2",
        });

        result = await pancakeProfile.getTeamProfile("1");
        assert.equal(result[2].toString(), "2");

        result = await pancakeProfile.getTeamProfile("2");
        assert.equal(result[2].toString(), "1");
      });

      it("Exceptions for changeTeam are properly triggered", async () => {
        await expectRevert(
          pancakeProfile.changeTeam(frank, "1", {
            from: frank,
          }),
          "User doesn't exist"
        );

        await expectRevert(
          pancakeProfile.changeTeam(carol, "5", {
            from: frank,
          }),
          "teamId doesn't exist"
        );

        await expectRevert(
          pancakeProfile.changeTeam(bob, "2", {
            from: frank,
          }),
          "Already in the team"
        );

        // Alice makes the team not joinable
        await pancakeProfile.makeTeamNotJoinable("2", {
          from: alice,
        });

        // Frnak cannot change Carol to team2 since team is not joinable
        await expectRevert(
          pancakeProfile.changeTeam(carol, "2", {
            from: frank,
          }),
          "Team not joinable"
        );
      });
    });
  });
});
