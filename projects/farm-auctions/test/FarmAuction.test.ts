import { artifacts, contract } from "hardhat";
import { parseEther } from "ethers/lib/utils";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { assert } from "chai";
import { gasToBNB, gasToUSD } from "./utils/gas";

const FarmAuction = artifacts.require("FarmAuction");
const MockCake = artifacts.require("./test/MockCake");

contract("FarmAuction", ([owner, operator, alice, bob, carol, david, eve]) => {
  let mockCake, fakeCake, farmAuction;
  let result: any;

  let startBlock, endBlock;

  before(async () => {
    mockCake = await MockCake.new("PancakeSwap", "Cake", parseEther("100000"), { from: owner });
    fakeCake = await MockCake.new("FakeSwap", "Cake", parseEther("100000"), { from: owner });
    farmAuction = await FarmAuction.new(mockCake.address, operator, "28800", {
      from: owner,
    });

    await mockCake.mintTokens(parseEther("100000"), { from: alice });
    await mockCake.mintTokens(parseEther("100000"), { from: bob });
    await fakeCake.mintTokens(parseEther("100000"), { from: david });
    await mockCake.approve(farmAuction.address, constants.MAX_UINT256, { from: alice });
    await mockCake.approve(farmAuction.address, constants.MAX_UINT256, { from: bob });

    await fakeCake.transfer(farmAuction.address, parseEther("100"), { from: david });
  });

  describe("Contract cannot be deployed with wrong parameters", async () => {
    it("Contract cannot be deployed with a wrong max auction length (0)", async () => {
      await expectRevert(
        FarmAuction.new(mockCake.address, operator, "0", {
          from: owner,
        }),
        "Auction: Length cannot be zero"
      );
    });

    it("Contract cannot be deployed with a wrong max auction length (123456789)", async () => {
      await expectRevert(
        FarmAuction.new(mockCake.address, operator, "123456789", {
          from: owner,
        }),
        "Auction: Cannot be longer than three days (86,400 blocks)"
      );
    });
  });

  describe("Operator can manage the contract", async () => {
    it("Operator cannot start an auction if there are no whitelisted addresses", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator }),
        "Auction: No whitelisted address"
      );
    });

    it("Anyone can view whitelisted statuses", async () => {
      result = await farmAuction.whitelisted(alice);

      assert.equal(result, false);
    });

    it("Operator can add multiple addresses to the whitelist", async () => {
      result = await farmAuction.addWhitelist([alice, bob, carol, david], { from: operator });

      console.info(
        `        --> Cost to whitelist (4) addresses: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      assert.equal(result.logs[0].args.account, alice);
      assert.equal(result.logs[1].args.account, bob);
      assert.equal(result.logs[2].args.account, carol);
      assert.equal(result.logs[3].args.account, david);
    });

    it("Anyone can view whitelisted statuses", async () => {
      result = await farmAuction.whitelisted(alice);

      assert.equal(result, true);
    });

    it("Operator can add multiple times the same address to the whitelist", async () => {
      result = await farmAuction.addWhitelist([alice, alice], { from: operator });

      expectEvent.notEmitted(result, "WhitelistAdd", { account: alice });
    });

    it("Anyone can view whitelisted statuses", async () => {
      result = await farmAuction.whitelisted(david);

      assert.equal(result, true);
    });

    it("Operator can remove an address from the whitelist", async () => {
      result = await farmAuction.removeWhitelist([david], { from: operator });

      console.info(
        `        --> Cost to un-whitelist (1) address: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      expectEvent(result, "WhitelistRemove", { account: david });
    });

    it("Anyone can view whitelisted statuses", async () => {
      result = await farmAuction.whitelisted(david);

      assert.equal(result, false);
    });

    it("Operator can remove non-whitelisted address from the whitelist", async () => {
      result = await farmAuction.removeWhitelist([eve], { from: operator });

      expectEvent.notEmitted(result, "WhitelistRemove", { account: david });
    });

    it("Admin cannot add an address to the whitelist (operator only)", async () => {
      await expectRevert(farmAuction.addWhitelist([alice], { from: owner }), "Management: Not the operator");
    });

    it("User cannot add an address to the whitelist (operator only)", async () => {
      await expectRevert(farmAuction.addWhitelist([alice], { from: alice }), "Management: Not the operator");
    });

    it("Anyone can view whitelisted addresses", async () => {
      result = await farmAuction.viewBidders("0", "25");

      assert.equal(result[0].length, 3);
      assert.equal(result[0][0], alice);
      assert.equal(result[0][1], bob);
      assert.equal(result[0][2], carol);
    });

    it("Anyone can view whitelisted addresses (size > cursor)", async () => {
      result = await farmAuction.viewBidders("2", "1");

      assert.equal(result[0].length, 1);
      assert.equal(result[0][0], carol);
    });
  });

  describe("Auction", async () => {
    it("Whitelisted address cannot bid if the auction is not opened", async () => {
      const correctModulo = parseEther("100");

      await expectRevert(farmAuction.bid(correctModulo, { from: alice }), "Auction: Not in progress");
    });

    it("Operator cannot close an auction before one is started", async () => {
      await expectRevert(farmAuction.closeAuction(parseEther("100"), { from: operator }), "Auction: Not in progress");
    });

    it("Operator cannot start an auction with a lower start block than current block", async () => {
      startBlock = (await time.latestBlock()).sub(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator }),
        "Auction: Start block must be higher than current block"
      );
    });

    it("Operator cannot start an auction with a lower start block than end block", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.sub(new BN(20));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator }),
        "Auction: Start block must be lower than End block"
      );
    });

    it("Operator cannot start an auction with a higher start block than current block + buffer", async () => {
      startBlock = (await time.latestBlock()).add(new BN(123456789));
      endBlock = startBlock.add(new BN(10));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator }),
        "Auction: Start block must be lower than current block + Buffer"
      );
    });

    it("Operator cannot start an auction with a higher end block than start block + buffer", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(123456789));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator }),
        "Auction: End block must be lower than Start block + Buffer"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (0)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("0"), 1, { from: operator }),
        "Auction: Initial bid amount cannot be zero"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (0.15)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("0.15"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (0.666)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("0.666"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (1)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("1"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (2)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("2"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (5)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("5"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong initial bid amount (9)", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("9"), 1, { from: operator }),
        "Auction: Incorrect initial bid amount"
      );
    });

    it("Operator cannot start an auction with a wrong leaderboard", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      await expectRevert(
        farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 0, { from: operator }),
        "Auction: Leaderboard cannot be zero"
      );
    });

    it("Operator can start an auction", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      result = await farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 1, { from: operator });

      console.info(
        `        --> Cost to start the auction: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      expectEvent(result, "AuctionStart", {
        auctionId: "1",
        startBlock: startBlock,
        endBlock: endBlock,
        initialBidAmount: parseEther("100").toString(),
        leaderboard: "1",
      });
    });

    it("Operator cannot close an auction before end block has passed", async () => {
      await expectRevert(farmAuction.closeAuction(parseEther("100"), { from: operator }), "Auction: In progress");
    });

    it("Anyone can view auctions", async () => {
      result = await farmAuction.viewAuctions("0", "5");

      assert.equal(result[0].length, 1);
      assert.equal(result[0][0].status, 1);
      assert.equal(result[0][0].startBlock, startBlock);
      assert.equal(result[0][0].endBlock, endBlock);
      assert.equal(result[0][0].leaderboard, 1);
    });

    it("Operator cannot set new max auction length if an auction is running", async () => {
      await expectRevert(farmAuction.setMaxAuctionLength("28800", { from: operator }), "Auction: In progress");
    });

    it("Operator cannot start a new auction while the previous has not finished", async () => {
      const currentBlock = (await time.latestBlock()).add(new BN(10));
      const endBlock = currentBlock.add(new BN(1000));

      await expectRevert(
        farmAuction.startAuction(currentBlock, endBlock, parseEther("100"), "1", { from: operator }),
        "Auction: In progress"
      );
    });

    it("Operator cannot add an existing address to the whitelist", async () => {
      await expectRevert(farmAuction.addWhitelist([alice], { from: operator }), "Auction: In progress");
    });

    it("Operator cannot add an existing address to the whitelist", async () => {
      await expectRevert(farmAuction.removeWhitelist([alice], { from: operator }), "Auction: In progress");
    });

    it("Whitelisted address cannot bid (for the first time) if the auction hasn't started", async () => {
      const wrongInitialAmount = parseEther("10");

      await expectRevert(farmAuction.bid(wrongInitialAmount, { from: alice }), "Auction: Too early");
    });

    it("Whitelisted address cannot bid (for the first time) with an amount lower than threshold", async () => {
      await time.advanceBlockTo((await time.latestBlock()).add(new BN(11)));

      const wrongInitialAmount = parseEther("10");

      await expectRevert(farmAuction.bid(wrongInitialAmount, { from: alice }), "Bid: Incorrect initial bid amount");
    });

    it("Whitelisted address can bid (for the first time) with an amount higher than threshold (alice)", async () => {
      const correctInitialAmount = parseEther("1000");

      result = await farmAuction.bid(correctInitialAmount, { from: alice });

      expectEvent(result, "AuctionBid", { auctionId: "1", account: alice, amount: correctInitialAmount.toString() });

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: alice,
        to: farmAuction.address,
        value: correctInitialAmount.toString(),
      });
    });

    it("Anyone can view claimable status (auction not ended)", async () => {
      result = await farmAuction.claimable("1", alice);

      assert.equal(result, false);
    });

    it("Whitelisted address can bid (for the first time) with an amount higher than threshold (bob)", async () => {
      const correctInitialAmount = parseEther("100");

      result = await farmAuction.bid(correctInitialAmount, { from: bob });

      expectEvent(result, "AuctionBid", { auctionId: "1", account: bob, amount: correctInitialAmount.toString() });

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: bob,
        to: farmAuction.address,
        value: correctInitialAmount.toString(),
      });

      console.info(
        `        --> Cost to bid (initial): ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );
    });

    it("Whitelisted address can bid again, without restrictions", async () => {
      const correctModulo = parseEther("50");

      result = await farmAuction.bid(correctModulo, { from: alice });

      expectEvent(result, "AuctionBid", { auctionId: "1", account: alice, amount: correctModulo.toString() });

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: alice,
        to: farmAuction.address,
        value: correctModulo.toString(),
      });

      console.info(
        `        --> Cost to bid: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );
    });

    it("Whitelisted address cannot bid with a wrong modulo (0.05)", async () => {
      const incorrectModulo = parseEther("0.05");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (0.666)", async () => {
      const incorrectModulo = parseEther("0.666");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (1)", async () => {
      const incorrectModulo = parseEther("1");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (1.5)", async () => {
      const incorrectModulo = parseEther("1.5");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (2)", async () => {
      const incorrectModulo = parseEther("2");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (5)", async () => {
      const incorrectModulo = parseEther("5");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (55)", async () => {
      const incorrectModulo = parseEther("55");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (99)", async () => {
      const incorrectModulo = parseEther("99");

      await expectRevert(farmAuction.bid(incorrectModulo, { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a wrong modulo (single wei)", async () => {
      await expectRevert(farmAuction.bid("1", { from: alice }), "Bid: Incorrect amount");
    });

    it("Whitelisted address cannot bid with a correct modulo (in wei)", async () => {
      await expectRevert(farmAuction.bid("1000", { from: alice }), "Bid: Incorrect amount");
    });

    it("Non whitelisted address cannot bid", async () => {
      const correctModulo = parseEther("100");

      await expectRevert(farmAuction.bid(correctModulo, { from: david }), "Whitelist: Not whitelisted");
    });

    it("Admin cannot collect funds if auction has not ended", async () => {
      await expectRevert(farmAuction.claimAuctionLeaderboard("1", [alice], { from: owner }), "Auction: In progress");
    });

    it("Whitelisted address cannot claim if auction has not ended", async () => {
      await expectRevert(farmAuction.claimAuction("1", { from: alice }), "Auction: In progress");
    });

    it("Whitelisted address cannot claim if auction has not been closed", async () => {
      await time.advanceBlockTo(endBlock.add(new BN(1)));

      await expectRevert(farmAuction.claimAuction("1", { from: alice }), "Auction: Not claimable");
    });

    it("Whitelisted address cannot bid if auction has not ended and end block is over", async () => {
      const correctModulo = parseEther("100");

      await expectRevert(farmAuction.bid(correctModulo, { from: alice }), "Auction: Too late");
    });

    it("Admin cannot collect funds when auction is not closed", async () => {
      await expectRevert(farmAuction.claimAuctionLeaderboard("1", [alice], { from: owner }), "Auction: Not claimable");
    });

    it("Anyone can view claimable status (auction not closed)", async () => {
      result = await farmAuction.claimable("1", alice);

      assert.equal(result, false);
    });

    it("Operator can close an auction", async () => {
      const bidLimit = parseEther("1050");

      result = await farmAuction.closeAuction(bidLimit, { from: operator });

      console.info(
        `        --> Cost to close the auction: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      expectEvent(result, "AuctionClose", {
        auctionId: "1",
        participationLimit: bidLimit.toString(),
        numberParticipants: "2",
      });
    });

    it("Anyone can view bids for an auction", async () => {
      result = await farmAuction.viewBidsPerAuction("1", "0", "5");

      assert.equal(result[0].length, 2);
      assert.equal(result[0][0].account, alice);
      assert.equal(result[0][0].amount, parseEther("1050"));
      assert.equal(result[0][0].hasClaimed, false);
      assert.equal(result[0][1].account, bob);
      assert.equal(result[0][1].amount, parseEther("100"));
      assert.equal(result[0][1].hasClaimed, false);
    });

    it("Anyone can view claimable status (bidder not participated)", async () => {
      result = await farmAuction.claimable("1", david);

      assert.equal(result, false);
    });

    it("Admin can collect funds", async () => {
      const expectedClaimAmount = parseEther("1050");

      assert.equal(await farmAuction.totalCollected(), "0");

      result = await farmAuction.claimAuctionLeaderboard("1", [alice], { from: owner });

      expectEvent(result, "AuctionClaim", {
        auctionId: "1",
        account: owner,
        amount: expectedClaimAmount.toString(),
        isAdmin: true,
      });

      assert.equal(await farmAuction.totalCollected(), expectedClaimAmount.toString());

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: farmAuction.address,
        to: owner,
        value: expectedClaimAmount.toString(),
      });
    });

    it("Admin cannot collect funds twice for a same address", async () => {
      await expectRevert(
        farmAuction.claimAuctionLeaderboard("1", [alice], { from: owner }),
        "Bid: Cannot be claimed twice"
      );
    });

    it("Admin cannot collect funds for an address not in leaderboard", async () => {
      await expectRevert(
        farmAuction.claimAuctionLeaderboard("1", [bob], { from: owner }),
        "Bid: Cannot be claimed (not in leaderboard)"
      );
    });

    it("Admin cannot collect funds for multiple addresses with one not in leaderboard", async () => {
      await expectRevert(
        farmAuction.claimAuctionLeaderboard("1", [alice, bob], { from: owner }),
        "Bid: Cannot be claimed twice"
      );
    });

    it("Admin cannot collect funds for multiple addresses with one not in leaderboard (reverse)", async () => {
      await expectRevert(
        farmAuction.claimAuctionLeaderboard("1", [bob, alice], { from: owner }),
        "Bid: Cannot be claimed (not in leaderboard)"
      );
    });

    it("Anyone can view bids for an auction (after admin claim)", async () => {
      result = await farmAuction.viewBidsPerAuction("1", "0", "5");

      assert.equal(result[0].length, 2);
      assert.equal(result[0][0].account, alice);
      assert.equal(result[0][0].amount, parseEther("1050"));
      assert.equal(result[0][0].hasClaimed, true);
      assert.equal(result[0][1].account, bob);
      assert.equal(result[0][1].amount, parseEther("100"));
      assert.equal(result[0][1].hasClaimed, false);
    });

    it("Anyone can view bids for an auction (after admin claim) (size > cursor)", async () => {
      result = await farmAuction.viewBidsPerAuction("1", "1", "1");

      assert.equal(result[0].length, 1);
      assert.equal(result[0][0].account, bob);
      assert.equal(result[0][0].amount, parseEther("100"));
      assert.equal(result[0][0].hasClaimed, false);
    });

    it("Anyone can view claimable status (bidder in leaderboard)", async () => {
      result = await farmAuction.claimable("1", alice);

      assert.equal(result, false);
    });

    it("Whitelisted address cannot claim if included in leaderboard", async () => {
      await expectRevert(farmAuction.claimAuction("1", { from: alice }), "Bid: Cannot be claimed (in leaderboard)");
    });

    it("Anyone can view claimable status (bidder has not claimed)", async () => {
      result = await farmAuction.claimable("1", bob);

      assert.equal(result, true);
    });

    it("Whitelisted address can claim if not included in leaderboard", async () => {
      const expectedClaimAmount = parseEther("100");

      result = await farmAuction.claimAuction("1", { from: bob });

      expectEvent(result, "AuctionClaim", {
        auctionId: "1",
        account: bob,
        amount: expectedClaimAmount.toString(),
        isAdmin: false,
      });

      expectEvent.inTransaction(result.receipt.transactionHash, mockCake, "Transfer", {
        from: farmAuction.address,
        to: bob,
        value: expectedClaimAmount.toString(),
      });
    });

    it("Anyone can view claimable status (bidder has claimed)", async () => {
      result = await farmAuction.claimable("1", bob);

      assert.equal(result, false);
    });

    it("Anyone can view bids for an auction (after user claim)", async () => {
      result = await farmAuction.viewBidsPerAuction("1", "0", "5");

      assert.equal(result[0].length, 2);
      assert.equal(result[0][0].account, alice);
      assert.equal(result[0][0].amount, parseEther("1050"));
      assert.equal(result[0][0].hasClaimed, true);
      assert.equal(result[0][1].account, bob);
      assert.equal(result[0][1].amount, parseEther("100"));
      assert.equal(result[0][1].hasClaimed, true);
    });

    it("Whitelisted address cannot claim twice", async () => {
      await expectRevert(farmAuction.claimAuction("1", { from: bob }), "Bid: Cannot be claimed twice");
    });

    it("Whitelisted address that did not participate cannot claim", async () => {
      await expectRevert(farmAuction.claimAuction("1", { from: carol }), "Bid: Not found");
    });

    it("Operator can set new max auction length", async () => {
      result = await farmAuction.setMaxAuctionLength("14400", { from: operator });

      expectEvent(result, "NewMaxAuctionLength", { maxAuctionLength: "14400" });
    });

    it("Operator cannot set new max auction length with a wrong value (0)", async () => {
      await expectRevert(farmAuction.setMaxAuctionLength("0", { from: operator }), "Auction: Length cannot be zero");
    });

    it("Operator cannot set new max auction length with a wrong value (123456789)", async () => {
      await expectRevert(
        farmAuction.setMaxAuctionLength("123456789", { from: operator }),
        "Auction: Cannot be longer than three days (86,400 blocks)"
      );
    });

    it("Anyone can view bids for an auction", async () => {
      result = await farmAuction.viewBidderAuctions(alice, "0", "5");

      assert.equal(result[0].length, 1);
      assert.equal(result[1].length, 1);
      assert.equal(result[2].length, 1);
      assert.equal(result[0][0], "1");
      assert.equal(result[1][0], parseEther("1050").toString());
      assert.equal(result[2][0], true);
    });
  });

  describe("Auction with no bidders", async () => {
    it("Operator can start an auction", async () => {
      startBlock = (await time.latestBlock()).add(new BN(10));
      endBlock = startBlock.add(new BN(100));

      result = await farmAuction.startAuction(startBlock, endBlock, parseEther("100"), 10, { from: operator });

      console.info(
        `        --> Cost to start the auction: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      expectEvent(result, "AuctionStart", {
        auctionId: "2",
        startBlock: startBlock,
        endBlock: endBlock,
        initialBidAmount: parseEther("100").toString(),
        leaderboard: "10",
      });
    });

    it("Operator can close an auction", async () => {
      await time.advanceBlockTo(endBlock.add(new BN(1)));

      result = await farmAuction.closeAuction("0", { from: operator });

      console.info(
        `        --> Cost to close the auction: ${gasToBNB(result.receipt.gasUsed)} (USD: ${gasToUSD(
          result.receipt.gasUsed
        )}) - gasUsed: ${result.receipt.gasUsed}`
      );

      expectEvent(result, "AuctionClose", { auctionId: "2", numberParticipants: "0" });
    });

    it("Admin can collect funds", async () => {
      result = await farmAuction.claimAuctionLeaderboard("2", [alice], { from: owner });

      expectEvent(result, "AuctionClaim", {
        auctionId: "2",
        account: owner,
        amount: parseEther("0").toString(),
        isAdmin: true,
      });
    });

    it("Anyone can view auctions (size > cursor)", async () => {
      result = await farmAuction.viewAuctions("1", "1");

      assert.equal(result[0].length, 1);
      assert.equal(result[0][0].status, 2);
      assert.equal(result[0][0].startBlock, startBlock);
      assert.equal(result[0][0].endBlock, endBlock);
      assert.equal(result[0][0].leaderboard, 10);
    });
  });

  describe("Operator can manage the contract in between auctions", async () => {
    it("Operator can remove an address from the whitelist", async () => {
      result = await farmAuction.removeWhitelist([alice], { from: operator });

      expectEvent(result, "WhitelistRemove", { account: alice });
    });

    it("Operator can add an address to the whitelist", async () => {
      result = await farmAuction.addWhitelist([alice], { from: operator });

      expectEvent(result, "WhitelistAdd", { account: alice });
    });
  });

  describe("Admin can manage the contract", async () => {
    it("Admin can set new operator address", async () => {
      result = await farmAuction.setOperatorAddress(alice, { from: owner });

      expectEvent(result, "NewOperatorAddress", { account: alice });
    });

    it("Admin cannot set new operator address to zero address", async () => {
      await expectRevert(
        farmAuction.setOperatorAddress(constants.ZERO_ADDRESS, { from: owner }),
        "Cannot be zero address"
      );
    });

    it("Admin can recover token", async () => {
      const recoveryAmount = parseEther("100");

      result = await farmAuction.recoverToken(fakeCake.address, recoveryAmount, { from: owner });

      expectEvent(result, "TokenRecovery", { token: fakeCake.address, amount: recoveryAmount.toString() });

      expectEvent.inTransaction(result.receipt.transactionHash, fakeCake, "Transfer", {
        from: farmAuction.address,
        to: owner,
        value: recoveryAmount.toString(),
      });
    });

    it("Admin cannot recover $Cake token", async () => {
      await expectRevert(
        farmAuction.recoverToken(mockCake.address, parseEther("100"), { from: owner }),
        "Recover: Cannot be Cake token"
      );
    });
  });
});
