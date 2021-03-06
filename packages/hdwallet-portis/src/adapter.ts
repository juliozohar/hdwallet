import {
  Keyring,
  HDWallet,
  Events,
  ActionCancelled,
} from "@shapeshiftoss/hdwallet-core";

import { PortisHDWallet } from "./portis";
import Portis from "@portis/web3";

type PortisWallet = any;

const INACTIVITY_LOGOUT_TIME = 10 * 60 * 1000;

export class PortisAdapter {
  keyring: Keyring;
  portis: any;
  portisAppId: string;

  /// wallet id to remove from the keyring when the active wallet changes
  currentDeviceId: string;

  private constructor(
    keyring: Keyring,
    args: { portis?: PortisWallet; portisAppId?: string }
  ) {
    this.portis = args.portis;
    this.portisAppId = args.portisAppId;
    this.keyring = keyring;
  }

  public static useKeyring(
    keyring: Keyring,
    args: { portis?: PortisWallet; portisAppId?: string }
  ) {
    return new PortisAdapter(keyring, args);
  }

  public async initialize(): Promise<number> {
    return Object.keys(this.keyring.wallets).length;
  }

  public async pairDevice(): Promise<HDWallet> {
    try {
      const wallet = await this.pairPortisDevice();
      this.portis.onActiveWalletChanged(async (wallAddr) => {
        // check if currentDeviceId has changed
        const walletAddress = "portis:" + wallAddr;
        if (
          !this.currentDeviceId ||
          walletAddress.toLowerCase() !== this.currentDeviceId.toLowerCase()
        ) {
          this.keyring.emit(
            ["Portis", this.currentDeviceId, Events.DISCONNECT],
            this.currentDeviceId
          );
          this.keyring.remove(this.currentDeviceId);
          this.pairPortisDevice();
        }
      });
      this.portis.onLogout(() => {
        this.keyring.emit(
          ["Portis", this.currentDeviceId, Events.DISCONNECT],
          this.currentDeviceId
        );
        this.keyring.remove(this.currentDeviceId);
      });
      return wallet;
    } catch (e) {
      if (e.message && e.message.includes("User denied login.")) {
        throw new ActionCancelled();
      } else {
        throw e;
      }
    }
  }

  private async pairPortisDevice(): Promise<HDWallet> {
    this.portis = new Portis(this.portisAppId, "mainnet");
    const wallet = new PortisHDWallet(this.portis);
    await wallet.initialize();
    const deviceId = await wallet.getDeviceID();
    this.keyring.add(wallet, deviceId);
    this.currentDeviceId = deviceId;
    this.keyring.emit(["Portis", deviceId, Events.CONNECT], deviceId);

    const watchForInactivity = () => {
      let time;
      const resetTimer = () => {
        clearTimeout(time);
        time = setTimeout(() => {
          window.onload = null;
          document.onmousemove = null;
          document.onkeypress = null;
          clearTimeout(time);
          this.portis.logout();
        }, INACTIVITY_LOGOUT_TIME);
      };
      window.onload = resetTimer;
      document.onmousemove = resetTimer;
      document.onkeypress = resetTimer;
      resetTimer();
    };

    watchForInactivity();
    return wallet;
  }
}
