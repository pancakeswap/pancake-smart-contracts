import { parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, expectRevert, time } from "@openzeppelin/test-helpers";

const MockERC20 = artifacts.require("./test/MockERC20");
const MockVotingEscrow = artifacts.require("./test/MockVotingEscrow");
const GaugeVoting = artifacts.require("./GaugeVoting");
const GaugeVotingAdminUtil = artifacts.require("./GaugeVotingAdminUtil");

contract("GaugeVoting Test", ([admin, user1, user2, user3, user4, user5, ...accounts]) => {
  let mockCake, mockVotingEscrow, voter, voterAdminUtil;
  let startTimestamp, nextTime;
  let result;
  let WEEK = 7 * 86400;
  let TWOWEEK = 14 * 86400;
  let MAX_LOCK_TIME = 209 * WEEK - 1;

  let V2Staker1 = "0x0000000000000000000000000000000000000001";
  let V2Staker2 = "0x0000000000000000000000000000000000000002";
  let PancakePair1 = "0x0000000000000000000000000000000000000101";
  let PancakePair2 = "0x0000000000000000000000000000000000000102";
  let PancakePair3 = "0x0000000000000000000000000000000000000103";
  let PancakePair4 = "0x0000000000000000000000000000000000000104";
  let PancakePair5 = "0x0000000000000000000000000000000000000105";
  let ALMWrapper1 = "0x0000000000000000000000000000000000000201";
  let ALMWrapper2 = "0x0000000000000000000000000000000000000202";
  let ALMWrapper3 = "0x0000000000000000000000000000000000000203";
  let ALMWrapper4 = "0x0000000000000000000000000000000000000204";
  let veCakePool = "0x0000000000000000000000000000000000000301";

  let V2BscReceiver = "0x1000000000000000000000000000000000000001";
  let V2CrossChainReceiver = "0x1000000000000000000000000000000000000002";
  let MasterChefV3BscReceiver = "0x1000000000000000000000000000000000000003";
  let MasterChefV3CrossChainReceiver = "0x1000000000000000000000000000000000000004";
  let ALMBscReceiver = "0x1000000000000000000000000000000000000005";
  let ALMCrossChainReceiver = "0x1000000000000000000000000000000000000006";
  let veCAKEBscReceiver_Injector = "0x1000000000000000000000000000000000000007";

  describe("GaugeVoting #2 - EXTRA Test", async () => {
    before(async () => {
      mockCake = await MockERC20.new("Mock CAKE", "CAKE", parseEther("1000000"), {
        from: admin,
      });
      mockVotingEscrow = await MockVotingEscrow.new({
        from: admin,
      });
      voter = await GaugeVoting.new(mockVotingEscrow.address, {
        from: admin,
      });
      voterAdminUtil = await GaugeVotingAdminUtil.new({
        from: admin,
      });

      // update voting address
      await voterAdminUtil.updateGaugeVotingAddress(voter.address, {
        from: admin,
      });

      startTimestamp = await time.latest(); //1699488000;
      nextTime = new BN(startTimestamp).add(new BN(WEEK)).div(new BN(WEEK)).mul(new BN(WEEK));

      // init user's locks data
      await mockVotingEscrow.createLocksForUser(
        user1,
        parseEther("1000"),
        new BN(nextTime).add(new BN("5875200")) /*1706572800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user2,
        parseEther("1000"),
        new BN(nextTime).add(new BN("61171200")) /*1761868800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user3,
        parseEther("5000"),
        new BN(nextTime).add(new BN("6134400")) /*1706832000*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user4,
        parseEther("100000"),
        new BN(nextTime).add(new BN("29635200")) /*1730332800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user5,
        parseEther("2500"),
        new BN(nextTime).add(new BN("29635200")) /*1730332800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.setTotalSupply(parseEther("24804.169"), {
        from: admin,
      });
    });

    it("add types", async () => {
      result = await voter.addType("V2 LP - Stakers", 1, {
        from: admin,
      });
    });

    it("add gauges", async () => {
      // V2 LP on Bsc
      await voter.addGauge(V2Staker1, 0, 0, 0, V2BscReceiver, 56, 100, 0, {
        from: admin,
      });

      // V2 LP on Arb
      await voter.addGauge(V2Staker2, 0, 0, 0, V2CrossChainReceiver, 42161, 100, 0, {
        from: admin,
      });
    });

    it("kill a gauge", async () => {
      await voter.killGauge(V2Staker1, 56, {
        from: admin,
      });

      // user1 vote
      await expectRevert(
        voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
          from: user1,
        }),
        "gauge killed"
      );
    });

    it("unkill a gauge and user1 can vote regularly", async () => {
      await voter.unkillGauge(V2Staker1, 56, {
        from: admin,
      });

      // user1 vote
      await voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
        from: user1,
      });

      // user1 vote
      await voter.voteForGaugeWeights(V2Staker2, 5000, 42161, false, false, {
        from: user1,
      });

      let usedPower1 = await voter.voteUserPower(user1, {
        from: user1,
      });

      //console.log('used power: ', usedPower1.toString());
    });

    it("user2 can not vote when it is in admin vote period", async () => {
      startTimestamp = await time.latest();
      nextTime = new BN(startTimestamp).add(new BN(TWOWEEK)).div(new BN(TWOWEEK)).mul(new BN(TWOWEEK));
      nextTime = new BN(nextTime).sub(new BN("86400"));
      await time.increaseTo(nextTime);

      // admin change the period
      await voter.updateAdminOnlyPeriod(86400, {
        from: admin,
      });

      // user2 vote
      await expectRevert(
        voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
          from: user2,
        }),
        "Currently in admin only period"
      );

      // admin change the period
      await voter.updateAdminOnlyPeriod(43200, {
        from: admin,
      });

      // user2 vote
      await voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
        from: user2,
      });

      // user4 vote
      await voter.voteForGaugeWeightsBulk([V2Staker1], [1000], [56], false, false, {
        from: user4,
      });

      let weight1 = await voter.getGaugeWeight(V2Staker1, 56, true);
      assert.notEqual(String(weight1), String("0"));
    });

    it("kill again and user1 vote can return his vote power", async () => {
      startTimestamp = await time.latest();
      nextTime = new BN(startTimestamp).add(new BN(TWOWEEK)).div(new BN(TWOWEEK)).mul(new BN(TWOWEEK));
      nextTime = new BN(nextTime).add(new BN(TWOWEEK)).add(new BN("1"));
      await time.increaseTo(nextTime);
      let timestamp = await voter.WEIGHT_VOTE_DELAY();
      //console.log(timestamp-0)
      let usedPower1_0 = await voter.voteUserPower(user1, {
        from: user1,
      });
      //console.log('used power: ', usedPower1_0.toString());
      await voter.killGauge(V2Staker1, 56, {
        from: admin,
      });

      // user1 vote
      await voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
        from: user1,
      });

      let usedPower1_1 = await voter.voteUserPower(user1, {
        from: user1,
      });
      //console.log('used power: ', usedPower1_1.toString());

      assert.equal(String(usedPower1_1), String("5000"));
    });

    it("test admin util functions", async () => {
      // loop the checkpoint
      await voterAdminUtil.checkPointGaugesBulk(0, 0, {
        from: admin,
      });

      let hash0 = await voterAdminUtil.getGaugeHashFromId(0);
      //console.log(hash0);
      let hash1 = await voterAdminUtil.getGaugeHashFromId(1);
      //console.log(hash1);

      const result0 = await voterAdminUtil.getGaugeInfoFull(hash0);
      const result1 = await voterAdminUtil.getGaugeInfoFull(hash1);

      assert.equal(String(result0[0]), String("0"));
      assert.equal(String(result1[0]), String("1"));
      assert.equal(String(result0[1]), String("0"));
      assert.equal(String(result1[1]), String("0"));
      // console.log(result0[2].toString());
      // console.log(result0[3]);
      // console.log(result0[4].toString());
      // console.log(result0[5]);
      // console.log(result0[6].toString());
      // console.log(result0[7].toString());
      // console.log(result1[2].toString());
      // console.log(result1[3]);
      // console.log(result1[4].toString());
      // console.log(result1[5]);
      // console.log(result1[6].toString());
      // console.log(result1[7].toString());
    });
  });
});
