/**
 *  RecordApi Handler
 */
import {
  BUILDER_API_GATEWAY_MIDDLEWARE,
  ContentTypeEnum,
  ERROR_API_MIDDLEWARE,
  IAPIGatewayEvent,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
  StatusCodeEnum,
  VALIDATION_MIDDLEWARE,
} from "@kushki/core";
import { Handler } from "aws-lambda";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { SchemaEnum } from "infrastructure/SchemaEnum";
import * as middy from "middy";
import "reflect-metadata";
import { ITransactionService } from "repository/ITransactionService";
import * as Rollbar from "rollbar";
import "source-map-support/register";

const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: Rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: middy.Middy<IAPIGatewayEvent<string | object>, object> = middy<
  Handler<IAPIGatewayEvent<string | object>>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      ITransactionService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.TransactionService, // Service Instance
      "record", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_API_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR))
  .use(
    BUILDER_API_GATEWAY_MIDDLEWARE(
      ROLLBAR,
      ContentTypeEnum.JSON,
      StatusCodeEnum.OK,
      ContentTypeEnum.JSON,
      true
    )
  )
  .use(
    VALIDATION_MIDDLEWARE(ROLLBAR, {
      body: { name: SchemaEnum.record_transaction_request },
    })
  );

export { HANDLER };
