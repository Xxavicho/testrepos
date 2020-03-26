/**
 * Streams identifiers
 */

export type StreamList = {
  elastic: string;
  elasticBilling: string;
  redshift: string;
};

const STREAMS: StreamList = {
  elastic: `${process.env.FIREHOSE_ELASTIC}`,
  elasticBilling: `${process.env.FIREHOSE_ELASTIC_BILLING}`,
  redshift: `${process.env.FIREHOSE_REDSHIFT}`,
};
const SQS_RESOURCE: {
  WebhookQueue: string;
} = {
  WebhookQueue: `${process.env.SQS_WEBHOOK}`,
};

export { STREAMS, SQS_RESOURCE };
