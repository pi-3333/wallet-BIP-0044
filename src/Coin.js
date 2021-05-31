import * as bip32 from 'bip32'

import Account from './Account'
import TransactionBuilder from './TransactionBuilder'

const COIN_START = 0x80000000

/**
 * Manage Accounts for a specific Coin
 */
class Coin {
  /**
   * Create a new Coin object to interact with Accounts and Chains for that coin. This spawns a BIP44 compatible wallet.
   *
   * ##### Examples
   * Create a new Coin using a specified seed.
   *```
   *import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   *```
   * Create a new Coin using a specified seed, don't auto discover.
   *```
   *import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin, false)
   *```
   * @param  {string} node - BIP32 Node already derived to m/44'
   * @param  {CoinInfo} coin - The CoinInfo containing network & version variables
   * @param  {Object} [options] - The Options for spawning the Coin
   * @param  {boolean} [options.discover=true] - Should the Coin auto-discover Accounts and Chains
   * @param  {Object} [options.serializedData] - The Data to de-serialize from
   * @return {Coin}
   */
  constructor (node, coin, options) {
    if (typeof node === 'string') { this.seed = node } else { this.seed = node.toBase58() }

    this.coin = coin

    this.discover = true

    if (options && options.discover !== undefined) { this.discover = options.discover }

    const purposeNode = bip32.fromBase58(this.seed)
    purposeNode.network = this.coin.network

    let bip44Num = this.coin.network.slip44

    // Check if we need to convert the hexa to the index
    if (bip44Num >= COIN_START) { bip44Num -= COIN_START }

    this.root = purposeNode.derivePath(bip44Num + "'")

    this.accounts = {}

    if (options && options.serializedData) { this.deserialize(options.serializedData) }

    if (this.discover) {
      this.discoverAccounts()
    }
  }

  serialize () {
    const serializedAccounts = {}

    for (const accountNumber in this.accounts) {
      serializedAccounts[accountNumber] = this.accounts[accountNumber].serialize()
    }

    return {
      name: this.coin.name,
      network: this.coin.network,
      seed: this.seed,
      accounts: serializedAccounts
    }
  }

  deserialize (serializedData) {
    if (serializedData) {
      if (serializedData.accounts) {
        for (const accountNumber in serializedData.accounts) {
          if (!Object.prototype.hasOwnProperty.call(serializedData.accounts, accountNumber)) continue
          const accountMaster = bip32.fromBase58(serializedData.accounts[accountNumber].extendedPrivateKey, this.coin.network)

          this.accounts[accountNumber] = new Account(accountMaster, this.coin, {
            discover: false,
            serializedData: serializedData.accounts[accountNumber]
          })
        }
      }
    }
  }

  /**
   * Get the balance for the entire coin, or a specific address/array of addresses
   * @param  {Object} [options] - Specific options defining what balance to get back
   * @param {Boolean} [options.discover=true] - Should the Coin discover Accounts
   * @param {number|Array.<number>} [options.accounts=All Accounts in Coin] - Get Balance for defined Accounts
   * @param {string|Array.<string>} [options.addresses=All Addresses in each Account in Coin] - Get Balance for defined Addresses
   * @example <caption> Get Balance for entire Coin</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * bitcoin.getBalance().then((balance) => {
   *    console.log(balance)
   * })
   * @return {Promise<number>} A Promise that will resolve to the balance of the entire Coin
   */
  async getBalance (options) {
    if (!options || (options && options.discover === undefined) || (options && options.discover === true)) {
      try {
        await this.discoverAccounts()
      } catch (e) { throw new Error('Unable to Discover Coin Accounts for getBalance! \n' + e) }
    }

    const accountsToSearch = []

    // Check if we are an array (ex. [0,1,2]) or just a number (ex. 1)
    if (options && Array.isArray(options.accounts)) {
      for (const accNum of options.accounts) {
        if (!isNaN(accNum)) {
          accountsToSearch.push(accNum)
        }
      }
    } else if (options && !isNaN(options.accounts)) {
      accountsToSearch.push(options.accounts)
    } else {
      for (const accNum in this.accounts) {
        accountsToSearch.push(accNum)
      }
    }

    let totalBalance = 0

    let addrsToSearch

    if (options && options.addresses && (typeof options.addresses === 'string' || Array.isArray(options.addresses))) {
      addrsToSearch = options.addresses
    }

    for (const accNum of accountsToSearch) {
      if (this.accounts[accNum]) {
        try {
          const balanceRes = await this.accounts[accNum].getBalance({
            discover: false,
            addresses: addrsToSearch,
            id: accNum
          })

          totalBalance += balanceRes.balance
        } catch (e) { throw new Error('Unable to get Coin balance! \n' + e) }
      }
    }

    return totalBalance
  }

  /**
   * Get a specific Address
   * @param  {number} [accountNumber=0] - Number of the account you wish to get the Address from
   * @param  {number} [chainNumber=0] - Number of the Chain you wish to get the Address from
   * @param  {number} [addressIndex=0] - Index of the Address you wish to get
   * @return {Address}
   */
  getAddress (accountNumber, chainNumber, addressIndex) {
    return this.getAccount(accountNumber || 0).getAddress(chainNumber, addressIndex)
  }

