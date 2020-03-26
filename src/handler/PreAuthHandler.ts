/**
 *  Pre Authorization Handler
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
import { ICardService } from "repository/ICardService";
import * as Rollbar from "rollbar";
import "source-map-support/register";

const CORE: IHandler = CONTAINER.get<IHandler>(ID.Handler);
const ROLLBAR: Rollbar = CONTAINER.get<IRollbar>(ID.Rollbar).init();
const HANDLER: middy.Middy<IAPIGatewayEvent<string | object>, object> = middy<
  Handler<IAPIGatewayEvent<string | object>>
>(
  ROLLBAR.lambdaHandler(
    CORE.run<
      ICardService, // Service Definition
      object // Service observable resolve type
    >(
      IDENTIFIERS.CardService, // Service Instance
      "preAuthorization", // Service Method
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
      StatusCodeEnum.Created,
      ContentTypeEnum.JSON,
      true
    )
  )
  .use(
    VALIDATION_MIDDLEWARE(ROLLBAR, {
      body: { name: SchemaEnum.charges_card_request },
    })
  );

export { HANDLER };
