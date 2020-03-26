/**
 *  Webhook Handler
 */
import {
  BUILDER_SQS_MIDDLEWARE,
  ERROR_MIDDLEWARE,
  IDENTIFIERS as ID,
  IHandler,
  INPUT_OUTPUT_LOGS,
  IRollbar,
  ISQSEvent,
  SETUP_MIDDLEWARE,
  SSM_MIDDLEWARE,
} from "@kushki/core";
import { Handler } from "aws-lambda";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import * as middy from "middy";
import "reflect-metadata";
import { INotificationService } from "repository/INotificationService";
import * as Rollbar from "rollbar";
import "source-map-support/register";

const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: Rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: middy.Middy<ISQSEvent<string | object>, object> = middy<
  Handler<ISQSEvent<string | object>>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      INotificationService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.NotificationService, // Service Instance
      "webhookSqs", // Service Method
      CONTAINER,
      ROLLBAR
    )
  )
)
  .use(SETUP_MIDDLEWARE(ROLLBAR))
  .use(INPUT_OUTPUT_LOGS(ROLLBAR))
  .use(ERROR_MIDDLEWARE(ROLLBAR))
  .use(SSM_MIDDLEWARE(ROLLBAR))
  .use(BUILDER_SQS_MIDDLEWARE(ROLLBAR));

export { HANDLER };
