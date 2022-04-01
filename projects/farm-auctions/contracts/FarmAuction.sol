// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PancakeSwap Farms Auctions.
 * @notice Auctions for new Farms, including multiplier.
 */
contract FarmAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    IERC20 public immutable cakeToken;

    address public operatorAddress;

    uint256 public currentAuctionId;
    uint256 public maxAuctionLength;
    uint256 public totalCollected;

    enum Status {
        Pending,
        Open,
        Close
    }

    struct Auction {
        Status status;
        uint256 startBlock;
        uint256 endBlock;
        uint256 initialBidAmount;
        uint256 leaderboard;
        uint256 leaderboardThreshold;
    }

    struct BidInfo {
        uint256 totalAmount;
        bool hasClaimed;
    }

    // Only used for view
    struct Bid {
        address account;
        uint256 amount;
        bool hasClaimed;
    }

    EnumerableSet.AddressSet bidders;

    // Mapping to track auctions
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => BidInfo)) public auctionBids;
    mapping(uint256 => EnumerableSet.AddressSet) private _auctionBidders;

    // Mapping to track bidder's bids per auction
    mapping(address => uint256[]) private _bidderAuctions;

    // Modifier to prevent external address to modify state
    modifier onlyOperator() {
        require(msg.sender == operatorAddress, "Management: Not the operator");
        _;
    }

    event AuctionBid(uint256 indexed auctionId, address indexed account, uint256 amount);
    event AuctionClaim(uint256 indexed auctionId, address indexed account, uint256 amount, bool isAdmin);
    event AuctionClose(uint256 indexed auctionId, uint256 participationLimit, uint256 numberParticipants);
    event AuctionStart(
        uint256 indexed auctionId,
        uint256 startBlock,
        uint256 endBlock,
        uint256 initialBidAmount,
        uint256 leaderboard
    );
    event NewMaxAuctionLength(uint256 maxAuctionLength);
    event NewOperatorAddress(address indexed account);
    event TokenRecovery(address indexed token, uint256 amount);
    event WhitelistAdd(address indexed account);
    event WhitelistRemove(address indexed account);

    /**
     * @notice Constructor
     * @param _cakeToken: address of the $Cake token
     * @param _operatorAddress: address of the operator
     * @param _maxAuctionLength: max amount of blocks for an auction
     */
    constructor(
        address _cakeToken,
        address _operatorAddress,
        uint256 _maxAuctionLength
    ) {
        require(_maxAuctionLength > 0, "Auction: Length cannot be zero");
        require(_maxAuctionLength <= 86400, "Auction: Cannot be longer than three days (86,400 blocks)");

        cakeToken = IERC20(_cakeToken);
        operatorAddress = _operatorAddress;
        maxAuctionLength = _maxAuctionLength;
    }

    /**
     * @notice Bid for the current auction round
     * @param _amount: amount of the bid in $Cake token
     * @dev Callable by (whitelisted) bidders
     */
    function bid(uint256 _amount) external nonReentrant {
        require(bidders.contains(msg.sender), "Whitelist: Not whitelisted");
        require(auctions[currentAuctionId].status == Status.Open, "Auction: Not in progress");
        require(block.number > auctions[currentAuctionId].startBlock, "Auction: Too early");
        require(block.number < auctions[currentAuctionId].endBlock, "Auction: Too late");
        require(_amount % uint256(10**19) == uint256(0), "Bid: Incorrect amount");

        if (auctionBids[currentAuctionId][msg.sender].totalAmount == 0) {
            require(_amount >= auctions[currentAuctionId].initialBidAmount, "Bid: Incorrect initial bid amount");
        }

        cakeToken.safeTransferFrom(address(msg.sender), address(this), _amount);

        auctionBids[currentAuctionId][msg.sender].totalAmount += _amount;

        if (!_auctionBidders[currentAuctionId].contains(msg.sender)) {
            _auctionBidders[currentAuctionId].add(msg.sender);
            _bidderAuctions[msg.sender].push(currentAuctionId);
        }

        emit AuctionBid(currentAuctionId, msg.sender, _amount);
    }

    /**
     * @notice Claim unsuccessful participation (total bids) for an auction round
     * @param _auctionId: auction id
     * @dev Callable by (current, and previous whitelisted) bidders
     */
    function claimAuction(uint256 _auctionId) external nonReentrant {
        require(block.number > auctions[_auctionId].endBlock, "Auction: In progress");
        require(auctions[_auctionId].status == Status.Close, "Auction: Not claimable");
        require(auctionBids[_auctionId][msg.sender].totalAmount != 0, "Bid: Not found");
        require(
            auctionBids[_auctionId][msg.sender].totalAmount < auctions[_auctionId].leaderboardThreshold,
            "Bid: Cannot be claimed (in leaderboard)"
        );
        require(!auctionBids[_auctionId][msg.sender].hasClaimed, "Bid: Cannot be claimed twice");

        auctionBids[_auctionId][msg.sender].hasClaimed = true;

        uint256 claimableAmount = auctionBids[_auctionId][msg.sender].totalAmount;
        cakeToken.safeTransfer(address(msg.sender), claimableAmount);

        emit AuctionClaim(_auctionId, msg.sender, claimableAmount, false);
    }

    /**
     * @notice Add addresses to the whitelist
     * @param _bidders: addresses of bidders
     * @dev Callable by operator
     */
    function addWhitelist(address[] calldata _bidders) external onlyOperator {
        require((currentAuctionId == 0) || (auctions[currentAuctionId].status == Status.Close), "Auction: In progress");

        for (uint256 i = 0; i < _bidders.length; i++) {
            address account = _bidders[i];

            if (!bidders.contains(account)) {
                bidders.add(account);

                emit WhitelistAdd(account);
            }
        }
    }

    /**
     * @notice Remove addresses from the whitelist
     * @param _bidders: addresses of bidders
     * @dev Callable by operator
     */
    function removeWhitelist(address[] calldata _bidders) external onlyOperator {
        require((currentAuctionId == 0) || (auctions[currentAuctionId].status == Status.Close), "Auction: In progress");

        for (uint256 i = 0; i < _bidders.length; i++) {
            address account = _bidders[i];

            if (bidders.contains(account)) {
                bidders.remove(account);

                emit WhitelistRemove(account);
            }
        }
    }

    /**
     * @notice Start an auction round
     * @param _startBlock: start block
     * @param _endBlock: end block
     * @param _initialBidAmount: amount of the initial bid (10 ** 18)
     * @param _leaderboard: top n of addresses to keep as winners
     * @dev Callable by operator
     */
    function startAuction(
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _initialBidAmount,
        uint256 _leaderboard
    ) external onlyOperator {
        require((currentAuctionId == 0) || (auctions[currentAuctionId].status == Status.Close), "Auction: In progress");
        require(_startBlock > block.number, "Auction: Start block must be higher than current block");
        require(_startBlock < _endBlock, "Auction: Start block must be lower than End block");
        require(
            block.number + maxAuctionLength > _startBlock,
            "Auction: Start block must be lower than current block + Buffer"
        );
        require(
            _startBlock + maxAuctionLength > _endBlock,
            "Auction: End block must be lower than Start block + Buffer"
        );
        require(_initialBidAmount > 0, "Auction: Initial bid amount cannot be zero");
        require(_initialBidAmount % uint256(10**19) == uint256(0), "Auction: Incorrect initial bid amount");
        require(_leaderboard > 0, "Auction: Leaderboard cannot be zero");
        require(bidders.length() > 0, "Auction: No whitelisted address");

        currentAuctionId++;

        auctions[currentAuctionId] = Auction({
            status: Status.Open,
            startBlock: _startBlock,
            endBlock: _endBlock,
            initialBidAmount: _initialBidAmount,
            leaderboard: _leaderboard,
            leaderboardThreshold: 0
        });

        emit AuctionStart(currentAuctionId, _startBlock, _endBlock, _initialBidAmount, _leaderboard);
    }

    /**
     * @notice Close an auction round, and store $Cake leaderboard threshold
     * @param _bidLimit: minimal $Cake committed to be a winner
     * @dev Callable by operator
     */
    function closeAuction(uint256 _bidLimit) external onlyOperator {
        require(
            (currentAuctionId != 0) || auctions[currentAuctionId].status == Status.Open,
            "Auction: Not in progress"
        );
        require(block.number > auctions[currentAuctionId].endBlock, "Auction: In progress");

        auctions[currentAuctionId].status = Status.Close;
        auctions[currentAuctionId].leaderboardThreshold = _bidLimit;

        emit AuctionClose(currentAuctionId, _bidLimit, _auctionBidders[currentAuctionId].length());
    }

    /**
     * @notice Claim $Cake for all bids by bidders in leaderboard
     * @param _auctionId: auction id
     * @param _bidders: addresses of bidders
     * @dev Callable by owner
     */
    function claimAuctionLeaderboard(uint256 _auctionId, address[] calldata _bidders) external onlyOwner nonReentrant {
        require(block.number > auctions[_auctionId].endBlock, "Auction: In progress");
        require(auctions[_auctionId].status == Status.Close, "Auction: Not claimable");

        uint256 auctionThreshold = auctions[_auctionId].leaderboardThreshold;

        uint256 claimableAmount = 0;
        for (uint256 i = 0; i < _bidders.length; i++) {
            BidInfo memory bidInfo = auctionBids[_auctionId][_bidders[i]];

            require(!bidInfo.hasClaimed, "Bid: Cannot be claimed twice");
            require(bidInfo.totalAmount >= auctionThreshold, "Bid: Cannot be claimed (not in leaderboard)");

            claimableAmount += bidInfo.totalAmount;

            auctionBids[_auctionId][_bidders[i]].hasClaimed = true;
        }

        if (claimableAmount > 0) {
            totalCollected += claimableAmount;

            cakeToken.safeTransfer(address(msg.sender), claimableAmount);
        }

        emit AuctionClaim(_auctionId, msg.sender, claimableAmount, true);
    }

    /**
     * @notice Allows the owner to recover tokens sent to the contract by mistake
     * @param _token: token address
     * @param _amount: token amount
     * @dev Callable by owner
     */
    function recoverToken(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(cakeToken), "Recover: Cannot be Cake token");

        IERC20(_token).safeTransfer(address(msg.sender), _amount);

        emit TokenRecovery(_token, _amount);
    }

    /**
     * @notice Allows the owner to set the Operator address (to run Auction rounds)
     * @param _operatorAddress: address of the new operator
     * @dev Callable by owner
     */
    function setOperatorAddress(address _operatorAddress) external onlyOwner {
        require(_operatorAddress != address(0), "Management: Cannot be zero address");

        operatorAddress = _operatorAddress;

        emit NewOperatorAddress(_operatorAddress);
    }

    /**
     * @notice Allows the owner to change the maximal length (denominated in block) for an auction round
     * @param _maxAuctionLength: amount of blocks, for an auction
     * @dev Callable by owner
     */
    function setMaxAuctionLength(uint256 _maxAuctionLength) external onlyOperator {
        require((currentAuctionId == 0) || (auctions[currentAuctionId].status == Status.Close), "Auction: In progress");
        require(_maxAuctionLength > 0, "Auction: Length cannot be zero");
        require(_maxAuctionLength <= 86400, "Auction: Cannot be longer than three days (86,400 blocks)");

        maxAuctionLength = _maxAuctionLength;

        emit NewMaxAuctionLength(_maxAuctionLength);
    }

    /**
     * @notice View list of auctions
     * @param cursor: cursor
     * @param size: size
     */
    function viewAuctions(uint256 cursor, uint256 size) external view returns (Auction[] memory, uint256) {
        uint256 length = size;
        if (length > currentAuctionId - cursor) {
            length = currentAuctionId - cursor;
        }

        Auction[] memory values = new Auction[](length);
        for (uint256 i = 0; i < length; i++) {
            values[i] = auctions[cursor + i + 1];
        }

        return (values, cursor + length);
    }

    /**
     * @notice View list of whitelisted addresses (a.k.a. bidders)
     * @param cursor: cursor
     * @param size: size
     */
    function viewBidders(uint256 cursor, uint256 size) external view returns (address[] memory, uint256) {
        uint256 length = size;
        uint256 biddersLength = bidders.length();
        if (length > biddersLength - cursor) {
            length = biddersLength - cursor;
        }

        address[] memory values = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            values[i] = bidders.at(cursor + i);
        }

        return (values, cursor + length);
    }

    /**
     * @notice View list of current bidders and bid amount for an auction round
     * @param auctionId: auction id
     * @param cursor: cursor
     * @param size: size
     */
    function viewBidsPerAuction(
        uint256 auctionId,
        uint256 cursor,
        uint256 size
    ) external view returns (Bid[] memory, uint256) {
        uint256 length = size;
        uint256 biddersLength = _auctionBidders[auctionId].length();
        if (length > biddersLength - cursor) {
            length = biddersLength - cursor;
        }

        Bid[] memory values = new Bid[](length);
        for (uint256 i = 0; i < length; i++) {
            address account = _auctionBidders[auctionId].at(cursor + i);
            uint256 amount = auctionBids[auctionId][account].totalAmount;
            bool claimed = auctionBids[auctionId][account].hasClaimed;

            values[i] = Bid({account: account, amount: amount, hasClaimed: claimed});
        }

        return (values, cursor + length);
    }

    /**
     * @notice Get the claimable status of a specific bid, for a given auction and bidder
     * @param auctionId: auction id
     * @param bidder: address of bidder
     */
    function claimable(uint256 auctionId, address bidder) external view returns (bool) {
        Auction memory auction = auctions[auctionId];
        BidInfo memory bidInfo = auctionBids[auctionId][bidder];

        return
            block.number > auction.endBlock &&
            auction.status == Status.Close &&
            bidInfo.totalAmount != 0 &&
            bidInfo.totalAmount < auction.leaderboardThreshold &&
            !bidInfo.hasClaimed;
    }

    /**
     * @notice Get the whitelisted status of a specific bidder
     * @param bidder: address of bidder
     */
    function whitelisted(address bidder) external view returns (bool) {
        return bidders.contains(bidder);
    }

    /**
     * @notice View list of participated auctions, along with bids for a bidder
     * @param bidder: address of bidder
     * @param cursor: cursor
     * @param size: size
     */
    function viewBidderAuctions(
        address bidder,
        uint256 cursor,
        uint256 size
    )
        external
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory,
            uint256
        )
    {
        uint256 length = size;
        if (length > _bidderAuctions[bidder].length - cursor) {
            length = _bidderAuctions[bidder].length - cursor;
        }

        uint256[] memory auctionIds = new uint256[](length);
        uint256[] memory bids = new uint256[](length);
        bool[] memory claimed = new bool[](length);

        for (uint256 i = 0; i < length; i++) {
            auctionIds[i] = _bidderAuctions[bidder][cursor + i];
            bids[i] = auctionBids[auctionIds[i]][bidder].totalAmount;
            claimed[i] = auctionBids[auctionIds[i]][bidder].hasClaimed;
        }

        return (auctionIds, bids, claimed, cursor + length);
    }
}
