import { Insight } from '@oipwg/insight-explorer'
import config from './config'

const FeePerKb = 100000

/**
 * An object that contains information about a coins Name, Network, and access to an explorer
 * @typedef {Object} CoinInfo
 * @property {string} name - All lowercase "name" of the CoinInfo, this is what is passed in to the `supportedCoins` check. This cannot include spaces.
 * @property {string} displayName - The Display Name for the Coin, this would be the full official name and can include spaces.
 * @property {string} ticker - The "Ticker" that is used to track the Coin on Exchanges
 * @property {number} satPerCoin - The number of satoshis per single coin
 * @property {number} feePerKb - The amount of fee in satoshis to pay per kilobyte of data being put into the blockchain
 * @property {number} feePerByte - The amount of fee in satoshis to pay per byte of data being put into the blockchain
 * @property {number} maxFeePerByte - The maximum fee to pay per byte of data being put into the blockchain
 * @property {number} minFee - The minimum fee that should ever be paid
 * @property {number} dust - Amount in Satoshis of the minimum value allowed to be sent around the network
 * @property {number} txVersion - The current TX version number for the coin
 * @property {Insight} explorer - An Insight explorer for the current coin so that data can be retrieved from the network
 * @property {CoinNetwork} network - The specific coin network variables, same as used in @oipwg/bitcoinjs-lib
 *
 */

/**
 * An object that contains version variables specific to the Coin
 * @typedef {Object} CoinNetwork
 * @property {Object} bip32 - BIP32 Variables
 * @property {number} bip32.public - The Extended Public Key version bytes
 * @property {number} bip32.private - The Extended Private Key version bytes
 * @property {number} slip44 - The `coinType` number for the coin, must match [SLIP-0044](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)
 * @property {string} messagePrefix - The Prefix to add on when checking/signing a message
 * @property {number} pubKeyHash - The coin specific "version" used when creating a Public Key Hash (Public Address)
 * @property {number} scriptHash - The coin specific "version" used when creating a Script Hash
 * @property {number} wif - Wallet Import Format "version" for this specific coin
 *
 */

module.exports = {
  name: '3333',
  displayName: '3333 coin',
  ticker: '3333',
  satPerCoin: 1e8,
  feePerKb: FeePerKb,
  feePerByte: FeePerKb / 1000,
  maxFeePerByte: 100,
  minFee: 0,
  dust: 100000,

  txVersion: 1,

  explorer: new Insight('https://mainnet.pi3333.tk/api'),

  network: {
    bip32: {
      public: 76067358,
      private: 76066276
    },
    slip44: 333333,
    messagePrefix: '\u001b3333coin Signed Message:\n',
    pubKeyHash: 35,
    scriptHash: 94,
    wif: 163
  }
}