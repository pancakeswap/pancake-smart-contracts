import { assert } from "chai";
import { expectEvent, expectRevert } from "@openzeppelin/test-helpers";
import { artifacts, contract } from "hardhat";

const { gasToBNB, gasToUSD } = require("./helpers/GasCalculation");

const MockBEP20 = artifacts.require("./utils/MockBEP20.sol");
const MockBunnies = artifacts.require("./utils/MockBunnies.sol");
const MockCats = artifacts.require("./utils/MockCats.sol");
const PancakeProfile = artifacts.require("./PancakeProfile.sol");

contract("User interactions", ([alice, bob, carol, david, erin, frank]) => {
  const _totalInitSupply = "50000000000000000000"; // 50 CAKE
  const _numberCakeToReactivate = "5000000000000000000";
  const _numberCakeToRegister = "5000000000000000000"; // 5 CAKE
  const _numberCakeToUpdate = "2000000000000000000"; // 2 CAKE

  let mockBunnies, mockCats, mockCake, pancakeProfile;
  let DEFAULT_ADMIN_ROLE, SPECIAL_ROLE, NFT_ROLE, POINT_ROLE;
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
  describe("All contracts are deployed correctly", async () => {
    it("Initial parameters are correct for MockBunnies", async () => {
      assert.equal(await mockBunnies.name(), "Mock Bunnies");
      assert.equal(await mockBunnies.symbol(), "MB");
      assert.equal(await mockBunnies.balanceOf(alice), "0");
      assert.equal(await mockBunnies.totalSupply(), "0");
      assert.equal(await mockBunnies.owner(), alice);
    });

    it("Initial parameters are correct for MockCAKE", async () => {
      assert.equal(await mockCake.name(), "Mock CAKE");
      assert.equal(await mockCake.symbol(), "CAKE");
      assert.equal(await mockCake.balanceOf(alice), "50000000000000000000");
      assert.equal(await mockCake.totalSupply(), "50000000000000000000");
    });

    it("Initial parameters are correct for PancakeProfile", async () => {
      assert.equal(await pancakeProfile.cakeToken(), mockCake.address);
      assert.equal(await pancakeProfile.numberCakeToRegister(), _numberCakeToRegister);
      assert.equal(await pancakeProfile.numberCakeToUpdate(), _numberCakeToUpdate);
      assert.equal(await pancakeProfile.numberCakeToReactivate(), _numberCakeToReactivate);

      for (let role of [SPECIAL_ROLE, NFT_ROLE, POINT_ROLE]) {
        assert.equal(await pancakeProfile.getRoleMemberCount(role), "0");
      }

      assert.equal(await pancakeProfile.getRoleMemberCount(DEFAULT_ADMIN_ROLE), "1");
    });
  });

  describe("Logic to register and create team works as expected", async () => {
    it("Bob cannot create a profile if teamId is invalid", async () => {
      await expectRevert(
        pancakeProfile.createProfile("0", mockBunnies.address, "0", {
          from: bob,
        }),
        "Invalid teamId"
      );
    });

    it("Alice creates a team and data is reflected accordingly", async () => {
      result = await pancakeProfile.addTeam("The Testers", "ipfs://hash/team1.json", {
        from: alice,
      });

      expectEvent(result, "TeamAdd", {
        teamId: "1",
        teamName: "The Testers",
      });

      // Verify the team is created properly
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[0], "The Testers");
      assert.equal(result[1], "ipfs://hash/team1.json");
      assert.equal(result[2], "0");
      assert.equal(result[3], "0");
      assert.equal(result[4], true);
    });

    it("Bob cannot mint a NFT if contract address not supported", async () => {
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "NFT address invalid"
      );

      result = await pancakeProfile.addNftAddress(mockBunnies.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: NFT_ROLE,
        account: mockBunnies.address,
        sender: alice,
      });

      assert.equal(await pancakeProfile.getRoleMemberCount(NFT_ROLE), "1");
    });

    it("Bob cannot create a profile without a NFT to spend", async () => {
      // Bob is trying to spend a token that doesn't exist
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "ERC721: owner query for nonexistent token"
      );

      // Bob mints a NFT
      await mockBunnies.mint({ from: bob });
      assert.equal(await mockBunnies.balanceOf(bob), "1");
      assert.equal(await mockBunnies.ownerOf("0"), bob);
      assert.equal(await mockBunnies.totalSupply(), "1");
    });

    it("Bob cannot create a profile without approving the NFT to be spent", async () => {
      // Bob will not be able to transfer because contract not approved
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "ERC721: transfer caller is not owner nor approved"
      );

      // Bob approves the contract to receive his NFT
      result = await mockBunnies.approve(pancakeProfile.address, "0", {
        from: bob,
      });

      expectEvent(result, "Approval", {
        owner: bob,
        approved: pancakeProfile.address,
        tokenId: "0",
      });
    });

    it("Bob cannot create a profile without CAKE tokens in his wallet", async () => {
      // Bob doesn't have CAKE
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "BEP20: transfer amount exceeds balance"
      );

      // Bob mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: bob });
      }

      // Bob has the proper balance
      assert.equal(await mockCake.balanceOf(bob), "10000000000000000000");
    });

    it("Bob cannot create a profile without CAKE token approval to be spent", async () => {
      // Bob didn't approve CAKE to be spent
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "BEP20: transfer amount exceeds allowance"
      );

      // Bob approves the CAKE token to be spent
      result = await mockCake.approve(pancakeProfile.address, "5000000000000000000", { from: bob });

      expectEvent(result, "Approval", {
        owner: bob,
        spender: pancakeProfile.address,
        value: "5000000000000000000", // 5 CAKE
      });
    });

    it("Bob can finally create a profile and data is reflected as expected", async () => {
      result = await pancakeProfile.createProfile("1", mockBunnies.address, "0", {
        from: bob,
      });

      expectEvent(result, "UserNew", {
        userAddress: bob,
        teamId: "1",
        nftAddress: mockBunnies.address,
        tokenId: "0",
      });

      // Team 1 has 1 user
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[2], "1");

      // Verify Bob's balance went down and allowance must be 0
      assert.equal(await mockCake.balanceOf(bob), "5000000000000000000");
      assert.equal(await mockCake.allowance(bob, pancakeProfile.address), "0");

      // Verify that the mock NFT went to the contract
      assert.equal(await mockBunnies.balanceOf(bob), "0");
      assert.equal(await mockBunnies.ownerOf("0"), pancakeProfile.address);

      // Verify number of active profiles changed
      assert.equal(await pancakeProfile.numberActiveProfiles(), "1");

      // Verify Bob has registered
      assert.equal(await pancakeProfile.hasRegistered(bob), true);
    });

    it("Bob cannot register twice", async () => {
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "0", {
          from: bob,
        }),
        "Already registered"
      );
    });
  });

  describe("Logic to pause and reactivate a profile works as expected", async () => {
    it("Bob only can pause his profile", async () => {
      result = await pancakeProfile.pauseProfile({
        from: bob,
      });

      expectEvent(result, "UserPause", {
        userAddress: bob,
        teamId: "1",
      });

      result = await pancakeProfile.getUserStatus(bob);
      assert.equal(result, false);
    });

    it("NFT returned to Bob and contract statuses were updated", async () => {
      // Verify that the mock NFT went back to Bob
      assert.equal(await mockBunnies.balanceOf(bob), "1");
      assert.equal(await mockBunnies.ownerOf("0"), bob);

      // Verify there is no more active user
      assert.equal(await pancakeProfile.numberActiveProfiles(), "0");

      // Verify the team has 0 active user
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[2], "0");
    });

    it("Bob cannot pause again/update while paused/register", async () => {
      // Bob cannot pause a profile twice
      await expectRevert(
        pancakeProfile.pauseProfile({
          from: bob,
        }),
        "User not active"
      );

      // Bob cannot update his own profile after it is paused
      await expectRevert(
        pancakeProfile.updateProfile(mockBunnies.address, "0", {
          from: bob,
        }),
        "User not active"
      );

      // Bob cannot re-register
      await expectRevert(
        pancakeProfile.pauseProfile({
          from: bob,
        }),
        "User not active"
      );
    });

    it("Bob reactivates his profile", async () => {
      // Bob increases allowance for address
      result = await mockCake.increaseAllowance(pancakeProfile.address, "5000000000000000000", { from: bob });

      expectEvent(result, "Approval", {
        owner: bob,
        spender: pancakeProfile.address,
        value: "5000000000000000000", // 5 CAKE
      });

      // Bob approves the contract to receive his NFT
      result = await mockBunnies.approve(pancakeProfile.address, "0", {
        from: bob,
      });

      expectEvent(result, "Approval", {
        owner: bob,
        approved: pancakeProfile.address,
        tokenId: "0",
      });

      // Bob reactivates his profile
      result = await pancakeProfile.reactivateProfile(mockBunnies.address, "0", {
        from: bob,
      });

      expectEvent(result, "UserReactivate", {
        userAddress: bob,
        teamId: "1",
        nftAddress: mockBunnies.address,
        tokenId: "0",
      });

      // Verify there is one active user again
      assert.equal(await pancakeProfile.numberActiveProfiles(), "1");
      // Verify the team has 1 active user again
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[2], "1");

      result = await pancakeProfile.getUserStatus(bob);
      assert.equal(result, true);
    });

    it("Bob cannot reactivate his profile if active", async () => {
      await expectRevert(
        pancakeProfile.reactivateProfile(mockBunnies.address, "0", {
          from: bob,
        }),
        "User is active"
      );
    });
  });

  describe("Multiple users join the system", async () => {
    it("Carol and David mints CAKE/NFTs", async () => {
      // Carol gets 10 CAKE and mint NFT
      for (let i = 0; i < 20; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: carol });
      }

      await mockBunnies.mint({ from: carol });

      // David gets 10 CAKE and mint NFT
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: david });
      }

      await mockBunnies.mint({ from: david });

      assert.equal(await mockBunnies.totalSupply(), "3");

      // Carol approves NFTs to be spent
      result = await mockBunnies.approve(pancakeProfile.address, "1", {
        from: carol,
      });

      expectEvent(result, "Approval", {
        owner: carol,
        approved: pancakeProfile.address,
        tokenId: "1",
      });

      // Carol approves the CAKE token to be spent
      result = await mockCake.approve(
        pancakeProfile.address,
        "100000000000000000000", // 100 CAKE
        { from: carol }
      );

      expectEvent(result, "Approval", {
        owner: carol,
        spender: pancakeProfile.address,
        value: "100000000000000000000", // 100 CAKE
      });
    });

    it("Carol tries to spend the David's NFT", async () => {
      // Carol cannot spend the NFT of David WITHOUT his consent
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "2", {
          from: carol,
        }),
        "Only NFT owner can register"
      );

      // David approves NFTs to be spent by Carol
      result = await mockBunnies.approve(carol, "2", {
        from: david,
      });

      expectEvent(result, "Approval", {
        owner: david,
        approved: carol,
        tokenId: "2",
      });

      // Carol cannot spend the NFT of David WITH his consent
      await expectRevert(
        pancakeProfile.createProfile("1", mockBunnies.address, "2", {
          from: carol,
        }),
        "Only NFT owner can register"
      );
    });

    it("Carol creates a profile with her NFT", async () => {
      result = await pancakeProfile.createProfile("1", mockBunnies.address, "1", { from: carol });

      expectEvent(result, "UserNew", {
        userAddress: carol,
        teamId: "1",
        nftAddress: mockBunnies.address,
        tokenId: "1",
      });
    });

    it("David registers and all statuses are updated accordingly", async () => {
      // David activates his profile
      await mockBunnies.approve(pancakeProfile.address, "2", {
        from: david,
      });

      // David approves the CAKE token to be spent
      await mockCake.approve(
        pancakeProfile.address,
        "10000000000000000000", // 10 CAKE
        { from: david }
      );
      result = await pancakeProfile.createProfile("1", mockBunnies.address, "2", { from: david });

      expectEvent(result, "UserNew", {
        userAddress: david,
        teamId: "1",
        nftAddress: mockBunnies.address,
        tokenId: "2",
      });

      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[2], "3");
      assert.equal(await pancakeProfile.numberActiveProfiles(), "3");
    });
  });

  describe("Multiple NFT contracts are supported and it is possible to update profile", async () => {
    it("Alice deploys and approves a new NFT contract", async () => {
      // Alice deploys new NFT contract
      mockCats = await MockCats.new({ from: alice });

      // Erin mints first tokenId (0) for MockCats
      await mockCats.mint({ from: erin });

      // Carol mints second tokenId (1) for MockCats
      await mockCats.mint({ from: carol });
    });

    it("Carol cannot update her profile until it is approved", async () => {
      await expectRevert(
        pancakeProfile.updateProfile(mockCats.address, "1", {
          from: carol,
        }),
        "NFT address invalid"
      );
    });

    it("Carol pauses her profile and tries to reactivate with new NFT", async () => {
      result = await pancakeProfile.pauseProfile({
        from: carol,
      });

      expectEvent(result, "UserPause", {
        userAddress: carol,
        teamId: "1",
      });

      // Carol approves NFT to be spent by
      await mockBunnies.approve(pancakeProfile.address, "1", {
        from: carol,
      });

      await expectRevert(
        pancakeProfile.reactivateProfile(mockCats.address, "1", {
          from: carol,
        }),
        "NFT address invalid"
      );

      result = await pancakeProfile.reactivateProfile(mockBunnies.address, "1", {
        from: carol,
      });

      expectEvent(result, "UserReactivate", {
        userAddress: carol,
        teamId: "1",
        nftAddress: mockBunnies.address,
        tokenId: "1",
      });
    });

    it("Alice approves a new NFT contract", async () => {
      // Alice adds the new NFT contract as supported
      result = await pancakeProfile.addNftAddress(mockCats.address, {
        from: alice,
      });

      expectEvent(result, "RoleGranted", {
        role: NFT_ROLE,
        account: mockCats.address,
        sender: alice,
      });
    });

    it("Carol pauses her profile and tries to reactivate with Erin's NFT", async () => {
      result = await pancakeProfile.pauseProfile({
        from: carol,
      });

      expectEvent(result, "UserPause", {
        userAddress: carol,
        teamId: "1",
      });

      // Erin approves her NFT contract to be spent by Carol
      await mockCats.approve(carol, "0", {
        from: erin,
      });

      await expectRevert(
        pancakeProfile.reactivateProfile(mockCats.address, "0", {
          from: carol,
        }),
        "Only NFT owner can update"
      );

      // Carol approves NFT to be spent by
      await mockCats.approve(pancakeProfile.address, "1", {
        from: carol,
      });

      result = await pancakeProfile.reactivateProfile(mockCats.address, "1", {
        from: carol,
      });

      expectEvent(result, "UserReactivate", {
        userAddress: carol,
        teamId: "1",
        nftAddress: mockCats.address,
        tokenId: "1",
      });
    });

    it("Erin let Carol spends her NFT for the profile but it reverts", async () => {
      // Erin approves her NFT contract to be spent by Carol
      await mockCats.approve(carol, "0", {
        from: erin,
      });

      await expectRevert(
        pancakeProfile.updateProfile(mockCats.address, "0", {
          from: carol,
        }),
        "Only NFT owner can update"
      );
    });

    it("Erin mints and registers her token", async () => {
      // Erin mints 10 CAKE
      for (let i = 0; i < 5; i++) {
        await mockCake.mintTokens("2000000000000000000", { from: erin });
      }

      // Erin approves her NFT contract to be spent by PancakeProfile
      await mockCats.approve(pancakeProfile.address, "0", {
        from: erin,
      });

      // Erin approves the CAKE token to be spent by PancakeProfile
      await mockCake.approve(
        pancakeProfile.address,
        "10000000000000000000", // 10 CAKE
        { from: erin }
      );

      // Erin creates her Pancake profile
      result = await pancakeProfile.createProfile("1", mockCats.address, "0", {
        from: erin,
      });

      expectEvent(result, "UserNew", {
        userAddress: erin,
        teamId: "1",
        nftAddress: mockCats.address,
        tokenId: "0",
      });

      assert.equal(await pancakeProfile.numberActiveProfiles(), "4");
      assert.equal(await pancakeProfile.numberTeams(), "1");
    });

    it("Frank cannot call functions without a profiles", async () => {
      await expectRevert(
        pancakeProfile.pauseProfile({
          from: frank,
        }),
        "Has not registered"
      );

      await expectRevert(
        pancakeProfile.updateProfile(mockCats.address, "0", {
          from: frank,
        }),
        "Has not registered"
      );

      await expectRevert(
        pancakeProfile.reactivateProfile(mockCats.address, "0", {
          from: frank,
        }),
        "Has not registered"
      );
    });

    it("Erin updates her profile and changes the NFT contract she had", async () => {
      // Erin mints a token for MockBunnies
      await mockBunnies.mint({ from: erin });

      result = await pancakeProfile.getUserProfile(erin);
      assert.equal(result[0], "4");
      assert.equal(result[1], "0");
      assert.equal(result[2], "1");
      assert.equal(result[3], mockCats.address);
      assert.equal(result[4], "0");
      assert.equal(result[5], true);

      // Verify the number of users in team 1 is 4
      result = await pancakeProfile.getTeamProfile("1");
      assert.equal(result[2], "4");

      // Erin approves her NFT contract to be spent by PancakeProfile
      await mockBunnies.approve(pancakeProfile.address, "3", {
        from: erin,
      });

      result = await pancakeProfile.updateProfile(mockBunnies.address, "3", {
        from: erin,
      });

      expectEvent(result, "UserUpdate", {
        userAddress: erin,
        nftAddress: mockBunnies.address,
        tokenId: "3",
      });

      // Balance checks
      assert.equal(await mockCake.balanceOf(erin), "3000000000000000000");
      assert.equal(await mockBunnies.balanceOf(erin), "0");
      assert.equal(await mockBunnies.ownerOf("3"), pancakeProfile.address);
      assert.equal(await mockBunnies.balanceOf(pancakeProfile.address), "3");
      assert.equal(await mockCats.balanceOf(erin), "1");
      assert.equal(await mockCats.balanceOf(pancakeProfile.address), "1");
      assert.equal(await mockCats.ownerOf("0"), erin);

      // Checking Erin's profile reflects the changes
      result = await pancakeProfile.getUserProfile(erin);
      assert.equal(result[3], mockBunnies.address);
      assert.equal(result[4], "3");
    });

    it("Tests for view functions", async () => {
      result = await pancakeProfile.getUserProfile(erin);
      assert.equal(result[3], mockBunnies.address);
      assert.equal(result[4], "3");

      // Frank has no profile
      await expectRevert(pancakeProfile.getUserProfile(frank), "Not registered");

      // teamId doesn't exist
      await expectRevert(pancakeProfile.getTeamProfile("5"), "teamId invalid");
    });
  });
});
