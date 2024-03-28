import { Service, ServiceProperties } from './service';
import {
  ArchivedElection,
  Census,
  CspCensus,
  ElectionResultsTypeNames,
  InvalidElection,
  PublishedCensus,
  PublishedElection,
  UnpublishedElection,
} from '../types';
import { AccountAPI, CensusTypeEnum, ElectionAPI, IElectionCreateResponse, IElectionKeysResponse } from '../api';
import { CensusService } from './census';
import { allSettled } from '../util/promise';
import invariant from 'tiny-invariant';
import { ElectionCore } from '../core/election';
import { ChainService } from './chain';
import { Wallet } from '@ethersproject/wallet';
import { Signer } from '@ethersproject/abstract-signer';
import { ArchivedCensus } from '../types/census/archived';
import { keccak256 } from '@ethersproject/keccak256';
import { Buffer } from 'buffer';

interface ElectionServiceProperties {
  censusService: CensusService;
  chainService: ChainService;
}

type ElectionServiceParameters = ServiceProperties & ElectionServiceProperties;

export interface FetchElectionsParameters {
  account: string;
  page: number;
}

export type ElectionKeys = IElectionKeysResponse;
export type ElectionCreatedInformation = IElectionCreateResponse;

export enum ElectionCreationSteps {
  GET_CHAIN_DATA = 'get-chain-data',
  CENSUS_CREATED = 'census-created',
  GET_ACCOUNT_DATA = 'get-account-data',
  GET_DATA_PIN = 'get-data-pin',
  GENERATE_TX = 'generate-tx',
  SIGN_TX = 'sign-tx',
  CREATING = 'creating',
  DONE = 'done',
}

export type ElectionCreationStepValue =
  | { key: ElectionCreationSteps.GET_CHAIN_DATA }
  | { key: ElectionCreationSteps.CENSUS_CREATED }
  | { key: ElectionCreationSteps.GET_ACCOUNT_DATA }
  | { key: ElectionCreationSteps.GET_DATA_PIN }
  | { key: ElectionCreationSteps.GENERATE_TX }
  | { key: ElectionCreationSteps.SIGN_TX }
  | { key: ElectionCreationSteps.CREATING; txHash: string }
  | { key: ElectionCreationSteps.DONE; electionId: string };

export class ElectionService extends Service implements ElectionServiceProperties {
  public censusService: CensusService;
  public chainService: ChainService;

  /**
   * Instantiate the election service.
   *
   * @param params - The service parameters
   */
  constructor (params: Partial<ElectionServiceParameters>) {
    super();
    Object.assign(this, params);
  }

  public async signTransaction (tx: Uint8Array, message: string, walletOrSigner: Wallet | Signer): Promise<string> {
    invariant(this.chainService, 'No chain service set');
    return this.chainService.fetchChainData().then(chainData => {
      const payload = message
        .replace('{hash}', ElectionCore.hashTransaction(tx))
        .replace('{chainId}', chainData.chainId);
      return ElectionCore.signTransaction(tx, payload, walletOrSigner);
    });
  }

  private buildPublishedCensus (electionInfo): Promise<PublishedCensus> {
    return this.censusService
      .get(electionInfo.census.censusRoot)
      .then(
        censusInfo =>
          new PublishedCensus(
            electionInfo.census.censusRoot,
            electionInfo.census.censusURL,
            censusInfo.type ??
              Census.censusTypeFromCensusOrigin(electionInfo.census.censusOrigin, electionInfo.voteMode.anonymous),
            censusInfo.size,
            censusInfo.weight
          )
      );
  }

  private buildCensus (electionInfo): Promise<PublishedCensus | ArchivedCensus> {
    if (electionInfo.census.censusOrigin === CensusTypeEnum.OFF_CHAIN_CA) {
      return Promise.resolve(new CspCensus(electionInfo.census.censusRoot, electionInfo.census.censusURL));
    }
    return electionInfo.fromArchive
      ? Promise.resolve(new ArchivedCensus(electionInfo.census.censusRoot, electionInfo.census.censusURL))
      : this.buildPublishedCensus(electionInfo);
  }

