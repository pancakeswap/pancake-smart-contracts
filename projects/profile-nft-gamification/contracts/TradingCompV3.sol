// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

import "./interfaces/IPancakeProfile.sol";
import "./BunnyMintingStation.sol";

/** @title TradingCompV3.
@notice It is a contract for users to collect points
based on off-chain events
*/
contract TradingCompV3 is Ownable, ERC721Holder {
    using SafeBEP20 for IBEP20;

    BunnyMintingStation public immutable bunnyMintingStation;
    IBEP20 public immutable cakeToken;
    IBEP20 public immutable moboxToken;
    IBEP20 public immutable moboxMisteryBoxToken;
    IERC721Enumerable public moboxAvatarNFTCollection;

    IPancakeProfile public immutable pancakeProfile;

    uint256 public constant numberTeams = 3;

    uint256 public competitionId;
    uint8 public bunnyId;
    uint256 public winningTeamId; // set to 0 as default
    string public bunnyTokenURI;

    enum CompetitionStatus {
        Registration,
        Open,
        Close,
        Claiming,
        Over
    }

    CompetitionStatus public currentStatus;

    mapping(address => UserStats) public userTradingStats;

    mapping(uint256 => CompetitionRewards) private _rewardCompetitions;

    struct CompetitionRewards {
        uint256[5] userCampaignId; // campaignId for user increase
        uint256[5] cakeRewards; // cake rewards per group
        uint256[5] moboxRewards; // cake rewards per group
        uint256[5] pointUsers; // number of points per user
    }

    struct UserStats {
        uint256 rewardGroup; // 0 - 4 --> (Teal - 0, Purple - 1, Bronze - 2, Silver - 3, Gold - 4)
        uint256 teamId; // 1 - 3
        bool canClaimMysteryBox; // true or false
        bool hasRegistered; // true or false
        bool hasClaimed; // true or false
    }

    event NewCompetitionStatus(CompetitionStatus status, uint256 competitionId);
    event TeamRewardsUpdate(uint256 teamId, uint256 competitionId);
    event UserRegister(address userAddress, uint256 teamId, uint256 competitionId);
    event UserUpdateMultiple(address[] userAddresses, uint256 rewardGroup, uint256 competitionId);
    event UserUpdateMultipleMobox(address[] userAddresses, bool canClaimMysteryBox, uint256 competitionId);
    event WinningTeam(uint256 teamId, uint256 competitionId);

    /**
     * @notice It initializes the contract.
     * @param _pancakeProfileAddress: PancakeProfile address
     * @param _bunnyStationAddress: BunnyMintingStation address
     * @param _cakeTokenAddress: the address of the CAKE token
     * @param _moboxTokenAddress: the address of the MOBOX token
     * @param _moboxMisteryBoxTokenAddress: the address of the MOBOX mystery box token
     * @param _competitionId: competition uniq id
     */
    constructor(
        address _pancakeProfileAddress,
        address _bunnyStationAddress,
        address _cakeTokenAddress,
        address _moboxTokenAddress,
        address _moboxMisteryBoxTokenAddress,
        uint256 _competitionId
    ) public {
        pancakeProfile = IPancakeProfile(_pancakeProfileAddress);
        bunnyMintingStation = BunnyMintingStation(_bunnyStationAddress);
        cakeToken = IBEP20(_cakeTokenAddress);
        moboxToken = IBEP20(_moboxTokenAddress);
        moboxMisteryBoxToken = IBEP20(_moboxMisteryBoxTokenAddress);
        competitionId = _competitionId;
        currentStatus = CompetitionStatus.Registration;
    }

    function setMoboxAvatarCollectionAddress(address _moboxAvatarCollectionAddress) external onlyOwner {
        require(address(moboxAvatarNFTCollection) == address(0), "ADDRESS_ALREADY_SET");

        moboxAvatarNFTCollection = IERC721Enumerable(_moboxAvatarCollectionAddress);
    }

    /**
     * @notice It allows users to claim reward after the end of trading competition.
     * @dev It is only available during claiming phase
     */
    function claimReward() external {
        address senderAddress = _msgSender();

        require(userTradingStats[senderAddress].hasRegistered, "NOT_REGISTERED");
        require(!userTradingStats[senderAddress].hasClaimed, "HAS_CLAIMED");
        require(currentStatus == CompetitionStatus.Claiming, "NOT_IN_CLAIMING");

        uint256 registeredUserTeamId = userTradingStats[senderAddress].teamId;
        bool isUserActive;
        uint256 userTeamId;
        (, , userTeamId, , , isUserActive) = pancakeProfile.getUserProfile(senderAddress);

        require(isUserActive, "NOT_ACTIVE");
        require(userTeamId == registeredUserTeamId, "USER_TEAM_HAS_CHANGED");

        userTradingStats[senderAddress].hasClaimed = true;

        uint256 userRewardGroup = userTradingStats[senderAddress].rewardGroup;
        bool canClaimMysteryBox = userTradingStats[senderAddress].canClaimMysteryBox;

        CompetitionRewards memory userRewards = _rewardCompetitions[registeredUserTeamId];

        if (userRewardGroup > 0) {
            cakeToken.safeTransfer(senderAddress, userRewards.cakeRewards[userRewardGroup]);
            moboxToken.safeTransfer(senderAddress, userRewards.moboxRewards[userRewardGroup]);

            // TOP 100 users
            if (userRewardGroup > 1) {
                bunnyMintingStation.mintCollectible(senderAddress, bunnyTokenURI, bunnyId);
                uint256 tokenId = moboxAvatarNFTCollection.tokenOfOwnerByIndex(address(this), 0);
                moboxAvatarNFTCollection.safeTransferFrom(address(this), senderAddress, tokenId);
            }
            if (canClaimMysteryBox) {
                // send 1 mystery box token. 18 decimals
                moboxMisteryBoxToken.safeTransfer(senderAddress, 1e18);
            }
        }

        // User collects points
        pancakeProfile.increaseUserPoints(
            senderAddress,
            userRewards.pointUsers[userRewardGroup],
            userRewards.userCampaignId[userRewardGroup]
        );
    }

    /**
     * @notice It allows users to register for trading competition
     * @dev Only callable if the user has an active PancakeProfile.
     */
    function register() external {
        address senderAddress = _msgSender();

        // 1. Checks if user has registered
        require(!userTradingStats[senderAddress].hasRegistered, "HAS_REGISTERED");

        // 2. Check whether it is joinable
        require(currentStatus == CompetitionStatus.Registration, "NOT_IN_REGISTRATION");

        // 3. Check if active and records the teamId
        uint256 userTeamId;
        bool isUserActive;

        (, , userTeamId, , , isUserActive) = pancakeProfile.getUserProfile(senderAddress);

        require(isUserActive, "NOT_ACTIVE");

        // 4. Write in storage user stats for the registered user
        UserStats storage newUserStats = userTradingStats[senderAddress];
        newUserStats.teamId = userTeamId;
        newUserStats.hasRegistered = true;

        emit UserRegister(senderAddress, userTeamId, competitionId);
    }

    /**
     * @notice It allows the owner to change the competition status
     * @dev Only callable by owner.
     * @param _status: CompetitionStatus (uint8)
     */
    function updateCompetitionStatus(CompetitionStatus _status) external onlyOwner {
        require(_status != CompetitionStatus.Registration, "IN_REGISTRATION");

        if (_status == CompetitionStatus.Open) {
            require(currentStatus == CompetitionStatus.Registration, "NOT_IN_REGISTRATION");
        } else if (_status == CompetitionStatus.Close) {
            require(currentStatus == CompetitionStatus.Open, "NOT_OPEN");
        } else if (_status == CompetitionStatus.Claiming) {
            require(winningTeamId > 0, "WINNING_TEAM_NOT_SET");
            require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        } else {
            require(currentStatus == CompetitionStatus.Claiming, "NOT_CLAIMING");
        }

        currentStatus = _status;

        emit NewCompetitionStatus(currentStatus, competitionId);
    }

    /**
     * @notice It allows the owner to claim the CAKE remainder
     * @dev Only callable by owner.
     * @param _amount: amount of CAKE to withdraw (decimals = 18)
     */
    function claimCakeRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        cakeToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to claim the MOBOX remainder
     * @dev Only callable by owner.
     * @param _amount: amount of MOBOX to withdraw (decimals = 18)
     */
    function claimMoboxRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        moboxToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to claim the MOBOX mystery box remainder
     * @dev Only callable by owner.
     * @param _amount: amount of MOBOX mystery box to withdraw (decimals = 18)
     */
    function claimMoboxMysteryRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        moboxMisteryBoxToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to claim the MOBOX mystery box remainder
     * @dev Only callable by owner.
     * @param tokenId: id of Avatar NFT
     */
    function claimMoboxAvatarNFTRemainder(uint256 tokenId) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        moboxAvatarNFTCollection.safeTransferFrom(address(this), _msgSender(), tokenId);
    }

    /**
     * @notice It allows the owner to update team rewards
     * @dev Only callable by owner.
     * @param _teamId: the teamId
     * @param _userCampaignIds: campaignIds for each user group for teamId
     * @param _cakeRewards: CAKE rewards for each user group for teamId
     * @param _moboxRewards: MOBOX rewards for each user group for teamId
     * @param _pointRewards: point to collect for each user group for teamId
     */
    function updateTeamRewards(
        uint256 _teamId,
        uint256[5] calldata _userCampaignIds,
        uint256[5] calldata _cakeRewards,
        uint256[5] calldata _moboxRewards,
        uint256[5] calldata _pointRewards
    ) external onlyOwner {
        require((_teamId > 0) && (_teamId <= numberTeams), "NOT_VALID_TEAM_ID");
        require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        _rewardCompetitions[_teamId].userCampaignId = _userCampaignIds;
        _rewardCompetitions[_teamId].cakeRewards = _cakeRewards;
        _rewardCompetitions[_teamId].moboxRewards = _moboxRewards;
        _rewardCompetitions[_teamId].pointUsers = _pointRewards;

        emit TeamRewardsUpdate(_teamId, competitionId);
    }

    /**
     * @notice It allows the owner to update user statuses
     * @dev Only callable by owner. Use with caution!
     * @param _addressesToUpdate: the array of addresses
     * @param _rewardGroup: the reward group
     */
    function updateUserStatusMultiple(address[] calldata _addressesToUpdate, uint256 _rewardGroup) external onlyOwner {
        require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        require(_rewardGroup <= 4, "TOO_HIGH");
        for (uint256 i = 0; i < _addressesToUpdate.length; i++) {
            userTradingStats[_addressesToUpdate[i]].rewardGroup = _rewardGroup;
        }

        emit UserUpdateMultiple(_addressesToUpdate, _rewardGroup, competitionId);
    }

    /**
     * @notice It allows the owner to update user statuses for MOBOX mystery box reward
     * @dev Only callable by owner. Use with caution!
     * @param _addressesToUpdate: the array of addresses
     * @param _canClaimMysteryBox: flag for mystery box
     */
    function updateUserStatusMysteryBox(address[] calldata _addressesToUpdate, bool _canClaimMysteryBox)
        external
        onlyOwner
    {
        require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        for (uint256 i = 0; i < _addressesToUpdate.length; i++) {
            userTradingStats[_addressesToUpdate[i]].canClaimMysteryBox = _canClaimMysteryBox;
        }

        emit UserUpdateMultipleMobox(_addressesToUpdate, _canClaimMysteryBox, competitionId);
    }

    /**
     * @notice It allows the owner to set the winning teamId (to collect NFT)
     * @dev Only callable by owner.
     * @param _winningTeamId: the winning teamId
     * @param _tokenURI: the tokenURI
     * @param _bunnyId: the bunnyId for winners (e.g. 15)
     */
    function updateWinningTeamAndTokenURIAndBunnyId(
        uint256 _winningTeamId,
        string calldata _tokenURI,
        uint8 _bunnyId
    ) external onlyOwner {
        require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        require((_winningTeamId > 0) && (_winningTeamId <= numberTeams), "NOT_VALID_TEAM_ID");
        require(_bunnyId > 14, "ID_TOO_LOW");
        winningTeamId = _winningTeamId;
        bunnyTokenURI = _tokenURI;
        bunnyId = _bunnyId;
        emit WinningTeam(_winningTeamId, competitionId);
    }

    /**
     * @notice It checks the claim information
     * @dev It does not check if user has a profile since registration required a profile.
     * @param _userAddress: the user address
     * @return hasRegistered: has the user registered
     * @return isActive: is the user active
     * @return hasUserClaimed: whether user has claimed
     * @return userRewardGroup: the final reward group for each user (i.e. tier)
     * @return userCakeRewards: the CAKE to claim/claimed
     * @return userMoboxRewards: the MOBOX to claim/claimed
     * @return userPointReward: the number of points to claim/claimed
     * @return canClaimMysteryBox: whether the user gets/got a mystery box
     * @return canClaimNFT: whether the user gets/got a NFT
     */
    function claimInformation(address _userAddress)
        external
        view
        returns (
            bool,
            bool,
            bool,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        bool isUserActive;
        (, , , , , isUserActive) = pancakeProfile.getUserProfile(_userAddress);
        UserStats memory userStats = userTradingStats[_userAddress];
        bool hasUserRegistered = userStats.hasRegistered;
        if ((currentStatus != CompetitionStatus.Claiming) && (currentStatus != CompetitionStatus.Over)) {
            return (hasUserRegistered, isUserActive, false, 0, 0, 0, 0, false, false);
        } else if (!hasUserRegistered || !isUserActive) {
            return (hasUserRegistered, isUserActive, false, 0, 0, 0, 0, false, false);
        } else {
            uint256 userRewardGroup = userStats.rewardGroup;

            bool canClaimNFT;
            if (userRewardGroup < 1) {
                canClaimNFT = true;
            }

            CompetitionRewards memory compRewards = _rewardCompetitions[userStats.teamId];

            return (
                hasUserRegistered,
                isUserActive,
                userStats.hasClaimed,
                userRewardGroup,
                compRewards.cakeRewards[userRewardGroup],
                compRewards.moboxRewards[userRewardGroup],
                compRewards.pointUsers[userRewardGroup],
                userStats.canClaimMysteryBox,
                canClaimNFT
            );
        }
    }

    /**
     * @notice It checks the reward groups for each team
     */
    function viewRewardTeams() external view returns (CompetitionRewards[] memory) {
        CompetitionRewards[] memory listCompetitionRewards = new CompetitionRewards[](numberTeams);
        for (uint256 i = 0; i < numberTeams; i++) {
            listCompetitionRewards[i] = _rewardCompetitions[i + 1];
        }
        return listCompetitionRewards;
    }
}
