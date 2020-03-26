/**
 * Aurus Gateway File
 */
import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  ILogger,
  KushkiError,
} from "@kushki/core";
import * as AWSXRay from "aws-xray-sdk";
import * as http from "http";
import * as https from "https";

AWSXRay.captureHTTPsGlobal(http, false);
AWSXRay.captureHTTPsGlobal(https, false);
import * as pid from "@kushki/pidcrypt";
import "@kushki/pidcrypt/asn1";
import "@kushki/pidcrypt/rsa";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { AurusChargeRequestEnum } from "infrastructure/AurusChargeRequestEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { MethodsEnum } from "infrastructure/MethodsEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { TAXES } from "infrastructure/TaxEnum";
import { inject, injectable } from "inversify";
import { defaultTo, filter, get, isEmpty, merge, sum } from "lodash";
import * as moment from "moment";
import * as nano from "nano-seconds";
import "reflect-metadata";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { OptionsWithUri } from "request";
import * as rp from "request-promise";
import { StatusCodeError } from "request-promise/errors";
import * as Rollbar from "rollbar";
import { iif, Observable, Observer, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, switchMap } from "rxjs/operators";
import { Amount } from "types/amount";
import { AurusAmount } from "types/aurus_amount";
import { AurusCaptureRequest } from "types/aurus_capture_request";
import { AurusChargesRequest } from "types/aurus_charges_request";
import { AurusErrorResponse } from "types/aurus_error";
import { AurusPreAuthRequest } from "types/aurus_preauth_request";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensRequest } from "types/aurus_tokens_request";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { AurusVoidRequest } from "types/aurus_void_request";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest, Currency } from "types/charges_card_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { TokenRequest } from "types/remote/token_request";
import { CardToken, TokensCardRequest } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { VoidCardRequest } from "types/void_card_request";

/**
 * Aurus Gateway Implementation
 */

@injectable()
export class AurusGateway implements ICardGateway {
  private readonly _rsa: pid;
  private readonly _logger: ILogger;
  private readonly _storage: IDynamoGateway;
  private readonly _rollbar: Rollbar;
  private readonly _lambda: ILambdaGateway;
  private readonly _processEmail: string = "dev@kushkipagos.com";

  constructor(
    @inject(CORE.Logger) logger: ILogger,
    @inject(IDENTIFIERS.DynamoGateway) storage: IDynamoGateway,
    @inject(CORE.RollbarInstance) rollbar: Rollbar,
    @inject(CORE.LambdaGateway) lambda: ILambdaGateway
  ) {
    this._storage = storage;
    this._logger = logger;
    this._rollbar = rollbar;
    this._lambda = lambda;
    const public_key: string =
      "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC81t5iu5C0JxYq5/XNPiD5ol3Zw8rw3LtFI" +
      "Um7y3m8o8wv5qVnzGh6XwQ8LWypdkbBDKWZZrAUd3lybZOP7/82Nb1/noYj8ixVRdbnYtbsSA" +
      "bu9PxjB7a/7LCGKsugLkou74PJDadQweM88kzQOx/kzAyVbS9gCCVUguHcq2vRRQIDAQAB";
    const key: string = Buffer.from(public_key, "base64").toString("binary");

    this._rsa = new pid.RSA();
    const asn: pid = pid.ASN1.decode(AurusGateway._toByteArray(key));
    const tree: string = asn.toHexTree();

    this._rsa.setPublicKeyFromASN(tree);
  }

  private static _aurusError(data: object): data is AurusErrorResponse {
    return data.hasOwnProperty("response_code");
  }

  private static _toByteArray(str: string): number[] {
    const byte_array: number[] = [];
    let index: number = 0;

    while (index < str.length) {
      byte_array.push(str.charCodeAt(index));
      index = index + 1;
    }

    return byte_array;
  }

  private static _convertFromHex(str: string): string {
    let s: string = "";
    let i: number = 0;

    while (i < str.length) {
      s += String.fromCharCode(parseInt(str.substring(i, i + 2), 16));
      i += 2;
    }

    return s;
  }

