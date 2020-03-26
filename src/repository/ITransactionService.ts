/**
 * ISubscription Service file.
 */
import {
  AurusError,
  IAPIGatewayEvent,
  IDynamoDbEvent,
  KushkiError,
} from "@kushki/core";
import { Observable } from "rxjs";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";

/**
 * Transaction Service Interface
 */
export interface ITransactionService {
  /**
   *  Save Transaction from Aurus
   */
  record(event: IAPIGatewayEvent<RecordTransactionRequest>): Observable<object>;

  /**
   *  Sync Transaction with usrv
   */
  sync(event: IDynamoDbEvent<SyncTransactionStream>): Observable<boolean>;

  /**
   *  Process CardTransaction
   */
  processRecord(
    requestEvent: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    aurusChargeResponse: AurusResponse,
    merchantId: string,
    tokenInfo: DynamoTokenFetch,
    merchantName: string,
    processor?: DynamoProcessorFetch,
    error?: KushkiError | AurusError | null,
    saleTicketNumber?: string | null,
    ruleInfo?: object,
    plccInfo?: { flag: string; brand: string },
    trxType?: string
  ): Observable<Transaction>;

  /**
   * Process VoidTransactions
   * @param event - Api Gateway event
   * @param chargeTrx - charge transaction
   */
  processVoidRecord(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    chargeTrx: Transaction
  ): Observable<Transaction>;

  /**
   * Listen Transaction Card table
   * @returns boolean
   */
  notifyTransaction(event: IDynamoDbEvent<Transaction>): Observable<boolean>;
}
export type VoidBody = VoidCardRequest | null | undefined;