  /**
   * Fetches info about an election.
   *
   * @param electionId - The id of the election
   */
  async fetchElection (electionId: string): Promise<PublishedElection | ArchivedElection> {
    invariant(this.url, 'No URL set');
    invariant(this.censusService, 'No census service set');

    const electionInfo = await ElectionAPI.info(this.url, electionId).catch(err => {
      err.electionId = electionId;
      throw err;
    });

    const electionParameters = {
      id: electionInfo.electionId,
      organizationId: electionInfo.organizationId,
      title: electionInfo.metadata?.title,
      description: electionInfo.metadata?.description,
      header: electionInfo.metadata?.media.header,
      streamUri: electionInfo.metadata?.media.streamUri,
      meta: electionInfo.metadata?.meta,
      startDate: electionInfo.startDate,
      endDate: electionInfo.endDate,
      census: await this.buildCensus(electionInfo),
      maxCensusSize: electionInfo.census.maxCensusSize,
      manuallyEnded: electionInfo.manuallyEnded,
      fromArchive: electionInfo.fromArchive,
      chainId: electionInfo.chainId,
      status: electionInfo.status,
      voteCount: electionInfo.voteCount,
      finalResults: electionInfo.finalResults,
      results: electionInfo.result,
      metadataURL: electionInfo.metadataURL,
      creationTime: electionInfo.creationTime,
      electionType: {
        autoStart: electionInfo.electionMode.autoStart,
        interruptible: electionInfo.electionMode.interruptible,
        dynamicCensus: electionInfo.electionMode.dynamicCensus,
        secretUntilTheEnd: electionInfo.voteMode.encryptedVotes,
        anonymous: electionInfo.voteMode.anonymous,
      },
      voteType: {
        uniqueChoices: electionInfo.voteMode.uniqueValues,
        maxVoteOverwrites: electionInfo.tallyMode.maxVoteOverwrites,
        costFromWeight: electionInfo.voteMode.costFromWeight,
        costExponent: electionInfo.tallyMode.costExponent,
        maxCount: electionInfo.tallyMode.maxCount,
        maxValue: electionInfo.tallyMode.maxValue,
        maxTotalCost: electionInfo.tallyMode.maxTotalCost,
      },
      questions: electionInfo.metadata?.questions.map((question, qIndex) => ({
        title: question.title,
        description: question.description,
        numAbstains: this.calculateMultichoiceAbstains(electionInfo.metadata.type, electionInfo.result),
        choices: question.choices.map((choice, cIndex) => ({
          title: choice.title,
          value: choice.value,
          results: this.calculateChoiceResults(electionInfo.metadata.type.name, electionInfo.result, qIndex, cIndex),
        })),
      })),
      resultsType: electionInfo.metadata?.type,
      raw: electionInfo,
    };

    return electionParameters.fromArchive
      ? new ArchivedElection(electionParameters)
      : new PublishedElection(electionParameters);
  }

  private calculateChoiceResults (electionType, result, qIndex, cIndex) {
    try {
      switch (electionType) {
        case ElectionResultsTypeNames.SINGLE_CHOICE_MULTIQUESTION:
          return result ? result[qIndex][cIndex] : null;
        case ElectionResultsTypeNames.APPROVAL:
          return result ? result[cIndex][1] : null;
        case ElectionResultsTypeNames.MULTIPLE_CHOICE:
          return result
            .reduce((prev, cur) => {
              return prev + +cur[cIndex];
            }, 0)
            .toString();
        case ElectionResultsTypeNames.BUDGET:
          return result[cIndex][0];
        default:
          return result ? result[qIndex][cIndex] : null;
      }
    } catch (e) {
      return result ? result[qIndex][cIndex] : null;
    }
  }

  private calculateMultichoiceAbstains (electionType, result) {
    try {
      switch (electionType.name) {
        case ElectionResultsTypeNames.MULTIPLE_CHOICE:
          let abstains = 0;
          for (const pos of electionType.properties.abstainValues) {
            abstains += result.reduce((prev, cur) => {
              return prev + +cur[+pos];
            }, 0);
          }
          return abstains.toString();
        default:
          return null;
      }
    } catch (e) {
      return null;
    }
  }

