/**
 * SubscriptionService file
 */
import {
  AurusError,
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE_ID,
  IDynamoDbEvent,
  IDynamoRecord,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { pascalCase } from "change-case";
import { IDENTIFIERS } from "constant/Identifiers";
import { SQS_RESOURCE, STREAMS } from "constant/Streams";
import { TABLES } from "constant/Tables";
import * as dot from "dot-object";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionSyncModeEnum } from "infrastructure/TransactionSyncModeEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { inject, injectable } from "inversify";
import * as jp from "jsonpath";
import { cloneDeep, defaultTo, get } from "lodash";
import * as moment from "moment";
import * as nano from "nano-seconds";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { IFirehoseGateway } from "repository/IFirehoseGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import { ITransactionService, VoidBody } from "repository/ITransactionService";
import { forkJoin, from, iif, Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  concatMap,
  delay,
  filter,
  last,
  map,
  mapTo,
  mergeMap,
  reduce,
  switchMap,
} from "rxjs/operators";
import * as stringSimilarity from "string-similarity";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoChargeFetch } from "types/dynamo_charge_fetch";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";

interface IAurusTransaction {
  TRANSACTION_METADATA: string;
}

interface IAurusSubscription {
  SUBSCRIPTION_METADATA: string;
}

interface ICheckBrand {
  value: string;
  change: boolean;
}

type ErrorType = KushkiError | AurusError | null;

/**
 * Implementation
 */
@injectable()
export class TransactionService implements ITransactionService {
  private readonly _dynamoCondition: string =
    "attribute_not_exists(transaction_id)";

  private static _buildDynamo(
    data: RecordTransactionRequest,
    context?: AuthorizerContext
  ): object {
    data.dateAndTimeTransaction = moment
      .utc(data.dateAndTimeTransaction, "DDMMYYYYHHmmss")
      .format("x");
    data.syncMode = defaultTo(data.syncMode, "api");
    if (data.ticketNumber === "") delete data.ticketNumber;
    if (data.saleTicketNumber === "") delete data.saleTicketNumber;
    if (data.extraTaxes === "") delete data.extraTaxes;

    dot.move("approvedTransactionAmount", "approved_transaction_amount", data);
    dot.move("subtotalIVA", "subtotal_iva", data);
    dot.move("subtotalIVA0", "subtotal_iva0", data);
    dot.move("dateAndTimeTransaction", "created", data);
    data.created = Number(data.created);
    dot.move("responseCode", "response_code", data);
    dot.move("ticketNumber", "ticket_number", data);
    dot.move("transactionType", "transaction_type", data);
    dot.move("approvalCode", "approval_code", data);
    dot.move("transactionStatus", "transaction_status", data);
    dot.move("syncMode", "sync_mode", data);
    dot.move("currencyCode", "currency_code", data);
    dot.move("merchantId", "merchant_id", data);
    dot.move("processorId", "processor_id", data);
    dot.move("transactionId", "transaction_id", data);
    dot.move("extraTaxes", "taxes", data);
    dot.move("Metadata", "metadata", data);
    dot.move("subscription_metadata", "subscription_metadata", data);
    dot.move("subscriptionId", "subscription_id", data);
    dot.move("responseText", "response_text", data);
    dot.move("cardHolderName", "card_holder_name", data);
    dot.move("lastFourDigitsOfCard", "last_four_digits", data);
    dot.move("binCard", "bin_card", data);
    dot.move("paymentBrand", "payment_brand", data);
    dot.move("cardType", "card_type", data);
    dot.move("numberOfMonths", "number_of_months", data);
    dot.move("method", "method", data);
    dot.move("saleTicketNumber", "sale_ticket_number", data);
    dot.move("iceValue", "ice_value", data);
    dot.move("requestAmount", "request_amount", data);
    dot.move("ivaValue", "iva_value", data);
    dot.move("merchantName", "merchant_name", data);
    dot.move("processorName", "processor_name", data);
    dot.move("graceMonths", "grace_months", data);
    dot.move("creditType", "credit_type", data);
    dot.move("processorBankName", "processor_bank_name", data);
    dot.move("transactionReference", "transaction_reference", data);
    dot.move("conciliationId", "buy_order", data);
    dot.move("issuingBank", "issuing_bank", data);
    dot.move("contactDetails", "contact_details", data);
    dot.copy("kushkiMetadata", "kushki_metadata", context, data);
    dot.copy("credentialId", "credential_id", context, data);
    dot.copy("credentialAlias", "credential_alias", context, data);

    return data;
  }

