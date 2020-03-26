/**
 *  Sync Async Transaction  Handler
 */
import {
  BUILDER_SNS_MIDDLEWARE,
  ERROR_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  ISnsEvent,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import { Handler } from "aws-lambda";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import * as middy from "middy";
import "reflect-metadata";
import * as Rollbar from "rollbar";
import { SyncService } from "service/SyncService";
import "source-map-support/register";

const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: Rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: middy.Middy<ISnsEvent<string | object>, object> = middy<
  Handler<ISnsEvent<string | object>>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      SyncService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.SyncService, // Service Instance
      "syncAsyncTransactions", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR))
  .use(BUILDER_SNS_MIDDLEWARE(ROLLBAR));

export { HANDLER };