  async fetchElections (
    params: Partial<FetchElectionsParameters>
  ): Promise<Array<PublishedElection | ArchivedElection | InvalidElection>> {
    invariant(this.url, 'No URL set');
    const settings = {
      account: null,
      page: 0,
      ...params,
    };

    let electionList;
    if (settings.account) {
      electionList = AccountAPI.electionsList(this.url, settings.account, settings.page);
    } else {
      electionList = ElectionAPI.electionsList(this.url, settings.page);
    }

    return electionList
      .then(elections =>
        allSettled(elections?.elections?.map(election => this.fetchElection(election.electionId)) ?? [])
      )
      .then(elections =>
        elections.map(election =>
          election.status === 'fulfilled' ? election.value : new InvalidElection({ id: election?.reason?.electionId })
        )
      );
  }

  /**
   * Creates a new election.
   *
   * @param payload - The set information info raw payload to be submitted to the chain
   * @param metadata - The base64 encoded metadata JSON object
   * @returns The created election information
   */
  create (payload: string, metadata: string): Promise<ElectionCreatedInformation> {
    invariant(this.url, 'No URL set');
    return ElectionAPI.create(this.url, payload, metadata);
  }

  /**
   * Returns the next election id.
   *
   * @param address - The address of the account
   * @param election - The unpublished election
   * @returns The next election identifier
   */
  nextElectionId (address: string, election: UnpublishedElection): Promise<string> {
    invariant(this.url, 'No URL set');
    const censusOrigin = ElectionCore.censusOriginFromCensusType(election.census.type);
    return ElectionAPI.nextElectionId(this.url, address, censusOrigin, {
      serial: false, // TODO
      anonymous: election.electionType.anonymous,
      encryptedVotes: election.electionType.secretUntilTheEnd,
      uniqueValues: election.voteType.uniqueChoices,
      costFromWeight: election.voteType.costFromWeight,
    }).then(response => response.electionID);
  }

  /**
   * Returns an election salt for address
   *
   * @param address - The address of the account
   * @param electionCount - The election count
   * @returns The election salt
   */
  getElectionSalt (address: string, electionCount: number): Promise<string> {
    invariant(this.url, 'No URL set');
    invariant(this.chainService, 'No chain service set');
    return this.chainService.fetchChainData().then(chainData => {
      return keccak256(Buffer.from(address + chainData.chainId + electionCount.toString()));
    });
  }

  /**
   * Returns a numeric election identifier
   *
   * @param electionId - The identifier of the election
   * @returns The numeric identifier
   */
  getNumericElectionId (electionId: string): number {
    const arr = electionId.substring(electionId.length - 8, electionId.length).match(/.{1,2}/g);
    const uint32Array = new Uint8Array(arr.map(byte => parseInt(byte, 16)));
    const dataView = new DataView(uint32Array.buffer);
    return dataView.getUint32(0);
  }

  /**
   * Fetches the encryption keys from the specified process.
   *
   * @param electionId - The identifier of the election
   */
  keys (electionId: string): Promise<ElectionKeys> {
    invariant(this.url, 'No URL set');
    return ElectionAPI.keys(this.url, electionId);
  }

  /**
   * Estimates the election cost
   *
   * @returns The cost in tokens.
   */
  estimateElectionCost (election: UnpublishedElection): Promise<number> {
    invariant(this.chainService, 'No chain service set');
    return this.chainService
      .fetchChainCosts()
      .then(chainCosts => ElectionCore.estimateElectionCost(election, chainCosts))
      .then(cost => Math.trunc(cost));
  }

  /**
   * Calculate the election cost
   *
   * @returns The cost in tokens.
   */
  calculateElectionCost (election: UnpublishedElection): Promise<number> {
    invariant(this.url, 'No URL set');
    return ElectionAPI.price(
      this.url,
      election.maxCensusSize,
      election.duration,
      election.electionType.secretUntilTheEnd,
      election.electionType.anonymous,
      election.voteType.maxVoteOverwrites
    ).then(cost => cost.price);
  }
}
