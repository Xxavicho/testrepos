/**
 * Container
 */
import {
  CONTAINER as CONT_CORE,
  IDENTIFIERS as CORE,
  ILogger,
  KushkiErrors,
} from "@kushki/core";
import { Firehose, SNS, SQS } from "aws-sdk";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import * as AWSXRay from "aws-xray-sdk";
import { IDENTIFIERS } from "constant/Identifiers";
import { AntifraudGateway } from "gateway/AntifraudGateway";
import { AurusGateway } from "gateway/AurusGateway";
import { BinListGateway } from "gateway/BinListGateway";
import { DynamoGateway } from "gateway/DynamoGateway";
import { FirehoseGateway } from "gateway/FirehoseGateway";
import { MastercardTokenGateway } from "gateway/MastercardTokenGateway";
import { SandboxGateway } from "gateway/SandboxGateway";
import { SNSGateway } from "gateway/SNSGateway";
import { SQSGateway } from "gateway/SQSGateway";
import { ErrorCode, ERRORS } from "infrastructure/ErrorEnum";
import { Container, interfaces } from "inversify";
import { makeLoggerMiddleware } from "inversify-logger-middleware";
import { get } from "lodash";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IBinInfoGateway } from "repository/IBinInfoGateway";
import { ICardGateway } from "repository/ICardGateway";
import { ICardService } from "repository/ICardService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IFirehoseGateway } from "repository/IFirehoseGateway";
import { INotificationService } from "repository/INotificationService";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { ISNSGateway } from "repository/ISNSGateway";
import { ISyncService } from "repository/ISyncService";
import { ITransactionService } from "repository/ITransactionService";
import { CardService } from "service/CardService";
import { NotificationService } from "service/NotificationService";
import { SyncService } from "service/SyncService";
import { TransactionService } from "service/TransactionService";

const CONT_APP: Container = new Container();
const LOGGER: interfaces.Middleware = makeLoggerMiddleware();

CONT_APP.applyMiddleware(LOGGER);

// Service
CONT_APP.bind<ITransactionService>(IDENTIFIERS.TransactionService).to(
  TransactionService
);
CONT_APP.bind<ICardService>(IDENTIFIERS.CardService).to(CardService);
CONT_APP.bind<INotificationService>(IDENTIFIERS.NotificationService).to(
  NotificationService
);
CONT_APP.bind<ISyncService>(IDENTIFIERS.SyncService).to(SyncService);

// Gateway
CONT_APP.bind<ICardGateway>(IDENTIFIERS.CardGateway).to(AurusGateway);
CONT_APP.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).to(DynamoGateway);
CONT_APP.bind<IFirehoseGateway>(IDENTIFIERS.FirehoseGateway).to(
  FirehoseGateway
);
CONT_APP.bind<IAntifraudGateway>(IDENTIFIERS.AntifraudGateway).to(
  AntifraudGateway
);
CONT_APP.bind<ISandboxGateway>(IDENTIFIERS.SandboxGateway).to(SandboxGateway);
CONT_APP.bind<IBinInfoGateway>(IDENTIFIERS.BinInfoGateway).to(BinListGateway);
CONT_APP.bind(IDENTIFIERS.TokenGateway).to(MastercardTokenGateway);
CONT_APP.bind<ISNSGateway>(IDENTIFIERS.ISNSGateway).to(SNSGateway);
CONT_APP.bind(IDENTIFIERS.SQSGateway).to(SQSGateway);

// Core
CONT_APP.bind<KushkiErrors<ErrorCode>>(CORE.KushkiErrors).toConstantValue(
  ERRORS
);

// External
const DYNAMO_CLIENT: DocumentClient = new DocumentClient({
  convertEmptyValues: true,
  logger: CONT_CORE.get<ILogger>(CORE.Logger),
});

AWSXRay.captureAWSClient(get(DYNAMO_CLIENT, "service"));
CONT_APP.bind<DocumentClient>(IDENTIFIERS.AwsDocumentClient).toDynamicValue(
  () => DYNAMO_CLIENT
);

const SNS_CLIENT: SNS = new SNS();

AWSXRay.captureAWSClient(SNS_CLIENT);
CONT_APP.bind<SNS>(IDENTIFIERS.AwsSns).toDynamicValue(() => SNS_CLIENT);

const FIREHOSE_CLIENT: Firehose = new Firehose({
  logger: CONT_CORE.get<ILogger>(CORE.Logger),
});

AWSXRay.captureAWSClient(FIREHOSE_CLIENT);
CONT_APP.bind<Firehose>(IDENTIFIERS.AwsFirehose).toDynamicValue(
  () => FIREHOSE_CLIENT
);

const SQS_CLIENT: SQS = new SQS();

AWSXRay.captureAWSClient(SQS_CLIENT);
CONT_APP.bind<SQS>(IDENTIFIERS.AwsSqs).toDynamicValue(() => SQS_CLIENT);
const CONTAINER: interfaces.Container = Container.merge(CONT_CORE, CONT_APP);

export { CONTAINER };
