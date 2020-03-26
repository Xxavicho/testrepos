/**
 * ICard Service file.
 */
import { IAPIGatewayEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { TokenResponse } from "types/remote/token_response";
import { TokensCardRequest } from "types/tokens_card_request";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";

/**
 * Card Service Interface
 */
export interface ICardService {
  /**
   *  Request a token from Aurus
   */
  tokens(
    event: IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
  ): Observable<TokenResponse>;

  /**
   *  Request a capture request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   */
  capture(
    event: IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>
  ): Observable<object>;

  /**
   *  Request a charge request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   */
  charges(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<object>;

  /**
   *  Request a pre Authorization  request to Aurus
   * @param event - an IApiGatewayEvent with charge body
   */
  preAuthorization(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<object>;

  /**
   *  Void a transaction
   */
  chargeDelete(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object>;
  /**
   *  Void a transaction in card and subscription services
   */
  chargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object>;
  /**
   * Void a chargeBack
   */
  chargeBack(
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext
    >
  ): Observable<boolean>;

  /**
   * Get deferred conditions with a specific bin
   */
  deferred(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<object>;

  /**
   * Get bin info from a specific bin
   */
  binInfo(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<BinInfo>;
}
