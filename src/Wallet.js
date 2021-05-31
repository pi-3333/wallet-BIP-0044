import * as bip32 from 'bip32'
import * as bip39 from 'bip39'
import Exchange from '@oipwg/exchange-rate'
import { Insight } from '@oipwg/insight-explorer'
import axios from 'axios'

import Coin from './Coin'
import networks from './networks'
import networkConfig from './networks/config'

import { isEntropy, isMnemonic, isValidPublicAddress } from './util'

const DEFAULT_SUPPORTED_COINS = ['bitcoin', 'litecoin', 'flo', 'raven']
const DEFAULT_SUPPORTED_TESTNET_COINS = ['bitcoinTestnet', 'floTestnet', 'litecoinTestnet', 'ravenTestnet']

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Full Service [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) Multi-Coin Wallet supporting both sending and receiving payments */
class Wallet {
  /**
   * Create a new [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) wallet with the supplied settings
   *
   * ##### Examples
   * Create wallet with Random Mnemonic
   * ```
   * let wallet = new Wallet()
   * ```
   * Create wallet from [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Mnemonic
   * ```
   * let wallet = new Wallet("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")
   * ```
   * Create wallet from [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Entropy
   * ```
   * let wallet = new Wallet('00000000000000000000000000000000')
   * ```
   * Create wallet from Seed Hex
   * ```
   * let wallet = new Wallet("5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4")
   * ```
   * Create wallet from Seed Buffer
   * ```
   * let wallet = new Wallet(Buffer.from("5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4", "hex"))
   * ```
   *
   * @param  {string|Buffer} [seed] - [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Mnemonic, [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Entropy, or Seed Hex/Buffer
   * @param  {Object} [options] - Wallet settings
   * @param {boolean} [options.discover=false] - Defines if the Wallet should "auto-discover" Coin Account chains or not
   * @param {Array.<string>} [options.supportedCoins=['bitcoin', 'litecoin', 'flo']] - An Array of coins that the Wallet should support
   * @param {Array.<CoinInfo>} [options.networks] - An array containing a custom coins network info
   * @param {Object} [options.serializedData] - A previous Wallet state to reload from
   *
   * @example <caption>Create wallet using Mnemonic</caption>
   * let wallet = new Wallet("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")
   *
   * @return {Wallet}
   */
  constructor (seed, options) {
    // Check if seed is a string or buffer, if not, create a new BIP39 Mnemonic
    if (isMnemonic(seed)) {
      this.fromMnemonic(seed)
    } else if (isEntropy(seed)) {
      this.fromEntropy(seed)
    } else if (seed) {
      this.fromSeed(seed)
    } else {
      this.fromMnemonic(bip39.generateMnemonic())
    }

    // Derive the "m" level of the BIP44 wallet
    this.masterNode = bip32.fromSeed(Buffer.from(this.seed, 'hex'))

    // Set the networks to the imported defaults
    this.networks = networks

    // Check for custom coins/networks
    if (options && typeof options === 'object') {
      // Check if the user has defined their own supported coins for the wallet
      if (options.supportedCoins) {
        if (typeof options.supportedCoins === 'string') {
          this.supportedCoins = [options.supportedCoins]
        } else if (Array.isArray(options.supportedCoins)) {
          this.supportedCoins = options.supportedCoins
        }
      }
      // Check if the user has defined any custom networks that should be imported
      if (options.networks && typeof options.networks === 'object') {
        // Attach each passed in network, overwrite if needed
        for (const node in options.networks) {
          if (!Object.prototype.hasOwnProperty.call(options.networks, node)) continue
          this.networks[node] = options.networks[node]
        }
      }
    }

    // If we were not passed in a supported coin array by the options, then set it to the default options.
    if (!this.supportedCoins || !Array.isArray(this.supportedCoins)) { this.supportedCoins = DEFAULT_SUPPORTED_COINS }

    // The array to hold the live coin objects
    this.coins = {}

    // An optional variable to say if we should auto run address discovery on Account Chains
    if (options && (options.discover || options.discover === false)) { this.discover = options.discover } else { this.discover = true }

    // Attempt to deserialize if we were passed serialized data
    if (options && options.serializedData) { this.deserialize(options.serializedData) }

    // Add all coins
    for (const coinName of this.supportedCoins) { this.addCoin(coinName) }
  }

  serialize () {
    const serializedCoins = {}

    for (const name in this.coins) {
      serializedCoins[name] = this.coins[name].serialize()
    }

    return {
      masterNode: this.masterNode.toBase58(),
      seed: this.getMnemonic() ? this.getMnemonic() : this.seed,
      coins: serializedCoins
    }
  }

