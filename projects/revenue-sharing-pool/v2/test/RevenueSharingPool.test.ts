import { artifacts, contract, ethers, network } from "hardhat";
import { time, BN, expectEvent, expectRevert } from "@openzeppelin/test-helpers";
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
import VECakeArtifact from "./artifactsFile/VECake.json";
import ProxyForCakePoolArtifact from "./artifactsFile/ProxyForCakePool.json";
import ProxyForCakePoolFactoryArtifact from "./artifactsFile/ProxyForCakePoolFactory.json";
import DelegatorArtifact from "./artifactsFile/Delegator.json";
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
  let masterChefV2;
  let ProxyForCakePoolFactorySC;
  let VECakeSC;
  let CakeTokenSC;
  let RevenueSharingPoolSC;
  let RevenueToken;
  let RevenueSharingPoolFactorySC;
  let delegatorSC;
  let admin;
  let user1;
  let user2;
  let user3;
  let user4;
  let recipient;
  before(async function () {
    [admin, user1, user2, user3, user4, recipient] = await ethers.getSigners();
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
    await CakeTokenSC["mint(address,uint256)"](user4.address, ethers.utils.parseUnits("100000000000000"));

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
    masterChefV2 = await MasterChefV2.deploy(masterChef.address, CakeTokenSC.address, 2, admin.address);

    await dummyTokenV2.mint(admin.address, ethers.utils.parseUnits("1000"));
    await dummyTokenV2.approve(masterChefV2.address, ethers.constants.MaxUint256);
    await masterChefV2.init(dummyTokenV2.address);

    const lpTokenV2 = await ERC20Mock.deploy("LP Token V2", "LPV2");
    const dummyTokenV3 = await ERC20Mock.deploy("Dummy Token V3", "DTV3");
    const dummyTokenForCakePool = await ERC20Mock.deploy("Dummy Token Cake Pool", "DTCP");
    const dummyTokenForSpecialPool2 = await ERC20Mock.deploy("Dummy Token Special pool 2", "DT");

    await masterChefV2.add(0, lpTokenV2.address, true, true); // regular farm with pid 0 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenV3.address, true, true); // regular farm with pid 1 and 1 allocPoint
    await masterChefV2.add(1, dummyTokenForCakePool.address, false, true); // special farm with pid 2 and 1 allocPoint
    await masterChefV2.add(0, dummyTokenForSpecialPool2.address, false, true); // special farm with pid 3 and 0 allocPoint

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

    // deploy ProxyForCakePoolFactory
    const ProxyForCakePoolFactory = await ethers.getContractFactoryFromArtifact(ProxyForCakePoolFactoryArtifact);
    ProxyForCakePoolFactorySC = await ProxyForCakePoolFactory.deploy();

    // deploy VECake
    const VECake = await ethers.getContractFactoryFromArtifact(VECakeArtifact);
    VECakeSC = await VECake.deploy(CakePoolSC.address, CakeTokenSC.address, ProxyForCakePoolFactorySC.address);

    await CakeTokenSC.connect(admin).approve(VECakeSC.address, ethers.constants.MaxUint256);

    await ProxyForCakePoolFactorySC.initialize(VECakeSC.address);

    await CakePoolSC.setVCakeContract(VECakeSC.address);

    await VECakeSC.initializeCakePoolMigration();

    const RevenueSharingPoolFactory = await ethers.getContractFactoryFromArtifact(RevenueSharingPoolFactoryArtifact);
    RevenueSharingPoolFactorySC = await RevenueSharingPoolFactory.deploy(VECakeSC.address);

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
      expect(await RevenueSharingPoolSC.VECake()).to.deep.eq(VECakeSC.address);
      expect(await RevenueSharingPoolSC.emergencyReturn()).to.deep.eq(admin.address);
      expect(await RevenueSharingPoolSC.canCheckpointToken()).deep.eq(false);
    });
  });

  describe("checkpointToken", () => {
    beforeEach(async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      await VECakeSC.connect(user1).migrateFromCakePool();
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user3).migrateFromCakePool();
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
    beforeEach(async function () {
      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);
    });

    context("One user", async () => {
      it("The user's balanceOfAt is equal to the totalSupplyAt at specific week cursor when have only one user", async () => {
        await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
        await VECakeSC.connect(user1).migrateFromCakePool();

        let latestTimestamp = BigNumber.from((await time.latest()).toString());

        let weekCursor = latestTimestamp.div(WEEK).mul(WEEK);
        let totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(weekCursor);

        let user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, weekCursor);

        expect(user1BalanceOfAt).to.deep.eq(ZERO);
        expect(totalSupplyAt).to.deep.eq(ZERO);

        let nextWeekCursor = latestTimestamp.div(WEEK).add(1).mul(WEEK);
        totalSupplyAt = await RevenueSharingPoolSC.totalSupplyAt(nextWeekCursor);

        user1BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user1.address, nextWeekCursor);
        let userinfoInVECake = await VECakeSC.getUserInfo(user1.address);

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
        const totalSupplyAtInVECake = await VECakeSC.totalSupplyAt(weekBlock.toNumber());
        expect(user1BalanceOfAt).to.deep.eq(totalSupplyAt);
        expect(totalSupplyAtInVECake).to.deep.eq(totalSupplyAt);
      });
    });

    context("Three users", async () => {
      it("The total balanceOfAt of all users is equal to the totalSupplyAt at specific week cursor", async () => {
        await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
        await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
        await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

        await VECakeSC.connect(user1).migrateFromCakePool();
        await VECakeSC.connect(user2).migrateFromCakePool();
        await VECakeSC.connect(user3).migrateFromCakePool();

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
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      await VECakeSC.connect(user1).migrateFromCakePool();
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user3).migrateFromCakePool();
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

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

    it("user can not claim reward again after had claimed", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
      await time.increaseTo(targetTime.toNumber());

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      await time.increaseTo(nextWeekTimeStamp.sub(DAY).toNumber());

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

      await RevenueSharingPoolSC.connect(user4).claim(user4.address);

      let user4BalanceClaimedAgain = await RevenueToken.balanceOf(user4.address);
      expect(user4BalanceClaimedAgain).to.deep.eq(user4BalanceAfter);
    });

    it("user can not claim reward again used claimTo after had claimTo", async () => {
      let latestTimestamp = BigNumber.from((await time.latest()).toString());
      const targetTime = latestTimestamp.div(WEEK).add(1).mul(WEEK).add(1);
      await time.increaseTo(targetTime.toNumber());

      latestTimestamp = BigNumber.from((await time.latest()).toString());
      let nextWeekTimeStamp = latestTimestamp.div(WEEK).add(1).mul(WEEK);

      await time.increaseTo(nextWeekTimeStamp.sub(DAY).toNumber());

      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await VECakeSC.connect(user4).migrateFromCakePool();

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

      await RevenueSharingPoolSC.connect(user4).claimTo(user4.address);
      user4BalanceAfter = await RevenueToken.balanceOf(user4.address);
      expect(user4BalanceAfter.gt(ZERO)).to.deep.eq(true);

      await RevenueSharingPoolSC.connect(user4).claimTo(user4.address);

      let user4BalanceClaimedAgain = await RevenueToken.balanceOf(user4.address);
      expect(user4BalanceClaimedAgain).to.deep.eq(user4BalanceAfter);
    });
  });

  describe("Delegator claim", () => {
    let delegatorLockEndTime;
    beforeEach(async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      // deploy mock delegator smart contract
      const Delegator = await ethers.getContractFactoryFromArtifact(DelegatorArtifact);
      delegatorSC = await Delegator.deploy(VECakeSC.address, CakeTokenSC.address);

      let now = (await time.latest()).toString();
      let OneYear = BigNumber.from(now).add(YEAR);

      // add whitelist for delegator in VECakeSC
      await VECakeSC.setWhitelistedCallers([delegatorSC.address], true);
      // add delegator in VECakeSC
      await VECakeSC.updateDelegator(delegatorSC.address, true, OneYear);

      // create lock for delegator
      await CakeTokenSC.approve(delegatorSC.address, ethers.utils.parseUnits("1"));
      delegatorLockEndTime = OneYear;
      await delegatorSC.createLock(ethers.utils.parseUnits("1"), OneYear);

      await VECakeSC.connect(user1).delegateFromCakePool(delegatorSC.address);
      await VECakeSC.connect(user2).delegateFromCakePool(delegatorSC.address);
      await VECakeSC.connect(user3).delegateFromCakePool(delegatorSC.address);
    });

    it("Claim reward amount should be equal with inject reward amount", async () => {
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

      await RevenueSharingPoolSC.claim(delegatorSC.address);

      const delegatorBalanceAfter = await RevenueToken.balanceOf(delegatorSC.address);

      expect(injectAmount).to.deep.eq(delegatorBalanceAfter);
    });

    it("The total balanceOfAt of all users is equal to the totalSupplyAt at specific week cursor", async () => {
      let totalLockAmountOfDelegator = ethers.utils
        .parseUnits("80000")
        .add(ethers.utils.parseUnits("90000"))
        .add(ethers.utils.parseUnits("100000"))
        .add(ethers.utils.parseUnits("1"));

      await CakeTokenSC.connect(user4).approve(VECakeSC.address, ethers.constants.MaxUint256);
      await VECakeSC.connect(user4).createLock(totalLockAmountOfDelegator, delegatorLockEndTime);

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

      const delegatorBalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(delegatorSC.address, weekCursor);
      const user4BalanceOfAt = await RevenueSharingPoolSC.balanceOfAt(user4.address, weekCursor);

      const userTotalBalanceOfAt = delegatorBalanceOfAt.add(user4BalanceOfAt);
      expect(userTotalBalanceOfAt).to.deep.eq(totalSupplyAt);
    });

    it("The owner can set recipient for smart contract", async () => {
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

      // set recipient for smart contract
      await RevenueSharingPoolSC.setRecipient(delegatorSC.address, recipient.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(delegatorSC.address);
      expect(everSetRecipient).to.deep.eq(false);

      const recipientBalanceBefore = await RevenueToken.balanceOf(recipient.address);

      await RevenueSharingPoolSC.claim(delegatorSC.address);

      const recipientBalanceAfter = await RevenueToken.balanceOf(recipient.address);
      const delegatorBalanceAfter = await RevenueToken.balanceOf(delegatorSC.address);

      expect(ZERO).to.deep.eq(delegatorBalanceAfter);
      expect(injectAmount).to.deep.eq(recipientBalanceAfter.sub(recipientBalanceBefore));
    });

    it("The owner can not set recipient for smart contract after had set before", async () => {
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

      // set recipient for smart contract
      await delegatorSC.setRecipient(RevenueSharingPoolSC.address, recipient.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(delegatorSC.address);
      expect(everSetRecipient).to.deep.eq(true);
      await expectRevert(
        RevenueSharingPoolSC.setRecipient(delegatorSC.address, recipient.address),
        "Permission denied"
      );
    });
  });

  describe("CanCheckpointToken", () => {
    beforeEach(async function () {
      await RevenueSharingPoolSC.setCanCheckpointToken(true);
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      await VECakeSC.connect(user1).migrateFromCakePool();
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user3).migrateFromCakePool();
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
    let rewardInWeekFour;
    beforeEach(async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 60);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      await VECakeSC.connect(user1).migrateFromCakePool();
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user3).migrateFromCakePool();

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

      it("Inject again with amount zero , still get reward in week four", async () => {
        await RevenueSharingPoolSC.injectReward(Week3.toNumber(), ethers.utils.parseEther("0"));
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
      });

      it("Get reward in week four", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        rewardInWeekFour = user1Balance;
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
      });

      it("Using claimMany , will get same reward in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claimMany([user1.address]);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);
      });

      it("Using claimMany with cake pool proxy address , will get same reward in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        let userInfo = await VECakeSC.userInfo(user1.address);
        await RevenueSharingPoolSC.connect(user1).claimMany([userInfo.cakePoolProxy]);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);
      });

      it("Using claimTo , will get same reward in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claimTo(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);
      });

      it("Using claim with cake pool proxy address , will get same reward in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        let userInfo = await VECakeSC.userInfo(user1.address);
        await RevenueSharingPoolSC.connect(user1).claim(userInfo.cakePoolProxy);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);
      });

      it("Using claimForUser with user address , will not get reward for cake pool proxy in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claimForUser(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance).to.deep.eq(ZERO);
      });

      it("Using claimForUser with cake pool proxy address , will get same reward in week four as used claim", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        let userInfo = await VECakeSC.userInfo(user1.address);
        await RevenueSharingPoolSC.connect(user1).claimForUser(userInfo.cakePoolProxy);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);
      });

      it("user can not claim reward again used claimForUser after had used claimForUser", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        let userInfo = await VECakeSC.userInfo(user1.address);
        await RevenueSharingPoolSC.connect(user1).claimForUser(userInfo.cakePoolProxy);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance).to.deep.eq(rewardInWeekFour);

        const user1BalanceClaimForUserAgain = await RevenueToken.balanceOf(user1.address);
        await RevenueSharingPoolSC.connect(user1).claimForUser(userInfo.cakePoolProxy);
        expect(user1Balance).to.deep.eq(user1BalanceClaimForUserAgain);
      });

      it("Set recipient, will claim reward to recipient address", async () => {
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).setRecipient(user1.address, recipient.address);
        let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(user1.address);
        expect(everSetRecipient).to.deep.eq(true);

        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        const recipientBalance = await RevenueToken.balanceOf(recipient.address);
        expect(user1Balance).to.deep.eq(ZERO);
        expect(recipientBalance).to.deep.eq(rewardInWeekFour);
      });

      it("Inject more , will get more reward in week four", async () => {
        await RevenueSharingPoolSC.injectReward(Week3.toNumber(), ethers.utils.parseEther("999"));
        await time.increaseTo(Week4.toNumber());

        await RevenueSharingPoolSC.checkpointToken();
        await RevenueSharingPoolSC.connect(user1).claim(user1.address);
        const user1Balance = await RevenueToken.balanceOf(user1.address);
        expect(user1Balance.gt(ZERO)).to.deep.eq(true);
        expect(user1Balance.gt(rewardInWeekFour)).to.deep.eq(true);
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

      it("The totalDistributed should be equal to all injected amount", async () => {
        await RevenueSharingPoolSC.injectReward(Week3.toNumber(), ethers.utils.parseEther("999"));

        let totalDistributed = await RevenueSharingPoolSC.totalDistributed();

        expect(totalDistributed).to.deep.eq(ethers.utils.parseEther("999").add(ethers.utils.parseEther("888")));
      });
    });
  });

  describe("getRecipient", () => {
    let Week1, Week2, Week3, Week4, Week5;
    beforeEach(async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 60);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 60);

      // stop emission in cake pool
      await masterChefV2.set(2, 0, true);
      await masterChefV2.set(3, 1, true);
      // update cake pool
      await CakePoolSC.connect(user4).deposit(ethers.utils.parseUnits("1"), 0);

      await VECakeSC.connect(user1).migrateFromCakePool();
      await VECakeSC.connect(user2).migrateFromCakePool();
      await VECakeSC.connect(user3).migrateFromCakePool();
    });

    it("Users recipient will be user address when user had no proxy and did not set recipient", async () => {
      let recipientAddress = await RevenueSharingPoolSC.getRecipient(user4.address);
      expect(recipientAddress).to.deep.eq(user4.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(user4.address);
      expect(everSetRecipient).to.deep.eq(false);
    });

    it("Users recipient will be user recipient address when user had no proxy and had set recipient", async () => {
      await RevenueSharingPoolSC.connect(user4).setRecipient(user4.address, recipient.address);
      let recipientAddress = await RevenueSharingPoolSC.getRecipient(user4.address);
      expect(recipientAddress).to.deep.eq(recipient.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(user4.address);
      expect(everSetRecipient).to.deep.eq(true);
    });

    it("Users proxy recipient will be user address when user had proxy and did not set recipient", async () => {
      let userInfo = await VECakeSC.userInfo(user1.address);
      let recipientAddress = await RevenueSharingPoolSC.getRecipient(userInfo.cakePoolProxy);
      expect(recipientAddress).to.deep.eq(user1.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(user1.address);
      expect(everSetRecipient).to.deep.eq(false);
    });

    it("Users proxy recipient will be user recipient address when user had proxy and had set recipient", async () => {
      let userInfo = await VECakeSC.userInfo(user1.address);
      await RevenueSharingPoolSC.connect(user1).setRecipient(user1.address, recipient.address);
      let recipientAddress = await RevenueSharingPoolSC.getRecipient(userInfo.cakePoolProxy);
      expect(recipientAddress).to.deep.eq(recipient.address);
      let everSetRecipient = await RevenueSharingPoolSC.everSetRecipient(user1.address);
      expect(everSetRecipient).to.deep.eq(true);
    });

    it("Users can not set recipient for other users", async () => {
      await expectRevert(
        RevenueSharingPoolSC.connect(user1).setRecipient(user2.address, recipient.address),
        "Permission denied"
      );
    });

    it("Owner can not set recipient for EOA users", async () => {
      await expectRevert(RevenueSharingPoolSC.setRecipient(user1.address, recipient.address), "Permission denied");
    });
  });
});
