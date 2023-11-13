import { CENSUS3_URL, QUEUE_WAIT_OPTIONS } from './util/constants';
import { ClientOptions } from './client';
import {
  Census3CensusAPI,
  Census3ServiceAPI,
  Census3StrategyAPI,
  Census3TokenAPI,
  ICensus3CensusResponse,
  ICensus3SupportedChain,
  Census3Token,
  Census3TokenSummary,
  Census3Strategy,
  Census3CreateStrategyToken,
  ICensus3ValidatePredicateResponse,
  ICensus3StrategiesOperatorsResponse,
} from './api';
import invariant from 'tiny-invariant';
import { isAddress } from '@ethersproject/address';
import { TokenCensus } from './types';
import { delay } from './util/common';

export type Token = Omit<Census3Token, 'tags'> & { tags: string[] };
export type TokenSummary = Census3TokenSummary;
export type Strategy = Census3Strategy;
export type StrategyToken = Census3CreateStrategyToken;
export type Census3Census = ICensus3CensusResponse;
export type SupportedChain = ICensus3SupportedChain;
export type ParsedPredicate = ICensus3ValidatePredicateResponse;

export class VocdoniCensus3Client {
  public url: string;
  public queueWait: { retryTime: number; attempts: number };

  /**
   * Instantiate new VocdoniCensus3 client.
   *
   * To instantiate the client just pass the `ClientOptions` you want or empty object to let defaults.
   *
   * `const client = new VocdoniCensus3Client({EnvOptions.PROD})`
   *
   * @param {ClientOptions} opts optional arguments
   */
  constructor(opts: ClientOptions) {
    this.url = opts.api_url ?? CENSUS3_URL[opts.env];
    this.queueWait = {
      retryTime: opts.tx_wait?.retry_time ?? QUEUE_WAIT_OPTIONS.retry_time,
      attempts: opts.tx_wait?.attempts ?? QUEUE_WAIT_OPTIONS.attempts,
    };
  }

  /**
   * Returns a list of summarized tokens supported by the service
   *
   * @returns {Promise<TokenSummary[]>} Token summary list
   */
  getSupportedTokens(): Promise<TokenSummary[]> {
    return Census3TokenAPI.list(this.url, { pageSize: -1 }).then((list) => list.tokens ?? []);
  }

  /**
   * Returns a list of supported chain identifiers
   *
   * @returns {Promise<number[]>} Supported chain list
   */
  getSupportedChains(): Promise<SupportedChain[]> {
    return Census3ServiceAPI.info(this.url).then((info) => info.supportedChains ?? []);
  }

  /**
   * Returns a list of supported tokens type
   *
   * @returns {Promise<string[]>} Supported tokens type list
   */
  getSupportedTypes(): Promise<string[]> {
    return Census3TokenAPI.types(this.url).then((types) => types.supportedTypes ?? []);
  }

  /**
   * Returns a list of supported strategies operators
   *
   * @returns {Promise<ICensus3StrategiesOperatorsResponse>} Supported strategies operators list
   */
  getSupportedOperators(): Promise<ICensus3StrategiesOperatorsResponse> {
    return Census3StrategyAPI.operators(this.url).then((operators) => operators);
  }

  /**
   * Returns the full token information based on the id (address)
   *
   * @param {string} id The id (address) of the token
   * @param {number} chainId The id of the chain
   * @param {string} externalId The identifier used by external provider
   * @returns {Promise<Token>} The token information
   */
  getToken(id: string, chainId: number, externalId?: string): Promise<Token> {
    invariant(id, 'No token id');
    invariant(chainId, 'No chain id');
    return Census3TokenAPI.token(this.url, id, chainId, externalId).then((token) => ({
      ...token,
      tags: token.tags?.split(',') ?? [],
    }));
  }

  /**
   * Returns if the holder ID is already registered in the database as a holder of the token.
   *
   * @param {string} tokenId The id (address) of the token
   * @param {number} chainId The id of the chain
   * @param {string} holderId The identifier of the holder
   * @param {string} externalId The identifier used by external provider
   * @returns {Promise<Token>} The token information
   */
  isHolderInToken(tokenId: string, chainId: number, holderId: string, externalId?: string): Promise<boolean> {
    invariant(tokenId, 'No token id');
    invariant(holderId, 'No holder id');
    invariant(chainId, 'No chain id');
    return Census3TokenAPI.holder(this.url, tokenId, chainId, holderId, externalId);
  }

