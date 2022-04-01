// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

import {IWETH} from "./interfaces/IWETH.sol";

import {ICollectionWhitelistChecker} from "./interfaces/ICollectionWhitelistChecker.sol";

contract ERC721NFTMarketV1 is ERC721Holder, Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;

    using SafeERC20 for IERC20;

    enum CollectionStatus {
        Pending,
        Open,
        Close
    }

    address public immutable WBNB;

    uint256 public constant TOTAL_MAX_FEE = 1000; // 10% of a sale

    address public adminAddress;
    address public treasuryAddress;

    uint256 public minimumAskPrice; // in wei
    uint256 public maximumAskPrice; // in wei

    mapping(address => uint256) public pendingRevenue; // For creator/treasury to claim

    EnumerableSet.AddressSet private _collectionAddressSet;

    mapping(address => mapping(uint256 => Ask)) private _askDetails; // Ask details (price + seller address) for a given collection and a tokenId
    mapping(address => EnumerableSet.UintSet) private _askTokenIds; // Set of tokenIds for a collection
    mapping(address => Collection) private _collections; // Details about the collections
    mapping(address => mapping(address => EnumerableSet.UintSet)) private _tokenIdsOfSellerForCollection;

    struct Ask {
        address seller; // address of the seller
        uint256 price; // price of the token
    }

    struct Collection {
        CollectionStatus status; // status of the collection
        address creatorAddress; // address of the creator
        address whitelistChecker; // whitelist checker (if not set --> 0x00)
        uint256 tradingFee; // trading fee (100 = 1%, 500 = 5%, 5 = 0.05%)
        uint256 creatorFee; // creator fee (100 = 1%, 500 = 5%, 5 = 0.05%)
    }

    // Ask order is cancelled
    event AskCancel(address indexed collection, address indexed seller, uint256 indexed tokenId);

    // Ask order is created
    event AskNew(address indexed collection, address indexed seller, uint256 indexed tokenId, uint256 askPrice);

    // Ask order is updated
    event AskUpdate(address indexed collection, address indexed seller, uint256 indexed tokenId, uint256 askPrice);

    // Collection is closed for trading and new listings
    event CollectionClose(address indexed collection);

    // New collection is added
    event CollectionNew(
        address indexed collection,
        address indexed creator,
        address indexed whitelistChecker,
        uint256 tradingFee,
        uint256 creatorFee
    );

    // Existing collection is updated
    event CollectionUpdate(
        address indexed collection,
        address indexed creator,
        address indexed whitelistChecker,
        uint256 tradingFee,
        uint256 creatorFee
    );

    // Admin and Treasury Addresses are updated
    event NewAdminAndTreasuryAddresses(address indexed admin, address indexed treasury);

    // Minimum/maximum ask prices are updated
    event NewMinimumAndMaximumAskPrices(uint256 minimumAskPrice, uint256 maximumAskPrice);

    // Recover NFT tokens sent by accident
    event NonFungibleTokenRecovery(address indexed token, uint256 indexed tokenId);

    // Pending revenue is claimed
    event RevenueClaim(address indexed claimer, uint256 amount);

    // Recover ERC20 tokens sent by accident
    event TokenRecovery(address indexed token, uint256 amount);

    // Ask order is matched by a trade
    event Trade(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 askPrice,
        uint256 netPrice,
        bool withBNB
    );

    // Modifier for the admin
    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "Management: Not admin");
        _;
    }

    /**
     * @notice Constructor
     * @param _adminAddress: address of the admin
     * @param _treasuryAddress: address of the treasury
     * @param _WBNBAddress: WBNB address
     * @param _minimumAskPrice: minimum ask price
     * @param _maximumAskPrice: maximum ask price
     */
    constructor(
        address _adminAddress,
        address _treasuryAddress,
        address _WBNBAddress,
        uint256 _minimumAskPrice,
        uint256 _maximumAskPrice
    ) {
        require(_adminAddress != address(0), "Operations: Admin address cannot be zero");
        require(_treasuryAddress != address(0), "Operations: Treasury address cannot be zero");
        require(_WBNBAddress != address(0), "Operations: WBNB address cannot be zero");
        require(_minimumAskPrice > 0, "Operations: _minimumAskPrice must be > 0");
        require(_minimumAskPrice < _maximumAskPrice, "Operations: _minimumAskPrice < _maximumAskPrice");

        adminAddress = _adminAddress;
        treasuryAddress = _treasuryAddress;

        WBNB = _WBNBAddress;

        minimumAskPrice = _minimumAskPrice;
        maximumAskPrice = _maximumAskPrice;
    }

    /**
     * @notice Buy token with BNB by matching the price of an existing ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT purchased
     */
    function buyTokenUsingBNB(address _collection, uint256 _tokenId) external payable nonReentrant {
        // Wrap BNB
        IWETH(WBNB).deposit{value: msg.value}();

        _buyToken(_collection, _tokenId, msg.value, true);
    }

    /**
     * @notice Buy token with WBNB by matching the price of an existing ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT purchased
     * @param _price: price (must be equal to the askPrice set by the seller)
     */
    function buyTokenUsingWBNB(
        address _collection,
        uint256 _tokenId,
        uint256 _price
    ) external nonReentrant {
        IERC20(WBNB).safeTransferFrom(address(msg.sender), address(this), _price);

        _buyToken(_collection, _tokenId, _price, false);
    }

    /**
     * @notice Cancel existing ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT
     */
    function cancelAskOrder(address _collection, uint256 _tokenId) external nonReentrant {
        // Verify the sender has listed it
        require(_tokenIdsOfSellerForCollection[msg.sender][_collection].contains(_tokenId), "Order: Token not listed");

        // Adjust the information
        _tokenIdsOfSellerForCollection[msg.sender][_collection].remove(_tokenId);
        delete _askDetails[_collection][_tokenId];
        _askTokenIds[_collection].remove(_tokenId);

        // Transfer the NFT back to the user
        IERC721(_collection).transferFrom(address(this), address(msg.sender), _tokenId);

        // Emit event
        emit AskCancel(_collection, msg.sender, _tokenId);
    }

    /**
     * @notice Claim pending revenue (treasury or creators)
     */
    function claimPendingRevenue() external nonReentrant {
        uint256 revenueToClaim = pendingRevenue[msg.sender];
        require(revenueToClaim != 0, "Claim: Nothing to claim");
        pendingRevenue[msg.sender] = 0;

        IERC20(WBNB).safeTransfer(address(msg.sender), revenueToClaim);

        emit RevenueClaim(msg.sender, revenueToClaim);
    }

    /**
     * @notice Create ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT
     * @param _askPrice: price for listing (in wei)
     */
    function createAskOrder(
        address _collection,
        uint256 _tokenId,
        uint256 _askPrice
    ) external nonReentrant {
        // Verify price is not too low/high
        require(_askPrice >= minimumAskPrice && _askPrice <= maximumAskPrice, "Order: Price not within range");

        // Verify collection is accepted
        require(_collections[_collection].status == CollectionStatus.Open, "Collection: Not for listing");

        // Verify token has restriction
        require(_canTokenBeListed(_collection, _tokenId), "Order: tokenId not eligible");

        // Transfer NFT to this contract
        IERC721(_collection).safeTransferFrom(address(msg.sender), address(this), _tokenId);

        // Adjust the information
        _tokenIdsOfSellerForCollection[msg.sender][_collection].add(_tokenId);
        _askDetails[_collection][_tokenId] = Ask({seller: msg.sender, price: _askPrice});

        // Add tokenId to the askTokenIds set
        _askTokenIds[_collection].add(_tokenId);

        // Emit event
        emit AskNew(_collection, msg.sender, _tokenId, _askPrice);
    }

    /**
     * @notice Modify existing ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT
     * @param _newPrice: new price for listing (in wei)
     */
    function modifyAskOrder(
        address _collection,
        uint256 _tokenId,
        uint256 _newPrice
    ) external nonReentrant {
        // Verify new price is not too low/high
        require(_newPrice >= minimumAskPrice && _newPrice <= maximumAskPrice, "Order: Price not within range");

        // Verify collection is accepted
        require(_collections[_collection].status == CollectionStatus.Open, "Collection: Not for listing");

        // Verify the sender has listed it
        require(_tokenIdsOfSellerForCollection[msg.sender][_collection].contains(_tokenId), "Order: Token not listed");

        // Adjust the information
        _askDetails[_collection][_tokenId].price = _newPrice;

        // Emit event
        emit AskUpdate(_collection, msg.sender, _tokenId, _newPrice);
    }

    /**
     * @notice Add a new collection
     * @param _collection: collection address
     * @param _creator: creator address (must be 0x00 if none)
     * @param _whitelistChecker: whitelist checker (for additional restrictions, must be 0x00 if none)
     * @param _tradingFee: trading fee (100 = 1%, 500 = 5%, 5 = 0.05%)
     * @param _creatorFee: creator fee (100 = 1%, 500 = 5%, 5 = 0.05%, 0 if creator is 0x00)
     * @dev Callable by admin
     */
    function addCollection(
        address _collection,
        address _creator,
        address _whitelistChecker,
        uint256 _tradingFee,
        uint256 _creatorFee
    ) external onlyAdmin {
        require(!_collectionAddressSet.contains(_collection), "Operations: Collection already listed");
        require(IERC721(_collection).supportsInterface(0x80ac58cd), "Operations: Not ERC721");

        require(
            (_creatorFee == 0 && _creator == address(0)) || (_creatorFee != 0 && _creator != address(0)),
            "Operations: Creator parameters incorrect"
        );

        require(_tradingFee + _creatorFee <= TOTAL_MAX_FEE, "Operations: Sum of fee must inferior to TOTAL_MAX_FEE");

        _collectionAddressSet.add(_collection);

        _collections[_collection] = Collection({
            status: CollectionStatus.Open,
            creatorAddress: _creator,
            whitelistChecker: _whitelistChecker,
            tradingFee: _tradingFee,
            creatorFee: _creatorFee
        });

        emit CollectionNew(_collection, _creator, _whitelistChecker, _tradingFee, _creatorFee);
    }

    /**
     * @notice Allows the admin to close collection for trading and new listing
     * @param _collection: collection address
     * @dev Callable by admin
     */
    function closeCollectionForTradingAndListing(address _collection) external onlyAdmin {
        require(_collectionAddressSet.contains(_collection), "Operations: Collection not listed");

        _collections[_collection].status = CollectionStatus.Close;
        _collectionAddressSet.remove(_collection);

        emit CollectionClose(_collection);
    }

    /**
     * @notice Modify collection characteristics
     * @param _collection: collection address
     * @param _creator: creator address (must be 0x00 if none)
     * @param _whitelistChecker: whitelist checker (for additional restrictions, must be 0x00 if none)
     * @param _tradingFee: trading fee (100 = 1%, 500 = 5%, 5 = 0.05%)
     * @param _creatorFee: creator fee (100 = 1%, 500 = 5%, 5 = 0.05%, 0 if creator is 0x00)
     * @dev Callable by admin
     */
    function modifyCollection(
        address _collection,
        address _creator,
        address _whitelistChecker,
        uint256 _tradingFee,
        uint256 _creatorFee
    ) external onlyAdmin {
        require(_collectionAddressSet.contains(_collection), "Operations: Collection not listed");

        require(
            (_creatorFee == 0 && _creator == address(0)) || (_creatorFee != 0 && _creator != address(0)),
            "Operations: Creator parameters incorrect"
        );

        require(_tradingFee + _creatorFee <= TOTAL_MAX_FEE, "Operations: Sum of fee must inferior to TOTAL_MAX_FEE");

        _collections[_collection] = Collection({
            status: CollectionStatus.Open,
            creatorAddress: _creator,
            whitelistChecker: _whitelistChecker,
            tradingFee: _tradingFee,
            creatorFee: _creatorFee
        });

        emit CollectionUpdate(_collection, _creator, _whitelistChecker, _tradingFee, _creatorFee);
    }

    /**
     * @notice Allows the admin to update minimum and maximum prices for a token (in wei)
     * @param _minimumAskPrice: minimum ask price
     * @param _maximumAskPrice: maximum ask price
     * @dev Callable by admin
     */
    function updateMinimumAndMaximumPrices(uint256 _minimumAskPrice, uint256 _maximumAskPrice) external onlyAdmin {
        require(_minimumAskPrice < _maximumAskPrice, "Operations: _minimumAskPrice < _maximumAskPrice");

        minimumAskPrice = _minimumAskPrice;
        maximumAskPrice = _maximumAskPrice;

        emit NewMinimumAndMaximumAskPrices(_minimumAskPrice, _maximumAskPrice);
    }

    /**
     * @notice Allows the owner to recover tokens sent to the contract by mistake
     * @param _token: token address
     * @dev Callable by owner
     */
    function recoverFungibleTokens(address _token) external onlyOwner {
        require(_token != WBNB, "Operations: Cannot recover WBNB");
        uint256 amountToRecover = IERC20(_token).balanceOf(address(this));
        require(amountToRecover != 0, "Operations: No token to recover");

        IERC20(_token).safeTransfer(address(msg.sender), amountToRecover);

        emit TokenRecovery(_token, amountToRecover);
    }

    /**
     * @notice Allows the owner to recover NFTs sent to the contract by mistake
     * @param _token: NFT token address
     * @param _tokenId: tokenId
     * @dev Callable by owner
     */
    function recoverNonFungibleToken(address _token, uint256 _tokenId) external onlyOwner nonReentrant {
        require(!_askTokenIds[_token].contains(_tokenId), "Operations: NFT not recoverable");
        IERC721(_token).safeTransferFrom(address(this), address(msg.sender), _tokenId);

        emit NonFungibleTokenRecovery(_token, _tokenId);
    }

    /**
     * @notice Set admin address
     * @dev Only callable by owner
     * @param _adminAddress: address of the admin
     * @param _treasuryAddress: address of the treasury
     */
    function setAdminAndTreasuryAddresses(address _adminAddress, address _treasuryAddress) external onlyOwner {
        require(_adminAddress != address(0), "Operations: Admin address cannot be zero");
        require(_treasuryAddress != address(0), "Operations: Treasury address cannot be zero");

        adminAddress = _adminAddress;
        treasuryAddress = _treasuryAddress;

        emit NewAdminAndTreasuryAddresses(_adminAddress, _treasuryAddress);
    }

    /**
     * @notice Check asks for an array of tokenIds in a collection
     * @param collection: address of the collection
     * @param tokenIds: array of tokenId
     */
    function viewAsksByCollectionAndTokenIds(address collection, uint256[] calldata tokenIds)
        external
        view
        returns (bool[] memory statuses, Ask[] memory askInfo)
    {
        uint256 length = tokenIds.length;

        statuses = new bool[](length);
        askInfo = new Ask[](length);

        for (uint256 i = 0; i < length; i++) {
            if (_askTokenIds[collection].contains(tokenIds[i])) {
                statuses[i] = true;
            } else {
                statuses[i] = false;
            }

            askInfo[i] = _askDetails[collection][tokenIds[i]];
        }

        return (statuses, askInfo);
    }

    /**
     * @notice View ask orders for a given collection across all sellers
     * @param collection: address of the collection
     * @param cursor: cursor
     * @param size: size of the response
     */
    function viewAsksByCollection(
        address collection,
        uint256 cursor,
        uint256 size
    )
        external
        view
        returns (
            uint256[] memory tokenIds,
            Ask[] memory askInfo,
            uint256
        )
    {
        uint256 length = size;

        if (length > _askTokenIds[collection].length() - cursor) {
            length = _askTokenIds[collection].length() - cursor;
        }

        tokenIds = new uint256[](length);
        askInfo = new Ask[](length);

        for (uint256 i = 0; i < length; i++) {
            tokenIds[i] = _askTokenIds[collection].at(cursor + i);
            askInfo[i] = _askDetails[collection][tokenIds[i]];
        }

        return (tokenIds, askInfo, cursor + length);
    }

    /**
     * @notice View ask orders for a given collection and a seller
     * @param collection: address of the collection
     * @param seller: address of the seller
     * @param cursor: cursor
     * @param size: size of the response
     */
    function viewAsksByCollectionAndSeller(
        address collection,
        address seller,
        uint256 cursor,
        uint256 size
    )
        external
        view
        returns (
            uint256[] memory tokenIds,
            Ask[] memory askInfo,
            uint256
        )
    {
        uint256 length = size;

        if (length > _tokenIdsOfSellerForCollection[seller][collection].length() - cursor) {
            length = _tokenIdsOfSellerForCollection[seller][collection].length() - cursor;
        }

        tokenIds = new uint256[](length);
        askInfo = new Ask[](length);

        for (uint256 i = 0; i < length; i++) {
            tokenIds[i] = _tokenIdsOfSellerForCollection[seller][collection].at(cursor + i);
            askInfo[i] = _askDetails[collection][tokenIds[i]];
        }

        return (tokenIds, askInfo, cursor + length);
    }

    /*
     * @notice View addresses and details for all the collections available for trading
     * @param cursor: cursor
     * @param size: size of the response
     */
    function viewCollections(uint256 cursor, uint256 size)
        external
        view
        returns (
            address[] memory collectionAddresses,
            Collection[] memory collectionDetails,
            uint256
        )
    {
        uint256 length = size;

        if (length > _collectionAddressSet.length() - cursor) {
            length = _collectionAddressSet.length() - cursor;
        }

        collectionAddresses = new address[](length);
        collectionDetails = new Collection[](length);

        for (uint256 i = 0; i < length; i++) {
            collectionAddresses[i] = _collectionAddressSet.at(cursor + i);
            collectionDetails[i] = _collections[collectionAddresses[i]];
        }

        return (collectionAddresses, collectionDetails, cursor + length);
    }

    /**
     * @notice Calculate price and associated fees for a collection
     * @param collection: address of the collection
     * @param price: listed price
     */
    function calculatePriceAndFeesForCollection(address collection, uint256 price)
        external
        view
        returns (
            uint256 netPrice,
            uint256 tradingFee,
            uint256 creatorFee
        )
    {
        if (_collections[collection].status != CollectionStatus.Open) {
            return (0, 0, 0);
        }

        return (_calculatePriceAndFeesForCollection(collection, price));
    }

    /**
     * @notice Checks if an array of tokenIds can be listed
     * @param _collection: address of the collection
     * @param _tokenIds: array of tokenIds
     * @dev if collection is not for trading, it returns array of bool with false
     */
    function canTokensBeListed(address _collection, uint256[] calldata _tokenIds)
        external
        view
        returns (bool[] memory listingStatuses)
    {
        listingStatuses = new bool[](_tokenIds.length);

        if (_collections[_collection].status != CollectionStatus.Open) {
            return listingStatuses;
        }

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            listingStatuses[i] = _canTokenBeListed(_collection, _tokenIds[i]);
        }

        return listingStatuses;
    }

    /**
     * @notice Buy token by matching the price of an existing ask order
     * @param _collection: contract address of the NFT
     * @param _tokenId: tokenId of the NFT purchased
     * @param _price: price (must match the askPrice from the seller)
     * @param _withBNB: whether the token is bought with BNB (true) or WBNB (false)
     */
    function _buyToken(
        address _collection,
        uint256 _tokenId,
        uint256 _price,
        bool _withBNB
    ) internal {
        require(_collections[_collection].status == CollectionStatus.Open, "Collection: Not for trading");
        require(_askTokenIds[_collection].contains(_tokenId), "Buy: Not for sale");

        Ask memory askOrder = _askDetails[_collection][_tokenId];

        // Front-running protection
        require(_price == askOrder.price, "Buy: Incorrect price");
        require(msg.sender != askOrder.seller, "Buy: Buyer cannot be seller");

        // Calculate the net price (collected by seller), trading fee (collected by treasury), creator fee (collected by creator)
        (uint256 netPrice, uint256 tradingFee, uint256 creatorFee) = _calculatePriceAndFeesForCollection(
            _collection,
            _price
        );

        // Update storage information
        _tokenIdsOfSellerForCollection[askOrder.seller][_collection].remove(_tokenId);
        delete _askDetails[_collection][_tokenId];
        _askTokenIds[_collection].remove(_tokenId);

        // Transfer WBNB
        IERC20(WBNB).safeTransfer(askOrder.seller, netPrice);

        // Update pending revenues for treasury/creator (if any!)
        if (creatorFee != 0) {
            pendingRevenue[_collections[_collection].creatorAddress] += creatorFee;
        }

        // Update trading fee if not equal to 0
        if (tradingFee != 0) {
            pendingRevenue[treasuryAddress] += tradingFee;
        }

        // Transfer NFT to buyer
        IERC721(_collection).safeTransferFrom(address(this), address(msg.sender), _tokenId);

        // Emit event
        emit Trade(_collection, _tokenId, askOrder.seller, msg.sender, _price, netPrice, _withBNB);
    }

    /**
     * @notice Calculate price and associated fees for a collection
     * @param _collection: address of the collection
     * @param _askPrice: listed price
     */
    function _calculatePriceAndFeesForCollection(address _collection, uint256 _askPrice)
        internal
        view
        returns (
            uint256 netPrice,
            uint256 tradingFee,
            uint256 creatorFee
        )
    {
        tradingFee = (_askPrice * _collections[_collection].tradingFee) / 10000;
        creatorFee = (_askPrice * _collections[_collection].creatorFee) / 10000;

        netPrice = _askPrice - tradingFee - creatorFee;

        return (netPrice, tradingFee, creatorFee);
    }

    /**
     * @notice Checks if a token can be listed
     * @param _collection: address of the collection
     * @param _tokenId: tokenId
     */
    function _canTokenBeListed(address _collection, uint256 _tokenId) internal view returns (bool) {
        address whitelistCheckerAddress = _collections[_collection].whitelistChecker;
        return
            (whitelistCheckerAddress == address(0)) ||
            ICollectionWhitelistChecker(whitelistCheckerAddress).canList(_tokenId);
    }
}
