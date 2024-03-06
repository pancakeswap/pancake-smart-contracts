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
import VCakeTestArtifact from "./artifactsFile/VCakeTest.json";

const ZERO = BigNumber.from(0);
const DAY = BigNumber.from(86400);
const WEEK = DAY.mul(7);

describe("VCake LockedBalance", () => {
  let CakePoolSC;
  let VCakeTestSC;
  let CakeTokenSC;
  let admin;
  let user1;
  let user2;
  let user3;
  before(async function () {
    [admin, user1, user2, user3] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactoryFromArtifact(ERC20MockArtifact);

    // Prepare for master chef v3

    const CakeToken = await ethers.getContractFactoryFromArtifact(CakeTokenArtifact);
    CakeTokenSC = await CakeToken.deploy();
    await CakeTokenSC["mint(address,uint256)"](admin.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user1.address, ethers.utils.parseUnits("100000000"));
    // await CakeTokenSC["mint(address,uint256)"](user2, ethers.utils.parseUnits("100000000"));
    // await CakeTokenSC["mint(address,uint256)"](user3, ethers.utils.parseUnits("100000000"));

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

    const VCakeTest = await ethers.getContractFactoryFromArtifact(VCakeTestArtifact);
    VCakeTestSC = await VCakeTest.deploy(CakePoolSC.address, masterChefV2.address, 2);

    await CakePoolSC.setVCakeContract(VCakeTestSC.address);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_reset");
  });

  describe("Check whether the formula for calculating the locked amount in the pool is correct when executing syncFromCakePool at first", () => {
    beforeEach(async function () {
      await VCakeTestSC.connect(user1).syncFromCakePool();
    });

    it("Deposit flexible for the first time in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 0);
      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);
      const user1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(ZERO);
      expect(prevLockedBalance.end).to.deep.eq(ZERO);

      expect(user1Info.lockedAmount).to.deep.eq(ZERO);
      expect(user1Info.lockEndTime).to.deep.eq(ZERO);

      expect(currentLockedBalance.amount).to.deep.eq(ZERO);
      expect(currentLockedBalance.end).to.deep.eq(ZERO);
    });

    it("Lock for the first time in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      const currentTime = (await time.latest()).toNumber();

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);
      const user1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(ZERO);
      expect(prevLockedBalance.end).to.deep.eq(ZERO);

      expect(user1Info.lockedAmount).to.deep.eq(ethers.utils.parseUnits("100000"));
      expect(user1Info.lockEndTime).to.deep.eq(BigNumber.from(currentTime + 3600 * 24 * 30));

      expect(currentLockedBalance.amount).to.deep.eq(user1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(user1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Extend lock duration for locked account in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      const currentTime = (await time.latest()).toNumber();

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      expect(prevUser1Info.lockEndTime).to.deep.eq(BigNumber.from(currentTime + 3600 * 24 * 30));

      await CakePoolSC.connect(user1).deposit(0, 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      expect(currentUser1Info.lockEndTime).to.deep.eq(BigNumber.from(currentTime + 3600 * 24 * 30 + 3600 * 24 * 30));

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Deposit more cake for locked account in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 0);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Deposit more cake and extend duration for locked account in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 60);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Lock again after expired in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 31);

      await CakePoolSC.connect(user1).deposit(0, 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Unlock for locked account without overdue fee in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 31);

      await CakePoolSC.connect(user1).unlock(user1.address);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Unlock for locked account with overdue fee in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 40);

      await CakePoolSC.connect(user1).unlock(user1.address);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Withdraw part in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 40);

      await CakePoolSC.connect(user1).withdraw(prevUser1Info.shares.div(BigNumber.from(2)));

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Withdraw all in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 40);

      await CakePoolSC.connect(user1).withdraw(prevUser1Info.shares);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Lock again after Withdraw part in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      let prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 32);

      await CakePoolSC.connect(user1).withdraw(prevUser1Info.shares.div(BigNumber.from(2)));

      prevUser1Info = await CakePoolSC.userInfo(user1.address);

      expect(prevUser1Info.shares.gt(ZERO)).to.deep.eq(true);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Lock again with overdue fee before DURATION_FACTOR_OVERDUE in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      let prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 60);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Lock again with overdue fee after DURATION_FACTOR_OVERDUE in CakePool", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      let prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * (30 + 200));

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });
  });

  describe("Check whether the formula for calculating the locked amount in the pool is correct when executing syncFromCakePool at any time", () => {
    beforeEach(async function () {});

    it("Lock for the first time in CakePool , executing syncFromCakePool after this", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      await VCakeTestSC.connect(user1).syncFromCakePool();

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);
      const user1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(ZERO);
      expect(prevLockedBalance.end).to.deep.eq(ZERO);

      expect(currentLockedBalance.amount).to.deep.eq(user1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(user1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Extend lock duration for locked account in CakePool, executing syncFromCakePool after the first lock", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      await VCakeTestSC.connect(user1).syncFromCakePool();
      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await CakePoolSC.connect(user1).deposit(0, 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Deposit more cake for locked account in CakePool, executing syncFromCakePool after the first lock", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      await VCakeTestSC.connect(user1).syncFromCakePool();

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 0);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Deposit more cake and extend duration for locked account in CakePool, executing syncFromCakePool after the first lock", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
      await VCakeTestSC.connect(user1).syncFromCakePool();

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.advanceBlockTo((await time.latestBlock()).toNumber() + 100);

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 60);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Lock again after expired in CakePool,executing syncFromCakePool after expired", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 31);

      await VCakeTestSC.connect(user1).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(0, 3600 * 24 * 30);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });

    it("Unlock for locked account without overdue fee in CakePool, executing syncFromCakePool after expired", async function () {
      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);

      const prevUser1Info = await CakePoolSC.userInfo(user1.address);

      await time.increase(3600 * 24 * 31);

      await VCakeTestSC.connect(user1).syncFromCakePool();

      await CakePoolSC.connect(user1).unlock(user1.address);

      const currentUser1Info = await CakePoolSC.userInfo(user1.address);

      const prevLockedBalance = await VCakeTestSC.prevLocks(user1.address);
      const currentLockedBalance = await VCakeTestSC.locks(user1.address);

      expect(prevLockedBalance.amount).to.deep.eq(prevUser1Info.lockedAmount);
      expect(prevLockedBalance.end).to.deep.eq(prevUser1Info.lockEndTime.div(WEEK).mul(WEEK));

      expect(currentLockedBalance.amount).to.deep.eq(currentUser1Info.lockedAmount);
      expect(currentLockedBalance.end).to.deep.eq(currentUser1Info.lockEndTime.div(WEEK).mul(WEEK));
    });
  });
});
