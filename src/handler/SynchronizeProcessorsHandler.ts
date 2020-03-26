/**
 *  SyncMerchants Handler
 */
import {
  BUILDER_DYNAMO_MIDDLEWARE,
  ERROR_API_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import { DynamoDBStreamEvent, Handler } from "aws-lambda";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import * as middy from "middy";
import "reflect-metadata";
import { ISyncService } from "repository/ISyncService";
import * as Rollbar from "rollbar";
import "source-map-support/register";

const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: Rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: middy.Middy<DynamoDBStreamEvent, object> = middy<
  Handler<DynamoDBStreamEvent>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      ISyncService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.SyncService, // Service Instance
      "syncProcessors", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_API_MIDDLEWARE(ROLLBAR))
  .use(BUILDER_DYNAMO_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR));

export { HANDLER };