  private readonly _newImage: string = "dynamodb.NewImage";
  private readonly _storage: IDynamoGateway;
  private readonly _firehose: IFirehoseGateway;
  private readonly _recipe: object;
  private readonly _sqs: ISQSGateway;
  private readonly _lambda: ILambdaGateway;

  // tslint:disable-next-line:max-func-body-length
  constructor(
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.FirehoseGateway) firehose: IFirehoseGateway,
    @inject(IDENTIFIERS.SQSGateway) sqs: ISQSGateway,
    @inject(CORE_ID.LambdaGateway) lambda: ILambdaGateway
  ) {
    this._storage = storage;
    this._lambda = lambda;
    this._firehose = firehose;
    this._sqs = sqs;
    this._recipe = {
      approval_code: "approval_code",
      approved_transaction_amount: "approved_transaction_amount",
      bin_card: "bin_card",
      buy_order: "buy_order",
      card_holder_name: "card_holder_name",
      card_type: "card_type",
      channel: "channel",
      created: "created",
      credential_alias: "credential_alias",
      credential_id: "credential_id",
      credit_type: "credit_type",
      currency_code: "currency_code",
      grace_months: "grace_months",
      ice_value: "ice_value",
      issuing_bank: "issuing_bank",
      iva_value: "iva_value",
      "kushki_metadata.origin": "origin",
      "kushki_metadata.ownerMerchantId": "owner_merchant_id",
      last_four_digits: "last_four_digits",
      merchant_id: "merchant_id",
      merchant_name: "merchant_name",
      metadata: "metadata",
      method: "method",
      number_of_months: "number_of_months",
      payment_brand: "payment_brand",
      processor_id: "processor_id",
      processor_name: "processor_name",
      recap: "recap",
      request_amount: "request_amount",
      response_code: "response_code",
      response_text: "response_text",
      sale_ticket_number: "sale_ticket_number",
      "security.id": "secure_id",
      "security.service": "secure_service",
      subscription_id: "subscription_id",
      subscription_metadata: "subscription_metadata",
      subtotal_iva: "subtotal_iva",
      subtotal_iva0: "subtotal_iva0",
      sync_mode: "sync_mode",
      taxes: "taxes",
      ticket_number: "ticket_number",
      transaction_id: "transaction_id",
      transaction_reference: "transaction_reference",
      transaction_status: "transaction_status",
      transaction_type: "transaction_type",
    };
  }

  public record(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () =>
            `${process.env.MERCHANT_WITH_RECORD_API}`.includes(
              event.body.merchantId
            ) || Boolean(event.body.transactionReference),
          this.cleanRecord(event),
          of({ status: "OK" })
        )
      )
    );
  }

  public cleanRecord(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<object> {
    return of(1).pipe(
      delay(5000),
      switchMap(() =>
        forkJoin([
          this._storage.query<Transaction>(
            TABLES.transaction,
            IndexEnum.transaction_transaction_id,
            "transaction_id",
            event.body.transactionId
          ),
          this._storage.getItem<DynamoChargeFetch>(TABLES.charges, {
            transactionId: event.body.transactionId,
          }),
        ])
      ),
      map((data: [Transaction[], DynamoChargeFetch | undefined]) => {
        const data_transactions: Transaction[] = data[0];
        const data_dynamo_charge: DynamoChargeFetch | undefined = data[1];

        if (
          data_dynamo_charge !== undefined &&
          data_dynamo_charge.deferred !== undefined
        ) {
          event.body.graceMonths = data_dynamo_charge.deferred.graceMonths;
          event.body.creditType = data_dynamo_charge.deferred.creditType;
          event.body.numberOfMonths = data_dynamo_charge.deferred.months;
        }

        return data_transactions;
      }),
      switchMap((transactions: Transaction[]) =>
        iif(
          () => transactions.length === 0,
          this._processRecord(event),
          of(true)
        )
      ),
      tag("TransactionService | record"),
      map(() => ({ status: "OK" }))
    );
  }

  public sync(
    event: IDynamoDbEvent<SyncTransactionStream>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      filter(
        (record: IDynamoRecord<SyncTransactionStream>) =>
          record.dynamodb !== undefined &&
          record.dynamodb.NewImage !== undefined
      ),
      mergeMap((record: IDynamoRecord<SyncTransactionStream>) =>
        iif(
          () =>
            get(record, "dynamodb.NewImage.transaction_type") ===
              TransactionTypeEnum.VOID ||
            record.eventName !== DynamoEventNameEnum.INSERT,
          of(true),
          this._syncLogic(record)
        )
      )
    );
  }

  /* tslint:disable:parameters-max-number */
  public processRecord(
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
    error: ErrorType = null,
    saleTicketNumber: string | null = null,
    ruleInfo: object = {},
    plccInfo?: { flag: string; brand: string },
    trxType?: string
  ): Observable<Transaction> {
    let record_trx_request: Partial<RecordTransactionRequest> = {};

    record_trx_request.cardType = get(tokenInfo, "binInfo.info.type", "");

    record_trx_request.transactionType = this._getTransactionType(
      trxType,
      aurusChargeResponse.transaction_details
        ? aurusChargeResponse.transaction_details.isDeferred
        : "N"
    );
    if (requestEvent.body.deferred !== undefined)
      record_trx_request.numberOfMonths = requestEvent.body.deferred.months;
    if (saleTicketNumber !== null)
      record_trx_request.saleTicketNumber = saleTicketNumber;

    record_trx_request.transactionReference = tokenInfo.transactionReference;
    record_trx_request.syncMode = TransactionSyncModeEnum.ONLINE;
    record_trx_request.transactionStatus = TransactionStatusEnum.APPROVAL;
    record_trx_request.requestAmount = this._getTotal(requestEvent.body);
    record_trx_request.dateAndTimeTransaction = moment().format(
      "DDMMYYYYHHmmss"
    );

    record_trx_request.processorId =
      processor === undefined ? "" : processor.public_id;
    record_trx_request.merchantId = merchantId;

    record_trx_request = {
      ...TransactionService._processRecordCharge(requestEvent.body),
      ...TransactionService._processRecordAurus(aurusChargeResponse, processor),
      ...record_trx_request,
      ...ruleInfo,
    };

    record_trx_request.merchantName = merchantName;

    if (error !== null) {
      record_trx_request.transactionStatus = TransactionStatusEnum.DECLINED;
      if (error instanceof KushkiError && error.code === "K021") {
        const metadata_error: object = error.getMetadata();
        const resp_text: string = "responseText";
        const resp_code: string = "responseCode";

        record_trx_request.responseText = `${metadata_error[resp_text]}`;
        record_trx_request.responseCode = `${metadata_error[resp_code]}`;
      } else {
        record_trx_request.responseText = error.getMessage();
        record_trx_request.responseCode = error.code;
      }
    }
    record_trx_request.binCard = tokenInfo.bin;
    record_trx_request.lastFourDigitsOfCard = tokenInfo.lastFourDigits;
    record_trx_request.cardHolderName = get(tokenInfo, "cardHolderName", "NA");

    // Put paymentBrand for Aurus declined transactions
    if (
      record_trx_request.paymentBrand === "" &&
      tokenInfo.binInfo !== undefined
    )
      record_trx_request.paymentBrand = pascalCase(tokenInfo.binInfo.brand);

    record_trx_request.issuingBank = get(tokenInfo, "binInfo.bank", "");

    if (this._validateSecurityInfo(tokenInfo))
      record_trx_request.security = {
        id: tokenInfo.secureId,
        service: tokenInfo.secureService,
      };

    record_trx_request = this._addUndefinedFields(
      record_trx_request,
      requestEvent.body,
      tokenInfo,
      plccInfo
    );

    return this._buildAndSaveTransaction(
      record_trx_request,
      requestEvent.requestContext.authorizer
    )
      .pipe()
      .pipe(tag("TransactionService | processRecord"));
  }

  public processVoidRecord(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    chargeTrx: Transaction
  ): Observable<Transaction> {
    return of(1).pipe(
      map(() => {
        chargeTrx.transaction_id = nano
          .now()
          .toString()
          .replace(",", "");

        const req_trx: Partial<RecordTransactionRequest> = {
          dateAndTimeTransaction: moment().format("DDMMYYYYHHmmss"),
          saleTicketNumber: event.pathParameters.ticketNumber,
          syncMode: TransactionSyncModeEnum.ONLINE,
          ticketNumber: chargeTrx.ticket_number,
          transaction_reference: chargeTrx.transaction_reference,
          transactionId: chargeTrx.transaction_id,
          transactionStatus: TransactionStatusEnum.INITIALIZED,
          transactionType: TransactionTypeEnum.VOID,
        };

        return {
          ...this._mapVoidRecord(chargeTrx, req_trx),
        };
      }),
      switchMap((trx: Partial<RecordTransactionRequest>) =>
        this._buildAndSaveTransaction(trx, event.requestContext.authorizer)
      ),
      tag("TransactionService | processVoidRecord")
    );
  }

  public notifyTransaction(
    event: IDynamoDbEvent<Transaction>
  ): Observable<boolean> {
    return from(event.Records).pipe(
      concatMap((record: IDynamoRecord<Transaction>) =>
        iif(
          () =>
            get(record, "eventName", "") === DynamoEventNameEnum.INSERT &&
            get(record, this._newImage) !== undefined,
          this._enqueueNotification(record),
          of(true)
        )
      ),
      last(),
      mapTo(true)
    );
  }

  private _addUndefinedFields(
    record: object,
    chargeRequest: ChargesCardRequest | CaptureCardRequest,
    tokenInfo: DynamoTokenFetch,
    plccInfo?: { flag: string; brand: string }
  ): object {
    const record_trx_request: Partial<RecordTransactionRequest> = {
      ...record,
    };

    if (chargeRequest.deferred !== undefined)
      record_trx_request.numberOfMonths = chargeRequest.deferred.months;

    if (tokenInfo.settlement !== undefined)
      record_trx_request.settlement = tokenInfo.settlement;

    if (plccInfo !== undefined && plccInfo.brand !== "")
      record_trx_request.paymentBrand = pascalCase(plccInfo.brand);

    if (chargeRequest.contactDetails !== undefined)
      record_trx_request.contactDetails = {
        ...chargeRequest.contactDetails,
      };

    return record_trx_request;
  }

  private _enqueueNotification(
    record: IDynamoRecord<Transaction>
  ): Observable<boolean> {
    return of(1).pipe(
      concatMap(() =>
        this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
          public_id: get(record, `${this._newImage}.merchant_id`),
        })
      ),
      concatMap((merchant: DynamoMerchantFetch | undefined) => {
        const urls_webhook: null | string[] = get(merchant, "urls", []);

        return urls_webhook !== null && urls_webhook.length > 0
          ? this._enqueueSqs(
              urls_webhook,
              record,
              get(merchant, "private_id", "")
            )
          : of(true);
      })
    );
  }

  private _enqueueSqs(
    urls: string[],
    record: IDynamoRecord<Transaction>,
    signature: string
  ): Observable<boolean> {
    return from(urls).pipe(
      concatMap((uri: string) =>
        this._sqs.put(SQS_RESOURCE.WebhookQueue, {
          transaction: get(record, this._newImage),
          url: uri,
          webhookSignature: signature,
        })
      ),
      last(),
      mapTo(true)
    );
  }

  private _getTransactionType(
    trxType: string | undefined,
    isDeferred: string
  ): string {
    switch (trxType) {
      case TransactionRuleTypeEnum.PREAUTH:
        return TransactionTypeEnum.PREAUTH;
      case TransactionRuleTypeEnum.CAPTURE:
        return TransactionTypeEnum.CAPTURE;
      default:
        return isDeferred === "Y"
          ? TransactionTypeEnum.DEFFERED
          : TransactionTypeEnum.SALE;
    }
  }

  private _syncLogic(
    record: IDynamoRecord<SyncTransactionStream>
  ): Observable<boolean> {
    return of(1).pipe(
      mergeMap(() =>
        forkJoin([
          this._storage.getItem<DynamoChargeFetch>(TABLES.charges, {
            transactionId: get(record, "dynamodb.NewImage.transaction_id"),
          }),
          of(record),
        ])
      ),
      map(
        (
          data: [
            DynamoChargeFetch | undefined,
            IDynamoRecord<SyncTransactionStream>
          ]
        ) => {
          const dynamo_charge: DynamoChargeFetch | undefined = data[0];

          if (
            dynamo_charge !== undefined &&
            dynamo_charge.deferred !== undefined
          ) {
            // @ts-ignore
            data[1].dynamodb.NewImage.grace_months =
              dynamo_charge.deferred.graceMonths;
            // @ts-ignore
            data[1].dynamodb.NewImage.credit_type =
              dynamo_charge.deferred.creditType;
          }

          const payment_brand = this._capitalizeText(
            get(data[1], "dynamodb.NewImage.payment_brand", "")
          );

          const card_type = this._capitalizeText(
            get(data[1], "dynamodb.NewImage.card_type", "")
          );

          const sync_data: SyncTransactionStream = {
            ...get(data[1], this._newImage),
            card_type,
            payment_brand,
          };

          return {
            elastic: this._buildElastic(sync_data),
            redshift: this._buildRedshift(sync_data),
          };
        }
      ),
      reduce(
        (
          acc: {
            elastic: object[];
            redshift: object[];
            billing: object[];
          },
          item: { elastic: object; redshift: object }
        ) => {
          /* tslint:disable:object-literal-sort-keys */
          acc.elastic.push(item.elastic);
          acc.redshift.push(item.redshift);

          if (
            get(item.elastic, "transaction_status") ===
            TransactionStatusEnum.APPROVAL
          )
            acc.billing.push(item.elastic);

          return acc;
        },
        {
          elastic: [],
          redshift: [],
          billing: [],
        }
      ),
      mergeMap(
        (items: { elastic: object[]; redshift: object[]; billing: object[] }) =>
          forkJoin([
            this._firehose.put(items.redshift, STREAMS.redshift),
            this._firehose.put(items.elastic, STREAMS.elastic),
            iif(
              () => items.billing.length > 0,
              of(1).pipe(
                switchMap(() =>
                  this._firehose.put(items.billing, STREAMS.elasticBilling)
                )
              ),
              of(false)
            ),
          ])
      ),
      tag("TransactionService | sync"),
      map(() => true)
    );
  }

  private _capitalizeText(text: string): string {
    if (text) {
      const check_brand: ICheckBrand = this._checkBrand(text);

      text = check_brand.value;
      if (check_brand.change)
        text = text
          .toLowerCase()
          .replace(/\b./g, (a): string => a.toUpperCase());

      return text;
    }
    return "";
  }

  private _checkBrand(brand: string): ICheckBrand {
    const match_amex: object = stringSimilarity.findBestMatch(brand, [
      "American express",
      "Amex",
    ]);
    const match_mastercard: object = stringSimilarity.findBestMatch(brand, [
      "Master card",
    ]);

    if (get(match_amex, "bestMatch.rating") >= 0.6)
      return { value: "Amex", change: false };

    if (get(match_mastercard, "bestMatch.rating") >= 0.6)
      return { value: "Mastercard", change: false };

    return { value: brand, change: true };
  }

  private _mapVoidRecord(
    chargeTrx: Transaction,
    voidTrx: Partial<RecordTransactionRequest>
  ): Partial<RecordTransactionRequest> {
    dot.copy("response_code", "responseCode", chargeTrx, voidTrx);
    dot.copy("response_text", "responseText", chargeTrx, voidTrx);

    dot.copy("currency_code", "currencyCode", chargeTrx, voidTrx);
    dot.copy("taxes", "extraTaxes", chargeTrx, voidTrx);
    dot.copy("number_of_months", "numberOfMonths", chargeTrx, voidTrx);
    dot.copy("subtotal_iva", "subtotalIVA", chargeTrx, voidTrx);
    dot.copy("subtotal_iva0", "subtotalIVA0", chargeTrx, voidTrx);
    dot.copy("iva_value", "ivaValue", chargeTrx, voidTrx);
    dot.copy("ice_value", "iceValue", chargeTrx, voidTrx);
    dot.copy("metadata", "Metadata", chargeTrx, voidTrx);
    dot.copy("grace_months", "graceMonths", chargeTrx, voidTrx);
    dot.copy("credit_type", "creditType", chargeTrx, voidTrx);
    dot.copy("request_amount", "requestAmount", chargeTrx, voidTrx);
    dot.copy("processor_id", "processorId", chargeTrx, voidTrx);
    dot.copy("merchant_id", "merchantId", chargeTrx, voidTrx);
    dot.copy("subscription_id", "subscriptionId", chargeTrx, voidTrx);
    dot.copy("ticket_number", "ticketNumber", chargeTrx, voidTrx);
    dot.copy("sale_ticket_number", "saleTicketNumber", chargeTrx, voidTrx);

    return voidTrx;
  }

  private static _processRecordCharge(
    chargeRequest: ChargesCardRequest | CaptureCardRequest
  ): ChargesCardRequest | CaptureCardRequest {
    dot.copy("amount.currency", "currencyCode", chargeRequest, chargeRequest);
    dot.copy("amount.extraTaxes", "extraTaxes", chargeRequest, chargeRequest);
    dot.copy("months", "numberOfMonths", chargeRequest, chargeRequest);
    dot.copy("amount.subtotalIva", "subtotalIVA", chargeRequest, chargeRequest);
    dot.copy(
      "amount.subtotalIva0",
      "subtotalIVA0",
      chargeRequest,
      chargeRequest
    );
    dot.copy("amount.iva", "ivaValue", chargeRequest, chargeRequest);
    dot.copy("amount.ice", "iceValue", chargeRequest, chargeRequest);
    dot.move("metadata", "Metadata", chargeRequest);
    dot.move("deferred.graceMonths", "graceMonths", chargeRequest);
    dot.move("deferred.creditType", "creditType", chargeRequest);

    return chargeRequest;
  }

  private _validateSecurityInfo(tokenInfo: DynamoTokenFetch): boolean {
    return (
      tokenInfo.secureId !== undefined && tokenInfo.secureService !== undefined
    );
  }

  private static _processRecordAurus(
    aurusChargeResponse: AurusResponse,
    processor?: DynamoProcessorFetch
  ): AurusResponse {
    // Number Mapping Rule
    dot.override = true;
    dot.object(aurusChargeResponse, {
      approved_amount: Number,
    });

    dot.move(
      "approved_amount",
      "approvedTransactionAmount",
      aurusChargeResponse
    );

    if (aurusChargeResponse.transaction_details) {
      // CardType Mastercard hotfix
      if (aurusChargeResponse.transaction_details.cardType !== "")
        aurusChargeResponse.transaction_details.cardType = pascalCase(
          aurusChargeResponse.transaction_details.cardType
        );

      if (aurusChargeResponse.transaction_details.cardType === "Mastercard")
        aurusChargeResponse.transaction_details.cardType = "Master Card";

      // Mapping Logic
      dot.move("ticket_number", "ticketNumber", aurusChargeResponse);
      dot.copy(
        "transaction_details.binCard",
        "binCard",
        aurusChargeResponse,
        aurusChargeResponse
      );
      dot.move("transaction_id", "transactionId", aurusChargeResponse);
      dot.copy(
        "transaction_details.cardType",
        "paymentBrand",
        aurusChargeResponse,
        aurusChargeResponse
      );
      dot.move("response_code", "responseCode", aurusChargeResponse);
      dot.move("response_text", "responseText", aurusChargeResponse);
      dot.copy(
        "transaction_details.processorBankName",
        "processorBankName",
        aurusChargeResponse,
        aurusChargeResponse
      );

      dot.move(
        "transaction_details.merchantName",
        "merchantName",
        aurusChargeResponse
      );
      dot.move(
        "transaction_details.cardHolderName",
        "cardHolderName",
        aurusChargeResponse
      );
      dot.move(
        "transaction_details.lastFourDigitsOfCard",
        "lastFourDigitsOfCard",
        aurusChargeResponse
      );
      dot.move(
        "transaction_details.approvalCode",
        "approvalCode",
        aurusChargeResponse
      );
      dot.move(
        "transaction_details.processorName",
        "processorName",
        aurusChargeResponse
      );
      dot.move(
        "transaction_details.conciliationId",
        "conciliationId",
        aurusChargeResponse
      );
      dot.copy("acquirer_bank", "acquirerBank", processor, aurusChargeResponse);
    }

    const mapped: AurusResponse = { ...aurusChargeResponse };

    dot.del("processorBankName", aurusChargeResponse);
    dot.del("transaction_details", aurusChargeResponse);

    return mapped;
  }

  private _getTotal(request: ChargesCardRequest | CaptureCardRequest): number {
    if (request.amount === undefined) return 0;

    let sum_taxes: number = 0;

    if (request.amount.ice !== undefined) sum_taxes += request.amount.ice;
    const extra_taxes: object | undefined = request.amount.extraTaxes;

    if (extra_taxes !== undefined)
      Object.keys(extra_taxes).forEach((key: string) => {
        sum_taxes += extra_taxes[key];
      });

    return Number(
      (
        request.amount.subtotalIva0 +
        request.amount.subtotalIva +
        request.amount.iva +
        sum_taxes
      ).toFixed(2)
    );
  }

  private _processRecord(
    event: IAPIGatewayEvent<RecordTransactionRequest>
  ): Observable<boolean> {
    return forkJoin([
      this._storage.getItem<IAurusTransaction>(
        `${process.env.AURUS_TRANSACTION}`,
        {
          TRANSACTION_ID:
            event.body.ticketNumber !== undefined &&
            event.body.ticketNumber.length > 0
              ? event.body.ticketNumber
              : event.body.transactionId,
        }
      ),
      iif(
        () => event.body.subscriptionId !== "",
        this._storage.getItem<IAurusSubscription>(
          `${process.env.AURUS_SUBSCRIPTION}`,
          {
            SUBSCRIPTION_ID: event.body.subscriptionId,
          }
        ),
        of(undefined)
      ),
      this._storage.getItem<DynamoProcessorFetch>(TABLES.processors, {
        public_id: event.body.merchantId,
      }),
    ]).pipe(
      map(
        (
          data: [
            IAurusTransaction | undefined,
            IAurusSubscription | undefined,
            DynamoProcessorFetch | undefined
          ]
        ) => {
          const transaction: IAurusTransaction | undefined = data[0];
          const subscription: IAurusSubscription | undefined = data[1];
          const processor: DynamoProcessorFetch | undefined = data[2];

          if (processor === undefined) throw new KushkiError(ERRORS.E003);
          event.body.processorId = event.body.merchantId;
          event.body.merchantId = processor.merchant_id;
          if (
            transaction !== undefined &&
            transaction.TRANSACTION_METADATA !== "NA"
          )
            event.body.Metadata = JSON.parse(transaction.TRANSACTION_METADATA);
          if (
            subscription !== undefined &&
            subscription.SUBSCRIPTION_METADATA !== "NA"
          )
            event.body.subscription_metadata = JSON.parse(
              subscription.SUBSCRIPTION_METADATA
            );

          return { ...event.body };
        }
      ),
      switchMap((record: RecordTransactionRequest) => this._saveRecord(record)),
      tag("TransactionService | _processRecord")
    );
  }

  private _saveRecord(req: RecordTransactionRequest): Observable<boolean> {
    return iif(
      () => !req.subscriptionId,
      of(1).pipe(
        switchMap(() =>
          this._storage.put(
            TransactionService._buildDynamo({ ...req }),
            TABLES.transaction,
            this._dynamoCondition
          )
        )
      ),
      of(1).pipe(
        switchMap(() =>
          this._lambda.invokeFunction(
            `usrv-subscriptions-${process.env.USRV_STAGE}-subscriptionsRecord`,
            req
          )
        )
      )
    ).pipe(mapTo(true));
  }

  private _buildRedshift(data: SyncTransactionStream): object {
    /* tslint:disable:strict-type-predicates */
    if (
      data.last_four_digits !== undefined &&
      data.last_four_digits !== null &&
      data.last_four_digits.length > 4
    )
      data.last_four_digits = data.last_four_digits.substr(
        data.last_four_digits.length - 4
      );

    if (data.response_text !== undefined && data.response_text.length > 99)
      data.response_text = data.response_text.substr(0, 90);

    const result: object = dot.transform(this._recipe, data);
    const mods: object = {
      created: (value: number): string =>
        moment(value)
          .utc()
          .format("YYYY-MM-DD HH:mm:ss"),
      metadata: JSON.stringify,
      subscription_metadata: JSON.stringify,
      taxes: JSON.stringify,
    };

    dot.override = true;
    dot.object(result, mods);

    return result;
  }

  private _buildElastic(data: SyncTransactionStream): object {
    const result: {
      masked_credit_card: string;
      payment_method: string;
      metadata?: string;
      string_metadata?: string | object;
      string_subscription_metadata?: string | object;
      security?: object;
      secure_id?: string;
      secure_service?: string;
    } = dot.transform(this._recipe, data);

    result.payment_method = "card";
    result.masked_credit_card = `${data.bin_card}XXXXXX${data.last_four_digits}`;
    result.security = {
      id: result.secure_id,
      service: result.secure_service,
    };

    if (result.secure_id !== undefined && result.secure_service !== undefined) {
      delete result.secure_id;
      delete result.secure_service;
    }

    if (result.metadata !== undefined)
      jp.apply(result.metadata, "$..value", (_: string) => "");

    if (result.metadata !== undefined)
      result.string_metadata = cloneDeep(result.metadata);
    if (data.subscription_metadata !== undefined)
      result.string_subscription_metadata = cloneDeep(
        data.subscription_metadata
      );

    const mods: object = {
      created: (value: number): string =>
        moment(value)
          .utc()
          .toISOString(),
      string_metadata: JSON.stringify,
      string_subscription_metadata: JSON.stringify,
    };

    dot.override = true;
    dot.object(result, mods);

    return result;
  }

  private _buildAndSaveTransaction(
    record: object,
    context: AuthorizerContext
  ): Observable<Transaction> {
    return of(
      <Transaction>(
        TransactionService._buildDynamo(
          <RecordTransactionRequest>record,
          context
        )
      )
    ).pipe(
      switchMap((transaction: Transaction) =>
        forkJoin([
          of(transaction),
          this._storage.put(
            transaction,
            TABLES.transaction,
            this._dynamoCondition
          ),
        ])
      ),
      map((data: [Transaction, boolean]) => data[0]),
      tag("TransactionService | _buildAndSaveTransaction")
    );
  }
}
