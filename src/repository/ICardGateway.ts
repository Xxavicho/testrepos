/**
 * Interface for Aurus Gateway.
 */
import { Observable } from "rxjs";
import { AurusAmount } from "types/aurus_amount";
import { AurusResponse } from "types/aurus_response";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { VoidCardRequest } from "types/void_card_request";

export interface ICardGateway {
  /**
   * Send Card requests
   */
  request(body: object, method: string, headers: object): Observable<object>;

  /**
   * Send a token request to Aurus
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
   * Send a charge request to Aurus
   * @param body - charge request body
   * @param mid - Private merchant id
   * @param trxReference -
   * @param plccFlag
   * @param tokenInfo
   * @param processor
   * @param whiteList
   */
  chargesTransaction(
    body: ChargesCardRequest,
    mid: string,
    trxReference: string,
    plccFlag: string,
    tokenInfo: DynamoTokenFetch,
    processor: DynamoProcessorFetch,
    whiteList?: string
  ): Observable<AurusResponse>;

  /**
   * Send a Pre Authorization request to Aurus
   * @param body - charge request body
   * @param mid - Private merchant id
   * @param tokenInfo
   * @param transactionReference
   */
  preAuthorization(
    body: ChargesCardRequest,
    mid: string,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string
  ): Observable<AurusResponse>;

  /**
   * Send a capture request to Aurus
   * @param body - capture request body information
   * @param transaction - transaction object
   * @param merchantId - Public merchant id
   */
  captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusResponse>;

  /**
   * Void a card transaction
   * @param data - Voided TRX information
   * @param ticket - Ticket number
   * @param mid - Private merchant id
   * @param trxReference
   */
  voidTransaction(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string
  ): Observable<AurusResponse>;
  /**
   * Void a card transaction
   * @param data - Aurus TRX information
   * @param processorID - processor identifier
   * @param tokenAmount
   */
  buildAurusAmount(
    data:
      | Required<VoidCardRequest>
      | ChargesCardRequest
      | Required<CaptureCardRequest>,
    processorID: string,
    tokenAmount?: number
  ): Observable<AurusAmount>;
}
