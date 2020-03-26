/**
 * ISubscription Service file.
 */
import { IDynamoDbEvent, ISnsEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { TransactionSNS } from "types/transactionSNS";

/**
 * Sync Service Interface
 */
export interface ISyncService {
  /**
   *  Sync Merchants with merchant usrv
   */
  syncMerchants(event: IDynamoDbEvent<MerchantFetch>): Observable<boolean>;

  /**
   *  Sync Processors with merchant usrv
   */
  syncProcessors(event: IDynamoDbEvent<ProcessorFetch>): Observable<boolean>;

  /**
   * SyncTransaction from SNS
   * @param event - Transaction
   */
  syncAsyncTransactions(event: ISnsEvent<TransactionSNS>): Observable<boolean>;
}
