import { parseEther, formatUnits } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert } from "chai";
import { BN, expectEvent, time } from "@openzeppelin/test-helpers";

const MockERC20 = artifacts.require("./test/MockERC20");
const MockVotingEscrow = artifacts.require("./test/MockVotingEscrow");
const GaugeVoting = artifacts.require("./GaugeVoting");

contract("GaugeVoting Test", ([admin, user1, user2, user3, user4, user5, ...accounts]) => {
  let mockCake, mockVotingEscrow, voter;
  let startTimestamp, nextTime;
  let result;
  let WEEK = 7 * 86400;
  let TWOWEEK = 14 * 86400;
  let MAX_LOCK_TIME = 126403199; //209*WEEK - 1;

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

  describe("GaugeVoting #1 - USER VOTE", async () => {
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

      startTimestamp = await time.latest(); //1699488000;
      await time.increaseTo(startTimestamp);
      nextTime = new BN(startTimestamp).add(new BN(WEEK)).div(new BN(WEEK)).mul(new BN(WEEK));

      // init user's locks data
      await mockVotingEscrow.createLocksForUser(
        user1,
        parseEther("1000"),
        new BN(nextTime).add(new BN("4838400")) /*1706572800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user2,
        parseEther("1000"),
        new BN(nextTime).add(new BN("59875200")) /*1761868800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user3,
        parseEther("5000"),
        new BN(nextTime).add(new BN("4838400")) /*1706832000*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user4,
        parseEther("100000"),
        new BN(nextTime).add(new BN("28425600")) /*1730332800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.createLocksForUser(
        user5,
        parseEther("2500"),
        new BN(nextTime).add(new BN("28425600")) /*1730332800*/,
        {
          from: admin,
        }
      );
      await mockVotingEscrow.setTotalSupply(parseEther("21657.894"), {
        from: admin,
      });
    });

    it("add types", async () => {
      result = await voter.addType("V2 LP - Stakers", 1, {
        from: admin,
      });
      expectEvent(result, "AddType", { name: "V2 LP - Stakers", type_id: "0" });
      result = await voter.addType("V3 LP - MasterChefV3", 1, {
        from: admin,
      });
      expectEvent(result, "AddType", { name: "V3 LP - MasterChefV3", type_id: "1" });
      result = await voter.addType("ALM Wrapper", 1, {
        from: admin,
      });
      expectEvent(result, "AddType", { name: "ALM Wrapper", type_id: "2" });
      result = await voter.addType("veCAKE Pool", 1, {
        from: admin,
      });
      expectEvent(result, "AddType", { name: "veCAKE Pool", type_id: "3" });
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
      // V3 LP on Bsc
      await voter.addGauge(PancakePair1, 1, 0, 12, MasterChefV3BscReceiver, 56, 100, 0, {
        from: admin,
      });
      // Another V3 LP on Bsc
      await voter.addGauge(PancakePair2, 1, 0, 13, MasterChefV3BscReceiver, 56, 100, 100, {
        from: admin,
      });
      // V3 LP on Arb
      await voter.addGauge(PancakePair3, 1, 0, 14, MasterChefV3CrossChainReceiver, 42161, 100, 0, {
        from: admin,
      });
      // Another V3 LP on Arb
      await voter.addGauge(PancakePair4, 1, 0, 15, MasterChefV3CrossChainReceiver, 42161, 100, 0, {
        from: admin,
      });
      // V3 LP on Eth
      await voter.addGauge(PancakePair5, 1, 0, 0, MasterChefV3CrossChainReceiver, 1, 100, 0, {
        from: admin,
      });
      // ALM Wrapper on Bsc
      await voter.addGauge(ALMWrapper1, 2, 0, 0, ALMBscReceiver, 56, 200, 0, {
        from: admin,
      });
      // ALM Wrapper on Eth
      await voter.addGauge(ALMWrapper2, 2, 0, 0, ALMCrossChainReceiver, 1, 200, 0, {
        from: admin,
      });
      // Another ALM Wrapper on Eth
      await voter.addGauge(ALMWrapper3, 2, 0, 0, ALMCrossChainReceiver, 1, 100, 0, {
        from: admin,
      });
      // ALM Wrapper on Arb
      await voter.addGauge(ALMWrapper4, 2, 0, 0, ALMCrossChainReceiver, 42161, 200, 0, {
        from: admin,
      });
      // veCAKE Pool
      await voter.addGauge(veCakePool, 3, 0, 0, veCAKEBscReceiver_Injector, 56, 100, 500, {
        from: admin,
      });

      // admin change the period
      await voter.updateAdminOnlyPeriod(0, {
        from: admin,
      });
    });

    it("gauge1 start vote", async () => {
      // user1 vote
      await voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
        from: user1,
      });
      // await voter.voteForGaugeWeightsBulk([V2Staker1, V2Staker2], [5000, 5000], [56, 42161], false, false, {
      //     from: user1
      // });

      // user2 vote
      await voter.voteForGaugeWeights(V2Staker1, 1000, 56, false, false, {
        from: user2,
      });
      // // user4 vote
      // await voter.voteForGaugeWeights(V2Staker1, 1000, 56, {
      //     from: user4
      // });
      await voter.voteForGaugeWeightsBulk(
        [V2Staker1, V2Staker2, PancakePair1, PancakePair2, veCakePool],
        [1000, 1000, 1000, 3000, 4000],
        [56, 42161, 56, 56, 56],
        false,
        false,
        {
          from: user4,
        }
      );

      let weight1 = await voter.getGaugeWeight(V2Staker1, 56, false);
      assert.equal(formatUnits(weight1.toString()), String("2315.3110231014955296"));
    });

    it("gauge2 start vote", async () => {
      // user1 vote
      await voter.voteForGaugeWeights(V2Staker2, 5000, 42161, false, false, {
        from: user1,
      });
      // user2 vote
      await voter.voteForGaugeWeights(V2Staker2, 1000, 42161, false, false, {
        from: user2,
      });
      // // user4 vote
      // await voter.voteForGaugeWeights(V2Staker2, 1000, 42161, false, false, {
      //     from: user4
      // });

      let weight2 = await voter.getGaugeWeight(V2Staker2, 42161, false);
      assert.equal(formatUnits(weight2.toString()), String("2315.3110231014955296"));
    });

    it("gauge3 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(PancakePair1, 1000, 56, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(PancakePair1, 1000, 56, false, false, {
        from: user3,
      });
      // // user4 vote
      // await voter.voteForGaugeWeights(PancakePair1, 1000, 56, false, false, {
      //     from: user4
      // });

      let weight3 = await voter.getGaugeWeight(PancakePair1, 56, false);
      assert.equal(formatUnits(weight3.toString()), String("2315.3110231014955296"));
    });

    it("gauge4 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(PancakePair2, 1000, 56, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(PancakePair2, 1000, 56, false, false, {
        from: user3,
      });
      // // user4 vote
      // await voter.voteForGaugeWeights(PancakePair2, 3000, 56, false, false, {
      //     from: user4
      // });

      let weight4 = await voter.getGaugeWeight(PancakePair2, 56, false);
      assert.equal(formatUnits(weight4.toString()), String("6812.9187141853270944"));
    });

    it("gauge5 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(PancakePair3, 1000, 42161, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(PancakePair3, 1000, 42161, false, false, {
        from: user3,
      });

      let weight5 = await voter.getGaugeWeight(PancakePair3, 42161, false);
      assert.equal(formatUnits(weight5.toString()), String("66.5071775596081728"));
    });

    it("gauge6 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(PancakePair4, 1000, 42161, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(PancakePair4, 1000, 42161, false, false, {
        from: user3,
      });

      let weight6 = await voter.getGaugeWeight(PancakePair4, 42161, false);
      assert.equal(formatUnits(weight6.toString()), String("66.5071775596081728"));
    });

    it("gauge7 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(PancakePair5, 1000, 1, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(PancakePair5, 1000, 1, false, false, {
        from: user3,
      });

      let weight7 = await voter.getGaugeWeight(PancakePair5, 1, false);
      assert.equal(formatUnits(weight7.toString()), String("66.5071775596081728"));
    });

    it("gauge8 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(ALMWrapper1, 1000, 56, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(ALMWrapper1, 1000, 56, false, false, {
        from: user3,
      });

      let weight8 = await voter.getGaugeWeight(ALMWrapper1, 56, false);
      assert.equal(formatUnits(weight8.toString()), String("133.0143551192163456"));
    });

    it("gauge9 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(ALMWrapper2, 1000, 1, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(ALMWrapper2, 1000, 1, false, false, {
        from: user3,
      });

      let weight9 = await voter.getGaugeWeight(ALMWrapper2, 1, false);
      assert.equal(formatUnits(weight9.toString()), String("133.0143551192163456"));
    });

    it("gauge10 start vote", async () => {
      // user2 vote
      await voter.voteForGaugeWeights(ALMWrapper3, 1000, 1, false, false, {
        from: user2,
      });
      // user3 vote
      await voter.voteForGaugeWeights(ALMWrapper3, 1000, 1, false, false, {
        from: user3,
      });

      let weight10 = await voter.getGaugeWeight(ALMWrapper3, 1, false);
      assert.equal(formatUnits(weight10.toString()), String("66.5071775596081728"));
    });

    it("gauge11 start vote", async () => {
      // user3 vote
      await voter.voteForGaugeWeights(ALMWrapper4, 1000, 42161, false, false, {
        from: user3,
      });

      let weight11 = await voter.getGaugeWeight(ALMWrapper4, 42161, false);
      assert.equal(formatUnits(weight11.toString()), String("38.2775122645364736"));
    });

    it("gauge12 start vote", async () => {
      // user3 vote
      await voter.voteForGaugeWeights(veCakePool, 1000, 56, false, false, {
        from: user3,
      });
      // user4 vote
      await voter.voteForGaugeWeights(veCakePool, 4000, 56, false, false, {
        from: user4,
      });

      let weight12 = await voter.getGaugeWeight(veCakePool, 56, false);
      assert.equal(formatUnits(weight12.toString()), String("9014.3541382999029408"));
    });

    // it("admin vote", async () => {
    //     nextTime = new BN(startTimestamp).add(new BN(WEEK)).div(new BN(WEEK)).mul(new BN(WEEK));
    //     //nextTime = new BN(nextTime).add(new BN(WEEK)).add(new BN("1"));
    //     let adminEndTime = new BN(nextTime).add(new BN("1"));
    //     adminEndTime = 0;
    //     //adminEndTime = adminEndTime.add(new BN("1"));
    //     // admin vote
    //     await voter.voteFromAdminBulk([V2Staker1, V2Staker2], [800, 800], [adminEndTime, adminEndTime], [56, 42161], {
    //         from: admin
    //     });
    //
    //     let weight1 = await voter.getGaugeWeight(V2Staker1, 56, false);
    //     assert.equal(formatUnits(weight1.toString()), String("2112.4402080994217376"));
    //
    //     // admin vote
    //     await voter.voteFromAdminBulk([PancakePair1, PancakePair2, PancakePair3, PancakePair4, PancakePair5], [800, 800, 800, 800, 800], [adminEndTime, adminEndTime, adminEndTime, adminEndTime, adminEndTime], [56, 56, 42161, 42161, 1], {
    //         from: admin
    //     });
    //
    //     // admin vote
    //     await voter.voteFromAdminBulk([ALMWrapper1, ALMWrapper2, ALMWrapper3, ALMWrapper4], [800, 800, 800, 800], [adminEndTime, adminEndTime, adminEndTime, adminEndTime], [56, 1, 1, 42161], {
    //         from: admin
    //     });
    //
    //     // admin vote
    //     await voter.voteFromAdmin(veCakePool, 800, adminEndTime, 56, {
    //         from: admin
    //     });
    // });

    // it("check the final results", async () => {
    //     let weight1 = await voter.getGaugeWeight(V2Staker1, 56, true);
    //     let weight2 = await voter.getGaugeWeight(V2Staker2, 42161, true);
    //     let weight3 = await voter.getGaugeWeight(PancakePair1, 56, true);
    //     let weight4 = await voter.getGaugeWeight(PancakePair2, 56, true);
    //     let weight5 = await voter.getGaugeWeight(PancakePair3, 42161, true);
    //     let weight6 = await voter.getGaugeWeight(PancakePair4, 42161, true);
    //     let weight7 = await voter.getGaugeWeight(PancakePair5, 1, true);
    //     let weight8 = await voter.getGaugeWeight(ALMWrapper1, 56, true);
    //     let weight9 = await voter.getGaugeWeight(ALMWrapper2, 1, true);
    //     let weight10 = await voter.getGaugeWeight(ALMWrapper3, 1, true);
    //     let weight11 = await voter.getGaugeWeight(ALMWrapper4, 42161, true);
    //     let weight12 = await voter.getGaugeWeight(veCakePool, 56, true);
    //     let totalWeightCapped = await voter.getTotalWeight(true);
    //     let type_chainId_weight = await voter.getTypeAndChainIdWeightCapped(2, 1);
    //
    //     assert.equal(String((weight1 / totalWeightCapped).toFixed(4)), String("0.2019"));
    //     assert.equal(String((weight2 / totalWeightCapped).toFixed(4)), String("0.2019"));
    //     assert.equal(String((weight3 / totalWeightCapped).toFixed(4)), String("0.2020"));
    //     assert.equal(String((weight4 / totalWeightCapped).toFixed(4)), String("0.0107"));
    //     assert.equal(String((weight5 / totalWeightCapped).toFixed(4)), String("0.0337"));
    //     assert.equal(String((weight6 / totalWeightCapped).toFixed(4)), String("0.0337"));
    //     assert.equal(String((weight7 / totalWeightCapped).toFixed(4)), String("0.0337"));
    //     assert.equal(String((weight8 / totalWeightCapped).toFixed(4)), String("0.0674"));
    //     assert.equal(String((weight9 / totalWeightCapped).toFixed(4)), String("0.0674"));
    //     assert.equal(String((weight10/ totalWeightCapped).toFixed(4)), String("0.0337"));
    //     assert.equal(String((weight11/ totalWeightCapped).toFixed(4)), String("0.0605"));
    //     assert.equal(String((weight12/ totalWeightCapped).toFixed(4)), String("0.0533"));
    //     console.log("type and chainId weight: ", type_chainId_weight.toString());
    //     console.log("getTotalWeight( _type = 3, _chainId = 1 ): ", type_chainId_weight / totalWeightCapped);
    //     assert.equal(String((type_chainId_weight/ totalWeightCapped).toFixed(4)), String("0.1011"));
    // });
    //
    // // it("update gauge info", async () => {
    // //     await voter.updateGaugeInfo(PancakePair2, 13, MasterChefV3BscReceiver, 56, 100, 0, {
    // //         from: admin
    // //     });
    // //     let weight4 = await voter.getGaugeWeight(PancakePair2, 56, true);
    // //     assert.equal(String(weight4), String("7106151799211914512000"));
    // //
    // //     await voter.updateGaugeInfo(PancakePair2, 13, MasterChefV3BscReceiver, 56, 100, 100, {
    // //         from: admin
    // //     });
    // //     let weight4_new = await voter.getGaugeWeight(PancakePair2, 56, true);
    // //     assert.equal(String(weight4_new), String("148588072200612126144"));
    // // });
    //
    // it("time pass", async () => {
    //     // let weight1 = await voter.getGaugeWeight(V2Staker1, 56, true);
    //     // assert.equal(String(weight1), String("0"));
    //     nextTime = new BN(startTimestamp).add(new BN(WEEK)).div(new BN(WEEK)).mul(new BN(WEEK));
    //     console.log("nextTime: ", nextTime-0);
    //     nextTime = new BN(nextTime).add(new BN(WEEK)).add(new BN("1"));
    //     //await time.increaseTo(nextTime);
    //     console.log("nextTime: ", nextTime-0);
    //     // await voter.gaugeRelativeWeight_write(V2Staker2, nextTime, 42161);
    //     // let weight2 = await voter.gaugeRelativeWeight(V2Staker2, nextTime, 42161);
    //     // assert.equal(String(weight2), String("0"));
    //     // let weight2_ = await voter.getGaugeWeight(V2Staker2, 42161, true);
    //     // assert.equal(String(weight2_), String("0"));
    //     // // user1 vote
    //     // await voter.voteForGaugeWeights(V2Staker1, 0, 56, false, false, {
    //     //     from: user1
    //     // });
    //     await voter.checkpointGauge(V2Staker1, 56);
    //     let weight1_ = await voter.getGaugeWeight(V2Staker1, 56, true);
    //     //weight1_ = new BN(weight1_).div(new BN("1000000000000000000"));
    //     assert.equal(String(weight1_), String("2812997963437862976000"));
    // });
    //
    // it("change admin allocation", async () => {
    //     let allocation1 = await voter.adminAllocation();
    //     assert.equal(String(allocation1), String("20"));
    //     await voter.changeAdminAllocation(50);
    //     let allocation2 = await voter.adminAllocation();
    //     assert.equal(String(allocation2), String("50"));
    //     await voter.changeAdminAllocation(100);
    //     let allocation3 = await voter.adminAllocation();
    //     assert.equal(String(allocation3), String("100"));
    // });
    //
    // it("change weight vote delay param", async () => {
    //     await expectRevert(voter.changeWeightVoteDelay(1), "delay should exceed WEEK");
    //     await expectRevert(voter.changeWeightVoteDelay(WEEK), "delay should exceed WEEK");
    //     await expectRevert(voter.changeWeightVoteDelay(MAX_LOCK_TIME), "delay should not exceed MAX_LOCK_TIME");
    //
    //     let weight1_0 = await voter.getGaugeWeight(V2Staker1, 56, true);
    //
    //     // user1 vote
    //     await voter.voteForGaugeWeights(V2Staker1, 5000, 56, false, false, {
    //         from: user1
    //     });
    //
    //     let weight1_1 = await voter.getGaugeWeight(V2Staker1, 56, true);
    //
    //     assert.equal(String(weight1_0), String(weight1_1));
    //
    //     await voter.changeWeightVoteDelay(WEEK+1, {
    //         from: admin
    //     });
    //
    //     nextTime = new BN(nextTime).add(new BN(WEEK)).add(new BN("2"));
    //     await time.increaseTo(nextTime);
    //
    //     // user1 vote
    //     await expectRevert(voter.voteForGaugeWeights(V2Staker1, 6000, 56, false, false, {
    //         from: user1
    //     }), "Used too much power");
    //
    //
    // });
  });
});
