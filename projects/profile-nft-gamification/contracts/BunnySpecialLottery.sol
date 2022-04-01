// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IPancakeSwapLottery} from "lottery/contracts/interfaces/IPancakeSwapLottery.sol";
import {BunnyMintingStation} from "./BunnyMintingStation.sol";
import {PancakeProfile} from "./PancakeProfile.sol";

contract BunnySpecialLottery is Ownable {
    /*** Contracts ***/

    IPancakeSwapLottery public pancakeSwapLottery;
    BunnyMintingStation public bunnyMintingStation;
    PancakeProfile public pancakeProfile;

    /*** Storage ***/

    uint8 constant nftId1 = 18;
    uint8 constant nftId2 = 19;
    uint8 constant nftId3 = 20;

    uint256 public endBlock; // End of the distribution
    uint256 public startLotteryRound;
    uint256 public finalLotteryRound;

    mapping(uint8 => uint256) public campaignIds;
    mapping(uint8 => uint256) public numberPoints;
    mapping(uint8 => string) public tokenURIs;
    mapping(address => bool) public userWhitelistForNft3;
    mapping(address => mapping(uint8 => bool)) public hasClaimed;

    /*** Events ***/

    event BunnyMint(address indexed to, uint256 indexed tokenId, uint8 indexed bunnyId);
    event NewAddressWhitelisted(address[] users);
    event NewCampaignId(uint8 bunnyId, uint256 campaignId);
    event NewEndBlock(uint256 endBlock);
    event NewLotteryRounds(uint256 startLotteryRound, uint256 finalLotteryRound);
    event NewNumberPoints(uint8 bunnyId, uint256 numberPoints);
    event NewTokenURI(uint8 bunnyId, string tokenURI);

    /*** Constructor ***/

    constructor(
        address _pancakeSwapLotteryAddress,
        address _bunnyMintingStationAddress,
        address _pancakeProfileAddress,
        uint256 _endBlock,
        string memory _tokenURI1,
        string memory _tokenURI2,
        string memory _tokenURI3,
        uint256 _numberPoints1,
        uint256 _numberPoints2,
        uint256 _numberPoints3,
        uint256 _campaignId1,
        uint256 _campaignId2,
        uint256 _campaignId3,
        uint256 _startLotteryRound,
        uint256 _finalLotteryRound
    ) public {
        pancakeSwapLottery = IPancakeSwapLottery(_pancakeSwapLotteryAddress);
        bunnyMintingStation = BunnyMintingStation(_bunnyMintingStationAddress);
        pancakeProfile = PancakeProfile(_pancakeProfileAddress);

        endBlock = _endBlock;

        tokenURIs[nftId1] = _tokenURI1;
        tokenURIs[nftId2] = _tokenURI2;
        tokenURIs[nftId3] = _tokenURI3;

        numberPoints[nftId1] = _numberPoints1;
        numberPoints[nftId2] = _numberPoints2;
        numberPoints[nftId3] = _numberPoints3;

        campaignIds[nftId1] = _campaignId1;
        campaignIds[nftId2] = _campaignId2;
        campaignIds[nftId3] = _campaignId3;

        startLotteryRound = _startLotteryRound;
        finalLotteryRound = _finalLotteryRound;
    }

    modifier validNftId(uint8 _bunnyId) {
        require(_bunnyId >= nftId1 && _bunnyId <= nftId3, "NFT: Id out of range");
        _;
    }

    /*** External ***/

    /**
     * @notice Mint a NFT from the BunnyMintingStation contract.
     * @dev Users can claim once. It maps to the teamId.
     * @param _lotteryId See _canClaim documentation
     * @param _cursor See _canClaim documentation
     */
    function mintNFT(
        uint8 _bunnyId,
        uint256 _lotteryId,
        uint256 _cursor
    ) external validNftId(_bunnyId) {
        require(_canClaim(msg.sender, _bunnyId, _lotteryId, _cursor), "User: Not eligible");

        hasClaimed[msg.sender][_bunnyId] = true;

        // Mint collectible and send it to the user.
        uint256 tokenId = bunnyMintingStation.mintCollectible(msg.sender, tokenURIs[_bunnyId], _bunnyId);

        // Increase point on PancakeSwap profile, for a given campaignId.
        pancakeProfile.increaseUserPoints(msg.sender, numberPoints[_bunnyId], campaignIds[_bunnyId]);

        emit BunnyMint(msg.sender, tokenId, _bunnyId);
    }

    /**
     * @notice Check if a user can claim NFT1
     * @dev External function are cheaper than public. Helpers for external calls only.
     * @param _lotteryId See _canClaim documentation
     */
    function canClaimNft1(address _userAddress, uint256 _lotteryId) external view returns (bool) {
        return _canClaim(_userAddress, nftId1, _lotteryId, 0);
    }

    /**
     * @notice Check if a user can claim NFT2
     * @dev External function are cheaper than public. Helpers for external calls only.
     * @param _lotteryId See _canClaim documentation
     * @param _cursor See _canClaim documentation
     */
    function canClaimNft2(
        address _userAddress,
        uint256 _lotteryId,
        uint256 _cursor
    ) external view returns (bool) {
        return _canClaim(_userAddress, nftId2, _lotteryId, _cursor);
    }

    /**
     * @notice Check if a user can claim NFT3
     * @dev External function are cheaper than public. Helpers for external calls only.
     */
    function canClaimNft3(address _userAddress) external view returns (bool) {
        return _canClaim(_userAddress, nftId3, startLotteryRound, 0);
    }

    /*** External - Owner ***/

    /**
     * @notice Change end block for distribution
     * @dev Only callable by owner.
     */
    function changeEndBlock(uint256 _endBlock) external onlyOwner {
        endBlock = _endBlock;
        emit NewEndBlock(_endBlock);
    }

    /**
     * @notice Change the campaignId for PancakeSwap Profile.
     * @dev Only callable by owner.
     */
    function changeCampaignId(uint8 _bunnyId, uint256 _campaignId) external onlyOwner validNftId(_bunnyId) {
        campaignIds[_bunnyId] = _campaignId;
        emit NewCampaignId(_bunnyId, _campaignId);
    }

    /**
     * @notice Change the number of points for PancakeSwap Profile.
     * @dev Only callable by owner.
     */
    function changeNumberPoints(uint8 _bunnyId, uint256 _numberPoints) external onlyOwner validNftId(_bunnyId) {
        numberPoints[_bunnyId] = _numberPoints;
        emit NewNumberPoints(_bunnyId, _numberPoints);
    }

    /**
     * @notice Change the start and final round of the lottery.
     * @dev Only callable by owner.
     */
    function changeLotteryRounds(uint256 _startLotteryRound, uint256 _finalLotteryRound) external onlyOwner {
        require(_startLotteryRound < _finalLotteryRound, "Round: startLotteryRound > finalLotteryRound");
        startLotteryRound = _startLotteryRound;
        finalLotteryRound = _finalLotteryRound;
        emit NewLotteryRounds(_startLotteryRound, _finalLotteryRound);
    }

    /**
     * @notice Change the token uri of a nft
     * @dev Only callable by owner.
     */
    function changeTokenURI(uint8 _bunnyId, string calldata _tokenURI) external onlyOwner validNftId(_bunnyId) {
        tokenURIs[_bunnyId] = _tokenURI;
        emit NewTokenURI(_bunnyId, _tokenURI);
    }

    /**
     * @notice Whitelist a user address. Whitelisted address can claim the NFT 3.
     * @dev Only callable by owner.
     */
    function whitelistAddresses(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            userWhitelistForNft3[_users[i]] = true;
        }
        emit NewAddressWhitelisted(_users);
    }

    /*** Internal ***/

    /**
     * @notice Check if a user can claim.
     * @dev In order to reduce the gas spent during the minting, this function takes a lotteryId (avoid looping on all the lotteries),
            and a cursor (avoid looping on all the user tickets for a specific lottery). Theses info are easily 
            accessible by the FE.
     * @param _lotteryId Id of the lottery to check against
     * @param _cursor Cursor position of ticket to check against
     */
    function _canClaim(
        address _userAddress,
        uint8 _bunnyId,
        uint256 _lotteryId,
        uint256 _cursor
    ) internal view returns (bool) {
        // Common requirements for being able to claim any NFT
        if (
            hasClaimed[_userAddress][_bunnyId] ||
            !pancakeProfile.getUserStatus(_userAddress) ||
            block.number >= endBlock ||
            _lotteryId < startLotteryRound ||
            _lotteryId > finalLotteryRound
        ) {
            return false;
        }

        if (_bunnyId == nftId1) {
            uint256 size;
            (, , , size) = pancakeSwapLottery.viewUserInfoForLotteryId(_userAddress, _lotteryId, 0, 1);
            return size > 0;
        }
        if (_bunnyId == nftId2) {
            bool[] memory ticketStatuses;
            uint256 size;

            (, , ticketStatuses, size) = pancakeSwapLottery.viewUserInfoForLotteryId(
                _userAddress,
                _lotteryId,
                _cursor,
                1
            );

            return size > 0 && ticketStatuses[0];
        }
        if (_bunnyId == nftId3) {
            return userWhitelistForNft3[_userAddress];
        }
    }
}
