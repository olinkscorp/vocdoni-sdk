import { Wallet } from '@ethersproject/wallet';
import { Election, PlainCensus, VocdoniSDKClient, Vote } from '../../src';
import { computePublicKey } from '@ethersproject/signing-key';
import { delay } from '../../src/util/common';

let client: VocdoniSDKClient;
let creator: Wallet;

beforeEach(async () => {
  creator = Wallet.createRandom();
  client = new VocdoniSDKClient(process.env.API_URL, creator);
  await client.ensureAccount();
}, 15000);

describe('Election integration tests', () => {
  it('should create an election with public keys census', async () => {
    const census = new PlainCensus();
    const now = new Date().getTime();

    census.add(computePublicKey(Wallet.createRandom().publicKey, true));
    census.add(computePublicKey(Wallet.createRandom().publicKey, true));
    census.add(computePublicKey(Wallet.createRandom().publicKey, true));
    const voter = Wallet.createRandom();
    census.add(computePublicKey(voter.publicKey, true));

    const election = new Election({
      title: 'Election title',
      description: 'Election description',
      header: 'https://source.unsplash.com/random',
      streamUri: 'https://source.unsplash.com/random',
      startDate: now + 25000,
      endDate: now + 10000000,
      census,
    });

    election.addQuestion('This is a title', 'This is a description', [
      {
        title: 'Option 1',
        value: 0,
      },
      {
        title: 'Option 2',
        value: 1,
      },
    ]);

    await client
      .createElection(election)
      .then(electionId => {
        expect(electionId).toMatch(/^[0-9a-fA-F]{64}$/);
        client.setElectionId(electionId);
        return delay(25000);
      })
      .then(() => {
        client.wallet = voter;
        const vote = new Vote([1]);
        return client.submitVote(vote);
      })
      .then(voteHash => expect(voteHash).toMatch(/^[0-9a-fA-F]{64}$/));
  }, 85000);
  it('should create an election with addresses census', async () => {
    const census = new PlainCensus();
    const now = new Date().getTime();

    census.add(await Wallet.createRandom().getAddress());
    census.add(await Wallet.createRandom().getAddress());
    census.add(await Wallet.createRandom().getAddress());
    const voter = Wallet.createRandom();
    census.add(await voter.getAddress());

    const election = new Election({
      title: 'Election title',
      description: 'Election description',
      header: 'https://source.unsplash.com/random',
      streamUri: 'https://source.unsplash.com/random',
      startDate: now + 25000,
      endDate: now + 10000000,
      census,
    });

    election.addQuestion('This is a title', 'This is a description', [
      {
        title: 'Option 1',
        value: 0,
      },
      {
        title: 'Option 2',
        value: 1,
      },
    ]);

    const delay = ms => new Promise(res => setTimeout(res, ms));
    await client
      .createElection(election)
      .then(electionId => {
        expect(electionId).toMatch(/^[0-9a-fA-F]{64}$/);
        client.setElectionId(electionId);
        return delay(25000);
      })
      .then(() => {
        client.wallet = voter;
        const vote = new Vote([1]);
        return client.submitVote(vote);
      })
      .then(voteHash => expect(voteHash).toMatch(/^[0-9a-fA-F]{64}$/));
  }, 85000);
});