  /**
   * Creates a new token to be tracked in the service
   *
   * @param {string} address The address of the token
   * @param {string} type The type of the token
   * @param {number} chainId The chain id of the token
   * @param {string} externalId The identifier used by external provider
   * @param {string} tags The tag list to associate the token with
   * @param {string} startBlock The start block where to start scanning
   */
  createToken(
    address: string,
    type: string,
    chainId: number = 1,
    externalId: string = '',
    tags: string[] = [],
    startBlock: number = 0
  ): Promise<void> {
    invariant(address, 'No token address');
    invariant(type, 'No token type');
    invariant(isAddress(address), 'Incorrect token address');
    return Census3TokenAPI.create(this.url, address, type, chainId, startBlock, tags?.join(), externalId);
  }

  /**
   * Returns the strategies
   *
   * @returns {Promise<Census3Strategy[]>} The list of strategies
   */
  getStrategies(): Promise<Census3Strategy[]> {
    return Census3StrategyAPI.list(this.url, { pageSize: -1 }).then((strategies) => strategies.strategies ?? []);
  }

  /**
   * Returns the strategies from the given token
   *
   * @param {string} id The id (address) of the token
   * @param {number} chainId The id of the chain
   * @param {string} externalId The identifier used by external provider
   * @returns {Promise<Census3Strategy[]>} The list of strategies
   */
  getStrategiesByToken(id: string, chainId: number, externalId?: string): Promise<Census3Strategy[]> {
    invariant(id, 'No token id');
    invariant(chainId, 'No chain id');
    return Census3StrategyAPI.listByToken(this.url, id, chainId, externalId).then(
      (strategies) => strategies.strategies
    );
  }

  /**
   * Returns the information of the strategy based on the id
   *
   * @param {number} id The id of the strategy
   * @returns {Promise<Strategy>} The strategy information
   */
  getStrategy(id: number): Promise<Strategy> {
    invariant(id || id >= 0, 'No strategy id');
    return Census3StrategyAPI.strategy(this.url, id);
  }

  /**
   * Returns the size of the strategy based on the id
   *
   * @param {number} id The id of the strategy
   * @returns {Promise<Strategy>} The strategy size
   */
  getStrategySize(id: number): Promise<number> {
    invariant(id || id >= 0, 'No strategy id');
    const waitForQueue = (queueId: string, wait?: number, attempts?: number): Promise<number> => {
      const waitTime = wait ?? this.queueWait?.retryTime;
      const attemptsNum = attempts ?? this.queueWait?.attempts;
      invariant(waitTime, 'No queue wait time set');
      invariant(attemptsNum >= 0, 'No queue attempts set');

      return attemptsNum === 0
        ? Promise.reject('Time out waiting for queue with id: ' + queueId)
        : Census3StrategyAPI.sizeQueue(this.url, id, queueId).then((queue) => {
            switch (true) {
              case queue.done && queue.error?.code?.toString().length > 0:
                return Promise.reject(new Error('Could not create the census'));
              case queue.done:
                return Promise.resolve(queue.size);
              default:
                return delay(waitTime).then(() => waitForQueue(queueId, waitTime, attemptsNum - 1));
            }
          });
    };

    return Census3StrategyAPI.size(this.url, id)
      .then((queueResponse) => queueResponse.queueID)
      .then((queueId) => waitForQueue(queueId));
  }

  /**
   * Creates a new strategy based on the given tokens and predicate
   *
   * @param {string} alias The alias of the strategy
   * @param {string} predicate The predicate of the strategy
   * @param tokens The token list for the strategy
   * @returns {Promise<number>} The strategy id
   */
  createStrategy(alias: string, predicate: string, tokens: { [key: string]: StrategyToken }): Promise<number> {
    invariant(alias, 'No alias set');
    invariant(predicate, 'No predicate set');
    invariant(tokens, 'No tokens set');
    return Census3StrategyAPI.create(this.url, alias, predicate, tokens).then(
      (createStrategy) => createStrategy.strategyID
    );
  }

  /**
   * Imports a strategy from IPFS from the given cid.
   *
   * @param {number} cid The IPFS cid of the strategy to import
   * @returns {Promise<Strategy>} The strategy information
   */
  importStrategy(cid: string): Promise<Strategy> {
    invariant(cid, 'No CID set');

    const waitForQueue = (queueId: string, wait?: number, attempts?: number): Promise<Strategy> => {
      const waitTime = wait ?? this.queueWait?.retryTime;
      const attemptsNum = attempts ?? this.queueWait?.attempts;
      invariant(waitTime, 'No queue wait time set');
      invariant(attemptsNum >= 0, 'No queue attempts set');

      return attemptsNum === 0
        ? Promise.reject('Time out waiting for queue with id: ' + queueId)
        : Census3StrategyAPI.importQueue(this.url, queueId).then((queue) => {
            switch (true) {
              case queue.done && queue.error?.code?.toString().length > 0:
                return Promise.reject(new Error('Could not import the strategy'));
              case queue.done:
                return Promise.resolve(queue.strategy);
              default:
                return delay(waitTime).then(() => waitForQueue(queueId, waitTime, attemptsNum - 1));
            }
          });
    };

    return Census3StrategyAPI.import(this.url, cid)
      .then((importStrategy) => importStrategy.queueID)
      .then((queueId) => waitForQueue(queueId));
  }