  /**
   * Get the Main Address for a specific Account number.
   * This is the Address at index 0 on the External Chain of the Account.
   * @param  {number} [accountNumber=0] - Number of the Account you wish to get
   * @example <caption>Get Main Address for Coin</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let mainAddress = bitcoin.getMainAddress()
   * @example <caption>Get Main Address for Account #1 on Coin</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let mainAddress = bitcoin.getMainAddress(1)
   * @return {Address}
   */
  getMainAddress (accountNumber) {
    return this.getAccount(accountNumber || 0).getMainAddress()
  }

  /**
   * Get the Extended Private Key for the root path. This is derived at m/44'/coinType'
   * @example <caption>Get the Extended Private Key for the entire Coin</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let extPrivateKey = bitcoin.getExtendedPrivateKey()
   * // extPrivateKey = xprv9x8MQtHNRrGgrnWPkUxjUC57DWKgkjobwAYUFedxVa2FAA5qaQuGqLkJnVcszqomTar51PCR8JiKnGGgzK9eJKGjbpUirKPVHxH2PU2Rc93
   * @return {string} The Extended Private Key
   */
  getExtendedPrivateKey () {
    return this.root.toBase58()
  }

  /**
   * Get the Neutered Extended Public Key for the root path. This is derived at m/44'/coinType'
   * @example <caption>Get the Extended Private Key for the entire Coin</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let extPublicKey = bitcoin.getExtendedPrivateKey()
   * // extPublicKey = xpub6B7hpPpGGDpz5GarrWVjqL1qmYABACXTJPU5433a3uZE2xQz7xDXP94ndkjrxogjordTDSDaHY4i5G4HqRH6E9FJZk2F4ED4cbnprW2Vm9v
   * @return {string} The Extended Public Key
   */
  getExtendedPublicKey () {
    return this.root.neutered().toBase58()
  }

  /**
   * Get the Account at the specified number
   * @param  {number} [accountNumber=0]
   * @example <caption>Get Default Account</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let account = bitcoin.getAccount()
   * @example <caption>Get Account #1</caption>
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let account = bitcoin.getAccount(1)
   * @return {Account}
   */
  getAccount (accountNumber) {
    let num = accountNumber || 0

    if (typeof accountNumber === 'string' && !isNaN(parseInt(accountNumber))) { num = parseInt(accountNumber) }

    if (!this.accounts[num]) { return this.addAccount(num) }

    return this.accounts[num]
  }

  /**
   * Get all Accounts on the Coin
   * @example
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let accounts = bitcoin.getAccounts()
   * // accounts = {
   * //   0: Account,
   * //   1: Account
   * // }
   * @return {Object.<number, Account>} Returns a JSON object with accounts
   */
  getAccounts () {
    return this.accounts
  }

  /**
   * Add the Account at the specified number, if it already exists, it returns the Account.
   * If the Account does not exist, it will create it and then return it.
   * @param  {number} [accountNumber=0]
   * @param {Boolean} [discover=discover Set in Coin Constructor] - Should the Account start auto-discovery.
   * @example
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let account = bitcoin.addAccount(1)
   * @return {Account}
   */
  addAccount (accountNumber, discover) {
    let num = accountNumber || 0

    if (typeof accountNumber === 'string' && !isNaN(parseInt(accountNumber))) { num = parseInt(accountNumber) }

    // if the account has already been added, just return
    if (this.accounts[num]) { return this.getAccount(num) }

    const accountMaster = this.root.deriveHardened(num)

    let shouldDiscover

    if (discover !== undefined) { shouldDiscover = discover } else { shouldDiscover = this.discover }

    this.accounts[num] = new Account(accountMaster, this.coin, { discover: shouldDiscover })

    return this.getAccount(num)
  }

  /**
   * Get the CoinInfo for the Coin
   * @example
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin)
   * let coinInfo = bitcoin.getCoinInfo()
   * // coinInfo = Networks.bitcoin
   * @return {CoinInfo}
   */
  getCoinInfo () {
    return this.coin
  }

  getHighestAccountNumber () {
    let highestAccountNumber = 0

    for (const accNum in this.accounts) {
      if (accNum > highestAccountNumber) { highestAccountNumber = accNum }
    }

    return parseInt(highestAccountNumber)
  }

  /**
   * Discover all Accounts for the Coin
   * @example
   * import { Coin, Networks } from '@oipwg/hdmw'
   *
   * let bitcoin = new Coin('00000000000000000000000000000000', Networks.bitcoin, false)
   * bitcoin.discoverAccounts().then((accounts) => {
   *   console.log(accounts.length)
   * })
   * @return {Promise<Array.<Account>>} Returns a Promise that will resolve to an Array of Accounts once complete
   */
  async discoverAccounts () {
    // Reset the internal accounts
    this.accounts = {}

    // Get the Account #0 and start discovery there.
    try {
      await this.getAccount(0).discoverChains()
    } catch (e) { throw new Error('Unable to discoverAccounts! \n' + e) }

    while (this.accounts[this.getHighestAccountNumber()].getUsedAddresses().length > 0) {
      try {
        await this.getAccount(this.getHighestAccountNumber() + 1).discoverChains()
      } catch (e) { throw new Error('Unable to discover account #' + (this.getHighestAccountNumber() + 1) + '\n' + e) }
    }

    const discoveredAccounts = []

    for (const accNum in this.accounts) {
      discoveredAccounts.push(this.accounts[accNum])
    }

    return discoveredAccounts
  }
}


module.exports = Coin