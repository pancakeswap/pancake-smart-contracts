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

const ZERO = BigNumber.from(0);

describe("VCake", () => {
  let CakePoolSC;
  let VCakeSC;
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
    await CakeTokenSC["mint(address,uint256)"](user2.address, ethers.utils.parseUnits("100000000"));
    await CakeTokenSC["mint(address,uint256)"](user3.address, ethers.utils.parseUnits("100000000"));

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

    const VCakeTest = await ethers.getContractFactoryFromArtifact(VCakeArtifact);
    VCakeSC = await VCakeTest.deploy(CakePoolSC.address, masterChefV2.address, 2);

    await CakePoolSC.setVCakeContract(VCakeSC.address);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_reset");
  });

  describe("Check VCake balance", () => {
    beforeEach(async function () {
      await VCakeSC.connect(user1).syncFromCakePool();
      await VCakeSC.connect(user2).syncFromCakePool();
      await VCakeSC.connect(user3).syncFromCakePool();

      await CakePoolSC.connect(user1).deposit(ethers.utils.parseUnits("80000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user2).deposit(ethers.utils.parseUnits("90000"), 3600 * 24 * 30);
      await CakePoolSC.connect(user3).deposit(ethers.utils.parseUnits("100000"), 3600 * 24 * 30);
    });

    it("The total balance of all users is equal to the totalSupply", async function () {
      const user1Balance = await VCakeSC.balanceOf(user1.address);
      const user2Balance = await VCakeSC.balanceOf(user2.address);
      const user3Balance = await VCakeSC.balanceOf(user3.address);

      const totalSupply = await VCakeSC.totalSupply();

      const usersBalance = user1Balance.add(user2Balance).add(user3Balance);

      expect(usersBalance).to.deep.eq(totalSupply);
    });

    it("The total balance of all users is equal to the totalSupply at specific block number", async function () {
      let user1Info = await CakePoolSC.userInfo(user1.address);
      console.log(user1Info.lockEndTime);

      let user1Balance = await VCakeSC.balanceOf(user1.address);
      let user2Balance = await VCakeSC.balanceOf(user2.address);
      let user3Balance = await VCakeSC.balanceOf(user3.address);

      let totalSupply = await VCakeSC.totalSupply();

      let usersBalance = user1Balance.add(user2Balance).add(user3Balance);
      expect(usersBalance).to.deep.eq(totalSupply);

      console.log(user1Balance, user2Balance, user3Balance, totalSupply);

      await time.increaseTo(user1Info.lockEndTime - 3600);

      user1Balance = await VCakeSC.balanceOf(user1.address);
      user2Balance = await VCakeSC.balanceOf(user2.address);
      user3Balance = await VCakeSC.balanceOf(user3.address);

      totalSupply = await VCakeSC.totalSupply();

      usersBalance = user1Balance.add(user2Balance).add(user3Balance);
      expect(usersBalance).to.deep.eq(totalSupply);

      console.log(user1Balance, user2Balance, user3Balance, totalSupply);

      await time.increaseTo(user1Info.lockEndTime + 3600);

      user1Balance = await VCakeSC.balanceOf(user1.address);
      user2Balance = await VCakeSC.balanceOf(user2.address);
      user3Balance = await VCakeSC.balanceOf(user3.address);

      totalSupply = await VCakeSC.totalSupply();

      usersBalance = user1Balance.add(user2Balance).add(user3Balance);
      expect(usersBalance).to.deep.eq(totalSupply);

      console.log(user1Balance, user2Balance, user3Balance, totalSupply);
    });

    it("Should return 0 when balanceOfAt(user, expiredBlock)", async function () {
      let user1Info = await CakePoolSC.userInfo(user1.address);

      await time.increaseTo(user1Info.lockEndTime - 100);
      let latestBN = (await time.latestBlock()).toString(10);
      let user1Balance = await VCakeSC.balanceOfAt(user1.address, latestBN);

      expect(user1Balance).to.not.eq(0);

      await time.increaseTo(user1Info.lockEndTime + 100);

      latestBN = (await time.latestBlock()).toString(10);
      user1Balance = await VCakeSC.balanceOfAt(user1.address, latestBN);
      expect(user1Balance).to.deep.eq(ZERO);
    });
  });
});