  /**
   * Validates a predicate
   *
   * @param {string} predicate The predicate of the strategy
   * @returns {Promise<ParsedPredicate>} The parsed predicate
   */
  validatePredicate(predicate: string): Promise<ParsedPredicate> {
    invariant(predicate, 'No predicate set');
    return Census3StrategyAPI.validatePredicate(this.url, predicate).then((validatePredicate) => validatePredicate);
  }

  /**
   * Returns the census3 censuses identifiers list
   *
   * @param {{ strategyId?: number }} options The options for listing
   * @returns {Promise<number[]>} The list of census3 censuses identifiers
   */
  getCensusesList(options?: { strategyId?: number }): Promise<Census3Census[]> {
    invariant(options.strategyId || options.strategyId >= 0, 'No strategy id');
    return Census3CensusAPI.list(this.url, options?.strategyId).then((response) => response.censuses);
  }

  /**
   * Returns the census3 censuses list
   *
   * @param {{ strategyId?: number }} options The options for listing
   * @returns {Promise<Census3Census[]>} The list of census3 censuses
   */
  getCensuses(options?: { strategyId?: number }): Promise<Census3Census[]> {
    return this.getCensusesList(options).then((censuses) =>
      Promise.all(censuses.map((census) => this.getCensus(census.censusID)))
    );
  }

  /**
   * Returns the census3 census based on the given identifier
   *
   * @param {number} id The id of the census
   * @returns {Promise<Census3Census>} The census3 census
   */
  getCensus(id: number): Promise<Census3Census> {
    invariant(id || id >= 0, 'No census id');
    return Census3CensusAPI.census(this.url, id);
  }

  /**
   * Creates the census based on the given strategy
   *
   * @param {number} strategyId The id of the strategy
   * @param {boolean} anonymous If the census has to be anonymous
   * @param {number} blockNumber The block number
   * @returns {Promise<Census3Census>} The census information
   */
  createCensus(strategyId: number, anonymous: boolean = false, blockNumber?: number): Promise<Census3Census> {
    invariant(strategyId || strategyId >= 0, 'No strategy id');

    const waitForQueue = (queueId: string, wait?: number, attempts?: number): Promise<Census3Census> => {
      const waitTime = wait ?? this.queueWait?.retryTime;
      const attemptsNum = attempts ?? this.queueWait?.attempts;
      invariant(waitTime, 'No queue wait time set');
      invariant(attemptsNum >= 0, 'No queue attempts set');

      return attemptsNum === 0
        ? Promise.reject('Time out waiting for queue with id: ' + queueId)
        : Census3CensusAPI.queue(this.url, queueId).then((queue) => {
            switch (true) {
              case queue.done && queue.error?.code?.toString().length > 0:
                return Promise.reject(new Error('Could not create the census'));
              case queue.done:
                return Promise.resolve(queue.census);
              default:
                return delay(waitTime).then(() => waitForQueue(queueId, waitTime, attemptsNum - 1));
            }
          });
    };

    return Census3CensusAPI.create(this.url, strategyId, anonymous, blockNumber)
      .then((createCensus) => createCensus.queueID)
      .then((queueId) => waitForQueue(queueId));
  }

  /**
   * Returns the actual census based on the given token
   *
   * @param {string} address The address of the token
   * @param {number} chainId The id of the chain
   * @param {boolean} anonymous If the census has to be anonymous
   * @param {string} externalId The identifier used by external provider
   * @returns {Promise<TokenCensus>} The token census
   */
  async createTokenCensus(
    address: string,
    chainId: number,
    anonymous: boolean = false,
    externalId?: string
  ): Promise<TokenCensus> {
    const token = await this.getToken(address, chainId, externalId);
    if (!token.status.synced) {
      return Promise.reject('Token is not yet synced.');
    }

    return this.createCensus(token.defaultStrategy, anonymous).then(
      (census) => new TokenCensus(census.merkleRoot, census.uri, anonymous, token, census.size, BigInt(census.weight))
    );
  }
}
