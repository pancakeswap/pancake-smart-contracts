// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

import "./interfaces/IPancakeProfile.sol";
import "./BunnyMintingStation.sol";

/** @title TradingCompV2.
@notice It is a contract for users to collect points
based on off-chain events
*/
contract TradingCompV2 is Ownable {
    using SafeBEP20 for IBEP20;

    BunnyMintingStation public bunnyMintingStation;
    IBEP20 public cakeToken;
    IBEP20 public lazioToken;
    IBEP20 public portoToken;
    IBEP20 public santosToken;

    IPancakeProfile public pancakeProfile;

    uint256 public constant numberTeams = 3;

    uint256 public competitionId;
    uint8 public bunnyId;
    uint256 public winningTeamId; // set to 0 as default
    string public tokenURI;

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
        uint256[5] lazioRewards; // lazio fan token rewards per group
        uint256[5] portoRewards; // porto fan token rewards per group
        uint256[5] santosRewards; // santos fan token rewards per group
        uint256[5] pointUsers; // number of points per user
    }

    struct UserStats {
        uint256 rewardGroup; // 0 to 4 --> 4 top / 0: bottom
        uint256 teamId; // 1 - 3
        bool hasRegistered; // true or false
        bool hasClaimed; // true or false
    }

    event NewCompetitionStatus(CompetitionStatus status, uint256 competitionId);
    event TeamRewardsUpdate(uint256 teamId, uint256 competitionId);
    event UserRegister(address userAddress, uint256 teamId, uint256 competitionId);
    event UserUpdateMultiple(address[] userAddresses, uint256 rewardGroup, uint256 competitionId);
    event WinningTeam(uint256 teamId, uint256 competitionId);

    /**
     * @notice It initializes the contract.
     * @param _pancakeProfileAddress: PancakeProfile address
     * @param _bunnyStationAddress: BunnyMintingStation address
     * @param _cakeTokenAddress: the address of the CAKE token
     * @param _lazioTokenAddress: the address of the LAZIO fan token
     * @param _portoTokenAddress: the address of the PORTO fan token
     * @param _santosTokenAddress: the address of the SANTOS fan token
     * @param _competitionId: competition uniq id
     */
    constructor(
        address _pancakeProfileAddress,
        address _bunnyStationAddress,
        address _cakeTokenAddress,
        address _lazioTokenAddress,
        address _portoTokenAddress,
        address _santosTokenAddress,
        uint256 _competitionId
    ) public {
        pancakeProfile = IPancakeProfile(_pancakeProfileAddress);
        bunnyMintingStation = BunnyMintingStation(_bunnyStationAddress);
        cakeToken = IBEP20(_cakeTokenAddress);
        lazioToken = IBEP20(_lazioTokenAddress);
        portoToken = IBEP20(_portoTokenAddress);
        santosToken = IBEP20(_santosTokenAddress);
        competitionId = _competitionId;
        currentStatus = CompetitionStatus.Registration;
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

        userTradingStats[senderAddress].hasClaimed = true;

        uint256 userRewardGroup = userTradingStats[senderAddress].rewardGroup;
        uint256 userTeamId = userTradingStats[senderAddress].teamId;

        CompetitionRewards memory userRewards = _rewardCompetitions[userTeamId];

        if (userRewardGroup > 0) {
            cakeToken.safeTransfer(senderAddress, userRewards.cakeRewards[userRewardGroup]);
            lazioToken.safeTransfer(senderAddress, userRewards.lazioRewards[userRewardGroup]);
            portoToken.safeTransfer(senderAddress, userRewards.portoRewards[userRewardGroup]);
            santosToken.safeTransfer(senderAddress, userRewards.santosRewards[userRewardGroup]);

            if (userTeamId == winningTeamId) {
                bunnyMintingStation.mintCollectible(senderAddress, tokenURI, bunnyId);
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
     * @notice It allows the owner to claim the LAZIO remainder
     * @dev Only callable by owner.
     * @param _amount: amount of LAZIO to withdraw (decimals = 8)
     */
    function claimLazioRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        lazioToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to claim the PORTO remainder
     * @dev Only callable by owner.
     * @param _amount: amount of PORTO to withdraw (decimals = 8)
     */
    function claimPortoRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        portoToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to claim the SANTOS remainder
     * @dev Only callable by owner.
     * @param _amount: amount of SANTOS to withdraw (decimals = 8)
     */
    function claimSantosRemainder(uint256 _amount) external onlyOwner {
        require(currentStatus == CompetitionStatus.Over, "NOT_OVER");
        santosToken.safeTransfer(_msgSender(), _amount);
    }

    /**
     * @notice It allows the owner to update team rewards
     * @dev Only callable by owner.
     * @param _teamId: the teamId
     * @param _userCampaignIds: campaignIds for each user group for teamId
     * @param _cakeRewards: CAKE rewards for each user group for teamId
     * @param _lazioRewards: LAZIO rewards for each user group for teamId
     * @param _portoRewards: PORTO rewards for each user group for teamId
     * @param _santosRewards: SANTOS rewards for each user group for teamId
     * @param _pointRewards: point to collect for each user group for teamId
     */
    function updateTeamRewards(
        uint256 _teamId,
        uint256[5] calldata _userCampaignIds,
        uint256[5] calldata _cakeRewards,
        uint256[5] calldata _lazioRewards,
        uint256[5] calldata _portoRewards,
        uint256[5] calldata _santosRewards,
        uint256[5] calldata _pointRewards
    ) external onlyOwner {
        require(currentStatus == CompetitionStatus.Close, "NOT_CLOSED");
        _rewardCompetitions[_teamId].userCampaignId = _userCampaignIds;
        _rewardCompetitions[_teamId].cakeRewards = _cakeRewards;
        _rewardCompetitions[_teamId].lazioRewards = _lazioRewards;
        _rewardCompetitions[_teamId].portoRewards = _portoRewards;
        _rewardCompetitions[_teamId].santosRewards = _santosRewards;
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
        tokenURI = _tokenURI;
        bunnyId = _bunnyId;
        emit WinningTeam(_winningTeamId, competitionId);
    }

    /**
     * @notice It checks the claim information
     * @dev It does not check if user has a profile since registration required a profile.
     * @param _userAddress: the user address
     * @return hasRegistered: has the user registered
     * @return hasUserClaimed: whether user has claimed
     * @return userRewardGroup: the final reward group for each user (i.e. tier)
     * @return userCakeRewards: the CAKE to claim/claimed
     * @return userLazioRewards: the LAZIO to claim/claimed
     * @return userPortoRewards: the PORTO to claim/claimed
     * @return userSantosRewards: the Santos to claim/claimed
     * @return userPointReward: the number of points to claim/claimed
     * @return canClaimNFT: whether the user gets/got a NFT
     */
    function claimInformation(address _userAddress)
        external
        view
        returns (
            bool,
            bool,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        bool hasUserRegistered = userTradingStats[_userAddress].hasRegistered;
        if ((currentStatus != CompetitionStatus.Claiming) && (currentStatus != CompetitionStatus.Over)) {
            return (hasUserRegistered, false, 0, 0, 0, 0, 0, 0, false);
        } else if (!hasUserRegistered) {
            return (hasUserRegistered, false, 0, 0, 0, 0, 0, 0, false);
        } else {
            uint256 userRewardGroup = userTradingStats[_userAddress].rewardGroup;
            uint256 userTeamId = userTradingStats[_userAddress].teamId;

            bool hasUserClaimed = userTradingStats[_userAddress].hasClaimed;
            bool canClaimNFT;

            if ((userTeamId == winningTeamId) && (userRewardGroup > 0)) {
                canClaimNFT = true;
            }

            return (
                hasUserRegistered,
                hasUserClaimed,
                userRewardGroup,
                _rewardCompetitions[userTeamId].cakeRewards[userRewardGroup],
                _rewardCompetitions[userTeamId].lazioRewards[userRewardGroup],
                _rewardCompetitions[userTeamId].portoRewards[userRewardGroup],
                _rewardCompetitions[userTeamId].santosRewards[userRewardGroup],
                _rewardCompetitions[userTeamId].pointUsers[userRewardGroup],
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
