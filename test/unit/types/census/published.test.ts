import { CensusType, PublishedCensus } from '../../../../src';

const validCensusId = '43cbda11b9d1a322c03eac325eb8a7b72779b46a76f8a727cff94b539ed9b903';
const validCensusURI = 'ipfs://QmeowUvr4Q9SMBSB942QVzFAqQQYukbjLYXxwANH3oTxbf';
const validCensusType = CensusType.WEIGHTED;

let census: PublishedCensus;

beforeEach(() => {
  census = new PublishedCensus(validCensusId, validCensusURI, validCensusType);
});

describe('Published census tests', () => {
  it('should throw with no valid census identifier', () => {
    expect(() => {
      new PublishedCensus(null, validCensusURI, validCensusType);
    }).toThrow('Census identifier is missing or invalid');
    expect(() => {
      new PublishedCensus(
        '43cbda11b9d1s322c03eac325eb8a7b72779b46a76f8a727cff94b539ed9b903',
        validCensusURI,
        validCensusType
      );
    }).toThrow('Census identifier is missing or invalid');
  });
  it('should throw with no valid census URI', () => {
    expect(() => {
      new PublishedCensus(validCensusId, null, validCensusType);
    }).toThrow('Census URI is missing or invalid');
    expect(() => {
      new PublishedCensus(validCensusId, 'test', validCensusType);
    }).toThrow('Census URI is missing or invalid');
  });
  it('should throw with no valid census type', () => {
    expect(() => {
      new PublishedCensus(validCensusId, validCensusURI, null);
    }).toThrow('Census type is missing or invalid');
    expect(() => {
      new PublishedCensus(validCensusId, validCensusURI, 'test' as CensusType);
    }).toThrow('Census type is missing or invalid');
  });
  it('should be published', () => {
    expect(census.isPublished).toBeTruthy();
  });
  it('should have the correct type', () => {
    expect(census.type).toBe(validCensusType);
  });
});
