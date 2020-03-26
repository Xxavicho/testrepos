/**
 * Injection identifiers
 */

export type containerSymbol = {
  AntifraudGateway: symbol;
  AwsDocumentClient: symbol;
  AwsFirehose: symbol;
  AwsSns: symbol;
  AwsSqs: symbol;
  BinInfoGateway: symbol;
  CardGateway: symbol;
  CardService: symbol;
  ConciliationService: symbol;
  DynamoGateway: symbol;
  FirehoseGateway: symbol;
  SandboxGateway: symbol;
  SQSGateway: symbol;
  SubscriptionService: symbol;
  SyncService: symbol;
  NotificationService: symbol;
  TokenGateway: symbol;
  TransactionService: symbol;
  ISNSGateway: symbol;
};

const IDENTIFIERS: containerSymbol = {
  AntifraudGateway: Symbol.for("AntifraudGateway"),
  AwsDocumentClient: Symbol.for("AwsDocumentClient"),
  AwsFirehose: Symbol.for("Firehose"),
  AwsSns: Symbol.for("AwsSns"),
  AwsSqs: Symbol.for("AwsSqs"),
  BinInfoGateway: Symbol.for("BinInfoGateway"),
  CardGateway: Symbol.for("CardGateway"),
  CardService: Symbol.for("CardService"),
  ConciliationService: Symbol.for("ConciliationService"),
  DynamoGateway: Symbol.for("DynamoGateway"),
  FirehoseGateway: Symbol.for("FirehoseGateway"),
  ISNSGateway: Symbol.for("SNSGateway"),
  NotificationService: Symbol.for("NotificationService"),
  SandboxGateway: Symbol.for("SandboxGateway"),
  SQSGateway: Symbol.for("SQSGateway"),
  SubscriptionService: Symbol.for("SubscriptionService"),
  SyncService: Symbol.for("SyncService"),
  TokenGateway: Symbol.for("TokenGateway"),
  TransactionService: Symbol.for("TransactionService"),
};

export { IDENTIFIERS };
