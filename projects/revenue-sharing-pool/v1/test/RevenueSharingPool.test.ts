import { artifacts, contract, ethers, network } from "hardhat";
import { time, BN, expectEvent } from "@openzeppelin/test-helpers";
import { parseEther, formatEther } from "ethers/lib/utils";
import { expect } from "chai";
import { beforeEach } from "mocha";
import { BigNumber } from "ethers";

import ERC20MockArtifact from "./artifactsFile/ERC20Mock.json";
import CakeTokenArtifact from "./artifactsFile/CakeToken.json";
import SyrupBarArtifact from "./artifactsFile/SyrupBar.json";
import MasterChefArtifact from "./artifactsFile/MasterChef.json";
import MasterChefV2Artifact from "./artifactsFile/MasterChefV2.json";
import CakePoolArtifact from "./artifactsFile/CakePool.json";
import VCakeArtifact from "./artifactsFile/VCake.json";
import RevenueSharingPoolFactoryArtifact from "./artifactsFile/RevenueSharingPoolFactory.json";
import RevenueSharingPoolArtifact from "./artifactsFile/RevenueSharingPool.json";

const ZERO = BigNumber.from(0);
const TOLERANCE = "0.04"; // 0.04%
const HOUR = BigNumber.from(3600);
const DAY = BigNumber.from(86400);
const WEEK = DAY.mul(7);
const YEAR = DAY.mul(365);
const MAX_LOCK = BigNumber.from(32054399); // seconds in 53 weeks - 1 second (60 * 60 * 24 * 7 * 53) - 1
const TOKEN_CHECKPOINT_DEADLINE = DAY;
const PRECISION = BigNumber.from(10).pow(17);
const tolerancePercent = 9990; // 99.9%