  public buildAurusAmount(
    data:
      | Required<VoidCardRequest>
      | ChargesCardRequest
      | Required<CaptureCardRequest>,
    processorID: string,
    tokenAmount?: number
  ): Observable<AurusAmount> {
    return new Observable((observer: Observer<Amount>) => {
      try {
        const amount: Amount = data.amount;
        const currency: string = defaultTo(amount.currency, "USD");
        const processor_array: string[] = `${process.env.CLARO_EC_PROCESSOR}`.split(
          ","
        );

        if (processor_array.includes(processorID) && tokenAmount) {
          const amended_amount: Amount = this._getClaroAmendedAmount(
            amount,
            tokenAmount
          );

          observer.next(amended_amount);

          return;
        }

        if (amount.iva !== 0 || amount.subtotalIva === 0) {
          observer.next(amount);

          return;
        }
        if (
          process.env.IVA_EC === undefined ||
          process.env.IVA_CO === undefined ||
          process.env.IVA_PE === undefined
        ) {
          observer.error(new Error("IVA parameters are not set review SSM"));

          return;
        }

        let iva: number = parseFloat(process.env.IVA_EC);

        if (currency === "COP") iva = parseFloat(process.env.IVA_CO);
        if (currency === "PEN") iva = parseFloat(process.env.IVA_PE);
        const total: number = amount.subtotalIva;

        amount.subtotalIva = parseFloat((total / (iva + 1)).toFixed(2));
        amount.iva = parseFloat((total - amount.subtotalIva).toFixed(2));

        observer.next(amount);
      } finally {
        observer.complete();
      }
    }).pipe(
      map((amountKushki: Amount) => ({
        ICE: defaultTo(amountKushki.ice, 0).toFixed(2),
        IVA: amountKushki.iva.toFixed(2),
        Subtotal_IVA: amountKushki.subtotalIva.toFixed(2),
        Subtotal_IVA0: amountKushki.subtotalIva0.toFixed(2),
        Total_amount: sum(
          filter(
            [...Object.values(amountKushki)],
            (v: string | number) => typeof v === "number"
          )
        ).toFixed(2),
      })),
      map((aurusAmount: AurusAmount) => {
        const extra_taxes: object | undefined = data.amount.extraTaxes;

        if (extra_taxes === undefined) return aurusAmount;
        aurusAmount.Total_amount = (
          Number(aurusAmount.Total_amount) +
          sum([...Object.values(extra_taxes)])
        ).toFixed(2);
        aurusAmount.tax = Object.keys(extra_taxes).map((tax: string) => ({
          taxAmount: extra_taxes[tax].toFixed(2),
          taxId: TAXES[tax].id,
          taxName: TAXES[tax].code,
        }));

        return aurusAmount;
      }),
      tag("Aurus Gateway | _buildAurusAmount")
    );
  }

  public request<T = object>(
    body: object,
    method: string,
    headers: object,
    decryptedBody?: object
  ): Observable<T> {
    return of(1).pipe(
      switchMap(() => {
        const options: OptionsWithUri = {
          body,
          headers,
          json: true,
          uri: `${process.env.AURUS_URL}/${method}`,
        };

        return rp.post(options);
      }),
      catchError((err: StatusCodeError) => {
        if (
          err.name === "StatusCodeError" &&
          AurusGateway._aurusError(err.error)
        ) {
          if (err.error.response_code === "1032") return of({});

          if (
            (err.error.transaction_id === undefined ||
              err.error.transaction_id === null ||
              err.error.transaction_id.length === 0) &&
            err.error.response_code === "211"
          ) {
            this._rollbar.warn(err.message);

            return throwError(
              new AurusError(
                err.error.response_code,
                err.error.response_text,
                err.error.transaction_details
              )
            );
          }

          return iif(
            () =>
              method === MethodsEnum.DEFERRED || method === MethodsEnum.CHARGE,
            this._storage.put(
              {
                transactionId:
                  err.error.transaction_id !== ""
                    ? err.error.transaction_id
                    : nano
                        .now()
                        .toString()
                        .replace(",", ""),
                ...decryptedBody,
                expirationTime: Number(
                  (new Date().getTime() + 86400000).toString().slice(0, 10)
                ),
              },
              TABLES.charges
            ),
            of(true)
          ).pipe(
            switchMap(() =>
              throwError(
                new AurusError(
                  err.error.response_code,
                  err.error.response_text,
                  err.error.transaction_details
                )
              )
            )
          );
        }

        return throwError(err);
      }),
      tag("AurusGateway | request")
    );
  }

