import { parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, constants, expectEvent, expectRevert } from "@openzeppelin/test-helpers";

const ERC721NFTMarketV1 = artifacts.require("./ERC721NFTMarketV1.sol");
const PancakeBunniesWhitelistChecker = artifacts.require("./PancakeBunniesWhitelistChecker.sol");

const MockERC20 = artifacts.require("./test/MockERC20.sol");
const MockNFT = artifacts.require("./test/MockNFT.sol");
const WBNB = artifacts.require("./test/WBNB.sol");
const PancakeBunnies = artifacts.require(".test/PancakeBunnies.sol");

contract(
  "ERC721 NFT Market V1",
  ([owner, admin, treasury, buyer1, buyer2, buyer3, seller1, seller2, seller3, creator1]) => {
    // VARIABLES
    let minimumAskPrice = parseEther("0.001");
    let maximumAskPrice = parseEther("100");

    // Contracts
    let collectibleMarket,
      mockERC20,
      mockNFT1,
      mockNFT2,
      mockNFT3,
      mockNFT4,
      pancakeBunnies,
      pancakeBunniesChecker,
      wrappedBNB;

    before(async () => {
      // Deploy WBNB
      wrappedBNB = await WBNB.new({ from: owner });

      // Deploy CollectibleMarketV1
      collectibleMarket = await ERC721NFTMarketV1.new(
        admin,
        treasury,
        wrappedBNB.address,
        minimumAskPrice,
        maximumAskPrice,
        { from: owner }
      );

      // Deploy PancakeBunnies (modified implementation in Solidity 0.8)
      pancakeBunnies = await PancakeBunnies.new({ from: owner });

      // Deploy pancakeBunniesChecker
      pancakeBunniesChecker = await PancakeBunniesWhitelistChecker.new(pancakeBunnies.address, { from: owner });

      // Deploy MockNFT 1
      mockNFT1 = await MockNFT.new("Mock NFT 1", "MN1", { from: owner });

      // Deploy MockNFT 2
      mockNFT2 = await MockNFT.new("Mock NFT 2", "MN2", { from: owner });

      // Deploy MockNFT 3
      mockNFT3 = await MockNFT.new("Mock NFT 3", "MN3", { from: owner });

      // Deploy MockNFT 4
      mockNFT4 = await MockNFT.new("Mock NFT 4", "MN4", { from: owner });

      // Deploy MockERC20
      mockERC20 = await MockERC20.new("Mock ERC20", "ERC", parseEther("1000"), { from: owner });

      // Mint 3 NFTs and approve
      let i = 0;

      for (let user of [seller1, seller2, seller3]) {
        i++;
        await mockNFT1.setApprovalForAll(collectibleMarket.address, true, { from: user });
        await mockNFT2.setApprovalForAll(collectibleMarket.address, true, { from: user });
        await mockNFT3.setApprovalForAll(collectibleMarket.address, true, { from: user });

        await mockNFT1.mint("ipfs://token" + i + " .json", { from: user });
        await mockNFT1.mint("ipfs://token" + i + " .json", { from: user });
        await mockNFT2.mint("ipfs://token" + i + " .json", { from: user });
        await mockNFT2.mint("ipfs://token" + i + " .json", { from: user });
        await mockNFT3.mint("ipfs://token" + i + " .json", { from: user });
        await mockNFT3.mint("ipfs://token" + i + " .json", { from: user });
      }

      for (let user of [buyer1, buyer2, buyer3, seller1, seller2, seller3]) {
        await wrappedBNB.deposit({ value: parseEther("10").toString(), from: user });
        await wrappedBNB.approve(collectibleMarket.address, constants.MAX_UINT256, { from: user });
      }
    });

    describe("COLLECTIBLE MARKET #1 - NORMAL BEHAVIOR", async () => {
      it("Admin adds a new collection (Mock NFT #1)", async () => {
        const result = await collectibleMarket.addCollection(
          mockNFT1.address,
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS,
          "100", // 1%
          "0",
          { from: admin }
        );

        expectEvent(result, "CollectionNew", {
          collection: mockNFT1.address,
          creator: constants.ZERO_ADDRESS,
          whitelistChecker: constants.ZERO_ADDRESS,
          tradingFee: "100",
          creatorFee: "0",
        });

        const collections = await collectibleMarket.viewCollections("0", "10");
        assert.equal(collections[0][0], mockNFT1.address);
        assert.equal(collections[1][0][0], "1"); // status
        assert.equal(collections[1][0][1], constants.ZERO_ADDRESS); //
        assert.equal(collections[1][0][2], constants.ZERO_ADDRESS);
        assert.equal(String(collections[1][0][3]), "100");
        assert.equal(String(collections[1][0][4]), "0");
        assert.equal(String(collections[2]), "1"); // 1 collection

        const tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.isEmpty(tokensForSale[0]); // Empty array
        assert.isEmpty(tokensForSale[1]); // Empty array
        assert.equal(String(tokensForSale[2]), "0"); // 0 token listed in the collection

        const tokensForSaleForSeller = await collectibleMarket.viewAsksByCollectionAndSeller(
          mockNFT1.address,
          seller1,
          "0",
          "500"
        );

        assert.isEmpty(tokensForSaleForSeller[0]); // Empty array
        assert.isEmpty(tokensForSaleForSeller[1]); // Empty array
        assert.equal(String(tokensForSaleForSeller[2]), "0"); // number of tokens listed by seller1
      });

      it("Tokens can/cannot be listed for NFT1/NFT2", async () => {
        let result = await collectibleMarket.canTokensBeListed(mockNFT1.address, ["0", "1", "2", "3", "4", "5"]);
        let boolArray = Array.from({ length: 6 }, (i) => (i = true));

        assert.sameOrderedMembers(result, boolArray);

        result = await collectibleMarket.canTokensBeListed(mockNFT2.address, ["0", "1", "2", "3", "4", "5"]);
        boolArray = Array.from({ length: 6 }, (i) => (i = false));

        assert.sameOrderedMembers(result, boolArray);
      });

      it("Seller1 lists a NFT", async () => {
        const result = await collectibleMarket.createAskOrder(mockNFT1.address, "0", parseEther("1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT1.address,
          seller: seller1,
          tokenId: "0",
          askPrice: parseEther("1").toString(),
        });

        expectEvent.inTransaction(result.receipt.transactionHash, mockNFT1, "Transfer", {
          from: seller1,
          to: collectibleMarket.address,
          tokenId: "0",
        });

        const tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.equal(tokensForSale[0][0], "0"); // TokenId = 0
        assert.equal(tokensForSale[1][0][0], seller1); // Address = seller1
        assert.equal(String(tokensForSale[1][0][1]), parseEther("1").toString()); // Price = 1 BNB
        assert.equal(String(tokensForSale[2]), "1"); // 1 token listed in the collection
      });

      it("Seller2 lists a NFT and modifies the order price", async () => {
        let result = await collectibleMarket.createAskOrder(mockNFT1.address, "2", parseEther("1.2"), {
          from: seller2,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT1.address,
          seller: seller2,
          tokenId: "2",
          askPrice: parseEther("1.2").toString(),
        });

        expectEvent.inTransaction(result.receipt.transactionHash, mockNFT1, "Transfer", {
          from: seller2,
          to: collectibleMarket.address,
          tokenId: "2",
        });

        let tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.equal(tokensForSale[0][1], "2"); // TokenId = 2
        assert.equal(tokensForSale[1][1][0], seller2); // Address = seller2
        assert.equal(String(tokensForSale[1][1][1]), parseEther("1.2").toString()); // Price = 1.2 BNB
        assert.equal(String(tokensForSale[2]), "2"); // 2 tokens listed in the collection

        result = await collectibleMarket.modifyAskOrder(mockNFT1.address, "2", parseEther("2"), {
          from: seller2,
        });

        expectEvent(result, "AskUpdate", {
          collection: mockNFT1.address,
          seller: seller2,
          tokenId: "2",
          askPrice: parseEther("2").toString(),
        });

        tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.equal(String(tokensForSale[1][1][1]), parseEther("2").toString()); // Price updated to 2 BNB
      });

      it("Seller2 cancels her order", async () => {
        let result = await collectibleMarket.cancelAskOrder(mockNFT1.address, "2", {
          from: seller2,
        });

        expectEvent(result, "AskCancel", {
          collection: mockNFT1.address,
          seller: seller2,
          tokenId: "2",
        });

        expectEvent.inTransaction(result.receipt.transactionHash, mockNFT1, "Transfer", {
          from: collectibleMarket.address,
          to: seller2,
          tokenId: "2",
        });

        let tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.isUndefined(tokensForSale[0][1]); // Array length is 1 so 2nd element is undefined
        assert.isUndefined(tokensForSale[1][1]); // Array length is 1 so 2nd element is undefined
        assert.equal(String(tokensForSale[2]), "1"); // 1 token listed in the collection
      });

      it("Buyer1 matches order from seller1 with BNB", async () => {
        const marketPrice = parseEther("1").toString();

        const estimations = await collectibleMarket.calculatePriceAndFeesForCollection(mockNFT1.address, marketPrice);
        const expectedNetPrice = estimations[0];
        const expectedTradingFee = estimations[1];
        const expectedCreatorFee = estimations[2];

        assert.equal(expectedNetPrice.toString(), parseEther("0.99").toString());
        assert.equal(expectedTradingFee.toString(), parseEther("0.01").toString());
        assert.equal(expectedCreatorFee.toString(), parseEther("0").toString());

        const result = await collectibleMarket.buyTokenUsingBNB(mockNFT1.address, "0", {
          value: marketPrice,
          from: buyer1,
        });

        expectEvent(result, "Trade", {
          collection: mockNFT1.address,
          tokenId: "0",
          seller: seller1,
          buyer: buyer1,
          askPrice: marketPrice,
          netPrice: expectedNetPrice, // 1%
          withBNB: true,
        });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: seller1,
          wad: expectedNetPrice,
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), expectedTradingFee);

        let tokensForSale = await collectibleMarket.viewAsksByCollection(mockNFT1.address, "0", "500");
        assert.isUndefined(tokensForSale[0][0]); // Array length is 0 so 1st element is undefined
        assert.isUndefined(tokensForSale[1][0]); // Array length is 1 so 1st element is undefined
        assert.equal(String(tokensForSale[2]), "0"); // 1 token listed in the collection
      });

      it("Seller1 lists a second NFT that is bought by buyer1 with WBNB", async () => {
        let result = await collectibleMarket.createAskOrder(mockNFT1.address, "1", parseEther("1.1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT1.address,
          seller: seller1,
          tokenId: "1",
          askPrice: parseEther("1.1").toString(),
        });

        expectEvent.inTransaction(result.receipt.transactionHash, mockNFT1, "Transfer", {
          from: seller1,
          to: collectibleMarket.address,
          tokenId: "1",
        });

        result = await collectibleMarket.buyTokenUsingWBNB(mockNFT1.address, "1", parseEther("1.1").toString(), {
          from: buyer1,
        });

        expectEvent(result, "Trade", {
          collection: mockNFT1.address,
          tokenId: "1",
          seller: seller1,
          buyer: buyer1,
          askPrice: parseEther("1.1").toString(),
          netPrice: parseEther("1.089").toString(), // 1%
          withBNB: false,
        });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: seller1,
          wad: parseEther("1.089").toString(),
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), parseEther("0.021").toString());
      });

      it("Seller1 cannot cancel order for a token previously sold by herself", async () => {
        // Buyer1 approves contract to use all tokenIds
        await mockNFT1.setApprovalForAll(collectibleMarket.address, true, { from: buyer1 });

        // Buyer1 creates an order
        await collectibleMarket.createAskOrder(mockNFT1.address, "1", parseEther("1.1"), {
          from: buyer1,
        });

        // Seller1 tries to cancel ask order
        await expectRevert(
          collectibleMarket.cancelAskOrder(mockNFT1.address, "1", {
            from: seller1,
          }),
          "Order: Token not listed"
        );

        // Seller1 tries to modify ask order
        await expectRevert(
          collectibleMarket.modifyAskOrder(mockNFT1.address, "1", parseEther("1"), {
            from: seller1,
          }),
          "Order: Token not listed"
        );

        // Buyer1 cancels order
        await collectibleMarket.cancelAskOrder(mockNFT1.address, "1", {
          from: buyer1,
        });
      });

      it("Treasury claims its pending revenue", async () => {
        const result = await collectibleMarket.claimPendingRevenue({ from: treasury });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: treasury,
          wad: parseEther("0.021").toString(),
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), parseEther("0").toString());
        assert.equal(String(await wrappedBNB.balanceOf(treasury)), parseEther("0.021").toString());

        await expectRevert(collectibleMarket.claimPendingRevenue({ from: treasury }), "Claim: Nothing to claim");
      });

      it("Seller 3 adds 2 offers", async () => {
        let result = await collectibleMarket.createAskOrder(mockNFT1.address, "4", parseEther("1.4"), {
          from: seller3,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT1.address,
          seller: seller3,
          tokenId: "4",
          askPrice: parseEther("1.4").toString(),
        });

        result = await collectibleMarket.createAskOrder(mockNFT1.address, "5", parseEther("1.5"), {
          from: seller3,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT1.address,
          seller: seller3,
          tokenId: "5",
          askPrice: parseEther("1.5").toString(),
        });

        const collections = await collectibleMarket.viewAsksByCollectionAndSeller(
          mockNFT1.address,
          seller3,
          "0",
          "500"
        );

        assert.equal(String(collections[0][0]), "4"); // tokenId
        assert.equal(String(collections[0][1]), "5"); // tokenId

        assert.equal(collections[1][0][0], seller3);
        assert.equal(String(collections[1][0][1]), parseEther("1.4").toString());

        assert.equal(collections[1][1][0], seller3);
        assert.equal(String(collections[1][1][1]), parseEther("1.5").toString());
        assert.equal(String(collections[2]), "2"); // number of tokens listed
      });

      it("Admin modifies the collection to remove all fees", async () => {
        const result = await collectibleMarket.modifyCollection(
          mockNFT1.address,
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS,
          "0",
          "0",
          { from: admin }
        );

        expectEvent(result, "CollectionUpdate", {
          collection: mockNFT1.address,
          creator: constants.ZERO_ADDRESS,
          whitelistChecker: constants.ZERO_ADDRESS,
          tradingFee: "0",
          creatorFee: "0",
        });
      });

      it("Admin changes minimum/max prices to 10/11 BNB, seller3 cannot change price below", async () => {
        const newMinPrice = parseEther("10");
        const newMaxPrice = parseEther("11");

        let result = await collectibleMarket.updateMinimumAndMaximumPrices(newMinPrice, newMaxPrice, { from: admin });

        expectEvent(result, "NewMinimumAndMaximumAskPrices", {
          minimumAskPrice: newMinPrice.toString(),
          maximumAskPrice: newMaxPrice.toString(),
        });

        await expectRevert(
          collectibleMarket.modifyAskOrder(mockNFT1.address, "5", parseEther("9.999999"), {
            from: seller2,
          }),
          "Order: Price not within range"
        );

        await expectRevert(
          collectibleMarket.modifyAskOrder(mockNFT1.address, "5", parseEther("11.0000000000000001"), {
            from: seller2,
          }),
          "Order: Price not within range"
        );

        await expectRevert(
          collectibleMarket.createAskOrder(mockNFT1.address, "4", parseEther("9.999999"), {
            from: seller2,
          }),
          "Order: Price not within range"
        );

        await expectRevert(
          collectibleMarket.createAskOrder(mockNFT1.address, "4", parseEther("11.0000000000000001"), {
            from: seller2,
          }),
          "Order: Price not within range"
        );

        result = await collectibleMarket.updateMinimumAndMaximumPrices(minimumAskPrice, maximumAskPrice, {
          from: admin,
        });

        expectEvent(result, "NewMinimumAndMaximumAskPrices", {
          minimumAskPrice: minimumAskPrice.toString(),
          maximumAskPrice: maximumAskPrice.toString(),
        });
      });

      it("Buyer1 matches order, no fee is taken", async () => {
        const marketPrice = parseEther("1.5").toString();

        const estimations = await collectibleMarket.calculatePriceAndFeesForCollection(mockNFT1.address, marketPrice);
        const expectedNetPrice = estimations[0];
        const expectedTradingFee = estimations[1];
        const expectedCreatorFee = estimations[2];

        assert.equal(expectedNetPrice.toString(), parseEther("1.5").toString());
        assert.equal(marketPrice, expectedNetPrice.toString());
        assert.equal(expectedTradingFee.toString(), parseEther("0.00").toString());
        assert.equal(expectedCreatorFee.toString(), parseEther("0").toString());

        const result = await collectibleMarket.buyTokenUsingBNB(mockNFT1.address, "5", {
          value: marketPrice,
          from: buyer1,
        });

        expectEvent(result, "Trade", {
          collection: mockNFT1.address,
          tokenId: "5",
          seller: seller3,
          buyer: buyer1,
          askPrice: marketPrice,
          netPrice: expectedNetPrice,
          withBNB: true,
        });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: seller3,
          wad: expectedNetPrice,
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), "0");
      });

      it("Admin adds a second collection with fees for both creator/treasury", async () => {
        const result = await collectibleMarket.addCollection(
          mockNFT2.address,
          creator1,
          constants.ZERO_ADDRESS,
          "45", // 0.45%
          "5", // 0.05%
          { from: admin }
        );

        expectEvent(result, "CollectionNew", {
          collection: mockNFT2.address,
          creator: creator1,
          whitelistChecker: constants.ZERO_ADDRESS,
          tradingFee: "45",
          creatorFee: "5",
        });

        const collections = await collectibleMarket.viewCollections("0", "10");
        assert.equal(String(collections[2]), "2"); // 2 collections are tradable
      });

      it("Seller 2 adds 2 offers for second collection", async () => {
        let result = await collectibleMarket.createAskOrder(mockNFT2.address, "2", parseEther("1.2"), {
          from: seller2,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT2.address,
          seller: seller2,
          tokenId: "2",
          askPrice: parseEther("1.2").toString(),
        });

        result = await collectibleMarket.createAskOrder(mockNFT2.address, "3", parseEther("1.3"), {
          from: seller2,
        });

        expectEvent(result, "AskNew", {
          collection: mockNFT2.address,
          seller: seller2,
          tokenId: "3",
          askPrice: parseEther("1.3").toString(),
        });

        const collections = await collectibleMarket.viewAsksByCollectionAndSeller(
          mockNFT2.address,
          seller2,
          "0",
          "500"
        );

        assert.equal(String(collections[0][0]), "2"); // tokenId
        assert.equal(String(collections[0][1]), "3"); // tokenId

        assert.equal(collections[1][0][0], seller2);
        assert.equal(String(collections[1][0][1]), parseEther("1.2").toString());

        assert.equal(collections[1][1][0], seller2);
        assert.equal(String(collections[1][1][1]), parseEther("1.3").toString());
        assert.equal(String(collections[2]), "2"); // number of tokens listed
      });

      it("Buyer2 buys one of the 2 collectibles listed for the second collection", async () => {
        const marketPrice = parseEther("1.2").toString();

        const estimations = await collectibleMarket.calculatePriceAndFeesForCollection(mockNFT2.address, marketPrice);
        const expectedNetPrice = estimations[0];
        const expectedTradingFee = estimations[1]; // 0.45%
        const expectedCreatorFee = estimations[2]; // 0.05%

        assert.equal(expectedNetPrice.toString(), parseEther("1.194").toString());
        assert.equal(expectedTradingFee.toString(), parseEther("0.0054").toString());
        assert.equal(expectedCreatorFee.toString(), parseEther("0.0006").toString());

        const result = await collectibleMarket.buyTokenUsingBNB(mockNFT2.address, "2", {
          value: marketPrice,
          from: buyer2,
        });

        expectEvent(result, "Trade", {
          collection: mockNFT2.address,
          tokenId: "2",
          seller: seller2,
          buyer: buyer2,
          askPrice: marketPrice,
          netPrice: expectedNetPrice,
          withBNB: true,
        });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: seller2,
          wad: expectedNetPrice,
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), expectedTradingFee);
        assert.equal(String(await collectibleMarket.pendingRevenue(creator1)), expectedCreatorFee);
      });

      it("Creator and treasury claim pending revenue", async () => {
        let result = await collectibleMarket.claimPendingRevenue({ from: treasury });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: treasury,
          wad: parseEther("0.0054").toString(),
        });

        result = await collectibleMarket.claimPendingRevenue({ from: creator1 });

        expectEvent.inTransaction(result.receipt.transactionHash, wrappedBNB, "Transfer", {
          src: collectibleMarket.address,
          dst: creator1,
          wad: parseEther("0.0006").toString(),
        });

        assert.equal(String(await collectibleMarket.pendingRevenue(treasury)), "0");
        assert.equal(String(await collectibleMarket.pendingRevenue(creator1)), "0");
      });
    });

    describe("COLLECTIBLE MARKET #2 - ALTERNATIVE BEHAVIOR", async () => {
      it("Cannot buy a token not for sale", async () => {
        await expectRevert(
          collectibleMarket.buyTokenUsingBNB(mockNFT1.address, "10", {
            from: buyer1,
            value: parseEther("1").toString(),
          }),
          "Buy: Not for sale"
        );
      });

      it("Cannot list a tokenId if caller is not the owner", async () => {
        // Seller1 cannot create an order for a token it doesn't own
        await expectRevert(
          collectibleMarket.createAskOrder(mockNFT2.address, "5", parseEther("1.1"), {
            from: seller1,
          }),
          "ERC721: transfer of token that is not own"
        );
      });

      it("Cannot buy own offer", async () => {
        // Seller1 puts a ask order for tokenId = 0 at 1BNB
        await collectibleMarket.createAskOrder(mockNFT2.address, "0", parseEther("1"), {
          from: seller1,
        });

        // Seller1 cannot purchase its own offer for 1 WBNB
        await expectRevert(
          collectibleMarket.buyTokenUsingBNB(mockNFT2.address, "0", {
            value: parseEther("1").toString(),
            from: seller1,
          }),
          "Buy: Buyer cannot be seller"
        );

        // Seller1 cannot purchase its own offer for 1 WBNB
        await expectRevert(
          collectibleMarket.buyTokenUsingWBNB(mockNFT2.address, "0", parseEther("1"), {
            from: seller1,
          }),
          "Buy: Buyer cannot be seller"
        );
      });

      it("Price front-running protections work as expected", async () => {
        // Seller1 cannot purchase its own offer for 1.0000000001 BNB
        await expectRevert(
          collectibleMarket.buyTokenUsingBNB(mockNFT2.address, "0", {
            value: parseEther("1.0000000001").toString(),
            from: seller1,
          }),
          "Buy: Incorrect price"
        );

        // Seller1 cannot purchase its own offer for 1.0000000001 WBNB
        await expectRevert(
          collectibleMarket.buyTokenUsingWBNB(mockNFT2.address, "0", parseEther("1.0000000001"), {
            from: seller1,
          }),
          "Buy: Incorrect price"
        );

        // Seller1 cannot purchase its own offer for 0.9999999999 BNB
        await expectRevert(
          collectibleMarket.buyTokenUsingBNB(mockNFT2.address, "0", {
            value: parseEther("0.9999999999").toString(),
            from: seller1,
          }),
          "Buy: Incorrect price"
        );

        // Seller1 cannot purchase its own offer for 0.9999999999 WBNB
        await expectRevert(
          collectibleMarket.buyTokenUsingWBNB(mockNFT2.address, "0", parseEther("0.9999999999"), {
            from: seller1,
          }),
          "Buy: Incorrect price"
        );
      });

      it("Cannot list assets if the collection is not approved", async () => {
        // Seller1 cannot create an order
        await expectRevert(
          collectibleMarket.createAskOrder(mockNFT3.address, "1", parseEther("1.1"), {
            from: seller1,
          }),
          "Collection: Not for listing"
        );
      });

      it("Cannot list, trade, nor modify price once collection is discontinued", async () => {
        const result = await collectibleMarket.closeCollectionForTradingAndListing(mockNFT2.address, { from: admin });

        expectEvent(result, "CollectionClose", { collection: mockNFT2.address });

        // Seller1 cannot create an order
        await expectRevert(
          collectibleMarket.createAskOrder(mockNFT2.address, "1", parseEther("1.1"), {
            from: seller1,
          }),
          "Collection: Not for listing"
        );

        // Seller1 cannot change price of an order
        await expectRevert(
          collectibleMarket.modifyAskOrder(mockNFT2.address, "0", parseEther("1.1"), {
            from: seller1,
          }),
          "Collection: Not for listing"
        );

        // Buyer1 cannot change purchase the tokenId=0 for 1 BNB
        await expectRevert(
          collectibleMarket.buyTokenUsingBNB(mockNFT2.address, "0", {
            value: parseEther("1").toString(),
            from: buyer1,
          }),
          "Collection: Not for trading"
        );

        // Buyer1 cannot change purchase the tokenId=0 for 1 BNB
        await expectRevert(
          collectibleMarket.buyTokenUsingWBNB(mockNFT2.address, "0", parseEther("1"), {
            from: buyer1,
          }),
          "Collection: Not for trading"
        );
      });
    });

    describe("COLLECTIBLE MARKET #3 - TOKEN RESTRICTIONS/PANCAKEBUNNIES", async () => {
      it("Add collection with restrictions", async () => {
        const result = await collectibleMarket.addCollection(
          pancakeBunnies.address,
          constants.ZERO_ADDRESS,
          pancakeBunniesChecker.address,
          "100", // 1%
          "0",
          { from: admin }
        );

        expectEvent(result, "CollectionNew", {
          collection: pancakeBunnies.address,
          creator: constants.ZERO_ADDRESS,
          whitelistChecker: pancakeBunniesChecker.address,
          tradingFee: "100",
          creatorFee: "0",
        });

        assert.equal(await pancakeBunniesChecker.canList("1"), true);
        assert.equal(await pancakeBunniesChecker.canList("2"), true);
        assert.equal(await pancakeBunniesChecker.canList("3"), true);
        assert.equal(await pancakeBunniesChecker.canList("4"), true);
        assert.equal(await pancakeBunniesChecker.canList("211"), true);

        const tokenListingStatuses = await collectibleMarket.canTokensBeListed(pancakeBunnies.address, [
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
        ]);

        const boolArray = Array.from({ length: 6 }, (i) => (i = true));

        assert.sameOrderedMembers(tokenListingStatuses, boolArray);
      });

      it("Owner mint bunnyId 1-5 for seller1 and owner adds restrictions for bunnyId 3/4", async () => {
        let i = 0;

        while (i < 5) {
          await pancakeBunnies.mint(seller1, "ipfs://" + i.toString(), i, { from: owner });
          i++;
        }

        const result = await pancakeBunniesChecker.addRestrictionForBunnies([new BN("3"), new BN("4")]);
        expectEvent(result, "NewRestriction");

        assert.equal(await pancakeBunniesChecker.isBunnyIdRestricted("3"), true);
        assert.equal(await pancakeBunniesChecker.isBunnyIdRestricted("4"), true);

        // For convenience, tokenId = 0 --> bunnyId = 0, tokenId = 1 --> bunnyId = 1
        assert.equal(await pancakeBunniesChecker.canList("3"), false);
        assert.equal(await pancakeBunniesChecker.canList("4"), false);

        const tokenListingStatuses = await collectibleMarket.canTokensBeListed(pancakeBunnies.address, ["3", "4"]);
        const boolArray = Array.from({ length: 2 }, (i) => (i = false));
        assert.sameOrderedMembers(tokenListingStatuses, boolArray);
      });

      it("Seller 1 can sell tokenIds 0-2 (bunnyIds 0-2)", async () => {
        await pancakeBunnies.setApprovalForAll(collectibleMarket.address, true, { from: seller1 });

        let result = await collectibleMarket.createAskOrder(pancakeBunnies.address, "0", parseEther("1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: pancakeBunnies.address,
          seller: seller1,
          tokenId: "0",
          askPrice: parseEther("1").toString(),
        });

        result = await collectibleMarket.createAskOrder(pancakeBunnies.address, "1", parseEther("1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: pancakeBunnies.address,
          seller: seller1,
          tokenId: "1",
          askPrice: parseEther("1").toString(),
        });

        result = await collectibleMarket.createAskOrder(pancakeBunnies.address, "2", parseEther("1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: pancakeBunnies.address,
          seller: seller1,
          tokenId: "2",
          askPrice: parseEther("1").toString(),
        });
      });

      it("Seller 1 cannot sell tokenIds 3-4 (bunnyIds 3-4)", async () => {
        await expectRevert(
          collectibleMarket.createAskOrder(pancakeBunnies.address, "3", parseEther("1"), {
            from: seller1,
          }),
          "Order: tokenId not eligible"
        );

        await expectRevert(
          collectibleMarket.createAskOrder(pancakeBunnies.address, "4", parseEther("1"), {
            from: seller1,
          }),
          "Order: tokenId not eligible"
        );
      });

      it("Owner removes restrictions for bunnyId=4", async () => {
        let result = await pancakeBunniesChecker.removeRestrictionForBunnies([new BN("4")]);
        expectEvent(result, "RemoveRestriction");

        assert.equal(await pancakeBunniesChecker.isBunnyIdRestricted("3"), true);
        assert.equal(await pancakeBunniesChecker.isBunnyIdRestricted("4"), false);
        assert.equal(await pancakeBunniesChecker.canList("3"), false);
        assert.equal(await pancakeBunniesChecker.canList("4"), true);

        const tokenListingStatuses = await collectibleMarket.canTokensBeListed(pancakeBunnies.address, ["3", "4"]);
        assert.equal(tokenListingStatuses[0], false);
        assert.equal(tokenListingStatuses[1], true);

        result = await collectibleMarket.createAskOrder(pancakeBunnies.address, "4", parseEther("1"), {
          from: seller1,
        });

        expectEvent(result, "AskNew", {
          collection: pancakeBunnies.address,
          seller: seller1,
          tokenId: "4",
          askPrice: parseEther("1").toString(),
        });
      });

      it("Revert statements work as expected", async () => {
        await expectRevert(
          pancakeBunniesChecker.removeRestrictionForBunnies([new BN("3"), new BN("4")], { from: owner }),
          "Operations: Not restricted"
        );

        await expectRevert(
          pancakeBunniesChecker.addRestrictionForBunnies([new BN("3"), new BN("4")], { from: owner }),
          "Operations: Already restricted"
        );
      });
    });

    describe("COLLECTIBLE MARKET #4 - ADMIN/OWNER/SPECIAL BEHAVIOR", async () => {
      it("Can recover tokens sent by accident", async () => {
        // Random ERC20
        await mockERC20.transfer(collectibleMarket.address, parseEther("1"), { from: owner });
        let result = await collectibleMarket.recoverFungibleTokens(mockERC20.address, { from: owner });
        expectEvent(result, "TokenRecovery", { token: mockERC20.address, amount: parseEther("1").toString() });

        // MockNFT1 tokenId not listed
        await mockNFT1.transferFrom(buyer1, collectibleMarket.address, "1", { from: buyer1 });
        result = await collectibleMarket.recoverNonFungibleToken(mockNFT1.address, "1", { from: owner });
        expectEvent(result, "NonFungibleTokenRecovery", { token: mockNFT1.address, tokenId: "1" });

        // MockNFT3 (collection not approved)
        await mockNFT3.transferFrom(seller2, collectibleMarket.address, "3", { from: seller2 });
        result = await collectibleMarket.recoverNonFungibleToken(mockNFT3.address, "3", { from: owner });
        expectEvent(result, "NonFungibleTokenRecovery", { token: mockNFT3.address, tokenId: "3" });
      });

      it("Cannot recover if nothing to, WBNB or NFTs that are listed", async () => {
        // Cannot recover if balanceOf is 0
        await expectRevert(
          collectibleMarket.recoverFungibleTokens(mockERC20.address, { from: owner }),
          "Operations: No token to recover"
        );

        // Cannot recover WBNB
        await wrappedBNB.transfer(collectibleMarket.address, parseEther("1"), { from: buyer3 });
        await expectRevert(
          collectibleMarket.recoverFungibleTokens(wrappedBNB.address, { from: owner }),
          "Operations: Cannot recover WBNB"
        );

        // Cannot recover token that is still in the orderbook
        await expectRevert(
          collectibleMarket.recoverNonFungibleToken(mockNFT2.address, "0", { from: owner }),
          "Operations: NFT not recoverable"
        );
      });

      it("Cannot add a collection if already listed or wrong creator attributes", async () => {
        // Collection already listed
        await expectRevert(
          collectibleMarket.addCollection(
            mockNFT1.address,
            creator1,
            constants.ZERO_ADDRESS,
            "45", // 0.45%
            "5", // 0.05%
            { from: admin }
          ),
          "Operations: Collection already listed"
        );

        // Creator address is set but fee is 0
        await expectRevert(
          collectibleMarket.addCollection(
            mockNFT3.address,
            creator1,
            constants.ZERO_ADDRESS,
            "45",
            "0", // creatorFee
            { from: admin }
          ),
          "Operations: Creator parameters incorrect"
        );

        // Fee is set for creator but address isn't
        await expectRevert(
          collectibleMarket.addCollection(
            mockNFT3.address,
            constants.ZERO_ADDRESS, // creator address
            constants.ZERO_ADDRESS,
            "45",
            "1",
            {
              from: admin,
            }
          ),
          "Operations: Creator parameters incorrect"
        );
      });

      it("Cannot add a collection if not ERC721", async () => {
        await expectRevert(
          collectibleMarket.addCollection(
            mockERC20.address, // MockERC20 instead of MockNFT3
            creator1,
            constants.ZERO_ADDRESS,
            "45", // 0.45%
            "5", // 0.05%
            { from: admin }
          ),
          "function selector was not recognized and there's no fallback function"
        );
      });

      it("Cannot add/modify a collection with fees too high", async () => {
        const maxFee = await collectibleMarket.TOTAL_MAX_FEE();

        await expectRevert(
          collectibleMarket.addCollection(
            mockNFT3.address,
            creator1,
            constants.ZERO_ADDRESS,
            maxFee,
            "1", // 0.01
            { from: admin }
          ),
          "Operations: Sum of fee must inferior to TOTAL_MAX_FEE"
        );

        await expectRevert(
          collectibleMarket.modifyCollection(
            mockNFT1.address,
            creator1,
            constants.ZERO_ADDRESS,
            maxFee,
            "1", // 0.01
            { from: admin }
          ),
          "Operations: Sum of fee must inferior to TOTAL_MAX_FEE"
        );
      });

      it("Cannot modify or remove a collection if not listed", async () => {
        await expectRevert(
          collectibleMarket.modifyCollection(
            mockNFT3.address,
            creator1,
            constants.ZERO_ADDRESS,
            "45", // 0.45%
            "5", // 0.05%
            { from: admin }
          ),
          "Operations: Collection not listed"
        );

        await expectRevert(
          collectibleMarket.closeCollectionForTradingAndListing(mockNFT3.address, { from: admin }),
          "Operations: Collection not listed"
        );
      });

      it("Cannot modify a collection with wrong creator parameters", async () => {
        // Creator address is set but fee is 0
        await expectRevert(
          collectibleMarket.modifyCollection(
            mockNFT1.address,
            creator1,
            constants.ZERO_ADDRESS,
            "45",
            "0", // creatorFee
            { from: admin }
          ),
          "Operations: Creator parameters incorrect"
        );

        // Fee is set for creator but address isn't
        await expectRevert(
          collectibleMarket.modifyCollection(
            mockNFT1.address,
            constants.ZERO_ADDRESS, // creator address
            constants.ZERO_ADDRESS,
            "45",
            "1",
            {
              from: admin,
            }
          ),
          "Operations: Creator parameters incorrect"
        );
      });

      it("Cannot change min/max prices if maxPrice >= minPrice", async () => {
        await expectRevert(
          collectibleMarket.updateMinimumAndMaximumPrices(minimumAskPrice, minimumAskPrice, { from: admin }),
          "Operations: _minimumAskPrice < _maximumAskPrice"
        );
      });

      it("Only admin can call admin functions", async () => {
        for (let user of [buyer1, seller1, owner]) {
          await expectRevert(
            collectibleMarket.addCollection(
              mockNFT2.address,
              creator1,
              constants.ZERO_ADDRESS,
              "45", // 0.45%
              "5", // 0.05%
              { from: user }
            ),
            "Management: Not admin"
          );

          await expectRevert(
            collectibleMarket.modifyCollection(
              mockNFT2.address,
              creator1,
              constants.ZERO_ADDRESS,
              "45", // 0.45%
              "5", // 0.05%
              { from: user }
            ),
            "Management: Not admin"
          );

          await expectRevert(
            collectibleMarket.updateMinimumAndMaximumPrices("0", "10", { from: user }),
            "Management: Not admin"
          );

          await expectRevert(
            collectibleMarket.closeCollectionForTradingAndListing(mockNFT1.address, { from: user }),
            "Management: Not admin"
          );
        }
      });

      it("Only owner can call owner functions", async () => {
        for (let user of [buyer1, seller1, admin]) {
          await expectRevert(
            collectibleMarket.recoverFungibleTokens(mockERC20.address, { from: user }),
            "Ownable: caller is not the owner"
          );

          await expectRevert(
            collectibleMarket.recoverNonFungibleToken(mockNFT3.address, "1", { from: user }),
            "Ownable: caller is not the owner"
          );

          await expectRevert(
            collectibleMarket.setAdminAndTreasuryAddresses(seller1, seller2, { from: user }),
            "Ownable: caller is not the owner"
          );
        }
      });

      it("Estimations for price returns (0,0,0) if collection is not listed", async () => {
        const result = await collectibleMarket.calculatePriceAndFeesForCollection(mockNFT3.address, parseEther("10"));
        assert.equal(result[0], "0");
        assert.equal(result[1], "0");
        assert.equal(result[2], "0");
      });

      it("Owner can change admin/treasury but cannot if one of them is equal to 0x address", async () => {
        const result = await collectibleMarket.setAdminAndTreasuryAddresses(admin, treasury, {
          from: owner,
        });

        expectEvent(result, "NewAdminAndTreasuryAddresses", { admin: admin, treasury: treasury });

        await expectRevert(
          collectibleMarket.setAdminAndTreasuryAddresses(admin, constants.ZERO_ADDRESS, { from: owner }),
          "Operations: Treasury address cannot be zero"
        );

        await expectRevert(
          collectibleMarket.setAdminAndTreasuryAddresses(constants.ZERO_ADDRESS, treasury, { from: owner }),
          "Operations: Admin address cannot be zero"
        );
      });

      it("Cannot deploy if wrong admin address/treasury and maxPrice <= minPrice", async () => {
        await expectRevert(
          ERC721NFTMarketV1.new(
            constants.ZERO_ADDRESS,
            treasury,
            wrappedBNB.address,
            minimumAskPrice,
            maximumAskPrice,
            { from: owner }
          ),
          "Operations: Admin address cannot be zero"
        );

        await expectRevert(
          ERC721NFTMarketV1.new(admin, constants.ZERO_ADDRESS, wrappedBNB.address, minimumAskPrice, maximumAskPrice, {
            from: owner,
          }),
          "Operations: Treasury address cannot be zero"
        );

        await expectRevert(
          ERC721NFTMarketV1.new(admin, treasury, constants.ZERO_ADDRESS, minimumAskPrice, maximumAskPrice, {
            from: owner,
          }),
          "Operations: WBNB address cannot be zero"
        );

        await expectRevert(
          ERC721NFTMarketV1.new(admin, treasury, wrappedBNB.address, minimumAskPrice, minimumAskPrice, {
            from: owner,
          }),
          "Operations: _minimumAskPrice < _maximumAskPrice"
        );
      });

      describe("COLLECTIBLE MARKET #5 - VIEW FUNCTIONS", async () => {
        it("Add fourth collection whose tokens are minted/listed by seller3", async () => {
          const result = await collectibleMarket.addCollection(
            mockNFT4.address,
            constants.ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
            "100", // 1%
            "0",
            { from: admin }
          );

          expectEvent(result, "CollectionNew", {
            collection: mockNFT4.address,
            creator: constants.ZERO_ADDRESS,
            whitelistChecker: constants.ZERO_ADDRESS,
            tradingFee: "100",
            creatorFee: "0",
          });

          // Mint 30 NFTs and approve
          let i = 0;

          while (i < 30) {
            await mockNFT4.mint("ipfs://token" + i + " .json", { from: seller3 });
            // tokenId = 0 --> 1 BNB, tokenId = 5 --> 1.5 BNB, tokenId = 30 --> 4 BNB, etc.
            const priceToList = parseEther(String(1 + i / 10));
            // Set approvals for all future NFTs minted
            await mockNFT4.setApprovalForAll(collectibleMarket.address, true, { from: seller3 });

            const result = await collectibleMarket.createAskOrder(mockNFT4.address, i, priceToList, {
              from: seller3,
            });

            expectEvent(result, "AskNew", {
              collection: mockNFT4.address,
              seller: seller3,
              tokenId: i.toString(),
              askPrice: priceToList.toString(),
            });

            expectEvent.inTransaction(result.receipt.transactionHash, mockNFT4, "Transfer", {
              from: seller3,
              to: collectibleMarket.address,
              tokenId: i.toString(),
            });

            // Increment i
            i++;
          }
        });

        it("viewCollections", async () => {
          let collections = await collectibleMarket.viewCollections("0", "1");
          assert.equal(String(collections[2]), "1"); // 3 collections
          collections = await collectibleMarket.viewCollections("1", "1");
          assert.equal(String(collections[2]), "2"); // 3 collections
          collections = await collectibleMarket.viewCollections("2", "1");
          assert.equal(String(collections[2]), "3"); // 3 collections
          collections = await collectibleMarket.viewCollections("3", "1");
          assert.equal(String(collections[2]), "3"); // 3 collections
        });

        it("viewAsksByCollectionAndSeller", async () => {
          let collections = await collectibleMarket.viewAsksByCollectionAndSeller(mockNFT4.address, seller3, "0", "10");
          assert.equal(String(collections[2]), "10"); // 30 tokens
          collections = await collectibleMarket.viewAsksByCollectionAndSeller(mockNFT4.address, seller3, "10", "15");
          assert.equal(String(collections[2]), "25"); // 150 tokens
          collections = await collectibleMarket.viewAsksByCollectionAndSeller(mockNFT4.address, seller3, "25", "70");
          assert.equal(String(collections[2]), "30"); // 150 tokens
        });

        it("viewAsksByCollectionAndTokenIds", async () => {
          let collections = await collectibleMarket.viewAsksByCollectionAndTokenIds(mockNFT4.address, [
            new BN("0"),
            new BN("1"),
            new BN("2"),
            new BN("100023"),
          ]);

          assert.equal(collections[0][0], true);
          assert.equal(collections[0][1], true);
          assert.equal(collections[0][2], true);
          assert.equal(collections[0][3], false);

          assert.equal(collections[1][0][0], seller3);
          assert.equal(collections[1][1][0], seller3);
          assert.equal(collections[1][2][0], seller3);
          assert.equal(collections[1][3][0], constants.ZERO_ADDRESS);

          assert.equal(String(collections[1][0][1]), parseEther("1").toString());
          assert.equal(String(collections[1][1][1]), parseEther("1.1").toString());
          assert.equal(String(collections[1][2][1]), parseEther("1.2").toString());
          assert.equal(String(collections[1][3][1]), parseEther("0").toString());
        });

        it("viewAsksByCollection", async () => {
          let collections = await collectibleMarket.viewAsksByCollection(mockNFT4.address, "0", "10");

          assert.equal(String(collections[2]), "10"); // 150 tokens
          collections = await collectibleMarket.viewAsksByCollection(mockNFT4.address, "10", "15");
          assert.equal(String(collections[2]), "25"); // 150 tokens
          collections = await collectibleMarket.viewAsksByCollection(mockNFT4.address, "25", "70");
          assert.equal(String(collections[2]), "30"); // 150 tokens
        });
      });
    });
  }
);
