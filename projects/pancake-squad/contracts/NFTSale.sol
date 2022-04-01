// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {VRFConsumerBase} from "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

import {IPancakeProfile} from "./interfaces/IPancakeProfile.sol";
import {PancakeSquad} from "./PancakeSquad.sol";

/**
 * @title NFTSale for PancakeSquad
 * @notice It distributes the PancakeSquad based on a ticketIds.
 */
contract NFTSale is VRFConsumerBase, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    enum Status {
        Pending, // Contract is deployed
        Premint, // Tickets are preminted by operator
        Presale, // Tickets are bought by Gen0 users
        Sale, // Tickets are for sold in general sale
        DrawingRandomness, // Randomness has been called
        Claim // Tickets are claimed for the NFTs
    }

    IERC20 public immutable cakeToken;
    IPancakeProfile public immutable pancakeProfile;
    PancakeSquad public immutable pancakeSquad;

    uint256 public immutable maxReserveSupply; // max supply that can be minted by contract owner
    uint256 public immutable maxSupply; // max supply

    Status public currentStatus; // Status of the sale

    address public operator;

    uint256 public maxPerAddress; // maximum per address
    uint256 public maxPerTransaction; // maximum per transaction

    bytes32 public keyHash; // key hash for the VRF
    bytes32 public latestRequestId; // latest request id for Chainlink
    uint256 public fee; // fee in LINK

    uint256 public pricePerTicket; // price per ticket in CAKE
    uint256 public randomOffsetNumber; // for offsetting with randomness
    uint256 public startTimestamp; // start timestamp for the public sale
    uint256 public totalTicketsDistributed; // total tickets distributed at a given point of ticket

    // Map number of tickets available to be used for gen0 presale
    mapping(address => uint256) public numberTicketsForGen0;

    // Map number of tickets used for gen0 presale
    mapping(address => uint256) public numberTicketsUsedForGen0;

    // Keep track of an array of ticketIds for a user address
    mapping(address => EnumerableSet.UintSet) private _ticketIdsOfUser;

    modifier onlyOperator() {
        require(msg.sender == operator, "Operations: Not operator");
        _;
    }

    event AddressesWhitelisted(address[] users, uint256[] numberTickets);
    event AddressesUnwhitelisted(address[] users);
    event Claim(uint256 amount);
    event Mint(address indexed user, uint256 numberTokens);
    event NewOperator(address indexed operator);
    event NewPricePerTicket(uint256 pricePerTicket);
    event NewSaleProperties(uint256 startTimestamp, uint256 maxPerAddress, uint256 maxPerTransaction);
    event RandomnessRequest(bytes32 latestRequestId, Status currentStatus);
    event SaleStatusUpdate(Status newStatus);
    event TicketsDistributed(address indexed user, uint256 numberTickets);
    event TokenRecovery(address indexed token, uint256 amount);

    /**
     * @notice Constructor
     * @param _pancakeSquad: PancakeSquad address
     * @param _maxReserveSupply: NFT max reserve for the premint by the owner
     * @param _pricePerTicket: price per ticket
     * @param _cakeToken: CAKE Token address
     * @param _pancakeProfile: Pancake Profile address
     * @param _vrfCoordinator: address of the VRF coordinator
     * @param _linkToken: address of the LINK token
     * @dev https://docs.chain.link/docs/vrf-contracts/
     * @dev PancakeSquad must be deployed before.
     */
    constructor(
        address _pancakeSquad,
        uint256 _maxReserveSupply,
        uint256 _pricePerTicket,
        address _cakeToken,
        address _pancakeProfile,
        address _operator,
        address _vrfCoordinator,
        address _linkToken
    ) VRFConsumerBase(_vrfCoordinator, _linkToken) {
        require(
            _maxReserveSupply < PancakeSquad(_pancakeSquad).maxSupply(),
            "Operations: maxReserveSupply must be inferior to maxSupply"
        );

        pancakeSquad = PancakeSquad(_pancakeSquad);
        maxReserveSupply = _maxReserveSupply;
        maxSupply = PancakeSquad(_pancakeSquad).maxSupply();
        pricePerTicket = _pricePerTicket;

        // Call to verify the address is correct
        IERC20(_cakeToken).totalSupply();
        cakeToken = IERC20(_cakeToken);

        // Call to verify the address is correct
        IPancakeProfile(_pancakeProfile).getTeamProfile(1);
        pancakeProfile = IPancakeProfile(_pancakeProfile);
        operator = _operator;
    }

    /**
     * @notice Buy tickets in the normal sale
     * @param _numberTickets: number of the tickets purchased
     */
    function buyTickets(uint256 _numberTickets) external nonReentrant {
        require(currentStatus == Status.Sale, "Status: Must be in sale");
        require(pancakeProfile.getUserStatus(msg.sender), "Tickets: User is not eligible");
        require(block.timestamp >= startTimestamp, "Tickets: Too early to buy");
        require(_numberTickets != 0, "Tickets: Cannot buy zero");
        require(_numberTickets <= maxPerTransaction, "Tickets: Max supply per batch reached");
        require(totalTicketsDistributed < maxSupply, "Tickets: Max supply reached");

        uint256 numberTicketsLeft = _numberTickets;

        if (numberTicketsLeft > maxSupply - totalTicketsDistributed) {
            numberTicketsLeft = maxSupply - totalTicketsDistributed;
        }

        // Calculate adjusted max per address (if gen0 tokens were minted)
        uint256 adjustedMaxPerAddress = maxPerAddress + numberTicketsUsedForGen0[msg.sender];

        require(
            (_ticketIdsOfUser[msg.sender].length() + numberTicketsLeft) <= adjustedMaxPerAddress,
            "Tickets: Max supply per address reached"
        );

        // Calculate total price in CAKE tokens
        uint256 totalPriceInCake = numberTicketsLeft * pricePerTicket;

        // Transfer to this contract
        cakeToken.safeTransferFrom(address(msg.sender), address(this), totalPriceInCake);

        // Add the tickets
        for (uint256 i = 0; i < numberTicketsLeft; i++) {
            _ticketIdsOfUser[msg.sender].add(totalTicketsDistributed + i);
        }

        totalTicketsDistributed += numberTicketsLeft;

        emit TicketsDistributed(msg.sender, numberTicketsLeft);
    }

    /**
     * @notice Buy tickets (in presale)
     * @param _numberTickets: number of tickets to buy
     */
    function buyTicketsInPreSaleForGen0(uint256 _numberTickets) external nonReentrant {
        require(currentStatus == Status.Presale, "Status: Must be in presale");
        require(_numberTickets != 0, "Tickets: Cannot buy zero");
        require(numberTicketsForGen0[msg.sender] >= _numberTickets, "Tickets: Number of tickets too high");

        numberTicketsUsedForGen0[msg.sender] += _numberTickets;
        numberTicketsForGen0[msg.sender] -= _numberTickets;

        uint256 totalPriceInCake = _numberTickets * pricePerTicket;

        // Transfer to this contract
        cakeToken.safeTransferFrom(address(msg.sender), address(this), totalPriceInCake);

        for (uint256 i = 0; i < _numberTickets; i++) {
            _ticketIdsOfUser[msg.sender].add(totalTicketsDistributed + i);
        }

        totalTicketsDistributed += _numberTickets;

        emit TicketsDistributed(msg.sender, _numberTickets);
    }

    /**
     * @notice Mint one or multiple PancakeSquad NFT (based on the user tickets)
     * @param _ticketIds: _ticketIds
     */
    function mint(uint256[] calldata _ticketIds) external nonReentrant {
        require(currentStatus == Status.Claim, "Status: Must be in claim");
        require(_ticketIds.length != 0, "Mint: Must be greater than 0");

        for (uint256 i = 0; i < _ticketIds.length; i++) {
            require(_ticketIdsOfUser[msg.sender].contains(_ticketIds[i]), "Mint: TicketId not belonging to user");
            _ticketIdsOfUser[msg.sender].remove(_ticketIds[i]);
            uint256 tokenIdToMint = calculateTokenId(_ticketIds[i]);
            pancakeSquad.mint(address(msg.sender), tokenIdToMint);
        }

        emit Mint(msg.sender, _ticketIds.length);
    }

    /**
     * @notice Allows the operator to draw randomness
     * @dev Callable by operator
     */
    function drawRandomness() external onlyOperator {
        require(
            currentStatus == Status.Pending || currentStatus == Status.DrawingRandomness,
            "Status: Wrong sale status"
        );
        require(keyHash != bytes32(0), "Operations: Must have valid key hash");
        require(LINK.balanceOf(address(this)) >= fee, "Operations: Not enough LINK tokens");

        latestRequestId = requestRandomness(keyHash, fee);

        emit RandomnessRequest(latestRequestId, currentStatus);
    }

    /**
     * @notice Mint the reserve supply of PancakeSquad NFT
     * @dev Callable by operator
     * @param _numberTickets: number of tickets to obtain
     */
    function getReserveTickets(uint256 _numberTickets) external onlyOperator nonReentrant {
        require(currentStatus == Status.Premint, "Status: Must be in premint");
        require(_numberTickets != 0, "Tickets: Cannot buy zero");

        require(
            (_ticketIdsOfUser[msg.sender].length() + _numberTickets) <= maxReserveSupply,
            "Operations: Must be inferior to maxReserveSupply"
        );

        for (uint256 i = 0; i < _numberTickets; i++) {
            _ticketIdsOfUser[msg.sender].add(totalTicketsDistributed + i);
        }

        totalTicketsDistributed += _numberTickets;

        emit TicketsDistributed(msg.sender, _numberTickets);
    }

    /**
     * @notice Set baseURI
     * @param _uri: base uri for the PancakeSquad collection
     * @dev Callable by operator
     */
    function setBaseURI(string memory _uri) external onlyOperator {
        pancakeSquad.setBaseURI(_uri);
    }

    /**
     * @notice Change the fee and keyHash
     * @param _fee: new fee (in LINK)
     * @param _keyHash: keyhash for Chainlink
     * @dev Callable by operator
     */
    function setFeeAndKeyHash(uint256 _fee, bytes32 _keyHash) external onlyOperator {
        fee = _fee;
        keyHash = _keyHash;
    }

    /**
     * @notice Set the sale properties for the mint phase
     * @param _startTimestamp: start timestamp, up to seconds
     * @param _maxPerAddress: max per address
     * @param _maxPerTransaction: max amount of NFT to mint per single transaction
     * @dev Callable by operator
     */
    function setSaleProperties(
        uint256 _startTimestamp,
        uint256 _maxPerAddress,
        uint256 _maxPerTransaction
    ) external onlyOperator {
        require(
            (currentStatus == Status.Presale) || (block.timestamp < startTimestamp),
            "Operations: Status must be in presale or sale has started"
        );

        require(block.timestamp < _startTimestamp, "Operations: Cannot set startTimestamp before current time");

        startTimestamp = _startTimestamp;
        maxPerAddress = _maxPerAddress;
        maxPerTransaction = _maxPerTransaction;

        emit NewSaleProperties(_startTimestamp, _maxPerAddress, _maxPerTransaction);
    }

    /**
     * @notice Change the ticket price before the presale starts
     * @dev Callable by operator
     * @param _pricePerTicket: ticket price
     */
    function setTicketPrice(uint256 _pricePerTicket) external onlyOperator {
        require((currentStatus == Status.Pending) || (currentStatus == Status.Premint), "Status: Must be pending");

        pricePerTicket = _pricePerTicket;

        emit NewPricePerTicket(_pricePerTicket);
    }

    /**
     * @notice It allows the owner to change the sale status before randomness
     * @dev Callable by operator
     * @param _status: sale status (uint8)
     */
    function updateSaleStatus(Status _status) external onlyOperator {
        require((_status != Status.Claim) && (_status != Status.Pending), "Status: Cannot be set to Pending or Claim");

        if (_status == Status.Premint) {
            require(currentStatus == Status.Pending, "Status: Must be in pending");
        } else if (_status == Status.Presale) {
            require(currentStatus == Status.Premint, "Status: Must be in premint");
        } else if (_status == Status.Sale) {
            require(currentStatus == Status.Presale, "Status: Must be in presale");
            require(
                block.timestamp + 10 minutes <= startTimestamp,
                "Operations: startTimestamp is too close or has passed"
            );
            require(block.timestamp + 1 days >= startTimestamp, "Operations: startTimestamp is too far");
        } else if (_status == Status.DrawingRandomness) {
            require(currentStatus == Status.Sale, "Status: Must be in sale");
            require(totalTicketsDistributed == maxSupply, "Operations: Total tickets distributed must equal maxSupply");
        }

        currentStatus = _status;

        emit SaleStatusUpdate(_status);
    }

    /**
     * @notice Whitelist a list of addresses with number of tickets to receive.
     * @dev Callable by operator
     * @param _users: list of user addresses
     * @param _numberTickets: number of tickets for gen0 of each user whitelisted
     */
    function whitelistAddresses(address[] calldata _users, uint256[] calldata _numberTickets) external onlyOperator {
        require(
            (currentStatus == Status.Pending) || (currentStatus == Status.Premint) || (currentStatus == Status.Presale),
            "Status: Must not in sale or after"
        );

        require(_users.length == _numberTickets.length, "Operations: Lengths must match");

        for (uint256 i = 0; i < _users.length; i++) {
            numberTicketsForGen0[_users[i]] = _numberTickets[i];
        }

        emit AddressesWhitelisted(_users, _numberTickets);
    }

    /**
     * @notice Unwhitelist a list of addresses.
     * @dev Callable by operator
     * @param _users: list of user addresses
     */
    function unwhitelistAddresses(address[] calldata _users) external onlyOperator {
        require(
            (currentStatus == Status.Pending) || (currentStatus == Status.Premint) || (currentStatus == Status.Presale),
            "Status: Must not in sale or after"
        );

        for (uint256 i = 0; i < _users.length; i++) {
            numberTicketsForGen0[_users[i]] = 0;
        }

        emit AddressesUnwhitelisted(_users);
    }

    /**
     * @notice Transfers the ownership of the NFT contract.
     * Can only be called once all tokens are minted.
     * @param _newOwner: new owner address
     * @dev Callable by owner
     */
    function changeOwnershipPancakeSquad(address _newOwner) external onlyOwner {
        require(currentStatus == Status.Claim, "Status: Must be in claim");
        require(pancakeSquad.totalSupply() == maxSupply, "Operations: All tokens must be minted");

        pancakeSquad.transferOwnership(_newOwner);
    }

    /**
     * @notice Allows the owner to claim CAKE from the mint phase
     * @dev Callable by owner
     */
    function claim() external onlyOwner {
        require(currentStatus == Status.Claim, "Status: Must be in claim");

        uint256 balance = cakeToken.balanceOf(address(this));
        require(balance != 0, "Operations: Cannot transfer zero balance");

        cakeToken.safeTransfer(address(msg.sender), balance);

        emit Claim(balance);
    }

    /**
     * @notice Lock for changes in URI
     * @dev Callable by owner
     */
    function lock() external onlyOwner {
        require(currentStatus == Status.Claim, "Status: Must be in claim");
        pancakeSquad.lock();
    }

    /**
     * @notice Allows the owner to recover tokens sent to the contract by mistake
     * @param _token: token address
     * @dev Callable by owner
     */
    function recoverToken(address _token) external onlyOwner nonReentrant {
        require(_token != address(cakeToken), "Operations: Cannot recover CAKE");
        uint256 balance = IERC20(_token).balanceOf(address(this));

        require(balance != 0, "Operations: Cannot recover zero balance");

        IERC20(_token).safeTransfer(address(msg.sender), balance);

        emit TokenRecovery(_token, balance);
    }

    /**
     * @notice Set operator address
     * @dev Callable by owner
     * @param _operator: address of the operator
     */
    function setOperatorAddress(address _operator) external onlyOwner {
        require(_operator != address(0), "Operations: Cannot be zero address");
        require(_ticketIdsOfUser[operator].length() == 0, "Operations: Cannot change operator");

        operator = _operator;

        emit NewOperator(_operator);
    }

    /**
     * @notice Returns whether a user can claim for gen0
     * @param user: address of the user
     */
    function canClaimForGen0(address user) external view returns (bool) {
        return (currentStatus == Status.Presale) && (numberTicketsForGen0[user] != 0);
    }

    /**
     * @notice Returns number of tickets of a user
     * @param user: address of the user
     */
    function viewNumberTicketsOfUser(address user) external view returns (uint256) {
        return _ticketIdsOfUser[user].length();
    }

    /**
     * @notice Returns a list of token IDs owned by `user` given a `cursor` and `size` of its token list
     * @param user: address
     * @param cursor: cursor
     * @param size: size
     */
    function ticketsOfUserBySize(
        address user,
        uint256 cursor,
        uint256 size
    ) external view returns (uint256[] memory, uint256) {
        uint256 length = size;
        if (length > _ticketIdsOfUser[user].length() - cursor) {
            length = _ticketIdsOfUser[user].length() - cursor;
        }

        uint256[] memory values = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            values[i] = _ticketIdsOfUser[user].at(cursor + i);
        }

        return (values, cursor + length);
    }

    /**
     * @notice Calculate tokenId for ticketId
     * @param _ticketId: ticketId
     */
    function calculateTokenId(uint256 _ticketId) public view returns (uint256) {
        if (maxSupply <= (randomOffsetNumber + _ticketId)) {
            return (randomOffsetNumber + _ticketId) - maxSupply;
        } else {
            return randomOffsetNumber + _ticketId;
        }
    }

    /**
     * @notice Callback function used by Chainlink's VRF Coordinator
     * @param requestId: requestId
     * @param randomness: randomness
     */
    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
        require(
            currentStatus == Status.Pending || currentStatus == Status.DrawingRandomness,
            "Chainlink: Wrong sale status"
        );
        require(latestRequestId == requestId, "Chainlink: Wrong requestId");
        randomOffsetNumber = uint256(randomness % maxSupply);

        // It allows verifying the VRF works before the sale
        if (currentStatus == Status.DrawingRandomness) {
            currentStatus = Status.Claim;

            emit SaleStatusUpdate(currentStatus);
        }
    }
}