describe("Revenue Sharing Pool", () => {
  let CakePoolSC;
  let VCakeSC;
  let CakeTokenSC;
  let RevenueSharingPoolSC;
  let RevenueToken;
  let RevenueSharingPoolFactorySC;
  let admin;
  let user1;
  let user2;
  let user3;
  let user4;
  before(async function () {
    [admin, user1, user2, user3, user4] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactoryFromArtifact(ERC20MockArtifact);

    // Prepare for master chef v3

    const CakeToken = await ethers.getContractFactoryFromArtifact(CakeTokenArtifact);
    CakeTokenSC = await CakeToken.deploy();
    await CakeTokenSC["mint(address,uint256)"](admin.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user1.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user2.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user3.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user4.address, ethers.utils.parseUnits("100000000"));

    const SyrupBar = await ethers.getContractFactoryFromArtifact(SyrupBarArtifact);
    const syrupBar = await SyrupBar.deploy(CakeTokenSC.address);

    const lpTokenV1 = await ERC20Mock.deploy("LP Token V1", "LPV1");
    const dummyTokenV2 = await ERC20Mock.deploy("Dummy Token V2", "DTV2");

    const MasterChef = await ethers.getContractFactoryFromArtifact(MasterChefArtifact);
    const masterChef = await MasterChef.deploy(
      CakeTokenSC.address,
      syrupBar.address,
      admin.address,
      ethers.utils.parseUnits("40"),
      ethers.constants.Zero
    );

    await CakeTokenSC.transferOwnership(masterChef.address);
    await syrupBar.transferOwnership(masterChef.address);

    await masterChef.add(0, lpTokenV1.address, true); // farm with pid 1 and 0 allocPoint
    await masterChef.add(1, dummyTokenV2.address, true); // farm with pid 2 and 1 allocPoint

    const MasterChefV2 = await ethers.getContractFactoryFromArtifact(MasterChefV2Artifact);
    const masterChefV2 = await MasterChefV2.deploy(masterChef.address, CakeTokenSC.address, 2, admin.address);

    await dummyTokenV2.mint(admin.address, ethers.utils.parseUnits("1000"));
    await dummyTokenV2.approve(masterChefV2.address, ethers.constants.MaxUint256);
    await masterChefV2.init(dummyTokenV2.address);

    const lpTokenV2 = await ERC20Mock.deploy("LP Token V2", "LPV2");
    const dummyTokenV3 = await ERC20Mock.deploy("Dummy Token V3", "DTV3");
    const dummyTokenForCakePool = await ERC20Mock.deploy("Dummy Token Cake Pool", "DTCP");

    await masterChefV2.add(0, lpTokenV2.address, true, true); // regular farm with pid 0 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenV3.address, true, true); // regular farm with pid 1 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenForCakePool.address, false, true); // special farm with pid 2 and 1 allocPoint

    // set cake pool
    const CakePool = await ethers.getContractFactoryFromArtifact(CakePoolArtifact);
    CakePoolSC = await CakePool.deploy(
      CakeTokenSC.address,
      masterChefV2.address,
      admin.address,
      admin.address,
      admin.address,
      2
    );
    await masterChefV2.updateWhiteList(CakePoolSC.address, true);
    await dummyTokenForCakePool.mint(admin.address, ethers.utils.parseUnits("1000"));
    await dummyTokenForCakePool.approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakePoolSC.init(dummyTokenForCakePool.address);

    await CakeTokenSC.connect(admin).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user1).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user2).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user3).approve(CakePoolSC.address, ethers.constants.MaxUint256);
    await CakeTokenSC.connect(user4).approve(CakePoolSC.address, ethers.constants.MaxUint256);

    const VCakeTest = await ethers.getContractFactoryFromArtifact(VCakeArtifact);
    VCakeSC = await VCakeTest.deploy(CakePoolSC.address, masterChefV2.address, 2);

    await CakePoolSC.setVCakeContract(VCakeSC.address);

    const RevenueSharingPoolFactory = await ethers.getContractFactoryFromArtifact(RevenueSharingPoolFactoryArtifact);
    RevenueSharingPoolFactorySC = await RevenueSharingPoolFactory.deploy(VCakeSC.address);

    RevenueToken = await ERC20Mock.deploy("Revenue Token", "RT");
    await RevenueToken.mint(admin.address, ethers.utils.parseUnits("10000000000"));

    const currentTime = (await time.latest()).toString();
    let tx = await RevenueSharingPoolFactorySC.deploy(currentTime, RevenueToken.address, admin.address);
    let receipt = await tx.wait();
    const newPoolAddress = receipt.events[2].args.pool;
    RevenueSharingPoolSC = await ethers.getContractAt(RevenueSharingPoolArtifact.abi, newPoolAddress, admin);

    await RevenueToken.connect(admin).approve(RevenueSharingPoolSC.address, ethers.constants.MaxUint256);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_reset");
  });

  describe("initialized", async () => {
    it("should initialized correctly", async () => {
      let latestTimestamp = (await time.latest()).toString();
      const startWeekCursor = BigNumber.from(latestTimestamp).div(WEEK).mul(WEEK);
      expect(await RevenueSharingPoolSC.startWeekCursor()).to.deep.eq(startWeekCursor);
      expect(await RevenueSharingPoolSC.lastTokenTimestamp()).deep.eq(startWeekCursor);
      expect(await RevenueSharingPoolSC.weekCursor()).to.deep.eq(startWeekCursor);
      expect(await RevenueSharingPoolSC.rewardToken()).to.deep.eq(RevenueToken.address);
      expect(await RevenueSharingPoolSC.VCake()).to.deep.eq(VCakeSC.address);
      expect(await RevenueSharingPoolSC.emergencyReturn()).to.deep.eq(admin.address);
      expect(await RevenueSharingPoolSC.canCheckpointToken()).deep.eq(false);
    });
  });

  describe("checkpointToken", () => {
    beforeEach(async function () {
      await VCakeSC.connect(user1).syncFromCakePool();
      await VCakeSC.connect(user2).syncFromCakePool();
      await VCakeSC.connect(user3).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
    });

    context("when owner call checkpointToken", async () => {
      it("should work", async () => {
        let latestTimestamp = (await time.latest()).toString();
        await RevenueToken.transfer(RevenueSharingPoolSC.address, ethers.utils.parseEther("888"));
        await RevenueSharingPoolSC.connect(admin).checkpointToken();

        expect(await RevenueSharingPoolSC.lastTokenBalance()).to.deep.eq(ethers.utils.parseEther("888"));
        const lastTokenTimestamp = (await RevenueSharingPoolSC.lastTokenTimestamp()).toNumber();
        expect(lastTokenTimestamp).to.be.gt(Number(latestTimestamp));

        const weekTimeStamp = BigNumber.from(latestTimestamp).div(WEEK).mul(WEEK);
        const tokensPerWeek = await RevenueSharingPoolSC.tokensPerWeek(weekTimeStamp);
        expect(tokensPerWeek).to.deep.eq(ethers.utils.parseEther("888"));
      });
    });
  });

  describe("totalSupplyAt and balanceOfAt", () => {
    beforeEach(async function () {});

    context("One user", async () => {
      it("The user's balanceOfAt is equal to the totalSupplyAt at specific week cursor when have only one user", async () => {
        await VCakeSC.connect(user1).syncFromCakePool();

        await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
        let latestTimestamp = BigNumber.from((await time.latest()).toString());

        let weekCursor = latestTimestamp.div(WEEK).mul(WEEK);
        let totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(weekCursor);

        let user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, weekCursor);

        expect(user1BalanceOfAt).to.deep.eq(ZERO);
        expect(totalSupplyAt).to.deep.eq(ZERO);

        let nextWeekCursor = latestTimestamp.div(WEEK).add(1).mul(WEEK);
        totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(nextWeekCursor);

        user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, nextWeekCursor);

        expect(user1BalanceOfAt.gt(ZERO)).to.deep.eq(true);
        expect(totalSupplyAt).to.deep.eq(ZERO);

        await RevenueSharingPoolSC.checkpointTotalSupply();

        totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(nextWeekCursor);

        user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, nextWeekCursor);

        expect(user1BalanceOfAt.gt(ZERO)).to.deep.eq(true);
        expect(totalSupplyAt).to.deep.eq(ZERO);

        const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK);
        await time.increaseTo(targetTime.toNumber());

        const weekBlock = await time.latestBlock();

        await RevenueSharingPoolSC.checkpointTotalSupply();

        totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(nextWeekCursor);

        user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, nextWeekCursor);

        const totalSupplyAtInVCake = await VCakeSC.totalSupplyAt(weekBlock.toNumber());

        expect(user1BalanceOfAt).to.deep.eq(totalSupplyAt);
        expect(totalSupplyAtInVCake).to.deep.eq(totalSupplyAt);
      });
    });

    context("Three users", async () => {
      it("The total balanceOfAt of all users is equal to the totalSupplyAt at specific week cursor", async () => {
        await VCakeSC.connect(user1).syncFromCakePool();
        await VCakeSC.connect(user2).syncFromCakePool();
        await VCakeSC.connect(user3).syncFromCakePool();

        await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
        await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
        await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

        let latestTimestamp = BigNumber.from((await time.latest()).toString());
        const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
        await time.increaseTo(targetTime.toNumber());

        const injectAmount = ethers.utils.parseUnits("88888");
        await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), injectAmount);
        await time.increase(WEEK.toNumber());
        await RevenueSharingPoolSC.checkpointToken();

        const lastTokenTimestamp = await RevenueSharingPoolSC.lastTokenTimestamp();
        const weekCursor = lastTokenTimestamp.div(WEEK).mul(WEEK);

        await RevenueSharingPoolSC.checkpointTotalSupply();

        const totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(weekCursor);

        const user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, weekCursor);
        const user2BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user2.address, weekCursor);
        const user3BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user3.address, weekCursor);

        const userTotalBalanceOfAt = user1BalanceOfAt.add(user2BalanceOfAt).add(user3BalanceOfAt);
        expect(userTotalBalanceOfAt).to.deep.eq(totalSupplyAt);
      });
    });
  });

  describe("claim", () => {
    beforeEach(async function () {
      await VCakeSC.connect(user1).syncFromCakePool();
      await VCakeSC.connect(user2).syncFromCakePool();
      await VCakeSC.connect(user3).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
    });

    it("should return 0 when user with no lock try to claim", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());

      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), ethers.utils.parseUnits("88888"));
      await time.increase(WEEK.toNumber());
      await RevenueSharingPoolSC.checkpointToken();

      let lastTokenBalance = await RevenueSharingPoolSC.lastTokenBalance();

      expect(lastTokenBalance).to.deep.eq(ethers.utils.parseUnits("88888"));

      const user4BalanceBefore = await RevenueToken.balanceOf(user4.address);

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);

      const user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceBefore).to.deep.eq(user4BalanceAfter);
    });

    it("All users claim reward amount should be equal with inject reward amount", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), injectAmount);
      await time.increase(WEEK.toNumber());
      await RevenueSharingPoolSC.checkpointToken();

      const lastTokenTimestamp = await RevenueSharingPoolSC.lastTokenTimestamp();
      const weekCursor = lastTokenTimestamp.div(WEEK).mul(WEEK);

      await RevenueSharingPoolSC.checkpointTotalSupply();

      const totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(weekCursor);
      const totalRewardBalance = await RevenueToken.balanceOf(RevenueSharingPoolSC.address);

      const user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, weekCursor);
      const user2BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user2.address, weekCursor);
      const user3BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user3.address, weekCursor);

      const userTotalBalanceOfAt = user1BalanceOfAt.add(user2BalanceOfAt).add(user3BalanceOfAt);
      let user1ClaimAmount = user1BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);
      let user2ClaimAmount = user2BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);
      let user3ClaimAmount = user3BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      const user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      const user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1ClaimAmount).to.deep.eq(user1BalanceAfter);
      expect(user2ClaimAmount).to.deep.eq(user2BalanceAfter);
      expect(user3ClaimAmount).to.deep.eq(user3BalanceAfter);

      const totalBalance = user1BalanceAfter.add(user2BalanceAfter).add(user3BalanceAfter);

      //The result is not completely consistent due to the loss of precision of the calculation
      expect(totalBalance.mul(10000).div(injectAmount).gt(tolerancePercent)).to.deep.eq(true);
    });

    it("user claim 0 when lock after checkpointToken ", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), injectAmount);
      await time.increase(WEEK.toNumber());
      await RevenueSharingPoolSC.checkpointToken();

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);
      await time.increaseTo(nextWeekTimeStamp.sub(1).toNumber());

      await VCakeSC.connect(user4).syncFromCakePool();
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      const user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceAfter).to.deep.eq(ZERO);
    });

    it("user claim 0 at this week when lock at this week", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
      await time.increaseTo(targetTime.toNumber());

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      await time.increaseTo(nextWeekTimeStamp.sub(DAY).toNumber());

      await VCakeSC.connect(user4).syncFromCakePool();
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(nextWeekTimeStamp.sub(DAY).toNumber(), injectAmount);
      await RevenueSharingPoolSC.checkpointToken();

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      const user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceAfter).to.deep.eq(ZERO);
    });

    it("user claim 0 at next week when lock at this week", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
      await time.increaseTo(targetTime.toNumber());

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      await time.increaseTo(nextWeekTimeStamp.sub(DAY).toNumber());

      await VCakeSC.connect(user4).syncFromCakePool();
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(nextWeekTimeStamp.sub(DAY).toNumber(), injectAmount);
      await RevenueSharingPoolSC.checkpointToken();

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      let user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceAfter).to.deep.eq(ZERO);

      await time.increaseTo(nextWeekTimeStamp.add(3600).toNumber());

      await RevenueSharingPoolSC.injectReward(nextWeekTimeStamp.add(3600).toNumber(), ethers.utils.parseUnits("88888"));
      await RevenueSharingPoolSC.checkpointToken();

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceAfter).to.deep.eq(ZERO);
    });

    it("user can claim reward after next week when lock at this week", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
      await time.increaseTo(targetTime.toNumber());

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      await time.increaseTo(nextWeekTimeStamp.sub(DAY).toNumber());

      await VCakeSC.connect(user4).syncFromCakePool();
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(nextWeekTimeStamp.sub(DAY).toNumber(), injectAmount);
      await RevenueSharingPoolSC.checkpointToken();

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      let user4BalanceAfter = await RevenueToken.balanceOf(user4.address);

      expect(user4BalanceAfter).to.deep.eq(ZERO);

      await time.increaseTo(nextWeekTimeStamp.add(3600).toNumber());

      await RevenueSharingPoolSC.injectReward(nextWeekTimeStamp.add(3600).toNumber(), ethers.utils.parseUnits("88888"));
      await RevenueSharingPoolSC.checkpointToken();

      await time.increaseTo(nextWeekTimeStamp.add(WEEK).add(3600).toNumber());

      await RevenueSharingPoolSC.injectReward(
        nextWeekTimeStamp.add(WEEK).add(3600).toNumber(),
        ethers.utils.parseUnits("88888")
      );
      await RevenueSharingPoolSC.checkpointToken();

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);
      user4BalanceAfter = await RevenueToken.balanceOf(user4.address);
      expect(user4BalanceAfter.gt(ZERO)).to.deep.eq(true);
    });
  });

  describe("CanCheckpointToken", () => {
    beforeEach(async function () {
      await RevenueSharingPoolSC.setCanCheckpointToken(true);

      await VCakeSC.connect(user1).syncFromCakePool();
      await VCakeSC.connect(user2).syncFromCakePool();
      await VCakeSC.connect(user3).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
    });
    it("All users claim reward amount should be equal with inject reward amount", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), injectAmount);
      await time.increase(WEEK.toNumber());
      await RevenueSharingPoolSC.connect(user4).claim(user4.address);

      const lastTokenTimestamp = await RevenueSharingPoolSC.lastTokenTimestamp();
      const weekCursor = lastTokenTimestamp.div(WEEK).mul(WEEK);

      const totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(weekCursor);
      const totalRewardBalance = await RevenueToken.balanceOf(RevenueSharingPoolSC.address);

      const user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, weekCursor);
      const user2BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user2.address, weekCursor);
      const user3BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user3.address, weekCursor);

      const userTotalBalanceOfAt = user1BalanceOfAt.add(user2BalanceOfAt).add(user3BalanceOfAt);
      let user1ClaimAmount = user1BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);
      let user2ClaimAmount = user2BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);
      let user3ClaimAmount = user3BalanceOfAt.mul(totalRewardBalance).div(totalSupplyAt);

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      const user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      const user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1ClaimAmount).to.deep.eq(user1BalanceAfter);
      expect(user2ClaimAmount).to.deep.eq(user2BalanceAfter);
      expect(user3ClaimAmount).to.deep.eq(user3BalanceAfter);

      const totalBalance = user1BalanceAfter.add(user2BalanceAfter).add(user3BalanceAfter);

      //The result is not completely consistent due to the loss of precision of the calculation
      expect(totalBalance.mul(10000).div(injectAmount).gt(tolerancePercent)).to.deep.eq(true);
    });

    it("User will get reward by claim without checkpointToken", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");
      await RevenueSharingPoolSC.injectReward(latestTimestamp.add(WEEK), injectAmount);
      await time.increase(WEEK.toNumber());

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      const user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      const user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1BalanceAfter.gt(ZERO)).to.deep.eq(true);
      expect(user2BalanceAfter.gt(ZERO)).to.deep.eq(true);
      expect(user3BalanceAfter.gt(ZERO)).to.deep.eq(true);
    });

    it("User will not get reward by claim before TOKEN_CHECKPOINT_DEADLINE", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekCursor = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      // increase time to nextWeekCursor - 1 hours
      await time.increaseTo(nextWeekCursor.sub(BigNumber.from(3600)).toNumber());

      await RevenueSharingPoolSC.checkpointToken();
      await RevenueSharingPoolSC.injectReward(targetTime, injectAmount);

      // await time.increase(WEEK.toNumber());

      await time.increaseTo(nextWeekCursor.add(BigNumber.from(1)).toNumber());

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      const user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      const user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1BalanceAfter).to.deep.eq(ZERO);
      expect(user2BalanceAfter).to.deep.eq(ZERO);
      expect(user3BalanceAfter).to.deep.eq(ZERO);
    });

    it("User will get reward by claim after TOKEN_CHECKPOINT_DEADLINE", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.add(WEEK);
      await time.increaseTo(targetTime.toNumber());

      const injectAmount = ethers.utils.parseUnits("88888");

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekCursor = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      // increase time to nextWeekCursor - 1 hours
      await time.increaseTo(nextWeekCursor.sub(BigNumber.from(3600)).toNumber());

      await RevenueSharingPoolSC.checkpointToken();
      await RevenueSharingPoolSC.injectReward(targetTime, injectAmount);

      await time.increaseTo(nextWeekCursor.add(1).toNumber());

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      let user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      let user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      let user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1BalanceAfter).to.deep.eq(ZERO);
      expect(user2BalanceAfter).to.deep.eq(ZERO);
      expect(user3BalanceAfter).to.deep.eq(ZERO);

      await time.increase(DAY.toNumber());

      const lastTokenTimestamp = await RevenueSharingPoolSC.lastTokenTimestamp();
      latestTimestamp = BigNumber.from((await time.latest()).toString());

      expect(latestTimestamp.gt(lastTokenTimestamp.add(DAY))).to.deep.eq(true);

      await RevenueSharingPoolSC.connect(user1).claim(user1.address);
      await RevenueSharingPoolSC.connect(user2).claim(user2.address);
      await RevenueSharingPoolSC.connect(user3).claim(user3.address);

      user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
      user2BalanceAfter = await RevenueToken.balanceOf(user2.address);
      user3BalanceAfter = await RevenueToken.balanceOf(user3.address);

      expect(user1BalanceAfter.gt(ZERO)).to.deep.eq(true);
      expect(user2BalanceAfter.gt(ZERO)).to.deep.eq(true);
      expect(user3BalanceAfter.gt(ZERO)).to.deep.eq(true);
    });
  });

  describe("Inject Reward", () => {
    let Week1, Week2, Week3, Week4, Week5;
    beforeEach(async function () {
      await VCakeSC.connect(user1).syncFromCakePool();
      await VCakeSC.connect(user2).syncFromCakePool();
      await VCakeSC.connect(user3).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 60);
      let latestTimestamp = BigNumber.from((await time.latest()).toString());

      Week1 = latestTimestamp.div(WEEK).add(1).mul(WEEK);
      Week2 = Week1.add(WEEK);
      Week3 = Week2.add(WEEK);
      Week4 = Week3.add(WEEK);
      Week5 = Week4.add(WEEK);
      // Inject reward in Week3
      await RevenueSharingPoolSC.injectReward(Week3.toNumber(), ethers.utils.parseEther("888"));
    });

    context("Can claim reward after inject reward timestamp", async () => {
      it("No reward in week one", async () => {
        await time.increaseTo(Week1.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);

        expect(user1Balance).to.deep.eq(ZERO);
      });

      it("No reward in week two", async () => {
        await time.increaseTo(Week2.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);

        expect(user1Balance).to.deep.eq(ZERO);
      });

      it("No reward in week three", async () => {
        await time.increaseTo(Week3.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);

        expect(user1Balance).to.deep.eq(ZERO);
      });

      it("Get reward in week four", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
      });

      it("No reward in week five after claim in week four", async () => {
        // claim in week four
        await time.increaseTo(Week4.toNumber());
        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);

        await time.increaseTo(Week5.toNumber());
        const user1BalanceBefore = await RevenueToken.balanceOf(user1.address);
        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
        expect(user1BalanceAfter.sub(user1BalanceBefore)).to.deep.eq(ZERO);
      });

      it("Get reward even after lock expired", async () => {
        const Year = Week1.add(YEAR);
        await time.increaseTo(Year.toNumber());
        const user1BalanceBefore = await RevenueToken.balanceOf(user1.address);
        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1BalanceAfter = await RevenueToken.balanceOf(user1.address);
        expect(user1BalanceAfter.sub(user1BalanceBefore).gt(ZERO)).to.deep.eq(true);
      });
    });
  });
});
