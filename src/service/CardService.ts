/**
 * CardService file
 */
import {
  AurusError,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  IGenericHeaders,
  ILambdaGateway,
  ILogger,
  KushkiError,
} from "@kushki/core";
import * as camelKeys from "camelcase-keys";
import { IDENTIFIERS } from "constant/Identifiers";
import { SNS } from "constant/SNS";
import { TABLES } from "constant/Tables";
import * as dot from "dot-object";
import { AggTransactionEnum } from "infrastructure/AggTransactionEnum";
import { CountryEnum } from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { DeferredNamesEnum } from "infrastructure/DeferredNameEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TransactionRuleTypeEnum } from "infrastructure/TransactionRuleTypeEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { TransactionTypeEnum } from "infrastructure/TransactionTypeEnum";
import { inject, injectable } from "inversify";
import { defaultTo, get, isEmpty, union } from "lodash";
import * as nano from "nano-seconds";
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IBinInfoGateway } from "repository/IBinInfoGateway";
import { ICardGateway } from "repository/ICardGateway";
import { ICardService } from "repository/ICardService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { ISNSGateway } from "repository/ISNSGateway";
import { CardData, ITokenGateway } from "repository/ITokenGateway";
import { ITransactionService, VoidBody } from "repository/ITransactionService";
import * as Rollbar from "rollbar";
import { forkJoin, from, iif, Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import {
  catchError,
  concatMap,
  filter,
  map,
  mapTo,
  mergeMap,
  reduce,
  switchMap,
  toArray,
} from "rxjs/operators";
import { Amount } from "types/amount";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinInfoResponse } from "types/bin_info_response";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { ChargesCardResponse, Details } from "types/charges_card_response";
import {
  DeferredOption,
  DynamoMerchantFetch,
} from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import {
  LambdaTransactionRuleBodyResponse,
  LambdaTransactionRuleResponse,
} from "types/lambda_transaction_rule_response";
import { CommissionTokenRequest } from "types/remote/commission_token_request";
import { IDeferredResponse } from "types/remote/deferred_response";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { CardInfo, MultiTokenRequest } from "types/remote/multi_token_request";
import { TokenResponse } from "types/remote/token_response";
import { PartnerConfig } from "types/remote/validate_charge_request";
import { RequestedVoid } from "types/requested_void";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import {
  History,
  SiftScienceWorkflowsResponse,
} from "types/sift_science_workflows_response";
import { TokenDynamo } from "types/token_dynamo";
import { CardToken, TokensCardRequest } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardResponse } from "types/void_card_response";
import { v4 } from "uuid";

type BinFetchType = DynamoBinFetch | undefined;
type TransactionRulePayload = {
  credentialId: string;
  currency: string;
  transactionType: TransactionRuleTypeEnum;
  customer: object;
  ignoreWarnings: boolean;
  isDeferred: boolean;
  merchantId: string;
  token: DynamoTokenFetch;
};

type partialTransactionRefund = {
  status: boolean;
  amount: number;
  requestAmount: number;
};

const ACQUIRER_BANK_TARGET_STRING: string = "details.acquirerBank";

type ChargeError = Error | AurusError | KushkiError;

/**
 * Implementation
 */
@injectable()
export class CardService implements ICardService {
  private static _validateBin(cardNumber: string): void {
    let bad_bins: string[] = [];
    const bin_card: string = cardNumber.slice(0, 6);

    if (process.env.BAD_BINS !== undefined)
      bad_bins = process.env.BAD_BINS.split(",");

    for (const bin of bad_bins)
      if (bin_card === bin) throw new KushkiError(ERRORS.E007);
  }

