import { Observable } from "rxjs";
import { AurusResponse } from "types/aurus_response";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";

export interface ISandboxGateway {
  /**
   * Send a token request to SandBox Service
   * @param body - token request body information
   * @param mid - Public merchant id
   * @param tokenType - Transaction or Subscription token to request
   * @param processorName - Name of the Processor
   * @param transactionReference - UUID identifier of the transaction
   */
  tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string,
    transactionReference: string
  ): Observable<TokensCardResponse>;

  /**
   * Send a charge request to SandBox Service
   * @param body - charge request body
   * @param mid - Private merchant id
   * @param trxReference -
   */
  chargesTransaction(
    body: ChargesCardRequest,
    mid: string,
    trxReference: string,
    plccFlag: string,
    tokenInfo: DynamoTokenFetch
  ): Observable<AurusResponse>;
}