  deserialize (serializedData) {
    if (serializedData) {
      if (serializedData.coins) {
        for (const name in serializedData.coins) {
          if (!Object.prototype.hasOwnProperty.call(serializedData.coins, name)) continue
          this.addCoin(name, { serializedData: serializedData.coins[name] })
        }
      }
    }
  }

  /**
   * Add a Coin to the Wallet
   * @param {String} name    - The coin "name" as defined in CoinInfo.name
   * @param {Object} [options] - Options you want passed to the coin being added
   */
  addCoin (name, options) {
    const opts = options || {}

    if (!opts.discover) { opts.discover = this.discover }

    // If the coin isn't already added AND we have access to a valid network,
    // then add the coin.
    if (!this.coins[name] && this.networks[name]) {
      this.coins[name] = new Coin(this.masterNode.derivePath('44\''), this.networks[name], opts)
    }
  }

  /**
   * Get a specific Coin
   * @param  {string} coin - The coin "name" as defined in CoinInfo.name
   * @example
   * let wallet = new Wallet();
   * let coin = wallet.getCoin("bitcoin")
   * @return {Coin} Returns the requested Coin
   */
  getCoin (coin) {
    for (const c in this.coins) {
      if (c === coin) { return this.coins[c] }
    }
  }

  /**
   * Get all Coins running inside the Wallet
   * @example
   * let wallet = new Wallet();
   * let coins = wallet.getCoins();
   * // coins = {
   * //  "bitcoin": Coin,
   * //  "litecoin": Coin,
   * //  "flo": Coin
   * // }
   * @return {Object.<number, Coin>} Object containing all coins
   */
  getCoins () {
    return this.coins
  }

  async GetCoinBalance (coin, options) {
    // This is a helper function to catch errors thrown by coin.getBalance() and return them
    let balance

    try {
      balance = await coin.getBalance(options)
    } catch (e) {
      return {
        error: new Error('Unable to get individual Coin Balance \n' + e)
      }
    }

    return {
      balance
    }
  }

  /**
   * Get Coin Balances
   * @param {Object} [options] - The options for searching the Balance of coins
   * @param  {Array} [options.coins=["bitcoin", "litecoin", "flo"]] - An array of coin names you want to get the balances for. If no coins are given, an array of all available coins will be used.
   * @param {Boolean} [options.discover=true] - Should we attempt a new discovery, or just grab the available balances
   * @param {Boolean} [options.testnet=true] - Should we attempt to get balances for testnet coins as well (coins ending with 'Testnet')
   *
   * @return {Promise<Object>} Returns a Promise that will resolve to an Object containing info about each coins balance, along with errors if there are any
   *
   * @example
   * let wallet = new Wallet(...)
   * wallet.getCoinBalances(["bitcoin", "litecoin", "flo"])
   *
   * //example return
   * {
   *      "flo": 2.16216,
   *      "bitcoin": "error fetching balance",
   *      "litecoin": 3.32211
   * }
   */
  async getCoinBalances (options = { discover: true, testnet: true }) {
    const coinnames = options.coins || Object.keys(this.getCoins())

    // when passing in custom options object, it's easy to forget to set the defaults, so just in case
    if (options.discover === undefined) {
      options.discover = true
    }

    // checking if false so that if undefined, it will proceed normally
    if (options.testnet === false) {
      for (let i = coinnames.length - 1; i >= 0; i--) {
        if (coinnames[i].includes('Testnet')) {
          coinnames.splice(i, 1)
        }
      }
    }

    const coinPromises = {}

    for (const name of coinnames) {
      coinPromises[name] = this.GetCoinBalance(this.getCoin(name), options)
    }

    const coinBalances = {}

    for (const coin in coinPromises) {
      const response = await coinPromises[coin]

      if (typeof response.balance === 'number') { coinBalances[coin] = response.balance } else { coinBalances[coin] = `error fetching balance: ${JSON.stringify(response)}` }
    }

    return coinBalances
  }