  public tokensTransaction(
    body: CardToken,
    mid: string,
    tokenType: string,
    processorName: string,
    transactionReference: string
  ): Observable<TokensCardResponse> {
    return AurusGateway._buildTokensRequest(body, mid, tokenType).pipe(
      map((request: AurusTokensRequest) => {
        this._logger.info(
          `Aurus Encryption Decrypted: ${AurusGateway._clearSensitiveData(
            JSON.stringify(request)
          )}`
        );

        return this._encrypt(request);
      }),
      switchMap((encrypted: object) =>
        this.request<AurusTokensResponse>(encrypted, MethodsEnum.TOKENS, {})
      ),
      switchMap((response: AurusTokensResponse) => {
        if (
          processorName === ProcessorEnum.TRANSBANK &&
          (body.currency === "CLP" || body.currency === "UF")
        )
          return this._transbankToken(
            body,
            mid,
            transactionReference,
            response.transaction_token,
            body.currency
          );

        return of({
          token: response.transaction_token,
        });
      }),
      tag("Aurus Gateway | tokensTransaction")
    );
  }

  public preAuthorization(
    body: ChargesCardRequest,
    mid: string,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string
  ): Observable<AurusResponse> {
    return of(1).pipe(
      switchMap(() =>
        this._buildPreAuthRequest(body, mid, tokenInfo, transactionReference)
      ),
      map((request: AurusPreAuthRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(encrypted, MethodsEnum.PREAUTH, {}, body)
      ),
      tag("Aurus Gateway | preAuthorization")
    );
  }

  public chargesTransaction(
    body: ChargesCardRequest,
    mid: string,
    trxReference: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch,
    processor: DynamoProcessorFetch,
    whiteList: string
  ): Observable<AurusResponse> {
    const method: string =
      (body.months !== undefined && body.months > 0) ||
      body.deferred !== undefined
        ? MethodsEnum.DEFERRED
        : MethodsEnum.CHARGE;

    return this._buildChargeParams(
      body,
      mid,
      trxReference,
      plcc,
      tokenInfo,
      processor,
      whiteList
    ).pipe(
      map((request: AurusChargesRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(encrypted, method, {}, body)
      ),
      tag("Aurus Gateway | chargesTransaction")
    );
  }

  public captureTransaction(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusResponse> {
    return this._buildCaptureParams(body, transaction, merchantId).pipe(
      map((request: AurusCaptureRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(encrypted, MethodsEnum.CAPTURE, {}, body)
      ),
      tag("Aurus Gateway | captureTransaction")
    );
  }

  public voidTransaction(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string
  ): Observable<AurusResponse> {
    return this._buildChargeDeleteRequest(data, ticket, mid, trxReference).pipe(
      map((request: AurusVoidRequest) => this._encrypt(request)),
      switchMap((encrypted: object) =>
        this.request<AurusResponse>(encrypted, MethodsEnum.VOID, {})
      ),
      tag("AurusGateway | voidTransaction")
    );
  }

  private static _buildTokensRequest(
    body: TokensCardRequest,
    mid: string,
    tokenType: string
  ): Observable<AurusTokensRequest> {
    let deferred: string = "0";
    let currency: string = "USD";

    if (body.isDeferred !== undefined) deferred = "1";
    if (body.currency !== undefined) currency = body.currency;
    if (
      body.card.expiryMonth.length === 1 &&
      parseInt(body.card.expiryMonth, 36) < 10 &&
      parseInt(body.card.expiryMonth, 36) > 0
    )
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

  private _getClaroAmendedAmount(amount: Amount, tokenAmount: number): Amount {
    const total_amount: number = parseFloat(tokenAmount.toFixed(2));

    const sub_first_calc: number = parseFloat(
      (total_amount / 1.232).toFixed(2)
    );
    const sub_second_calc: number = parseFloat(
      ((total_amount / 1.12) * 0.12).toFixed(2)
    );
    const subtotal_iva_amended: number = parseFloat(
      ((sub_first_calc + sub_second_calc) / 1.12).toFixed(2)
    );
    let ice_amended: number = parseFloat(
      ((total_amount / 1.232) * 0.1).toFixed(2)
    );
    const iva_amended: number = parseFloat(
      (subtotal_iva_amended * 0.12).toFixed(2)
    );
    const sum_total: number = parseFloat(
      sum([subtotal_iva_amended, ice_amended, iva_amended]).toFixed(2)
    );

    // istanbul ignore next
    if (total_amount !== sum_total) {
      const difference: number = parseFloat(
        (total_amount - sum_total).toFixed(2)
      );

      ice_amended = ice_amended + difference;
    }

    return {
      ...amount,
      ice: ice_amended,
      iva: iva_amended,
      subtotalIva: subtotal_iva_amended,
    };
  }

  private _buildChargeParams(
    body: ChargesCardRequest,
    mid: string,
    trxId: string,
    plcc: string,
    tokenInfo: DynamoTokenFetch,
    processor: DynamoProcessorFetch,
    whiteList?: string
  ): Observable<AurusChargesRequest> {
    let currency: Currency = CurrencyEnum.USD;

    if (body.amount.currency !== undefined) currency = body.amount.currency;

    return this.buildAurusAmount(body, mid, tokenInfo.amount).pipe(
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

          aurus_charge_request.fingerprint = trxId;
          aurus_charge_request.email = this._processEmail;
          aurus_charge_request.name = get(charges_names, "name", "NA");
          aurus_charge_request.lastName = get(charges_names, "lastName", "NA");
        }
        const brand: string = get(tokenInfo.binInfo, "brand", "").toLowerCase();

        if (
          !isEmpty(processor.processor_code) &&
          processor.processor_name === ProcessorEnum.VISANET
        )
          aurus_charge_request.processor_code = processor.processor_code;

        if (
          (brand === "amex" || brand === "american express") &&
          processor.processor_name === ProcessorEnum.BILLPOCKET
        )
          merge(aurus_charge_request, this._buildAmexProperties(body));

        if (body.metadata !== undefined)
          aurus_charge_request.metadata = body.metadata;

        if (
          get(body, "metadata.ksh_subscriptionValidation", false) ||
          whiteList === "1"
        )
          aurus_charge_request.security_validation = 0;

        AurusGateway._setDeferred(currency, body, aurus_charge_request);

        return aurus_charge_request;
      })
    );
  }

  private _buildAmexProperties(body: ChargesCardRequest): object {
    return {
      amexCallTypId: "61",
      amexCustAddress: "default",
      amexCustBrowserTypDescTxt: "CryoWeb",
      amexCustEmailAddr: get(body, "contactDetails.email", "default@gmail.com"),
      amexCustFirstName: get(body, "contactDetails.firstName", "default"),
      amexCustHostServerNm: "www.criol.com.mx",
      amexCustIdPhoneNbr: get(body, "contactDetails.phoneNumber", "00000000"),
      amexCustIPAddr: "192.168.0.1",
      amexCustLastName: get(body, "contactDetails.lastName", "default"),
      amexCustPostalCode: "123",
      amexMerSKUNbr: "CARGO",
      amexShipMthdCd: "01",
      amexShipToCtryCd: "484",
      customer_info: {
        address: "ABC, West",
        browser_type: "Chrome",
        call_type_id: "61",
        host_server: "Testing",
        ip_address: "127.0.0.0",
        mer_sku_number: "CARGO",
        phone_number: "1234567890",
        postal_code: "14495",
        ship_method_code: "02",
        ship_to_country_code: "484",
      },
      email: get(body, "contactDetails.email", "kushkitest@gmail.com"),
      language_indicator: "es",
      lastName: get(body, "contactDetails.lastName", "default"),
      name: get(body, "contactDetails.firstName", "default"),
    };
  }

  private _buildCaptureParams(
    body: CaptureCardRequest,
    transaction: Transaction,
    merchantId: string
  ): Observable<AurusCaptureRequest> {
    let currency: Currency = <Currency>transaction.currency_code;

    if (body.amount !== undefined && body.amount.currency !== undefined)
      currency = body.amount.currency;

    currency = <Currency>transaction.currency_code;

    return iif(
      () => body.amount !== undefined,
      this.buildAurusAmount(
        <Required<CaptureCardRequest>>body,
        transaction.processor_id
      ),
      of(undefined)
    ).pipe(
      map((amount: AurusAmount | undefined) => ({
        currency_code: currency,
        language_indicator: "es",
        merchant_identifier: merchantId,
        metadata: body.metadata,
        ticket_number: body.ticketNumber,
        transaction_amount:
          amount === undefined
            ? {
                ICE:
                  transaction.ice_value !== undefined
                    ? transaction.ice_value.toFixed(2).toString()
                    : "0.00",
                IVA: transaction.iva_value.toString(),
                Subtotal_IVA: transaction.subtotal_iva.toString(),
                Subtotal_IVA0: transaction.subtotal_iva0.toFixed(2).toString(),
                Total_amount: transaction.approved_transaction_amount
                  .toFixed(2)
                  .toString(),
              }
            : amount,
        transaction_reference: transaction.transaction_reference,
      }))
    );
  }

  private _buildPreAuthRequest(
    body: ChargesCardRequest,
    mid: string,
    tokenInfo: DynamoTokenFetch,
    transactionReference: string
  ): Observable<AurusPreAuthRequest> {
    let currency: Currency = "USD";
    const names: object = this._getdetailNames(tokenInfo.cardHolderName);

    if (body.amount.currency !== undefined) currency = body.amount.currency;

    return this.buildAurusAmount(body, mid, tokenInfo.amount).pipe(
      map((amount: AurusAmount) => ({
        currency_code: currency,
        email: this._processEmail,
        fingerprint: moment().format("x"),
        language_indicator: "es",
        lastName: get(names, "lastName", "NA"),
        merchant_identifier: mid,
        name: get(names, "name", "NA"),
        transaction_amount: amount,
        transaction_reference: transactionReference,
        transaction_token: body.token,
      }))
    );
  }

  private static _setDeferred(
    currency: string,
    body: ChargesCardRequest,
    aurusChargeRequest: AurusChargesRequest
  ): void {
    if (body.months !== undefined) aurusChargeRequest.months = body.months;
    if (currency === "COP") return;
    if (body.deferred === undefined) return;
    if (body.deferred.creditType.length > 2)
      body.deferred.creditType = body.deferred.creditType.slice(1);
    aurusChargeRequest[AurusChargeRequestEnum.MONTHS_OF_GRACE] =
      body.deferred.graceMonths;
    aurusChargeRequest[AurusChargeRequestEnum.TYPE_OF_CREDIT] =
      body.deferred.creditType;
    aurusChargeRequest.months = body.deferred.months;
  }

  private _buildChargeDeleteRequest(
    data: VoidCardRequest | null | undefined,
    ticket: string,
    mid: string,
    trxReference: string
  ): Observable<AurusVoidRequest> {
    return iif(
      () => data !== null && data !== undefined && data.amount !== undefined,
      this.buildAurusAmount(<Required<VoidCardRequest>>data, mid, 0),
      of(null)
    ).pipe(
      map((amount: AurusAmount | null) => {
        const request: AurusVoidRequest = {
          language_indicator: "es",
          merchant_identifier: mid,
          ticket_number: ticket,
          transaction_reference: trxReference,
        };

        if (
          amount !== null &&
          data !== undefined &&
          "Total_amount" in amount &&
          data !== null &&
          data.amount !== undefined
        ) {
          request.transaction_amount = amount;
          request.currency_code = defaultTo(data.amount.currency, "USD");
        }

        return request;
      }),
      tag("Aurus Gateway | _buildChargeDeleteRequest")
    );
  }

  private _encrypt(params: object): object {
    let crypted_string: string = "";

    this._logger.info("Aurus Encryption Clean:", { params });
    const chunks: string[] | null = JSON.stringify(params).match(
      /[\s\S]{1,117}/g
    );

    if (chunks === null) throw new KushkiError(ERRORS.E001);

    for (const chunk of chunks) {
      const crypted: string = this._rsa.encryptRaw(chunk);
      const hex: string = AurusGateway._convertFromHex(crypted);
      let buffer: Buffer;

      buffer = Buffer.from(hex.toString(), "binary");
      const base64: string = buffer.toString("base64");

      crypted_string += `${base64}<FS>`;
    }
    this._logger.info(`Aurus Encryption Encrypted: ${crypted_string}`);

    return { request: crypted_string };
  }

  private _transbankToken(
    event: CardToken,
    processorId: string,
    referenceNumber: string,
    token: string,
    currency: TokenRequest["currency"]
  ): Observable<TokensCardResponse> {
    return this._lambda
      .invokeFunction<{ token: string; shareAmount?: number }, TokenRequest>(
        `${process.env.TRANSBANK_TOKEN_LAMBDA}`,
        {
          currency,
          processorId,
          referenceNumber,
          cardNumber: event.card.number,
          cvv: defaultTo(event.card.cvv, undefined),
          monthExpiration: event.card.expiryMonth,
          shareNumber: event.months,
          totalAmount: event.totalAmount,
          yearExpiration: event.card.expiryYear,
        }
      )
      .pipe(
        map((response: { token: string; shareAmount?: number }) => ({
          token,
          settlement: response.shareAmount,
        }))
      );
  }

  // TODO fix flacky test that avoid line 460
  // istanbul ignore next
  private static _clearSensitiveData(data: string): string {
    return data
      .replace(
        /"number": ?"[0-9]{14,19}"/g,
        (match: string) => `${match.slice(0, 16)}XXXXXX${match.slice(-5)}`
      )
      .replace(/"cvv": ?"[0-9]{3,4}"/g, () => `"cvv":"XXX"`);
  }

  private _getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    const names: string[] = fullName.split(" ");
    const names_length: number = names.length;

    switch (names_length) {
      case 1:
        return {
          name: names[0],
        };
      case 2:
        return {
          lastName: names[1],
          name: names[0],
        };
      default:
        return {
          lastName: names[2],
          name: names[0],
        };
    }
  }
}
