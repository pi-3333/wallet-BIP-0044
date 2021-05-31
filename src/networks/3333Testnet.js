import { Insight } from '@oipwg/insight-explorer'
import config from './config'

const FeePerKb = 100000

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

  explorer: new Insight('https://testnet.pi3333.tk/api'),

  network: {
    bip32: {
      public: 76067358,
      private: 76066276
    },
    slip44: 333333,
    messagePrefix: '\u001b3333coin Signed Message:\n',
    pubKeyHash: 115,
    scriptHash: 58,
    wif: 239
  }
}