  /**
   * Calculate Exchange Rates for supported coins
   * @param {Object} [options] - The options for getting the exchange rates
   * @param {Array}  [options.coins=["bitcoin", "litecoin", "flo"]] - An array of coin names you want to get the balances for. If no coins are given, an array of all available coins will be used.
   * @param {String} [options.fiat="usd"] - The fiat type for which you wish to get the exchange rate for
   *
   * @return {Promise<Object>} Returns a Promise that will resolve to an Object containing info about each coins exchange rate, along with errors if there are any
   *
   * @example
   * let wallet = new Wallet(...)
   * wallet.getExchangeRates(["flo", "bitcoin", "litecoin"], "usd")
   *
   * //returns
   * {
   *      "flo": expect.any(Number) || "error",
   *      "bitcoin": expect.any(Number) || "error",
   *      "litecoin": expect.any(Number) || "error"
   * }
   */
  async getExchangeRates (options = { fiat: 'usd' }) {
    const coins = options.coins || Object.keys(this.getCoins())

    if (!coins) throw new Error('No coins found to fetch exchange rates')
    if (!options.fiat) { options.fiat = 'usd' }

    // Initialize an Exchange object
    if (!this.Exchange) { this.Exchange = new Exchange() }

    const promiseArray = {}

    for (const coinname of coins) {
      if (coinname.includes('Testnet')) { break }
      promiseArray[coinname] = this.Exchange.getExchangeRate(coinname, options.fiat)
    }

    const rates = {}

    for (const coinname in promiseArray) {
      try {
        rates[coinname] = await promiseArray[coinname]
      } catch (err) {
        rates[coinname] = 'error fetching rate'
      }
    }

    return rates
  }

  /**
   * Calculate Balance of coins after exchange rate conversion
   * @param {Object} [options] - The options for getting the exchange rates
   * @param {Array}  [options.coins=["bitcoin", "litecoin", "flo"]] - An array of coin names you want to get the balances for. If no coins are given, an array of all available coins will be used.
   * @param {String} [options.fiat="usd"] - The fiat type for which you wish to get the exchange rate for
   * @param {Boolean} [options.discover=true] - Should we attempt a new discovery, or just grab the available balances
   * @param {Boolean} [options.testnet=true] - should we include testnet coins?
   * @return {Promise<Object>} Returns a Promise that will resolve to the fiat balances for each coin
   * @example
   * let wallet = new Wallet(...)
   * wallet.getFiatBalances(["flo", "bitcoin", "litecoin"], "usd")
   *
   * //returns
   * {
   *      "flo": expect.any(Number) || "error",
   *      "bitcoin": expect.any(Number) || "error",
   *      "litecoin": expect.any(Number) || "error"
   * }
   */
  async getFiatBalances (options) {
    const fiatBalances = {}
    let balances = {}
    let xrates = {}

    try {
      balances = await this.getCoinBalances(options)
    } catch (err) {
      throw new Error(`Failed to get coin balances: ${JSON.stringify(err)}`)
    }

    try {
      xrates = await this.getExchangeRates(options)
    } catch (err) {
      throw new Error(`Failed to get exchange rates: ${JSON.stringify(err)}`)
    }

    for (const coinB in balances) {
      for (const coinX in xrates) {
        if (coinB === coinX) {
          // Both have been grabbed with no errors
          if (!isNaN(balances[coinB]) && !isNaN(xrates[coinX])) {
            fiatBalances[coinB] = balances[coinB] * xrates[coinX]
          }
        }
      }
    }

    // Set the error state for coins not properly returned
    for (const coinName of this.supportedCoins) {
      if (!fiatBalances[coinName]) {
        fiatBalances[coinName] = 'error'
      }
    }

    return fiatBalances
  }

  /**
   * Init Wallet from BIP39 Mnemonic
   * @param  {string} mnemonic - A BIP39 Mnemonic String
   * @example
   * let wallet = new Wallet();
   * wallet.fromMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")
   * @return {Boolean} Returns if the operation was successful
   */
  fromMnemonic (mnemonic) {
    if (isMnemonic(mnemonic)) {
      this.mnemonic = mnemonic
      this.entropy = bip39.mnemonicToEntropy(this.mnemonic)
      this.seed = bip39.mnemonicToSeedSync(this.mnemonic).toString('hex')

      return true
    }

    return false
  }

  /**
   * Get the [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Mnemonic, if defined
   * @example
   * let wallet = new Wallet('00000000000000000000000000000000');
   * let mnemonic = wallet.getMnemonic()
   * // mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
   * @return {string}
   */
  getMnemonic () {
    return this.mnemonic
  }

  /**
   * Init Wallet from BIP39 Entropy
   * @param  {string} entropy - A BIP39 Entropy String
   * @example
   * let wallet = new Wallet();
   * wallet.fromEntropy('00000000000000000000000000000000')
   * @return {Boolean} Returns if the operation was successful
   */
  fromEntropy (entropy) {
    if (isEntropy(entropy)) {
      this.entropy = entropy
      this.mnemonic = bip39.entropyToMnemonic(this.entropy)

      return this.fromMnemonic(this.mnemonic)
    }

    return false
  }

  /**
   * Get the Entropy value used to generate the [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) Mnemonic.
   * Note that the Entropy will only be defined if we are creating
   * a wallet from Entropy or a Mnemonic, not off of just the Seed Hex
   *
   * @example
   * let wallet = new Wallet("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
   * let entropy = wallet.getEntropy()
   * // entropy = '00000000000000000000000000000000'
   * @return {string}
   */
  getEntropy () {
    return this.entropy
  }

