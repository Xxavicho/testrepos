import {
  AurusError,
  IDENTIFIERS as CORE_ID,
  ILambdaGateway,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { inject, injectable } from "inversify";
import { get, set } from "lodash";
import { parseFullName } from "parse-full-name";
import { ICardGateway } from "repository/ICardGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { map, switchMap } from "rxjs/operators";
import { AurusAmount } from "types/aurus_amount";
import { AurusChargesRequest } from "types/aurus_charges_request";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensRequest } from "types/aurus_tokens_request";
import { ChargesCardRequest, Currency } from "types/charges_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SandboxChargeResponse } from "types/sandbox_charge_response";
import { SandboxTokensResponse } from "types/sandbox_tokens_response";
import { CardToken, TokensCardRequest } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";

/**
 * Aurus SandBox Gateway Implementation
 */
@injectable()
export class SandboxGateway implements ISandboxGateway {
  private readonly _processEmail: string = "dev@kushkipagos.com";
  private readonly _lambda: ILambdaGateway;
  private readonly _aurusGtw: ICardGateway;

  constructor(
    @inject(CORE_ID.LambdaGateway) sandbox: ILambdaGateway,
    @inject(IDENTIFIERS.CardGateway) aurus: ICardGateway
  ) {
    this._lambda = sandbox;
    this._aurusGtw = aurus;
  }

  public chargesTransaction(
    body: ChargesCardRequest,
    mid: string,
    trxReference: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch
  ): Observable<AurusResponse> {
    return this._buildChargeParams(
      body,
      mid,
      trxReference,
      plcc,
      tokenInfo
    ).pipe(
      switchMap((request: AurusChargesRequest) =>
        this._lambda.invokeFunction<SandboxChargeResponse>(
          `${process.env.CHARGE_SANDBOX}`,
          {
            body: { ...request },
          }
        )
      ),
      switchMap((chargeResponse: SandboxChargeResponse) =>
        iif(
          () => chargeResponse.body.ticket_number.length === 0,
          throwError(
            new AurusError(
              chargeResponse.body.response_code,
              chargeResponse.body.response_text,
              {
                approved_amount: chargeResponse.body.approved_amount,
                response_code: chargeResponse.body.response_code,
                response_text: chargeResponse.body.response_text,
                ticket_number: chargeResponse.body.ticket_number,
                transaction_details: chargeResponse.body.transaction_details,
                transaction_id: chargeResponse.body.transaction_id,
              }
            )
          ),
          of(chargeResponse.body)
        )
      ),
      tag("SandBox Gateway | chargesTransaction")
    );
  }

  public tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string
  ): Observable<TokensCardResponse> {
    return SandboxGateway._buildTokensRequest(body, mid, tokenType).pipe(
      switchMap((request: AurusTokensRequest) =>
        this._lambda.invokeFunction<SandboxTokensResponse>(
          `${process.env.TOKEN_SANDBOX}`,
          {
            body: { ...request },
          }
        )
      ),
      switchMap((response: SandboxTokensResponse) =>
        iif(
          () => response.body.transaction_token.length === 0,
          throwError(
            new AurusError(
              response.body.response_code,
              response.body.response_text
            )
          ),
          of({ token: response.body.transaction_token })
        )
      ),
      tag("SandBox Gateway | tokensTransaction")
    );
  }

  private static _buildTokensRequest(
    body: TokensCardRequest,
    mid: string,
    tokenType: string
  ): Observable<AurusTokensRequest> {
    let currency: string = "USD";

    const deferred: string = get(body, "isDeferred", false) ? "1" : "0";

    if (body.currency !== undefined) currency = body.currency;

    if (SandboxGateway._validateCard(body))
      body.card.expiryMonth = `0${body.card.expiryMonth}`;
    const params: AurusTokensRequest = {
      card: {
        card_present: "1",
        expiry_month: body.card.expiryMonth,
        expiry_year: body.card.expiryYear,
        name: body.card.name,
        number: body.card.number,
      },
      currency_code: currency,
      deferred_payment: deferred,
      language_indicator: "es",
      merchant_identifier: mid,
      remember_me: "0",
      token_type: `${tokenType}-token`,
    };

    if (tokenType === "transaction")
      params.amount = body.totalAmount.toFixed(2);
    if (body.card.cvv !== undefined && body.card.cvv !== null)
      params.card.cvv = body.card.cvv;

    return of(params);
  }

  private _buildChargeParams(
    body: ChargesCardRequest,
    mid: string,
    trxId: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch
  ): Observable<AurusChargesRequest> {
    let currency: Currency = CurrencyEnum.USD;

    if (body.amount.currency !== undefined) currency = body.amount.currency;

    return this._aurusGtw.buildAurusAmount(body, mid, tokenInfo.amount).pipe(
      map((amount: AurusAmount) => {
        const aurus_charge_request: AurusChargesRequest = {
          plcc,
          currency_code: currency,
          language_indicator: "es",
          merchant_identifier: mid,
          transaction_amount: amount,
          transaction_reference: trxId,
          transaction_token: body.token,
        };

        if (currency === CurrencyEnum.PEN) {
          const charges_names: object = this._getdetailNames(
            tokenInfo.cardHolderName
          );

          aurus_charge_request.email = this._processEmail;
          aurus_charge_request.name = get(charges_names, "name", "NA");
          aurus_charge_request.lastname = get(charges_names, "lastname", "NA");
        }

        if (body.metadata !== undefined)
          aurus_charge_request.metadata = body.metadata;

        return aurus_charge_request;
      })
    );
  }

  private static _validateCard(body: TokensCardRequest): boolean {
    return (
      body.card.expiryMonth.length === 1 &&
      parseInt(body.card.expiryMonth, 36) < 10 &&
      parseInt(body.card.expiryMonth, 36) > 0
    );
  }

  private _getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    const detail_names: object = parseFullName(String(fullName));

    const middlename: string[] = get(detail_names, "middle", "").split(" ");

    if (middlename.length > 1) set(detail_names, "last", middlename[1]);

    return {
      lastname: get(detail_names, "last"),
      name: get(detail_names, "first"),
    };
  }
}
