/**
 * SyncService file
 */
import {
  DynamoEventNameEnum,
  IDynamoDbEvent,
  IDynamoRecord,
  IRecord,
  ISnsEvent,
} from "@kushki/core";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import * as dot from "dot-object";
import { ProcessorTypeEnum } from "infrastructure/ProcessorTypeEnum";
import { inject, injectable } from "inversify";
import { get } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISyncService } from "repository/ISyncService";
import { EMPTY, forkJoin, from, iif, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { last, map, mapTo, mergeMap } from "rxjs/operators";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { TransactionSNS } from "types/transactionSNS";

const enum processorType {
  TRADITIONAL = "traditional",
  AGGREGATOR = "aggregator",
}

/**
 * Implementation
 */
@injectable()
export class SyncService implements ISyncService {
  private readonly _dynamo: IDynamoGateway;

  constructor(@inject(IDENTIFIERS.DynamoGateway) dynamo: IDynamoGateway) {
    this._dynamo = dynamo;
  }

  public syncMerchants(
    event: IDynamoDbEvent<MerchantFetch>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      mergeMap((record: IDynamoRecord<MerchantFetch>) => {
        if (
          record.dynamodb === undefined ||
          record.dynamodb.NewImage === undefined
        )
          return of(EMPTY);
        return this._dynamo.put(
          {
            commission: get(
              record,
              "dynamodb.NewImage.commission.enabled",
              false
            ),
            contactPerson: record.dynamodb.NewImage.contactPerson,
            country: record.dynamodb.NewImage.country,
            deferredOptions:
              record.dynamodb.NewImage.deferredOptions !== undefined
                ? record.dynamodb.NewImage.deferredOptions
                : {},
            email: record.dynamodb.NewImage.email,
            enable: record.dynamodb.NewImage.deleteAt === undefined,
            merchant_name: record.dynamodb.NewImage.name,
            multi_merchant:
              get(record, "dynamodb.NewImage.multiMerchant", []).length > 0,
            nit: record.dynamodb.NewImage.taxId,
            private_id: record.dynamodb.NewImage.privateMerchantId,
            public_id: record.dynamodb.NewImage.publicMerchantId,
            sandboxEnable: get(record, "dynamodb.NewImage.sandboxEnable"),
            sift_science: record.dynamodb.NewImage.siftScience,
            urls: get(
              record,
              "dynamodb.NewImage.webhook.singleChargeNotification"
            ),
            voidWebhookUrl: get(
              record,
              "dynamodb.NewImage.webhook.voidApproval",
              []
            ),
            whiteList: get(record, "dynamodb.NewImage.whiteList", "0"),
          },
          TABLES.merchants
        );
      }),
      tag("SyncService | syncMerchants"),
      last(),
      mapTo(true)
    );
  }

  /* tslint:disable:cognitive-complexity */
  public syncProcessors(
    event: IDynamoDbEvent<ProcessorFetch>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      mergeMap((record: IDynamoRecord<ProcessorFetch>) =>
        iif(
          () => SyncService._canSync(record),
          this._dynamo.put(
            {
              acquirer_bank: get(
                record,
                "dynamodb.NewImage.StoreInformation.DemographicalInfo.acquirerBank",
                ""
              ),
              merchant_id: get(record, "dynamodb.NewImage.merchantId", ""),
              omitCVV:
                get(
                  record,
                  "dynamodb.NewImage.StoreInformation.DemographicalInfo.omitCVV",
                  false
                ) !== false
                  ? get(
                      record,
                      "dynamodb.NewImage.StoreInformation.DemographicalInfo.omitCVV"
                    )
                  : false,
              plcc:
                get(
                  record,
                  "dynamodb.NewImage.StoreInformation.CreditInfo.CreditTransactionPermissions.plcc",
                  "N"
                ) === "Y",
              private_id:
                record.dynamodb !== undefined &&
                record.dynamodb.NewImage !== undefined
                  ? record.dynamodb.NewImage.privateMerchantId
                  : "",
              processor_code: get(
                record,
                "dynamodb.NewImage.StoreInformation.ProcessorInfo.processorCode",
                ""
              ),
              processor_merchant_id: get(
                record,
                "dynamodb.NewImage.StoreInformation.CreditInfo.processorMerchantId",
                ""
              ),
              processor_name: get(
                record,
                "dynamodb.NewImage.StoreInformation.CreditInfo.processorName",
                ""
              ),
              processor_type:
                // istanbul ignore next
                record.dynamodb !== undefined
                  ? // istanbul ignore next
                    SyncService._getProcessorType(record.dynamodb.NewImage)
                  : "",
              public_id: get(record, "dynamodb.NewImage.publicMerchantId", ""),
              terminal_id: get(
                record,
                "dynamodb.NewImage.StoreInformation.CreditInfo.processorTerminalId",
                ""
              ),
              unique_code: this._getIdMerchant(
                get(record, "dynamodb.NewImage")
              ),
            },
            TABLES.processors
          ),
          of(true)
        )
      ),
      tag("SyncService | syncProccessor"),
      map(() => true)
    );
  }

  public syncAsyncTransactions(
    event: ISnsEvent<TransactionSNS>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      mergeMap((data: IRecord<TransactionSNS>) =>
        forkJoin([
          of(data),
          this._dynamo.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: data.Sns.Message.merchantId,
          }),
        ])
      ),
      mergeMap(
        ([data, merchant]: [
          IRecord<TransactionSNS>,
          DynamoMerchantFetch | undefined
        ]) =>
          this._dynamo.put(
            this._buildTransaction(data.Sns.Message, merchant),
            TABLES.transaction
          )
      ),
      tag("SyncService | syncAsyncTransactions")
    );
  }

  private _getIdMerchant(processor: ProcessorFetch): string {
    const test: string = SyncService._getProcessorType(processor);

    return test === processorType.TRADITIONAL
      ? get(processor, "StoreInformation.CreditInfo.uniqueCode")
      : get(processor, "StoreInformation.CreditInfo.processorMerchantId");
  }

  private _buildTransaction(
    trx: TransactionSNS,
    merchant: DynamoMerchantFetch | undefined
  ): object {
    const transaction_result: object = {
      approval_code: trx.approval_code,
      approved_transaction_amount: trx.totalAmount,
      channel: trx.channel,
      merchant_name: get(merchant, "merchant_name", ""),
      request_amount: trx.totalAmount,
      sync_mode: "api",
      ticket_number: trx.ticketNumber,
      transaction_status: trx.status,
      transaction_type: trx.transactionType,
    };

    dot.copy("token", "token", trx, transaction_result);
    dot.copy("amount", "amount", trx, transaction_result);
    dot.copy("subtotalIva", "subtotal_iva", trx, transaction_result);
    dot.copy("subtotalIva0", "subtotal_iva0", trx, transaction_result);
    dot.copy("ivaValue", "iva_value", trx, transaction_result);
    dot.copy("amount.extraTaxes", "taxes", trx, transaction_result);
    dot.copy("currency", "currency_code", trx, transaction_result);
    dot.copy("metadata", "metadata", trx, transaction_result);
    dot.copy("created", "created", trx, transaction_result);
    dot.copy("merchantId", "merchant_id", trx, transaction_result);
    dot.copy("paymentBrand", "payment_brand", trx, transaction_result);
    dot.copy("lastFourDigits", "last_four_digits", trx, transaction_result);
    dot.copy("approvalCode", "approval_code", trx, transaction_result);
    dot.copy("status", "transaction_status", trx, transaction_result);
    dot.copy("processorId", "processor_id", trx, transaction_result);
    dot.copy("processorName", "processor_name", trx, transaction_result);
    dot.copy("responseCode", "response_code", trx, transaction_result);
    dot.copy("responseText", "response_text", trx, transaction_result);
    dot.copy(
      "transactionReference",
      "transaction_reference",
      trx,
      transaction_result
    );
    dot.copy(
      "approvedTransactionAmount",
      "approved_transaction_amount",
      trx,
      transaction_result
    );
    dot.copy("totalAmount", "request_amount", trx, transaction_result);
    dot.copy("id", "transaction_id", trx, transaction_result);
    dot.copy("channel", "channel", trx, transaction_result);

    return transaction_result;
  }

  private static _getProcessorType(newImage?: ProcessorFetch): string {
    let processor_type: string = "";

    if (newImage !== undefined)
      processor_type =
        newImage.StoreInformation.CreditInfo.uniqueCode !== undefined &&
        newImage.StoreInformation.CreditInfo.uniqueCode !== null
          ? processorType.TRADITIONAL
          : processorType.AGGREGATOR;

    return processor_type;
  }

  private static _canSync(record: IDynamoRecord<ProcessorFetch>): boolean {
    return (
      record.eventName !== DynamoEventNameEnum.REMOVE &&
      get(record, "dynamodb.NewImage.paymentMethod") === ProcessorTypeEnum.CARD
    );
  }
}