  /**
   * Init Wallet from a Seed
   * @param  {string|Buffer} seed
   * @example
   * let wallet = new Wallet();
   * wallet.fromSeed("example-seed");
   * @return {Boolean} Returns if the operation was successful
   */
  fromSeed (seed) {
    if (seed instanceof Buffer) {
      this.seed = seed.toString('hex')
      return true
    } else if (typeof seed === 'string') {
      this.seed = seed
      return true
    }

    return false
  }

  /**
   * Get the Encoded Seed hex string
   * @example
   * let wallet = new Wallet('00000000000000000000000000000000');
   * let seedHex = wallet.getSeed()
   * // seedHex = '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
   * @return {string} The hex string of the seed buffer
   */
  getSeed () {
    return this.seed
  }

  /**
   * Returns the network information for the coins available
   * @return Array.<CoinInfo>
   */
  getNetworks () {
    return this.networks
  }

  setNetworks (networks) {
    this.networks = networks
  }

  /**
   * Add default SUPPORTED testnet coins to wallet
   * @param {Boolean} [bool=true] - if true, add testnet coins, is false, remove them
   */
  addTestnetCoins (bool = true) {
    if (bool) {
      for (const coinName of DEFAULT_SUPPORTED_TESTNET_COINS) { this.addCoin(coinName) }
    } else {
      for (const coinName of DEFAULT_SUPPORTED_TESTNET_COINS) { delete this.coins[coinName] }
    }
  }

  /**
   * Set the urls for the insight api explorers
   * @param options
   * @param {string} options.flo - flo api
   * @param {string} options.floTestnet - floTestnet api
   * @param {string} options.bitcoin - bitcoin api
   * @param {string} options.bitcoinTestnet - bitcoinTestnet api
   * @param {string} options.litecoin - litecoin api
   * @param {string} options.litecoinTestnet - litecoinTestnet api
   * @example
   * let options = {
   *     flo: 'myFloSiteApi.com/yadayada,
   *     bitcoin: 'myBitcoinApi.superApi/AyePeeEye',
   *     litecoin: 'superLightCoin.hero'
   * }
   * new Wallet(mnemonic, {discover: false}).setNetworkApi(options)
   */
  setExplorerUrls (options) {
    const networks = this.getNetworks()
    for (const networkCoin in networks) {
      for (const coin in options) {
        if (networkCoin === coin) {
          networks[coin].explorer = new Insight(options[coin])
        }
      }
    }
    this.setNetworks(networks)
  }

  /**
   * Get back the network explorer apis for supported coins
   */
  getExplorerUrls () {
    const networks = this.getNetworks()

    const networkObject = {}
    for (const walletCoin of Object.keys(this.getCoins())) {
      for (const networkCoin in networks) {
        if (walletCoin === networkCoin) {
          networkObject[walletCoin] = networks[walletCoin].explorer.url
        }
      }
    }
    return networkObject
  }

  resetExplorerUrls () {
    this.setExplorerUrls(networkConfig.defaultApiUrls)
  }

  static getDefaultExplorerUrls () {
    return networkConfig.defaultApiUrls
  }

  async purchaseRecord ({ txid, terms }) {
    try {
    // lookup a record at txid & terms
      const response = await axios.get(`https://api.oip.io/oip/o5/location/request?id=${txid}&terms=${terms}`)

      const { valid_until: validUntil, pre_image: preImage } = response.data

      const res = await axios.get(`https://api.oip.io/oip/o5/record/get/${txid}`)

      //! ask Bits about hard coding template.
      const { amount, destination } = res.data.results[0].record.details.tmpl_DE84D583

      const account = this.getCoin('flo').getAccount()
      const mainAddress = account.getMainAddress() // address with a balance
      const publicAddress = mainAddress.getPublicAddress()

      // send desired amount to to address

      const paymentTxid = await account.sendPayment({
        to: { [destination]: amount },
        from: publicAddress
      })

      await sleep(10000)

      // proof constructed by sining the request pre_image with address (that sent FLO)

      const signature = mainAddress.signMessage(preImage)

      const body = {
        valid_until: validUntil,
        id: txid,
        term: terms,
        pre_image: preImage,
        signature,
        payment_txid: paymentTxid,
        signing_address: publicAddress
      }

      // location/request needs to be submitted
      const res2 = await axios.post(`https://api.oip.io/oip/o5/location/proof?id=${txid}&terms=${terms}`, body)

      return res2.data
    } catch (error) {
      console.log(error)
    }
  }
}


module.exports = Wallet