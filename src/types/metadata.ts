import { MultiLanguage } from '../util/common';
import { object, array, string, number } from 'yup';
import { by639_1 } from 'iso-language-codes';

/**
 * Asserts that the given metadata is valid.
 * Throws an exception if it is not.
 */
export function checkValidProcessMetadata(processMetadata: ProcessMetadata): ProcessMetadata {
  if (typeof processMetadata != 'object') throw new Error('The metadata must be a JSON object');
  else if (processMetadata.questions.length < 1) throw new Error('The metadata needs to have at least one question');
  else if (processMetadata.questions.some(q => !Array.isArray(q.choices) || q.choices.length < 2))
    throw new Error('All questions need to have at least two choices');

  try {
    processMetadataSchema.validateSync(processMetadata);
    return processMetadataSchema.cast(processMetadata) as ProcessMetadata;
  } catch (err) {
    if (Array.isArray(err.errors)) throw new Error('ValidationError: ' + err.errors.join(', '));
    throw err;
  }
}

// Like { en: string(), fr: string, it: string, ... }
const strLangCodes = Object.keys(by639_1).reduce((prev, cur) => {
  prev[cur] = string().optional();
  return prev;
}, {});

const multiLanguageStringKeys = {
  ...strLangCodes,
  default: string().optional(),
};

export interface IChoice {
  title: MultiLanguage<string>;
  value: number;
}

export interface IQuestion {
  title: MultiLanguage<string>;
  description?: MultiLanguage<string>;
  choices: Array<IChoice>;
}

const processMetadataSchema = object()
  .shape({
    version: string()
      .matches(/^[0-9]\.[0-9]$/)
      .required(),
    title: object()
      .shape(multiLanguageStringKeys)
      .required(),
    description: object()
      .shape(multiLanguageStringKeys)
      .required(),
    media: object().shape({
      header: string().required(),
      streamUri: string().optional(),
    }),
    meta: object().optional(),
    questions: array()
      .of(
        object().shape({
          title: object()
            .shape(multiLanguageStringKeys)
            .required(),
          description: object()
            .shape(multiLanguageStringKeys)
            .optional(),
          choices: array()
            .of(
              object().shape({
                title: object()
                  .shape(multiLanguageStringKeys)
                  .required(),
                value: number()
                  .integer()
                  .required(),
              })
            )
            .required(),
        })
      )
      .required(),
    results: object()
      .shape({
        aggregation: string()
          .required()
          .oneOf(['index-weighted', 'discrete-counting']),
        display: string()
          .required()
          .oneOf([
            'rating',
            'simple-question',
            'multiple-choice',
            'linear-weighted',
            'quadratic-voting',
            'multiple-question',
            'raw',
          ]),
      })
      .required(),
  })
  .unknown(true); // allow deprecated or unknown fields beyond the required ones

type ProtocolVersion = '1.1';

export type ProcessResultsAggregation = 'index-weighted' | 'discrete-counting';
export type ProcessResultsDisplay =
  | 'rating'
  | 'simple-question'
  | 'multiple-choice'
  | 'linear-weighted'
  | 'quadratic-voting'
  | 'multiple-question'
  | 'raw';

/**
 * JSON metadata. Intended to be stored on IPFS or similar.
 * More info: https://vocdoni.io/docs/#/architecture/components/process?id=process-metadata-json
 */
export interface ProcessMetadata {
  version: ProtocolVersion; // Version of the metadata schema used
  title: MultiLanguage<string>;
  description: MultiLanguage<string>;
  media: {
    header: string;
    streamUri?: string;
  };
  /** Arbitrary key/value data that specific applications can use for their own needs */
  meta?: any;
  questions: Array<IQuestion>;
  results: {
    aggregation: ProcessResultsAggregation;
    display: ProcessResultsDisplay;
  };
}

export const ProcessMetadataTemplate: ProcessMetadata = {
  version: '1.1',
  title: {
    default: '', // Universal Basic Income
  },
  description: {
    default: '', // ## Markdown text goes here\n### Abstract
  },
  media: {
    header: 'https://source.unsplash.com/random/800x600', // Content URI
    streamUri: '',
  },
  meta: {},
  questions: [
    {
      title: {
        default: '', // Should universal basic income become a human right?
      },
      description: {
        default: '', // ## Markdown text goes here\n### Abstract
      },
      choices: [
        {
          title: {
            default: 'Yes',
          },
          value: 0,
        },
        {
          title: {
            default: 'No',
          },
          value: 1,
        },
      ],
    },
  ],
  results: {
    aggregation: 'discrete-counting',
    display: 'multiple-question',
  },
};