  // TODO: THIS FIX WAS CREATED BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  private static _validateTokenExists(
    cToken: DynamoTokenFetch | undefined,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >
  ): DynamoTokenFetch {
    if (cToken === undefined)
      return {
        amount: 0,
        bin: "",
        created: 0,
        currency: "",
        id: event.body.token,
        ip: "",
        lastFourDigits: "",
        maskedCardNumber: "",
        merchantId: event.requestContext.authorizer.merchantId,
        transactionReference: "",
      };

    return cToken;
  }

  public static readonly sSiftScienceDecision: string = "decision";
  public static readonly sSiftScienceBlockType: string = "red";
  public static readonly sColombianChileanDeferredOptions: IDeferredResponse[] = [
    {
      months: [
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
        "19",
        "20",
        "21",
        "22",
        "23",
        "24",
        "25",
        "26",
        "27",
        "28",
        "29",
        "30",
        "31",
        "32",
        "33",
        "34",
        "35",
        "36",
        "37",
        "38",
        "39",
        "40",
        "41",
        "42",
        "43",
        "44",
        "45",
        "46",
        "47",
        "48",
      ],
      monthsOfGrace: [],
      type: "all",
    },
  ];
  public readonly prodEnv = "primary";
  private readonly _requestVoid: object = {
    bin_card: "binCard",
    card_holder_name: "cardHolderName",
    created: "created",
    currency_code: "currencyCode",
    last_four_digits: "lastFourDigits",
    merchant_id: "merchantId",
    merchant_name: "merchantName",
    payment_brand: "paymentBrand",
    processor_id: "processorId",
    processor_name: "processorName",
    request_amount: "requestAmount",
    subscription_id: "subscriptionId",
    ticket_number: "ticketNumber",
    transaction_id: "transactionId",
    transaction_status: "transactionStatus",
    transaction_type: "transactionType",
  };
  private readonly _gateway: ICardGateway;
  private readonly _storage: IDynamoGateway;
  private readonly _antifraud: IAntifraudGateway;
  private readonly _lambda: ILambdaGateway;
  private readonly _binList: IBinInfoGateway;
  private readonly _transactionService: ITransactionService;
  private readonly _tokenGateway: ITokenGateway;
  private readonly _logger: ILogger;
  private readonly _sandbox: ISandboxGateway;
  private readonly _sns: ISNSGateway;
  private readonly _rollbar: Rollbar;

  // tslint:disable-next-line:parameters-max-number
  constructor(
    @inject(IDENTIFIERS.CardGateway) gateway: ICardGateway,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(IDENTIFIERS.AntifraudGateway) antifraud: IAntifraudGateway,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway,
    @inject(IDENTIFIERS.BinInfoGateway) binlist: IBinInfoGateway,
    @inject(IDENTIFIERS.TransactionService)
    transactionService: ITransactionService,
    @inject(IDENTIFIERS.TokenGateway) token: ITokenGateway,
    @inject(CORE.Logger) logger: ILogger,
    @inject(IDENTIFIERS.SandboxGateway) sandbox: ISandboxGateway,
    @inject(IDENTIFIERS.ISNSGateway) sns: ISNSGateway,
    @inject(CORE.RollbarInstance) rollbar: Rollbar
  ) {
    this._gateway = gateway;
    this._storage = storage;
    this._antifraud = antifraud;
    this._lambda = lambda;
    this._binList = binlist;
    this._transactionService = transactionService;
    this._tokenGateway = token;
    this._logger = logger;
    this._sandbox = sandbox;
    this._sns = sns;
    this._rollbar = rollbar;
  }

  public deferred(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        forkJoin([
          this._storage.getItem<DynamoBinFetch>(TABLES.bins, {
            bin: event.pathParameters.binNumber,
          }),
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: event.requestContext.authorizer.merchantId,
          }),
          this._storage.query<DynamoProcessorFetch>(
            TABLES.processors,
            IndexEnum.processors_merchant_id_index,
            "merchant_id",
            event.requestContext.authorizer.merchantId
          ),
        ])
      ),
      switchMap(
        (
          requests: [
            DynamoBinFetch | undefined,
            DynamoMerchantFetch | undefined,
            DynamoProcessorFetch[]
          ]
        ) => {
          if (
            requests[0] !== undefined &&
            requests[1] !== undefined &&
            requests[2].length !== 0
          ) {
            const request: {
              binFetch: DynamoBinFetch;
              merchantFetch: DynamoMerchantFetch;
              processorFetch: DynamoProcessorFetch[];
            } = {
              binFetch: requests[0],
              merchantFetch: requests[1],
              processorFetch: requests[2],
            };

            return this._getDeferredResponse(
              event.pathParameters.binNumber,
              request
            );
          }

          return of([]);
        }
      ),
      tag("Card Service | deferred")
    );
  }

  public binInfo(
    event: IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
  ): Observable<BinInfo> {
    return this._getProcessorDynamo(
      event.requestContext.authorizer.merchantId
    ).pipe(
      mergeMap((processor: DynamoProcessorFetch) =>
        this._getBinInfo(
          event.pathParameters.binNumber,
          get(processor, "plcc", false)
        )
      ),
      mergeMap((binFetch: DynamoBinFetch) => this._getListBins(binFetch)),
      map((binItem: DynamoBinFetch) => {
        const card_type: string =
          binItem.info !== undefined && binItem.info.type
            ? get(binItem, "info.type", "credit")
            : "credit";

        return {
          bank: get(binItem, "bank", ""),
          brand: get(binItem, "brand", "").toLowerCase(),
          cardType: card_type.toLowerCase(),
        };
      })
    );
  }

  public tokens(
    event: IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
  ): Observable<TokenResponse> {
    let token: string;
    let secure_service: string = "";
    let secure_id: string = "";
    let settlement: number | undefined;

    return this._processToken(event.body).pipe(
      mergeMap((data: CardToken) =>
        forkJoin([
          this._getProcessorDynamo(event.requestContext.authorizer.merchantId),
          of(this._prepareBody(data)),
        ])
      ),
      switchMap(([processor, body]: [DynamoProcessorFetch, CardToken]) =>
        forkJoin([
          of(body),
          this._getBinInfo(
            body.card.number.slice(0, 6),
            get(processor, "plcc", false)
          ),
        ])
      ),
      switchMap((data: [CardToken, DynamoBinFetch]) => this._forkBinList(data)),
      switchMap((data: [CardToken, DynamoBinFetch | undefined]) =>
        this._getTokenRule(data, event.requestContext.authorizer, event.headers)
      ),
      mergeMap(
        (
          data: [
            CardToken,
            DynamoBinFetch | undefined,
            LambdaTransactionRuleResponse
          ]
        ) => this._checkOmitCvvEnable(data, event.body)
      ),
      concatMap(
        (
          data: [
            CardToken,
            DynamoBinFetch | undefined,
            LambdaTransactionRuleResponse
          ]
        ) => {
          CardService._checkProcessor(data);

          return forkJoin([
            this._forkTokensTransaction(
              data,
              event.requestContext.authorizer.merchantId
            ),
            this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
              public_id: event.requestContext.authorizer.merchantId,
            }),
          ]);
        }
      ),
      mergeMap(
        ([data, merchant]: [
          [
            TokensCardResponse,
            CardToken,
            DynamoBinFetch | undefined,
            LambdaTransactionRuleResponse,
            string
          ],
          DynamoMerchantFetch | undefined
        ]) => {
          const is_aws_request: boolean = "KSH_AWS_REQUEST_ID" in event;
          const merchant_id: string =
            event.requestContext.authorizer.merchantId;

          token = data[0].token;
          if (data[3].secureId && data[3].secureService !== undefined) {
            secure_id = data[3].secureId;
            secure_service = data[3].secureService;
          }
          if (data[0].settlement !== undefined) settlement = data[0].settlement;

          return forkJoin([
            this._saveToken(
              data,
              merchant_id,
              is_aws_request,
              event.headers,
              get(event, "body.isDeferred", false),
              settlement
            ),
            this._invokeMultiMerchantTokensLambda(
              merchant_id,
              token,
              event.body.partners,
              event.body.totalAmount,
              event.body.card
            ),
            this._invokeCommissionTokenLambda(
              merchant_id,
              token,
              get(merchant, "commission", false),
              event.body.totalAmount,
              event.body.card,
              CurrencyEnum[get(event.body, "currency", "")]
            ),
          ]);
        }
      ),
      map(() =>
        this._getTokenResponse(token, secure_service, secure_id, settlement)
      )
    );
  }

  public capture(
    event: IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>
  ): Observable<object> {
    const capture_reference: string = v4();
    const valid_percentage_over_amount: number = 20;

    let current_merchant: DynamoMerchantFetch;
    let current_token: DynamoTokenFetch;
    let current_processor: DynamoProcessorFetch;
    let current_transaction: Transaction;

    return forkJoin([
      this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
        public_id: event.requestContext.authorizer.merchantId,
      }),
      this._storage
        .query<Transaction>(
          TABLES.transaction,
          IndexEnum.transaction_ticket_number,
          "ticket_number",
          event.body.ticketNumber
        )
        .pipe(map((transactions: Transaction[]) => transactions[0])),
    ]).pipe(
      map(
        ([merchant, transaction]: [
          DynamoMerchantFetch | undefined,
          Transaction | undefined
        ]) => {
          if (merchant === undefined || transaction === undefined)
            throw new KushkiError(ERRORS.E004);
          current_merchant = merchant;

          if (
            event.body.amount &&
            transaction.approved_transaction_amount *
              (1 + valid_percentage_over_amount / 100) <
              this._fullAmount(event.body.amount)
          )
            throw new KushkiError(ERRORS.E012);

          current_transaction = transaction;

          return transaction;
        }
      ),
      switchMap((transaction: Transaction) =>
        this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
          id: transaction.token,
        })
      ),
      switchMap((cToken: DynamoTokenFetch | undefined) => {
        current_token = CardService._validateTokenExists(cToken, event);

        return this._invokeTrxRule(
          current_token,
          event,
          TransactionRuleTypeEnum.CAPTURE
        );
      }),
      switchMap(
        (resp: {
          processor: DynamoProcessorFetch;
          plccInfo: { flag: string; brand: string };
        }) => {
          current_processor = resp.processor;

          return this._processCapture(
            current_merchant,
            current_transaction,
            resp.processor,
            current_token,
            capture_reference,
            event,
            resp.plccInfo
          );
        }
      ),
      catchError((err: ChargeError) =>
        iif(
          () => err instanceof AurusError || err instanceof KushkiError,
          this._processChargeOrCaptureError(
            <AurusError | KushkiError>err,
            event,
            current_processor,
            current_token,
            current_merchant
          ),
          throwError(err)
        )
      ),
      switchMap((data: AurusResponse) =>
        this._buildCaptureResponse(
          event.body,
          current_transaction,
          current_processor,
          data,
          capture_reference
        )
      ),
      tag("Card Service | capture")
    );
  }

  public charges(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<object> {
    const transaction_type: TransactionRuleTypeEnum = this._getTransactionRuleType(
      event.body
    );

    return this._trxMethod(event, transaction_type);
  }

  public preAuthorization(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<object> {
    return this._trxMethod(event, TransactionRuleTypeEnum.PREAUTH);
  }

  public chargeMethod(
    cToken: DynamoTokenFetch,
    trxReference: string,
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    processor: DynamoProcessorFetch,
    currentMerchant: DynamoMerchantFetch,
    plccInfo: { flag: string; brand: string },
    transactionType: TransactionRuleTypeEnum,
    ruleInfo?: object
  ): Observable<[boolean, Transaction]> {
    let aurus_charge: AurusResponse;
    const add_time: number = 86400000;
    const length_date: number = 10;

    return of(1).pipe(
      switchMap(() =>
        iif(
          () =>
            transactionType === TransactionRuleTypeEnum.CHARGE &&
            cToken.userId !== undefined &&
            cToken.sessionId !== undefined &&
            (get(currentMerchant, "sift_science.ProdAccountId") !== undefined ||
              get(currentMerchant, "sift_science.ProdAccountId") !== null),
          this._processWorkflows(currentMerchant, cToken),
          of(true)
        )
      ),
      switchMap(() => {
        if (transactionType === TransactionRuleTypeEnum.PREAUTH)
          return this._gateway.preAuthorization(
            event.body,
            processor.private_id,
            cToken,
            trxReference
          );

        return this._executeChargeTransaction(
          event.body,
          processor.private_id,
          trxReference,
          plccInfo.flag,
          cToken,
          cToken.merchantId,
          processor,
          currentMerchant.whiteList
        );
      }),
      switchMap((data: AurusResponse) => {
        aurus_charge = data;

        return forkJoin([
          this._storage.put(
            {
              ...event.body,
              channel: event.body.channel,
              details: data.transaction_details,
              expirationTime: Number(
                (new Date().getTime() + add_time)
                  .toString()
                  .slice(0, length_date)
              ),
              ticketNumber: data.ticket_number,
              transactionId: data.transaction_id,
              transactionReference: trxReference,
            },
            TABLES.charges
          ),
          this._processorCharge(
            event,
            aurus_charge,
            cToken,
            event.requestContext.authorizer.merchantId,
            currentMerchant.merchant_name,
            processor,
            undefined,
            ruleInfo,
            plccInfo,
            transactionType
          ),
        ]);
      })
    );
  }

  public chargeDeleteGateway(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    return of(1).pipe(
      mergeMap(() => this.chargeDelete(event)),
      catchError((err: KushkiError | Error) =>
        iif(
          () => err instanceof KushkiError && err.code === "K020",
          this._lambda.invokeFunction(
            `usrv-subscriptions-${process.env.USRV_STAGE}-subscriptionChargesDelete`,
            {
              amount: get(event, "body.amount", {}),
              fullResponse: get(event, "body.fullResponse", false),
              path: event.path,
              ticketNumber: event.pathParameters.ticketNumber,
            }
          ),
          throwError(err)
        )
      )
    );
  }

  public chargeBack(
    event: IAPIGatewayEvent<null, VoidCardPath, null, AuthorizerContext>
  ): Observable<boolean> {
    return this._storage
      .query<Transaction>(
        TABLES.transaction,
        IndexEnum.transaction_ticket_number,
        AggTransactionEnum.ticket_number,
        event.pathParameters.ticketNumber
      )
      .pipe(
        map((transaction: Transaction[]) => {
          if (transaction.length === 0) throw new KushkiError(ERRORS.E020);

          return transaction[0];
        }),
        switchMap((chargeTrx: Transaction) =>
          this._lambda.invokeFunction(`${process.env.CHARGEBACK_LAMBDA}`, {
            body: chargeTrx,
          })
        ),
        mapTo(true)
      );
  }

  public chargeDelete(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >
  ): Observable<object> {
    const transaction_id: string = v4();
    let sale_trx: Transaction;

    return this._storage
      .query<Transaction>(
        TABLES.transaction,
        IndexEnum.transaction_ticket_number,
        "ticket_number",
        event.pathParameters.ticketNumber
      )
      .pipe(
        switchMap((transaction: Transaction[]) => {
          if (
            transaction.length === 0 ||
            transaction[0].merchant_id !==
              event.requestContext.authorizer.merchantId
          )
            throw new KushkiError(ERRORS.E020);
          sale_trx = transaction[0];

          return transaction;
        }),
        switchMap((transaction: Transaction) =>
          forkJoin([
            this._storage.query<Transaction>(
              TABLES.transaction,
              IndexEnum.transaction_sale_ticket_number,
              "sale_ticket_number",
              event.pathParameters.ticketNumber
            ),
            this._checkPartialRefund(event, transaction),
            of(transaction),
          ])
        ),
        switchMap(
          (data: [Transaction[], partialTransactionRefund, Transaction]) =>
            iif(
              () =>
                data[0].length === 0 ||
                defaultTo(get(data[2], "pendingAmount"), 0) > 0,
              this._processInitVoid(sale_trx, transaction_id, event, data[1]),
              this._responseVoidInfo(sale_trx, event, data[0][0])
            )
        ),
        tag("CardService | chargeDelete")
      );
  }

  private _getTransactionRuleType(
    body: ChargesCardRequest
  ): TransactionRuleTypeEnum {
    switch (true) {
      case get(body, "months", 0) > 0:
        return TransactionRuleTypeEnum.DEFERRED;
      case get(body, "deferred.months", 0) > 0:
        return TransactionRuleTypeEnum.DEFERRED;
      case get(body, "metadata.ksh_subscriptionValidation", false):
        return TransactionRuleTypeEnum.SUBSCRIPTION_VALIDATION;
      default:
        return TransactionRuleTypeEnum.CHARGE;
    }
  }

  private _getProcessorDynamo(
    merchantId: string
  ): Observable<DynamoProcessorFetch> {
    return this._storage
      .query<DynamoProcessorFetch>(
        TABLES.processors,
        IndexEnum.processors_merchant_id_index,
        "merchant_id",
        merchantId
      )
      .pipe(
        map((processorItems: DynamoProcessorFetch[]) => {
          if (processorItems.length === 0) throw new KushkiError(ERRORS.E003);

          const plcc_processors: DynamoProcessorFetch[] = processorItems.filter(
            (processor: DynamoProcessorFetch) => processor.plcc === true
          );

          if (plcc_processors.length > 0) return plcc_processors[0];

          return processorItems[0];
        })
      );
  }

  // istanbul ignore next
  private _getMerchantCountry(
    country: string | undefined,
    processorName: string
  ): string | undefined {
    if (country === undefined) {
      if (
        processorName === ProcessorEnum.CREDIBANCO ||
        processorName === ProcessorEnum.REDEBAN
      )
        return CountryEnum.COLOMBIA;
      if (
        processorName === ProcessorEnum.CREDIMATIC ||
        processorName === ProcessorEnum.DATAFAST
      )
        return CountryEnum.ECUADOR;
      if (processorName === ProcessorEnum.TRANSBANK) return CountryEnum.CHILE;
    }

    return country;
  }

  private _fullAmount(amount: Amount): number {
    let total: number =
      get(amount, "iva", 0) +
      get(amount, "subtotalIva", 0) +
      get(amount, "subtotalIva0", 0);

    if (amount.ice !== undefined) total += amount.ice;

    if (amount.extraTaxes) {
      total += amount.extraTaxes.agenciaDeViaje
        ? amount.extraTaxes.agenciaDeViaje
        : 0;
      total += amount.extraTaxes.iac ? amount.extraTaxes.iac : 0;
      total += amount.extraTaxes.propina ? amount.extraTaxes.propina : 0;
      total += amount.extraTaxes.tasaAeroportuaria
        ? amount.extraTaxes.tasaAeroportuaria
        : 0;
    }

    return total;
  }

  private _processCapture(
    merchant: DynamoMerchantFetch,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    token: DynamoTokenFetch,
    trxReference: string,
    event: IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>,
    plccInfo
  ): Observable<AurusResponse> {
    const add_time: number = 86400000;
    const length_date: number = 10;

    return this._gateway
      .captureTransaction(event.body, transaction, processor.private_id)
      .pipe(
        switchMap((aurusResponse: AurusResponse) =>
          forkJoin([
            this._processorCharge(
              event,
              aurusResponse,
              token,
              event.requestContext.authorizer.merchantId,
              merchant.merchant_name,
              processor,
              undefined,
              undefined,
              plccInfo,
              TransactionRuleTypeEnum.CAPTURE
            ),
            this._storage.put(
              {
                ...event.body,
                channel: event.body.channel,
                details: aurusResponse.transaction_details,
                expirationTime: Number(
                  (new Date().getTime() + add_time)
                    .toString()
                    .slice(0, length_date)
                ),
                ticketNumber: aurusResponse.ticket_number,
                transactionId: aurusResponse.transaction_id,
                transactionReference: trxReference,
              },
              TABLES.charges
            ),
            of(aurusResponse),
          ])
        ),
        map((data: [Transaction, boolean, AurusResponse]) => data[2]),
        tag("CardService | _processCapture")
      );
  }

  private _responseVoidInfo(
    chargeTransaction: Transaction,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    voidTransaction: Transaction
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoProcessorFetch>(TABLES.processors, {
          public_id: chargeTransaction.processor_id,
        })
      ),
      switchMap((processorInfo: DynamoProcessorFetch | undefined) =>
        this._buildVoidResponse(
          event.body,
          { ...chargeTransaction, ...voidTransaction },
          <DynamoProcessorFetch>processorInfo,
          chargeTransaction.bin_card,
          chargeTransaction.ticket_number
        )
      )
    );
  }

  private _getDeferredResponse(
    binNumber: string,
    request: {
      binFetch: DynamoBinFetch;
      merchantFetch: DynamoMerchantFetch;
      processorFetch: DynamoProcessorFetch[];
    }
  ): Observable<IDeferredResponse[]> {
    const response: {
      bank: string;
      bin: string;
      deferredOptions: DeferredOption[];
    } = {
      bank: "",
      bin: binNumber,
      deferredOptions: [],
    };
    const merchant_country: string | undefined = this._getMerchantCountry(
      request.merchantFetch.country,
      request.processorFetch[0].processor_name
    );
    let has_deferred_options: boolean = false;

    response.bank = request.binFetch.bank;

    if (!isEmpty(request.merchantFetch.deferredOptions)) {
      response.deferredOptions = get(
        request,
        "merchantFetch.deferredOptions",
        []
      );
      has_deferred_options = true;
    }

    if (
      merchant_country === CountryEnum.COLOMBIA ||
      merchant_country === CountryEnum.CHILE
    )
      return of(CardService.sColombianChileanDeferredOptions);

    if (merchant_country === CountryEnum.MEXICO && has_deferred_options)
      return this._buildMexicanDeferredOptions(
        response.deferredOptions,
        request.binFetch,
        response.bin
      );

    if (has_deferred_options) return this._buildDeferredOptions(response);

    return of([]);
  }

  private _buildMexicanDeferredOptions(
    deferredOptions: DeferredOption[],
    binFetch: DynamoBinFetch,
    bin: string
  ): Observable<IDeferredResponse[]> {
    if (
      !isEmpty(get(binFetch.info, "type")) &&
      get(binFetch, "info.type", "").toLowerCase() === "credit"
    )
      return from(deferredOptions).pipe(
        filter((deferredOption: DeferredOption) =>
          defaultTo(deferredOption.bins, [""]).includes(bin)
        ),
        toArray(),
        mergeMap((options: DeferredOption[]) =>
          this._getDeferredOptionsMexico(options)
        ),
        tag("Card Service | buildMexicanDeferredOptions")
      );

    return of([]);
  }

  private _processInitVoid(
    chargeTransaction: Transaction,
    transactionId: string,
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    partialRefund: partialTransactionRefund
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        forkJoin([
          of(chargeTransaction),
          this._storage.getItem<DynamoProcessorFetch>(TABLES.processors, {
            public_id: chargeTransaction.processor_id,
          }),
          this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
            public_id: chargeTransaction.merchant_id,
          }),
        ])
      ),
      switchMap(
        (
          response: [
            Transaction,
            DynamoProcessorFetch | undefined,
            DynamoMerchantFetch | undefined
          ]
        ) =>
          forkJoin([
            of(response[0]),
            this._executeVoidTransaction(
              response,
              transactionId,
              event.requestContext.authorizer,
              partialRefund
            ),
            of(response[1]),
          ])
      ),
      switchMap(
        (
          responseProcess: [
            Transaction,
            object,
            DynamoProcessorFetch | undefined
          ]
        ) => {
          const invoke_response: { body: { ticketNumber: string } } = <
            { body: { ticketNumber: string } }
          >responseProcess[1];
          const transaction_response: Transaction = {
            ...responseProcess[0],
            transactionId,
            request_amount: partialRefund.requestAmount,
            ticket_number: invoke_response.body.ticketNumber,
            transaction_reference: transactionId,
          };

          return forkJoin([
            this._transactionService.processVoidRecord(
              event,
              transaction_response
            ),
            this._buildVoidResponse(
              event.body,
              transaction_response,
              <DynamoProcessorFetch>responseProcess[2],
              transaction_response.bin_card,
              chargeTransaction.ticket_number
            ),
            this._updatePendingAmount(partialRefund, chargeTransaction),
          ]);
        }
      ),
      concatMap(
        (responseTransaction: [Transaction, VoidCardResponse, boolean]) =>
          of(responseTransaction[1])
      ),
      tag("CardService | _processInitVoid")
    );
  }

  private _updatePendingAmount(
    partialRefund: partialTransactionRefund,
    chargeTransaction: Transaction
  ): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => partialRefund.status,
          this._storage.updateValues(
            `${process.env.DYNAMO_TRANSACTION}`,
            {
              created: chargeTransaction.created,
              transaction_id: chargeTransaction.transaction_id,
            },
            {
              pendingAmount: partialRefund.amount,
            }
          ),
          of(true)
        )
      )
    );
  }

  private _validatePlccBin(
    bin: string
  ): Observable<{ flag: string; brand: string }> {
    return of(1).pipe(
      concatMap(() =>
        // TODO change EC value when we sync country in merchant T-T
        this._storage.getItem<DynamoBinFetch>(TABLES.bins, { bin: `EC${bin}` })
      ),
      map((binInfo: DynamoBinFetch | undefined) => {
        if (binInfo === undefined) return { flag: "0", brand: "" };
        return { flag: "1", brand: binInfo.brand };
      }),
      tag("CardService | _validatePlccBin")
    );
  }

  private _getProcessorAndBinInfo(
    fullResponse: boolean | undefined,
    trx: Transaction
  ): Observable<[Transaction, BinFetchType]> {
    if (fullResponse === true)
      return forkJoin([
        of(trx),
        this._storage.getItem<DynamoBinFetch>(TABLES.bins, {
          bin: trx.bin_card,
        }),
      ]);

    return forkJoin([of(trx), of(undefined)]);
  }

  private _buildVoidRequest(transaction: Transaction): RequestedVoid {
    return {
      ...dot.transform(this._requestVoid, transaction),
      amount: this._getAmountTrx(transaction),
    };
  }

  private _getAmountTrx(transaction: Transaction): object {
    return {
      currency: transaction.currency_code,
      extraTaxes: transaction.taxes,
      ice: transaction.ice_value,
      iva: transaction.iva_value,
      subtotalIva: transaction.subtotal_iva,
      subtotalIva0: transaction.subtotal_iva0,
    };
  }

  private _buildCaptureResponse(
    captureRequest: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    aurusData: AurusResponse,
    captureReference: string
  ): Observable<object> {
    delete transaction.ticket_number;
    delete transaction.amount;
    delete transaction.transactionDetails;
    delete transaction.transaction_details;
    return iif(
      () =>
        captureRequest.fullResponse !== undefined &&
        captureRequest.fullResponse === true,
      this._processfullResponseCapture(
        captureRequest,
        transaction,
        processor,
        aurusData,
        captureReference
      ),
      of({
        ticketNumber: aurusData.ticketNumber,
      })
    );
  }

  private _processfullResponseCapture(
    captureRequest: CaptureCardRequest,
    transaction: Transaction,
    processor: DynamoProcessorFetch,
    aurusData: AurusResponse,
    captureReference: string
  ): Observable<object> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoBinFetch>(TABLES.bins, {
          bin: transaction.bin_card,
        })
      ),
      map((binFetch: BinFetchType) => {
        let response: ChargesCardResponse;

        response = {
          details: {
            approvalCode: aurusData.approvalCode,
            approvedTransactionAmount: Number(aurusData.approved_amount),
            binCard: aurusData.binCard,
            binInfo: this._summarizeBinInfo(binFetch),
            cardHolderName: transaction.card_holder_name,
            currencyCode: transaction.currency_code,
            fullResponse: true,
            lastFourDigits: aurusData.lastFourDigitsOfCard,
            maskedCardNumber: `${transaction.bin_card}XXXX${transaction.last_four_digits}`,
            merchantId: transaction.merchant_id,
            merchantName: transaction.merchant_name,
            metadata: captureRequest.metadata,
            paymentBrand: transaction.payment_brand,
            processorBankName: transaction.processor_bank_name,
            processorId: transaction.processor_id,
            processorName: transaction.processor_name,
            recap: aurusData.recap,
            responseCode: aurusData.response_code,
            responseText: aurusData.response_text,
            syncMode: "online",
            ticketNumber: aurusData.ticketNumber,
            transactionId: aurusData.transaction_id,
            transactionReference: captureReference,
            transactionType: TransactionStatusEnum.CAPTURE,
          },
          ticketNumber: aurusData.ticketNumber,
        };
        // istanbul ignore next
        if (processor.acquirer_bank !== undefined)
          dot.copy(
            "acquirer_bank",
            ACQUIRER_BANK_TARGET_STRING,
            processor,
            response
          );

        return response;
      }),
      tag("CardService | _processfullResponseCapture")
    );
  }

  private _buildChargeResponse(
    fullResponse: boolean | undefined,
    ticketNumber: string,
    processor: DynamoProcessorFetch,
    data: [Transaction, BinFetchType],
    transactionRuleResponse: LambdaTransactionRuleBodyResponse
  ): ChargesCardResponse {
    delete data[0].ticket_number;
    delete data[0].amount;
    delete data[0].transactionDetails;
    delete data[0].transaction_details;
    let response: ChargesCardResponse;

    if (fullResponse === true) {
      response = {
        ticketNumber,
        details: <Details>camelKeys({
          ...data[0],

          binInfo: this._summarizeBinInfo(data[1]),
          rules: get(transactionRuleResponse, "body.rules.rules", []),
        }),
      };

      if (processor.acquirer_bank !== undefined)
        dot.copy(
          "acquirer_bank",
          ACQUIRER_BANK_TARGET_STRING,
          processor,
          response
        );
    } else response = { ticketNumber };

    return response;
  }

  private _getBinInfo(
    bin: string,
    privateCard: boolean
  ): Observable<DynamoBinFetch> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => privateCard,
          this._getPrivateBinDynamo(bin),
          this._getBinDynamo(bin)
        )
      ),
      tag("CardService | _getBinInfo")
    );
  }

  private _getPrivateBinDynamo(bin: string): Observable<DynamoBinFetch> {
    return of(1).pipe(
      mergeMap(() =>
        // TODO : Change with environment variable when exists more countries to support private cards
        this._getBinDynamo(`EC${bin}`)
      ),
      mergeMap((dynamoBin: DynamoBinFetch) => {
        if (dynamoBin.bank === "" && dynamoBin.brand === "")
          return this._getBinDynamo(bin);

        return of(dynamoBin);
      })
    );
  }

  private _getBinDynamo(bin: string): Observable<DynamoBinFetch> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoBinFetch>(TABLES.bins, {
          bin,
        })
      ),
      map((dynamoBin: DynamoBinFetch | undefined) => {
        if (dynamoBin === undefined)
          return {
            bin,
            bank: "",
            brand: "",
            info: {
              type: "credit",
            },
            processor: "",
          };

        return dynamoBin;
      })
    );
  }

  private _buildAurusChargeResponse(
    error: KushkiError,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    currentMerchant: DynamoMerchantFetch,
    currentToken: DynamoTokenFetch,
    processor: DynamoProcessorFetch,
    ruleInfo?: object
  ): Observable<boolean> {
    return of(currentToken).pipe(
      map((tokenFetch: DynamoTokenFetch) => {
        const aurus_response: AurusResponse = <AurusResponse>(
          error.getMetadata()
        );

        aurus_response.ticket_number = "";
        aurus_response.approved_amount = "0";
        aurus_response.transaction_id = nano
          .now()
          .toString()
          .replace(",", "");
        aurus_response.recap = "";

        if (error.code === "K021") {
          dot.move("responseCode", "response_code", aurus_response);
          dot.move("responseText", "response_text", aurus_response);
        } else {
          aurus_response.response_code = error.code;
          aurus_response.response_text = error.getMessage();
        }

        aurus_response.transaction_details = {
          approvalCode: "",
          binCard: "",
          cardHolderName: "",
          cardType: "",
          isDeferred:
            event.body.months !== undefined && event.body.months > 0
              ? "Y"
              : "N",
          lastFourDigitsOfCard: "",
          merchantName: currentMerchant.merchant_name,
          processorBankName: "",
          processorName: "",
        };

        if (tokenFetch.binInfo !== undefined)
          aurus_response.transaction_details = {
            ...aurus_response.transaction_details,
            binCard: tokenFetch.binInfo.bin,
            cardType: tokenFetch.binInfo.brand,
            lastFourDigitsOfCard: tokenFetch.lastFourDigits,
            processorName: tokenFetch.binInfo.processor,
          };

        return aurus_response;
      }),
      concatMap((chargeAurus: AurusResponse) =>
        this._processorCharge(
          event,
          chargeAurus,
          currentToken,
          event.requestContext.authorizer.merchantId,
          currentMerchant.merchant_name,
          processor,
          error,
          ruleInfo
        )
      ),
      mapTo(true)
    );
  }

  // tslint:disable-next-line:parameters-max-number
  private _processorCharge(
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    aurusChargeResponse: AurusResponse,
    tokenFetch: DynamoTokenFetch,
    merchantId: string,
    merchantName: string,
    processor?: DynamoProcessorFetch,
    error?: KushkiError | AurusError,
    ruleInfo?: object,
    plccInfo?: { flag: string; brand: string },
    trxType?: string
  ): Observable<Transaction> {
    return of(1).pipe(
      switchMap(() =>
        iif(
          () => error !== undefined,
          of(1).pipe(
            switchMap(() =>
              this._transactionService.processRecord(
                event,
                aurusChargeResponse,
                merchantId,
                tokenFetch,
                merchantName,
                processor,
                error,
                undefined,
                ruleInfo,
                plccInfo,
                trxType
              )
            )
          ),
          of(1).pipe(
            switchMap(() =>
              this._transactionService.processRecord(
                event,
                aurusChargeResponse,
                merchantId,
                tokenFetch,
                merchantName,
                processor,
                undefined,
                undefined,
                ruleInfo,
                plccInfo,
                trxType
              )
            )
          )
        )
      ),
      tag("CardService | _processorCharge")
    );
  }

  private _trxMethod(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    transactionType: TransactionRuleTypeEnum
  ): Observable<object> {
    let current_merchant: DynamoMerchantFetch;
    let current_token: DynamoTokenFetch;
    let ticket_number: string;
    let processor: DynamoProcessorFetch;

    return this._storage
      .getItem<DynamoMerchantFetch>(TABLES.merchants, {
        public_id: event.requestContext.authorizer.merchantId,
      })
      .pipe(
        switchMap((merchant: DynamoMerchantFetch | undefined) =>
          forkJoin([this._getMerchant(merchant), this._getToken(event)])
        ),
        switchMap((data: [DynamoMerchantFetch, DynamoTokenFetch]) => {
          current_merchant = data[0];
          current_token = data[1];

          if (
            current_token.isDeferred &&
            event.body.months === undefined &&
            event.body.deferred === undefined
          ) {
            this._rollbar.critical("Transacción tokenizada como diferido.");
            throw new KushkiError(ERRORS.E013);
          }
          return this._invokeTrxRule(current_token, event, transactionType);
        }),
        concatMap(
          (data: {
            processor: DynamoProcessorFetch;
            plccInfo: { flag: string; brand: string };
            trxRuleResponse: LambdaTransactionRuleBodyResponse;
          }) => {
            processor = data.processor;

            return forkJoin([
              this.chargeMethod(
                current_token,
                current_token.transactionReference,
                event,
                data.processor, // DynamoProcessorFetch
                current_merchant,
                data.plccInfo, // Plcc flag
                transactionType,
                {
                  ip: defaultTo(current_token.ip, ""),
                  maskedCardNumber: current_token.maskedCardNumber,
                }
              ),
              of(data.trxRuleResponse),
            ]);
          }
        ),
        catchError((err: ChargeError) =>
          this._checkForErrorInCharge(
            err,
            event,
            processor,
            current_token,
            current_merchant
          )
        ),
        switchMap(
          ([data, trx_response]: [
            [boolean, Transaction],
            LambdaTransactionRuleBodyResponse
          ]) =>
            forkJoin([
              this._publishSNS(event.body.contactDetails, data[1]),
              this._validateSiftScienceCharge(
                transactionType,
                current_token,
                current_merchant
              ),
              of(data[1]),
              of(trx_response),
            ])
        ),
        switchMap(
          (
            data: [
              boolean,
              boolean,
              Transaction,
              LambdaTransactionRuleBodyResponse
            ]
          ) => {
            ticket_number = data[2].ticket_number;

            return forkJoin([
              this._getProcessorAndBinInfo(event.body.fullResponse, data[2]),
              of(data[3]),
            ]);
          }
        ),
        mergeMap(
          ([data, trx_response]: [
            [Transaction, BinFetchType],
            LambdaTransactionRuleBodyResponse
          ]) =>
            of(
              this._buildChargeResponse(
                event.body.fullResponse,
                ticket_number,
                processor,
                data,
                trx_response
              )
            )
        ),
        tag("Card Service | _trxMethod")
      );
  }

  private _getToken(
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  ): Observable<DynamoTokenFetch> {
    return of(1).pipe(
      switchMap(() =>
        this._storage.getItem<DynamoTokenFetch>(TABLES.tokens, {
          id: event.body.token,
        })
      ),
      map((dynamoToken: DynamoTokenFetch | undefined) =>
        CardService._validateTokenExists(dynamoToken, event)
      )
    );
  }

  private _getMerchant(
    merchant: DynamoMerchantFetch | undefined
  ): Observable<DynamoMerchantFetch> {
    if (merchant === undefined) throw new KushkiError(ERRORS.E004);

    return of(merchant);
  }

  private _checkForErrorInCharge(
    err: ChargeError,
    event: IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch
  ): Observable<never> {
    return iif(
      () => err instanceof AurusError || err instanceof KushkiError,
      of(1).pipe(
        switchMap(() =>
          this._processChargeOrCaptureError(
            <AurusError | KushkiError>err,
            event,
            processor,
            currentToken,
            currentMerchant
          )
        )
      ),
      throwError(err)
    );
  }

  private _invokeMultiMerchantTokensLambda(
    merchantId: string,
    token: string,
    partners: PartnerConfig[] | undefined,
    totalAmount: number,
    card: CardInfo
  ): Observable<boolean> {
    if (partners !== undefined && partners.length > 0) {
      const multi_merchant_tokens_request: MultiTokenRequest = {
        card,
        merchantId,
        partners,
        totalAmount,
        parentToken: token,
      };

      return this._lambda
        .invokeFunction(
          `${process.env.MULTI_MERCHANT_TOKENS_LAMBDA}`,
          multi_merchant_tokens_request
        )
        .pipe(mapTo(true));
    }

    return of(false);
  }

  private _invokeCommissionTokenLambda(
    merchantId: string,
    token: string,
    commission: boolean,
    totalAmount: number,
    card: CardInfo,
    currency: CurrencyEnum
  ): Observable<boolean> {
    return of(commission).pipe(
      mergeMap((commissionStatus: boolean) => {
        if (commissionStatus) {
          const commission_token_request: CommissionTokenRequest = {
            card,
            currency,
            merchantId,
            totalAmount,
            commission: commissionStatus,
            parentToken: token,
          };

          return this._lambda
            .invokeFunction(
              `${process.env.COMMISSION_TOKENS_LAMBDA}`,
              commission_token_request
            )
            .pipe(mapTo(true));
        }
        return of(false);
      })
    );
  }

  private _validateSiftScienceCharge(
    transactionType: string,
    currentToken: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch
  ): Observable<boolean> {
    return iif(
      () =>
        transactionType === TransactionRuleTypeEnum.CHARGE &&
        currentToken.userId !== undefined &&
        currentToken.sessionId !== undefined &&
        /* tslint:disable:strict-type-predicates */
        (currentMerchant.sift_science.ProdApiKey !== undefined ||
          currentMerchant.sift_science.ProdApiKey !== null),
      this._antifraud.transaction(currentMerchant, currentToken),
      of(true)
    );
  }

  private _publishSNS(
    contactDetails: object | undefined,
    transaction: Transaction
  ): Observable<boolean> {
    return iif(
      () => contactDetails !== undefined,
      this._sns.publish(`${SNS.SnsTransaction}`, {
        contactDetails,
        transaction,
      }),
      of(false)
    ).pipe(
      catchError(() => of(true)),
      tag("CardService | _publishSNS")
    );
  }

  private _remapAurusError(error: AurusError): AurusResponse {
    const metadata: AurusResponse = <AurusResponse>error.getMetadata();

    metadata.response_code = error.code;
    metadata.response_text = error.getMessage();
    metadata.ticket_number = "";
    metadata.approved_amount = "0";
    metadata.transaction_id = nano
      .now()
      .toString()
      .replace(",", "");
    metadata.recap = "";
    dot.move("approvalCode", "transaction_details.approvalCode", metadata);
    dot.move("cardHolderName", "transaction_details.cardHolderName", metadata);
    dot.move(
      "lastFourDigitsOfCard",
      "transaction_details.lastFourDigitsOfCard",
      metadata
    );
    dot.move("cardType", "transaction_details.cardType", metadata);
    dot.move("binCard", "transaction_details.binCard", metadata);
    dot.move("processorName", "transaction_details.processorName", metadata);
    dot.move(
      "processorBankName",
      "transaction_details.processorBankName",
      metadata
    );
    dot.move("isDeferred", "transaction_details.isDeferred", metadata);
    dot.move("merchantName", "transaction_details.merchantName", metadata);
    dot.move("conciliationId", "transaction_details.conciliationId", metadata);

    return metadata;
  }

  private _processWorkflows(
    currentMerchant: DynamoMerchantFetch,
    token: DynamoTokenFetch
  ): Observable<boolean> {
    return this._antifraud.createOrder(currentMerchant, token).pipe(
      switchMap(() =>
        this._antifraud.getWorkflows(
          currentMerchant,
          <Required<DynamoTokenFetch>>token
        )
      ),
      map((workflowResponse: SiftScienceWorkflowsResponse) => {
        const score: number =
          currentMerchant.sift_science.SiftScore !== undefined
            ? currentMerchant.sift_science.SiftScore
            : Number(process.env.SIFT_SCORE);

        if (
          workflowResponse.score_response !== undefined &&
          workflowResponse.score_response.scores.payment_abuse.score > score
        )
          throw new KushkiError(ERRORS.E021, undefined, {
            responseCode: "K021 | siftScore",
            responseText: "Declined by siftScore.",
          });

        const decision_ids: { id: string; workflowName: string }[] = [];

        if (
          workflowResponse.score_response !== undefined &&
          workflowResponse.score_response.workflow_statuses !== undefined
        )
          workflowResponse.score_response.workflow_statuses.forEach(
            (status: { history: History; config_display_name: string }) => {
              status.history.forEach(
                (history: {
                  app: string;
                  name: string;
                  config?: { decision_id?: string };
                }) => {
                  if (
                    !(
                      history.app === CardService.sSiftScienceDecision &&
                      history.config !== undefined &&
                      history.config.decision_id !== undefined
                    )
                  )
                    return;
                  decision_ids.push({
                    id: history.config.decision_id,
                    workflowName: status.config_display_name,
                  });
                }
              );
            }
          );

        return decision_ids;
      }),
      switchMap((decisions: { id: string; workflowName: string }[]) =>
        iif(
          () => decisions.length >= 1,
          this._processWorkflowDecisions(decisions, currentMerchant),
          of(true)
        )
      )
    );
  }

  private _processWorkflowDecisions(
    decisions: { id: string; workflowName: string }[],
    merchant: DynamoMerchantFetch
  ): Observable<boolean> {
    return from(decisions).pipe(
      mergeMap((decision: { id: string; workflowName: string }) =>
        forkJoin([
          this._antifraud.getDecision(merchant, decision.id),
          of(decision),
        ])
      ),
      reduce(
        (
          _: boolean,
          siftDecisionResponse: [
            SiftScienceDecisionResponse,
            { id: string; workflowName: string }
          ]
        ) => {
          if (
            siftDecisionResponse[0].type === CardService.sSiftScienceBlockType
          )
            throw new KushkiError(ERRORS.E021, undefined, {
              responseCode: `${siftDecisionResponse[1].workflowName}|${siftDecisionResponse[0].name}`,
              responseText: siftDecisionResponse[0].description,
            });

          return true;
        },
        false
      ),
      tag("CardService | _processWorkflowDecisions")
    );
  }

  private _buildDeferredOptions(options: {
    deferredOptions: DeferredOption[];
    bank: string;
    bin: string;
  }): Observable<IDeferredResponse[]> {
    return from(options.deferredOptions).pipe(
      filter(
        (deferredOption: DeferredOption) =>
          defaultTo(deferredOption.bank, [""]).includes(options.bank) ||
          defaultTo(deferredOption.bins, [""]).includes(options.bin)
      ),
      toArray(),
      switchMap((deferredOptions: DeferredOption[]) =>
        this._getDeferredOptions(deferredOptions)
      ),
      tag("Card Service | buildDeferredOptions conditions")
    );
  }

  private _getDeferredOptions(
    deferredOptions: DeferredOption[]
  ): Observable<IDeferredResponse[]> {
    return from(deferredOptions).pipe(
      reduce(
        (
          acc: { [k: string]: IDeferredResponse | undefined },
          curr: DeferredOption
        ) => {
          curr.deferredType.forEach((deferredType: string) => {
            const enum_key: string = `D${deferredType}`;
            let deferred: IDeferredResponse | undefined = acc[deferredType];

            if (deferred === undefined)
              deferred = {
                months: this._sortMonths(curr.months),
                monthsOfGrace: curr.monthsOfGrace,
                name: DeferredNamesEnum[enum_key],
                type: deferredType,
              };
            else {
              deferred.months = this._sortMonths(
                union(deferred.months, curr.months).sort()
              );
              deferred.monthsOfGrace = this._sortMonths(
                union(deferred.monthsOfGrace, curr.monthsOfGrace).sort()
              );
            }
            acc[deferredType] = deferred;
          });

          return acc;
        },
        {}
      ),
      map((obj: { [k: string]: IDeferredResponse | undefined }) =>
        Object.values<IDeferredResponse>(
          <{ [k: string]: IDeferredResponse }>obj
        )
      ),
      tag("CardService | _getDeferredOptions")
    );
  }

  private _getDeferredOptionsMexico(
    deferredOptions: DeferredOption[]
  ): Observable<IDeferredResponse[]> {
    return from(deferredOptions).pipe(
      reduce(
        (
          accumulator: { [k: string]: IDeferredResponse | undefined },
          current: DeferredOption
        ) => {
          current.deferredType.forEach((deferredType: string) => {
            let deferred: IDeferredResponse | undefined;

            deferred = {
              months: this._sortMonths(current.months),
              monthsOfGrace: [],
              type: "all",
            };

            accumulator[deferredType] = deferred;
          });

          return accumulator;
        },
        {}
      ),
      map((object: { [k: string]: IDeferredResponse | undefined }) =>
        Object.values<IDeferredResponse>(
          <{ [k: string]: IDeferredResponse }>object
        )
      ),
      tag("CardService | _getDeferredOptionsMexico")
    );
  }

  private _prepareBody(body: CardToken): CardToken {
    if (!body.hasOwnProperty("currency")) body.currency = "USD";
    body.card.name = this._transformCardName(body.card.name);
    CardService._validateBin(body.card.number);

    return body;
  }

  private _getTokenRule(
    data: [CardToken, DynamoBinFetch | undefined],
    context: AuthorizerContext,
    headers: IGenericHeaders
  ): Observable<
    [CardToken, DynamoBinFetch | undefined, LambdaTransactionRuleResponse]
  > {
    return forkJoin([
      of(data[0]),
      of(data[1]),
      this._lambda
        .invokeFunction<{ body: LambdaTransactionRuleResponse }>(
          `${process.env.LAMBDA_RULE}`,
          {
            body: {
              detail: {
                bank: data[1] === undefined ? "" : defaultTo(data[1].bank, ""),
                bin: data[0].card.number.slice(0, 5),
                brand:
                  data[1] === undefined ? "" : defaultTo(data[1].brand, ""),
                country:
                  data[1] === undefined ||
                  data[1].info === undefined ||
                  data[1].info.country === undefined
                    ? ""
                    : defaultTo(data[1].info.country.name, ""),
                credentialId: context.credentialId,
                currency: defaultTo(data[0].currency, CurrencyEnum.USD),
                ip: get(headers, "X-FORWARDED-FOR", "")
                  .split(",")[0]
                  .trim(),
                isCreditCard:
                  data[1] === undefined ||
                  data[1].info === undefined ||
                  data[1].info.type === undefined
                    ? "true"
                    : defaultTo(data[1].info.type, "").toLowerCase() === "debit"
                    ? "false"
                    : "true",
                isDeferred: defaultTo(data[0].isDeferred, false).toString(),
                lastFourDigits: data[0].card.number.slice(
                  data[0].card.number.length - 4,
                  data[0].card.number.length
                ),
                maskedCardNumber: `${data[0].card.number.slice(
                  0,
                  6
                )}${"X".repeat(
                  data[0].card.number.length - 10
                )}${data[0].card.number.substr(
                  data[0].card.number.length - 4
                )}`,
                otpData: {
                  tokenData: {
                    cardCurrency: defaultTo(data[0].currency, CurrencyEnum.USD),
                    cvv: defaultTo(data[0].card.cvv, ""),
                    expirationMonth: data[0].card.expiryMonth,
                    expirationYear: data[0].card.expiryYear,
                    holderName: data[0].card.name,
                    merchantCurrency: data[0].currency,
                    number: data[0].card.number,
                  },
                },
                processor: "",
                totalAmount: data[0].totalAmount.toString(),
                transactionType: "token",
              },
              merchantId: context.merchantId,
              transactionKind: "card",
            },
          }
        )
        .pipe(
          map(
            (response: { body: LambdaTransactionRuleResponse }) => response.body
          ),
          tag("CardService | _getTokenRule")
        ),
    ]);
  }

  private _checkOmitCvvEnable(
    data: [
      CardToken,
      DynamoBinFetch | undefined,
      LambdaTransactionRuleResponse
    ],
    bodyRequest: TokensCardRequest
  ): Observable<
    [CardToken, DynamoBinFetch | undefined, LambdaTransactionRuleResponse]
  > {
    return of(1).pipe(
      mergeMap(() =>
        this._storage.getItem<DynamoProcessorFetch>(TABLES.processors, {
          public_id: data[2].publicId,
        })
      ),
      mergeMap((processor: DynamoProcessorFetch | undefined) => {
        if (
          get(processor, "omitCVV", true) === false &&
          get(bodyRequest, "card.cvv", "") === ""
        ) {
          this._rollbar.warn("Transacción no permitida sin ccv2.");
          throw new KushkiError(ERRORS.E015);
        }

        return of(data);
      })
    );
  }

  private static _checkProcessor(
    data: [CardToken, DynamoBinFetch | undefined, LambdaTransactionRuleResponse]
  ): boolean {
    if (
      data[2].processor === ProcessorEnum.MCPROCESSOR &&
      get(data[0].card, "cvv", "") === ""
    )
      get(data[1], "brand", "").toLowerCase() === "amex" ||
      get(data[1], "brand", "").toLowerCase() === "american express"
        ? (data[0].card.cvv = "0000")
        : (data[0].card.cvv = "000");

    return true;
  }

  private _transformCardName(cardName: string): string {
    this._logger.info(`Original card holder name: ${cardName}`);

    const map_obj: object = {
      á: "a",
      Á: "A",
      é: "e",
      É: "E",
      í: "i",
      Í: "I",
      Ñ: "N",
      ñ: "n",
      ó: "o",
      Ó: "O",
      ú: "u",
      Ú: "U",
    };
    let str: string;

    str = cardName.replace(
      /[áéíóúÁÉÍÓÚÑñ]/gi,
      (matched: string): string => map_obj[matched]
    );
    str = str.replace(/[^\x00-\x7F]/g, "");
    str = str.replace(/[^a-zA-Z 0-9]+/g, "");
    this._logger.info(`Card holder name to save: ${str}`);

    return str;
  }

  /* tslint:disable: rxjs-no-explicit-generics */
  private _forkBinList([token, dynamo_bin]: [
    CardToken,
    DynamoBinFetch
  ]): Observable<[CardToken, DynamoBinFetch | undefined]> {
    let bin_to_put: DynamoBinFetch | undefined;

    if (dynamo_bin.brand !== "" || dynamo_bin.bank !== "")
      return of([token, dynamo_bin]);

    return this._binList.getBinInfo(token.card.number.slice(0, 6)).pipe(
      switchMap((binInfo: BinInfoResponse | undefined) => {
        if (binInfo === undefined) return of(false);
        bin_to_put = {
          bank:
            binInfo.bank !== undefined && binInfo.bank !== null
              ? binInfo.bank.name
              : "",
          bin: token.card.number.slice(0, 6),
          brand: binInfo.scheme.toUpperCase(),
          info: binInfo,
          processor: "NA",
        };

        return this._storage.put(bin_to_put, TABLES.bins);
      }),
      map((): [CardToken, DynamoBinFetch | undefined] => [token, bin_to_put]),
      tag("CardService | _forkBinList")
    );
  }

  private _getListBins(binData: DynamoBinFetch): Observable<DynamoBinFetch> {
    let bin_to_put: DynamoBinFetch;

    if (binData.brand !== "" || binData.bank !== "") return of(binData);

    return this._binList.getBinInfo(binData.bin).pipe(
      mergeMap((binInfo: BinInfoResponse | undefined) => {
        if (binInfo === undefined) {
          bin_to_put = {
            bank: "",
            bin: binData.bin,

            brand: "",
            info: {
              type: "credit",
            },
            processor: "",
          };

          return of(false);
        }
        bin_to_put = {
          bank:
            binInfo.bank !== undefined && binInfo.bank !== null
              ? binInfo.bank.name
              : "",
          bin: binData.bin,
          brand: binInfo.scheme.toUpperCase(),
          info: binInfo,
          processor: "NA",
        };

        return this._storage.put(bin_to_put, TABLES.bins);
      }),
      map((): DynamoBinFetch => bin_to_put)
    );
  }

  private _forkTokensTransaction(
    data: [
      CardToken,
      DynamoBinFetch | undefined,
      LambdaTransactionRuleResponse
    ],
    merchantId: string
  ): Observable<
    [
      TokensCardResponse,
      CardToken,
      DynamoBinFetch | undefined,
      LambdaTransactionRuleResponse,
      string
    ]
  > {
    const transaction_reference: string = v4();

    return forkJoin([
      this._executeTokenTransaction(
        data[0],
        data[2].publicId,
        "transaction",
        data[2].processor,
        transaction_reference,
        merchantId
      ),
      of(data[0]),
      of(data[1]),
      of(data[2]),
      of(transaction_reference),
    ]);
  }

  private _processChargeOrCaptureError(
    err: AurusError | KushkiError,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch | undefined,
    currentMerchant: DynamoMerchantFetch | undefined
  ): Observable<never> {
    return iif(
      () => err instanceof AurusError,
      this._handleChargeOrCaptureAurusError(
        <AurusError>err,
        event,
        processor,
        <DynamoTokenFetch>currentToken,
        <DynamoMerchantFetch>currentMerchant,
        {
          ip: currentToken === undefined ? "" : defaultTo(currentToken.ip, ""),
          maskedCardNumber:
            currentToken === undefined ? "" : currentToken.maskedCardNumber,
        }
      ),
      this._handleChargeOrCaptureKushkiError(
        err,
        event,
        processor,
        currentToken,
        currentMerchant,
        {
          ip: currentToken === undefined ? "" : defaultTo(currentToken.ip, ""),
          maskedCardNumber:
            currentToken === undefined ? "" : currentToken.maskedCardNumber,
        }
      )
    ).pipe(
      concatMap(() => {
        if (err.code === "322")
          return throwError(
            new AurusError("322", ERRORS.E322.message, err.getMetadata())
          );

        return throwError(err);
      }),
      tag("CardService | _processChargeError")
    );
  }

  private _handleChargeOrCaptureAurusError(
    err: AurusError,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    processor: DynamoProcessorFetch,
    tokenFetch: DynamoTokenFetch,
    currentMerchant: DynamoMerchantFetch,
    ruleInfo?: object
  ): Observable<Transaction> {
    return of(err.getMetadata<AurusResponse | TransactionDetails>()).pipe(
      switchMap((metadata: AurusResponse | TransactionDetails | object) => {
        if ("transaction_details" in metadata)
          metadata.transaction_details.merchantName =
            currentMerchant.merchant_name;
        return iif(
          () => "transaction_id" in metadata,
          this._processorCharge(
            event,
            <AurusResponse>metadata,
            tokenFetch,
            event.requestContext.authorizer.merchantId,
            currentMerchant.merchant_name,
            processor,
            err,
            ruleInfo
          ),
          this._processorCharge(
            event,
            this._remapAurusError(err),
            tokenFetch,
            event.requestContext.authorizer.merchantId,
            currentMerchant.merchant_name,
            processor,
            err,
            ruleInfo
          )
        );
      }),
      tag("CardService | _handleChargeOrCaptureAurusError")
    );
  }

  private _handleChargeOrCaptureKushkiError(
    err: Error,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    processor: DynamoProcessorFetch,
    currentToken: DynamoTokenFetch | undefined,
    currentMerchant: DynamoMerchantFetch | undefined,
    ruleInfo?: object
  ): Observable<boolean> {
    return iif(
      () => currentToken === undefined || currentMerchant === undefined,
      of(true),
      of(1).pipe(
        switchMap(() =>
          this._buildAurusChargeResponse(
            <KushkiError>err,
            event,
            <DynamoMerchantFetch>currentMerchant,
            <DynamoTokenFetch>currentToken,
            processor,
            ruleInfo
          )
        ),
        tag("CardService | _handleChargeOrCaptureKushkiError")
      )
    );
  }

  private _buildVoidResponse(
    body: VoidBody,
    trx: Transaction,
    processor: DynamoProcessorFetch,
    binNumber: string,
    saleTicketNumber: string | undefined
  ): Observable<VoidCardResponse> {
    const is_full_response: boolean =
      body !== undefined &&
      body !== null &&
      body.fullResponse !== undefined &&
      body.fullResponse;

    return of(1).pipe(
      switchMap(() =>
        iif(
          () => is_full_response,
          this._storage
            .getItem<DynamoBinFetch>(TABLES.bins, {
              bin: binNumber,
            })
            .pipe(
              map((binFetch: DynamoBinFetch | undefined) => {
                const response: VoidCardResponse = {
                  ticketNumber: trx.ticket_number,
                };

                delete trx.ticket_number;
                delete trx.amount;
                delete trx.transactionDetails;
                delete trx.transaction_details;
                delete trx.pendingAmount;

                response.details = <Details>camelKeys({
                  saleTicketNumber,
                  ...trx,
                  binInfo: this._summarizeBinInfo(binFetch),
                  transaction_status: TransactionStatusEnum.INITIALIZED,
                  transaction_type: TransactionTypeEnum.VOID,
                });

                dot.copy(
                  "acquirer_bank",
                  ACQUIRER_BANK_TARGET_STRING,
                  processor,
                  response
                );

                return response;
              })
            ),
          of({ ticketNumber: trx.ticket_number })
        )
      ),
      tag("CardService | _buildVoidResponse")
    );
  }

  private _summarizeBinInfo(binFetch: BinFetchType): object {
    return binFetch !== undefined && binFetch.info !== undefined
      ? // istanbul ignore next
        { bank: binFetch.bank, type: binFetch.info.type }
      : { bank: null, type: null };
  }

  private _invokeTrxRule(
    dynamoToken: DynamoTokenFetch,
    event: IAPIGatewayEvent<
      ChargesCardRequest | CaptureCardRequest,
      null,
      null,
      AuthorizerContext
    >,
    transactionType: TransactionRuleTypeEnum
  ): Observable<{
    processor: DynamoProcessorFetch;
    trxRuleResponse: LambdaTransactionRuleBodyResponse;
    plccInfo: { flag: string; brand: string };
  }> {
    let processor_fetch: DynamoProcessorFetch;

    return of(1).pipe(
      switchMap(() => {
        const is_deferred: boolean =
          (event.body.months !== undefined && event.body.months > 0) ||
          event.body.deferred !== undefined;
        const transaction_rule_payload: TransactionRulePayload = {
          transactionType,
          credentialId: event.requestContext.authorizer.credentialId,
          currency: get(event, "body.amount.currency", CurrencyEnum.USD),
          customer: event.body.contactDetails,
          ignoreWarnings: defaultTo(event.body.ignoreWarnings, false),
          isDeferred: is_deferred,
          merchantId: event.requestContext.authorizer.merchantId,
          token: dynamoToken,
        };

        return this._lambda.invokeFunction<LambdaTransactionRuleBodyResponse>(
          `${process.env.LAMBDA_RULE}`,
          this._getRulePayload(transaction_rule_payload)
        );
      }),
      switchMap((response: LambdaTransactionRuleBodyResponse) =>
        forkJoin([
          this._storage.getItem<DynamoProcessorFetch>(TABLES.processors, {
            public_id: response.body.publicId,
          }),
          of(response),
        ])
      ),
      mergeMap(
        (
          data: [
            DynamoProcessorFetch | undefined,
            LambdaTransactionRuleBodyResponse
          ]
        ) => {
          processor_fetch = <DynamoProcessorFetch>data[0];

          return of(data[1]);
        }
      ),
      switchMap((trxResponse: LambdaTransactionRuleBodyResponse) =>
        iif(
          () => get(trxResponse, "body.plcc", "0") === "1",
          forkJoin([this._validatePlccBin(dynamoToken.bin), of(trxResponse)]),
          forkJoin([of({ flag: "0", brand: "" }), of(trxResponse)])
        )
      ),
      map(
        ([plcc_information, trx_response]: [
          { flag: string; brand: string },
          LambdaTransactionRuleBodyResponse
        ]) => ({
          plccInfo: plcc_information,
          processor: processor_fetch,
          trxRuleResponse: trx_response,
        })
      ),
      tag("CardService | _invokeTrxRule")
    );
  }

  private _getRulePayload(
    transactionRulePayload: TransactionRulePayload
  ): object {
    return {
      body: {
        detail: {
          bank: this._getBankOrBrand(
            transactionRulePayload.token.binInfo,
            "bank"
          ),
          bin: defaultTo(transactionRulePayload.token.bin, ""),
          brand: this._getBankOrBrand(
            transactionRulePayload.token.binInfo,
            "card"
          ),
          country: this._getCountry(transactionRulePayload),
          credentialId: transactionRulePayload.credentialId,
          currency: transactionRulePayload.currency,
          customer: transactionRulePayload.customer,
          ignoreWarnings: transactionRulePayload.ignoreWarnings,
          ip: defaultTo(transactionRulePayload.token.ip, ""),
          isCreditCard: this._getCreditCard(transactionRulePayload),
          isDeferred: defaultTo(
            transactionRulePayload.isDeferred,
            false
          ).toString(),
          lastFourDigits: defaultTo(
            transactionRulePayload.token.lastFourDigits,
            ""
          ),
          maskedCardNumber: defaultTo(
            transactionRulePayload.token.maskedCardNumber,
            ""
          ),
          otpData: {
            chargeData: {
              // So trx-rule not crash without secureId if merchant is with Otp but the transaction fail to deliver a secureId (very strange case)
              secureServiceId: this._getSecureServiceId(transactionRulePayload),
            },
          },
          processor: this._getProcessor(transactionRulePayload),
          totalAmount: transactionRulePayload.token.amount.toString(),
          transactionType: transactionRulePayload.transactionType,
        },
        merchantId: transactionRulePayload.merchantId,
        transactionKind: "card",
      },
    };
  }

  private _getSecureServiceId(transactionRulePayload: TransactionRulePayload) {
    return get(transactionRulePayload.token, "secureId") !== undefined
      ? transactionRulePayload.token.secureId
      : "NA";
  }

  private _getProcessor(transactionRulePayload: TransactionRulePayload) {
    return transactionRulePayload.token.binInfo === undefined
      ? ""
      : defaultTo(transactionRulePayload.token.binInfo.processor, "");
  }

  private _getCreditCard(
    transactionRulePayload: TransactionRulePayload
  ): string {
    const type: string | null = get(
      transactionRulePayload.token.binInfo,
      "info.type"
    );

    return type === undefined || type === null
      ? "true"
      : get(
          transactionRulePayload.token.binInfo,
          "info.type",
          ""
        ).toLowerCase() === "debit"
      ? "false"
      : "true";
  }

  private _getCountry(transactionRulePayload: TransactionRulePayload): string {
    return get(transactionRulePayload.token.binInfo, "info.country") ===
      undefined
      ? ""
      : get(transactionRulePayload.token.binInfo, "info.country.name", "");
  }

  private _getBankOrBrand(
    binInfo: DynamoBinFetch | undefined,
    type: string
  ): string {
    return binInfo === undefined
      ? ""
      : defaultTo(type === "bank" ? binInfo.bank : binInfo.brand, "");
  }

  private _sortMonths(months: string[]): string[] {
    return months.sort(
      (a: string, b: string) => parseInt(a, 0) - parseInt(b, 0)
    );
  }

  private _processToken(request: TokensCardRequest): Observable<CardToken> {
    return of(request).pipe(
      switchMap((data: TokensCardRequest) =>
        iif(
          () => "token" in data && "kind" in data,
          this._tokenGateway.untokenize(request.token),
          of(request.card)
        )
      ),
      map((card: CardData) => {
        if (card.number.startsWith("0")) throw new KushkiError(ERRORS.E025);

        return {
          ...request,
          card,
        };
      })
    );
  }

  private _getTokenResponse(
    token: string,
    secureService: string,
    secureId: string,
    settlement: number | undefined
  ) {
    const response: TokenResponse = {
      token,
    };

    if (secureService !== "" && secureId !== "") {
      response.secureService = secureService;
      response.secureId = secureId;
    }

    if (settlement !== undefined) response.settlement = settlement;

    return response;
  }

  private _saveToken(
    info: [
      TokensCardResponse,
      CardToken,
      DynamoBinFetch | undefined,
      LambdaTransactionRuleResponse,
      string
    ],
    merchantId: string,
    isAwsRequest: boolean,
    headers: IGenericHeaders,
    isDeferred: boolean,
    settlement?: number
  ): Observable<boolean> {
    let ip: string | undefined;

    if (!isAwsRequest) ip = headers["X-FORWARDED-FOR"].split(",")[0].trim();

    return of(info).pipe(
      map(
        (
          data: [
            TokensCardResponse,
            CardToken,
            DynamoBinFetch | undefined,
            LambdaTransactionRuleResponse,
            string
          ]
        ) => {
          const currency: string | undefined = data[1].currency;
          const res: TokenDynamo = {
            currency,
            isDeferred,
            merchantId,
            amount: data[1].totalAmount,
            bin: data[1].card.number.slice(0, 6),
            cardHolderName: data[1].card.name,
            created: new Date().getTime(),
            id: data[0].token,
            lastFourDigits: data[1].card.number.substr(
              data[1].card.number.length - 4
            ),
            maskedCardNumber: `${data[1].card.number.slice(0, 6)}${"X".repeat(
              data[1].card.number.length - 10
            )}${data[1].card.number.substr(data[1].card.number.length - 4)}`,
            transactionReference: data[4],
          };

          const session_id: string | undefined | null = data[1].sessionId;
          const user_id: string | undefined | null = data[1].userId;

          if (
            data[3].secureId !== undefined &&
            data[3].secureService !== undefined
          ) {
            res.secureId = data[3].secureId;
            res.secureService = data[3].secureService;
          }

          if (ip !== undefined) res.ip = ip;
          if (session_id !== null && user_id !== null) {
            res.userId = user_id;
            res.sessionId = session_id;
          }
          if (settlement !== undefined) res.settlement = settlement;
          if (data[2] !== undefined) res.binInfo = data[2];
          return res;
        }
      ),
      switchMap((data: TokenDynamo) => this._storage.put(data, TABLES.tokens))
    );
  }

  private _getIsMerchantTest(merchantId: string): Observable<boolean> {
    return of(1).pipe(
      switchMap(() =>
        process.env.USRV_STAGE !== this.prodEnv
          ? this._storage.getItem<DynamoMerchantFetch>(TABLES.merchants, {
              public_id: merchantId,
            })
          : of(undefined)
      ),
      map((merchant: DynamoMerchantFetch | undefined) =>
        get(merchant, "sandboxEnable", false)
      ),
      tag("CardService |  _getIsMerchantTest")
    );
  }

  private _executeTokenTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string,
    transactionReference: string,
    merchantId: string
  ): Observable<TokensCardResponse> {
    return of(1).pipe(
      switchMap(() => this._getIsMerchantTest(merchantId)),
      switchMap((isTestMerchant: boolean) =>
        !isTestMerchant
          ? this._gateway.tokensTransaction(
              body,
              mid,
              tokenType,
              processorName,
              transactionReference
            )
          : this._sandbox.tokensTransaction(
              body,
              mid,
              tokenType,
              processorName,
              transactionReference
            )
      ),
      tag("CardService | _executeTokenTransaction")
    );
  }

  private _executeChargeTransaction(
    body: ChargesCardRequest,
    mid: string,
    trxReference: string,
    plccFlag: string,
    tokenInfo: DynamoTokenFetch,
    merchantId: string,
    processor: DynamoProcessorFetch,
    whiteList?: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() => this._getIsMerchantTest(merchantId)),
      switchMap((isTestMerchant: boolean) =>
        !isTestMerchant
          ? this._gateway.chargesTransaction(
              body,
              mid,
              trxReference,
              plccFlag,
              tokenInfo,
              processor,
              whiteList
            )
          : this._sandbox.chargesTransaction(
              body,
              mid,
              trxReference,
              plccFlag,
              tokenInfo
            )
      ),
      tag("CardService | _executeChargeTransaction")
    );
  }

  private _executeVoidTransaction(
    response: [
      Transaction,
      DynamoProcessorFetch | undefined,
      DynamoMerchantFetch | undefined
    ],
    transactionId: string,
    authorizerContext: AuthorizerContext,
    partialRefund: partialTransactionRefund
  ): Observable<object> {
    return this._lambda.invokeFunction(`${process.env.ASYNC_VOID_LAMBDA}`, {
      body: {
        ...this._buildVoidRequest(response[0]),
        contactPerson: get(response[2], "contactPerson", ""),
        email: get(response[2], "email", ""),
        forceRefund: partialRefund.status,
        id: transactionId,
        isSandboxTransaction:
          get(response, "[2].sandboxEnable", false) &&
          process.env.USRV_STAGE !== this.prodEnv,
        kushkiMetadata: authorizerContext.kushkiMetadata,
        nit: get(response[2], "nit", ""),
        privateMerchantId: get(response[2], "private_id", ""),
        privateProcessorId: get(response[1], "private_id", ""),
        processorMerchantId: get(response[1], "processor_merchant_id", ""),
        requestAmount: partialRefund.requestAmount,
        saleApprovalCode: response[0].approval_code,
        saleCreated: response[0].created,
        terminalId: get(response[1], "terminal_id", ""),
        transactionReference: transactionId,
        uniqueCode: get(response[1], "unique_code", ""),
        voidWebhookUrl: get(response[2], "voidWebhookUrl", []),
      },
    });
  }

  private _checkPartialRefund(
    event: IAPIGatewayEvent<
      VoidBody,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >,
    transaction: Transaction
  ): Observable<partialTransactionRefund> {
    return of(1).pipe(
      map(() => {
        const response: partialTransactionRefund = {
          amount: 0,
          requestAmount: 0,
          status: false,
        };
        const amount: object = defaultTo(get(event.body, "amount"), {});

        if (isEmpty(amount)) {
          response.requestAmount = get(transaction, "request_amount", 0);
          return response;
        }

        const transaction_amount: number =
          transaction.approved_transaction_amount;
        const amount_to_refund: number = this._fullAmount(<Amount>amount);

        response.requestAmount = amount_to_refund;
        const currency: string = defaultTo(
          get(amount, "currency"),
          CurrencyEnum.USD
        );
        let pending_amount: number = defaultTo(
          get(transaction, "pendingAmount"),
          -1
        );
        const compare_value: number =
          pending_amount === -1 ? transaction_amount : pending_amount;

        if (amount_to_refund === transaction_amount) return response;

        if (pending_amount === 0) throw new KushkiError(ERRORS.E023);

        if (amount_to_refund > compare_value || currency !== CurrencyEnum.COP)
          throw new KushkiError(ERRORS.E023);

        if (pending_amount === -1) pending_amount = 0;

        response.status = true;
        response.amount =
          pending_amount === 0
            ? transaction_amount - amount_to_refund
            : pending_amount - amount_to_refund;

        return response;
      }),
      tag("CardService | _checkPartialRefund")
    );
  }
}
