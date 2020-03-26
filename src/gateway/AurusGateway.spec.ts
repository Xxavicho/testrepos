/**
 * AurusGateway Unit Tests
 */
import {
  AurusError,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import * as http from "http";
import { CONTAINER } from "infrastructure/Container";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import * as lodash from "lodash";
import * as net from "net";
import { parseFullName } from "parse-full-name";
import { ICardGateway } from "repository/ICardGateway";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { RequestCallback, UriOptions, UrlOptions } from "request";
import * as rp from "request-promise";
import { StatusCodeError } from "request-promise/errors";
import * as Rollbar from "rollbar";
import { of } from "rxjs";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";

use(sinonChai);
const TOKEN: string = "token";
const MID: string = "1291219939131";
const TRX_REF = "1234-455559-tutu6";
let gCaptureRequest: CaptureCardRequest;
let gChargesAurusResponse: AurusResponse;
let gChargesRequest: ChargesCardRequest;
let gTokensRequest: CardToken;
let gTokensAurusResponse: AurusTokensResponse;
let gToken: DynamoTokenFetch;
let gAurusResponse: AurusResponse;
let gTransaction: Transaction;
const PROCESSORFETCH: DynamoProcessorFetch = {
  merchant_id: "12345",
  private_id: "123331",
  processor_name: "Credimatic Processor",
  processor_type: "traditional",
  public_id: "23444",
  terminal_id: "K69",
};

async function createSchemas(): Promise<void> {
  gTokensRequest = Mock.of<CardToken>({
    card: {
      expiryMonth: "asdas",
      expiryYear: "xzvzc",
      name: "czxcz",
      number: "cxvxcv",
    },
    totalAmount: 333,
  });
  gTokensAurusResponse = Mock.of<AurusTokensResponse>({
    response_code: "bxcvxvx",
    response_text: "rtwerwe",
    transaction_token: "qwertyuiopasdfghjklzxcvbnmqwe456",
    transaction_token_validity: "cxvxv",
  });
  gCaptureRequest = Mock.of<CaptureCardRequest>({
    ticketNumber: "eadadas",
  });
  gChargesAurusResponse = Mock.of<AurusResponse>({
    approved_amount: "czxczx",
    recap: "sadads",
    response_code: "asdcxva",
    response_text: "sadbcvbs",
    ticket_number: "asasdass",
    transaction_details: {
      approvalCode: "q2eqeq",
      binCard: "bxbcv",
      cardHolderName: "sxzczc",
      cardType: "asgdfgs",
      isDeferred: "mvmbvcb",
      lastFourDigitsOfCard: "2432423",
      merchantName: "tryryt",
      processorBankName: "yryrty",
      processorName: "nvnvb",
    },
    transaction_id: "vxcvx",
    transaction_reference: "gfjgh",
  });
  gChargesRequest = Mock.of<ChargesCardRequest>({
    amount: {
      iva: 342423,
      subtotalIva: 42432,
      subtotalIva0: 4234,
    },
    token: "asdad",
  });
  gAurusResponse = gChargesAurusResponse;
  gToken = Mock.of<DynamoTokenFetch>({
    amount: 4444,
    bin: "123132",
    created: 2131312,
    currency: "USD",
    id: "sadasd",
    ip: "ip",
    lastFourDigits: "4344",
    maskedCardNumber: "23424werwe",
    merchantId: "dasdasd",
    transactionReference: "reasa",
  });
  gTransaction = Mock.of<Transaction>({
    approval_code: "21321",
    approved_transaction_amount: 344,
    bin_card: "333333",
    card_holder_name: "name",
    created: 123242342,
    currency_code: "COP",
    iva_value: 5,
    last_four_digits: "1234",
    merchant_id: "mid",
    merchant_name: "asfsf",
    payment_brand: "visa",
    processor_bank_name: "gdgfd",
    processor_id: "id",
    processor_name: "zxvzv",
    recap: "adas",
    request_amount: 344,
    subtotal_iva: 5,
    subtotal_iva0: 2,
    sync_mode: "api",
    ticket_number: "11111",
    transaction_id: "2333333",
    transaction_status: "status",
    transaction_type: "type",
  });
}

function setBeforeEach(): {
  box: SinonSandbox;
  rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
  gateway: ICardGateway;
} {
  const box: SinonSandbox = createSandbox();
  const rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]> = box.stub(
    rp,
    "post"
  );

  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<Rollbar>({
      warn: box.stub(),
    })
  );

  const gateway: ICardGateway = CONTAINER.get(IDENTIFIERS.CardGateway);

  process.env.AURUS_URL = "https://aurusinc.com";

  return { box, rps, gateway };
}

type SinonSpySum = SinonSpy<[ArrayLike<number> | null | undefined]>;

function noDataVoidSuccess(
  gateway: ICardGateway,
  spyNext: SinonSpy,
  done: Mocha.Done,
  spyLodashSum: SinonSpySum
): void {
  gateway
    .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
    .subscribe({
      complete: (): void => {
        expect(spyLodashSum).to.not.be.called;
        expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
        done();
      },
      error: done,
      next: spyNext,
    });
}
function successVoidWithAmountAndExtraTaxes(
  gateway: ICardGateway,
  amount: Amount,
  spyNext: SinonSpy,
  done: Mocha.Done,
  spyLodashSum: SinonSpySum
): void {
  gateway
    .voidTransaction(
      {
        amount,
      },
      "1234567890",
      "95678343356756",
      TRX_REF
    )
    .subscribe({
      complete: (): void => {
        expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
        expect(spyLodashSum).to.be.calledTwice.and.calledWithExactly([
          (<Required<Amount>>amount).extraTaxes.agenciaDeViaje,
          (<Required<Amount>>amount).extraTaxes.tasaAeroportuaria,
        ]);
        done();
      },
      error: done,
      next: spyNext,
    });
}
function requestTokensSuccess(gateway: ICardGateway, done: Mocha.Done): void {
  gateway
    .tokensTransaction(gTokensRequest, "10000", "any", "lorem", "qwerty")
    .subscribe({
      next: (data: TokensCardResponse): void => {
        expect(data).to.be.a("object");
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(data[TOKEN]).to.have.lengthOf(32);
        done();
      },
    });
}
function chargesSuccess(
  gateway: ICardGateway,
  done: Mocha.Done,
  trxReference: string,
  tokenInfo: DynamoTokenFetch
): void {
  gateway
    .chargesTransaction(
      gChargesRequest,
      MID,
      trxReference,
      "",
      tokenInfo,
      PROCESSORFETCH
    )
    .subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.be.a("object");
        expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
        done();
      },
    });
}
function getAmount(): Amount {
  return {
    currency: "USD",
    iva: 12,
    subtotalIva: 100,
    subtotalIva0: 0,
  };
}
function calculateIva(gCharges: ChargesCardRequest): string {
  gCharges.amount.currency = "USD";
  gCharges.amount.subtotalIva0 = 0;
  gCharges.amount.iva = 0;
  gCharges.amount.ice = 0;
  gCharges.amount.subtotalIva = 150;

  return (
    gCharges.amount.subtotalIva -
    gCharges.amount.subtotalIva / 1.12
  ).toFixed(2);
}
describe("Aurus Gateway - Void", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;

  function prepareTest(): {
    spy_next: SinonSpy;
    spy_lodash_sum: SinonSpySum;
  } {
    rps.returns(Promise.resolve<AurusResponse>(gAurusResponse));
    const spy_next: SinonSpy = box.spy();
    const spy_lodash_sum: SinonSpy<[
      ArrayLike<number> | null | undefined
    ]> = box.spy(lodash, "sum");

    return { spy_next, spy_lodash_sum };
  }
  function testWithAmount(
    amount: Amount,
    spyNext: SinonSpy,
    done: Mocha.Done,
    spyLodashSum: SinonSpySum,
    trxReference: string
  ): void {
    gateway
      .voidTransaction(
        {
          amount,
        },
        "1234567890",
        "95678343356756",
        trxReference
      )
      .subscribe({
        complete: (): void => {
          expect(spyNext).to.be.calledOnce.and.calledWith(gAurusResponse);
          expect(spyLodashSum).to.be.calledOnce.and.calledWithExactly([
            amount.iva,
            amount.subtotalIva,
            amount.subtotalIva0,
          ]);
          done();
        },
        error: done,
        next: spyNext,
      });
  }
  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    await createSchemas();
    box = createSandbox();
    rps = box.stub(rp, "post");

    CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
      Mock.of<Rollbar>({
        warn: box.stub(),
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    process.env.AURUS_URL = "https://aurusinc.com";
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("test success void with null or undefined data", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();

    noDataVoidSuccess(gateway, spy_next, done, spy_lodash_sum);
  });
  it("test success void with amount", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = getAmount();

    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
  it("test success void with amount and transaction reference", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = getAmount();

    testWithAmount(amount, spy_next, done, spy_lodash_sum, "132424");
  });
  it("test success void with amount and extraTaxes", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      ...getAmount(),
      extraTaxes: {
        agenciaDeViaje: 200,
        tasaAeroportuaria: 300,
      },
    };

    successVoidWithAmountAndExtraTaxes(
      gateway,
      amount,
      spy_next,
      done,
      spy_lodash_sum
    );
  });
  it("test success void with amount without iva COP", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      currency: "COP",
      iva: 0,
      subtotalIva: 3000,
      subtotalIva0: 0,
    };

    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
  it("test success void with amount without iva USD", (done: Mocha.Done) => {
    const { spy_next, spy_lodash_sum } = prepareTest();
    const amount: Amount = {
      iva: 0,
      subtotalIva: 112,
      subtotalIva0: 0,
    };

    testWithAmount(amount, spy_next, done, spy_lodash_sum, TRX_REF);
  });
});
describe("Aurus Gateway - Token , Charge , PreAuthorization ", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;

  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
    await createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
      gateway: ICardGateway;
    } = setBeforeEach();

    gToken.cardHolderName = "Pepe Toro";
    box = ret.box;
    rps = ret.rps;
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test charge request without iva in amount - USD request success", (done: Mocha.Done) => {
    const calculated_iva: string = calculateIva(gChargesRequest);

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(gChargesRequest.amount.iva).to.be.eql(Number(calculated_iva));
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with CLARO EC CREDIMATIC merchant", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1234";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";
    const token: DynamoTokenFetch = { ...gToken };

    delete token.amount;
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        {
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        },
        "1234",
        TRX_REF,
        "0",
        token,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with CLARO EC CREDIMATIC merchant - with different token amount", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1234";
    process.env.CLARO_EC_PERCENTAGE = "10";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        {
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        },
        "1234",
        TRX_REF,
        "0",
        {
          ...gToken,
          amount: 19.78,
        },
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request with CLARO EC CREDIMATIC merchant - with more percentage", (done: Mocha.Done) => {
    process.env.CLARO_EC_PROCESSOR = "1111";
    process.env.CLARO_EC_PERCENTAGE = "1";
    process.env.CLARO_EC_CHANNEL = "APPMOVIL";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        {
          ...gChargesRequest,
          amount: {
            currency: "USD",
            ice: 2.15,
            iva: 2.02,
            subtotalIva: 16.61,
            subtotalIva0: 0,
          },
          metadata: {
            canal: "APPMOVIL",
          },
        },
        "1111",
        TRX_REF,
        "0",
        {
          ...gToken,
          amount: 18.78,
        },
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data).to.haveOwnProperty("ticket_number");
          done();
        },
      });
  });

  it("when chargesTransaction is called with credit type of datafast, it will response success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));
    lodash.set(gChargesRequest, "deferred.creditType", "002");

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("when chargesTransaction is called with credit type of billpocket and brand is amex, it will response success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));

    lodash.set(gToken, "binInfo", {
      bank: "string",
      bin: "string",
      brand: "Amex",
      processor: "string",
    });

    PROCESSORFETCH.processor_name = ProcessorEnum.BILLPOCKET;

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("when chargesTransaction is called with credit type of visanet with processor code, it will response success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));

    lodash.set(gToken, "binInfo", {
      bank: "string",
      bin: "string",
      brand: "Mastercard",
      processor: "string",
    });
    PROCESSORFETCH.processor_code = "00002";
    PROCESSORFETCH.processor_name = ProcessorEnum.VISANET;

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("should called chargesTransaction with whiteList param and it will response success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));
    lodash.set(gChargesRequest, "deferred.creditType", "002");
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH,
        "1"
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          done();
        },
      });
  });

  it("should called chargesTransaction and should return error", (done: Mocha.Done) => {
    const aurus_status_error: StatusCodeError = new StatusCodeError(
      402,
      { response_code: "11111", response_text: "Error", transaction_id: "" },
      { url: "" },
      new http.IncomingMessage(new net.Socket())
    );

    rps.throws(aurus_status_error);
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH,
        "1"
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.eql("Error");
          done();
        },
      });
  });

  it("should called chargesTransaction and should return error, AurusResponse with transactionId", (done: Mocha.Done) => {
    const aurus_status_error: StatusCodeError = new StatusCodeError(
      402,
      {
        response_code: "11211",
        response_text: "Error2",
        transaction_id: "123123",
      },
      { url: "" },
      new http.IncomingMessage(new net.Socket())
    );

    rps.throws(aurus_status_error);
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(of(true)),
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "0",
        gToken,
        PROCESSORFETCH,
        "1"
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.eql("Error2");
          done();
        },
      });
  });

  it("test preAuthorization request without currency - success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gToken.cardHolderName = "Pepe";

    if (gChargesRequest.amount) delete gChargesRequest.amount.currency;

    gateway.preAuthorization(gChargesRequest, MID, gToken, "refTrx").subscribe({
      next: (data: AurusResponse): void => {
        expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
        done();
      },
    });
  });

  it("test preAuthorization request with currency  - success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gChargesRequest.amount.currency = "USD";

    gateway
      .preAuthorization(gChargesRequest, MID, gToken, "trxReference")
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data.hasOwnProperty("transaction_id")).to.be.eql(true);
          done();
        },
      });
  });

  it("test charge request  without iva in amount - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe Toro";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request  without iva in amount  and transaction reference - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, "23424", gToken);
  });

  it("test charge request  without transaction reference - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.ice = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Juan Test Topo";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    lodash.set(gChargesRequest, "metadata.ksh_subscriptionValidation", true);
    delete gToken.cardHolderName;

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName complete name - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Indigo Merced Smith Doe";

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with metadata, ice and deferred - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = { metadata: "metadata" };
    gChargesRequest.months = 1;
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = 1.12;

    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 3 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "002",
      graceMonths: "01",
      months: 3,
    };
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 2 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "02",
      graceMonths: "01",
      months: 3,
    };
    gChargesRequest.amount.currency = "USD";
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec w/o metadata & w/o ice & w/o months - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = undefined;
    gChargesRequest.months = undefined;
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = undefined;
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request undefined currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = undefined;
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request with PEN currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = "PEN";
    gChargesRequest.amount.iva = 0;
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co w/o extraTaxes & w/o months & w/o metadata - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = undefined;
    gChargesRequest.metadata = undefined;
    gChargesRequest.months = undefined;
    gChargesRequest.amount.currency = "COP";
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co with extraTaxes & with months & with metadata - success", (done: Mocha.Done) => {
    const stringify_spy: SinonSpy<[
      string,
      ((string | number)[] | null | undefined)?,
      (string | number | undefined)?
    ]> = box.spy(JSON, "stringify");

    gChargesRequest.amount.extraTaxes = {
      agenciaDeViaje: 5,
      iac: 10,
      propina: 9,
      tasaAeroportuaria: 3,
    };
    gChargesRequest.metadata = { obj: { name: "name" } };
    gChargesRequest.months = 3;
    gChargesRequest.amount.currency = "COP";
    gChargesAurusResponse.transaction_reference = "2324";
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .chargesTransaction(
        gChargesRequest,
        MID,
        TRX_REF,
        "",
        gToken,
        PROCESSORFETCH
      )
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data).to.be.a("object");
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          expect(data.hasOwnProperty("transaction_reference")).to.be.eql(true);
          expect(stringify_spy).calledWithMatch(match.has("months", 3));
          expect(stringify_spy).calledWithMatch(
            match.has("metadata", gChargesRequest.metadata)
          );
          done();
        },
      });
  });
  it("test charge request co with extraTaxes empty object - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = {};
    gChargesRequest.amount.currency = "COP";
    rps.returns(Promise.resolve(gChargesAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test tokens request - success", (done: Mocha.Done) => {
    gTokensRequest.currency = undefined;
    gTokensRequest.isDeferred = true;
    gTokensRequest.card.cvv = "123";
    gTokensRequest.card.expiryMonth = "2";
    rps.returns(Promise.resolve(gTokensAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "ipsum"
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data[TOKEN]).to.have.lengthOf(32);
          expect(data).to.be.a("object");
          expect(data.hasOwnProperty("token")).to.be.eql(true);
          done();
        },
      });
  });
  it("test tokens request - fail E001", (done: Mocha.Done) => {
    box.stub(String.prototype, "match").returns(null);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "lorem"
      )
      .subscribe({
        error: (err: KushkiError): void => {
          expect(err.code).to.be.eq("K001");
          done();
        },
        next: (): void => {
          done("next should not be called.");
        },
      });
  });
  it("When request Token Transaction to Aurus and the response does not have transaction info - Error ", (done: Mocha.Done) => {
    const aurus_status_error: StatusCodeError = new StatusCodeError(
      402,
      { response_code: "211", response_text: "Solicitud no válida" },
      { url: "" },
      new http.IncomingMessage(new net.Socket())
    );

    rps.throws(aurus_status_error);
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "qwerty",
        "lorem"
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.getMessage()).to.be.eq("Solicitud no válida");
          expect(error.code).to.be.eq("211");
          done();
        },
        next: (): void => {
          done();
        },
      });
  });
  it("test tokens request - success without cvv and not transaction token type", (done: Mocha.Done) => {
    gTokensRequest.currency = "USD";
    delete gTokensRequest.card.cvv;
    gTokensRequest.isDeferred = undefined;
    gTokensRequest.card.expiryMonth = "11";
    rps.returns(Promise.resolve(gTokensAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    requestTokensSuccess(gateway, done);
  });
  it("test tokens request with Transbank as processor CLP - success", (done: Mocha.Done) => {
    const lambda: SinonStub = box.stub().returns(
      of({
        token: "ipsum",
      })
    );

    gTokensRequest.currency = "CLP";
    rps.returns(Promise.resolve(gTokensAurusResponse));
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor",
        "ipsum"
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data).to.be.a("object");
          expect(data).to.have.property("token");
          expect(lambda).to.be.calledOnce;
          done();
        },
      });
  });
  it("test tokens request with Transbank as processor UF - success", (done: Mocha.Done) => {
    gTokensRequest.currency = "UF";
    rps.returns(Promise.resolve(gTokensAurusResponse));
    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            token: "ipsum",
          })
        ),
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor",
        "ipsum"
      )
      .subscribe({
        next: (data: TokensCardResponse): void => {
          expect(data).to.have.property("token");
          done();
        },
      });
  });
});
describe("Aurus Gateway - capture", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;

  function validateCaptureRequest(data: AurusResponse, done: Mocha.Done): void {
    expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
    expect(data.ticket_number).to.be.eql(gAurusResponse.ticket_number);
    done();
  }

  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    await createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
      gateway: ICardGateway;
    } = setBeforeEach();

    box = ret.box;
    rps = ret.rps;
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test capture request without amount - success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    delete gTransaction.ice_value;

    gateway.captureTransaction(gCaptureRequest, gTransaction, MID).subscribe({
      next: (data: AurusResponse): void => validateCaptureRequest(data, done),
    });
  });

  it("test capture request without amount with ice in transactions - success", (done: Mocha.Done) => {
    gTransaction.ice_value = 0;
    if (gChargesRequest.amount) delete gCaptureRequest.amount;
    rps.returns(Promise.resolve(gAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);

    gateway.captureTransaction(gCaptureRequest, gTransaction, MID).subscribe({
      next: (data: AurusResponse): void => validateCaptureRequest(data, done),
    });
  });

  it("test capture request with amount - success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gAurusResponse));
    gateway = CONTAINER.get(IDENTIFIERS.CardGateway);
    gCaptureRequest.amount = {
      currency: "CLP",
      iva: 10,
      subtotalIva: 10,
      subtotalIva0: 10,
    };

    gateway.captureTransaction(gCaptureRequest, gTransaction, MID).subscribe({
      next: (data: AurusResponse): void => validateCaptureRequest(data, done),
    });
  });
});
describe("Aurus Gateway - error", () => {
  let gateway: ICardGateway;
  let box: SinonSandbox;
  let rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;

  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.IVA_CO = "0.19";
    process.env.IVA_EC = "0.12";
    await createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
      gateway: ICardGateway;
    } = setBeforeEach();

    box = ret.box;
    rps = ret.rps;
    gateway = ret.gateway;
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("test error no env tax", (done: Mocha.Done) => {
    delete process.env.IVA_EC;
    const amount: Amount = {
      iva: 0,
      subtotalIva: 112,
      subtotalIva0: 0,
    };

    gateway
      .voidTransaction({ amount }, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (err: Error): void => {
          expect(err.message).to.be.eq("IVA parameters are not set review SSM");
          done();
        },
        next: done,
      });
  });
  it("test error with AurusError", (done: Mocha.Done) => {
    const socket: net.Socket = new net.Socket();
    const http_message: http.IncomingMessage = new http.IncomingMessage(socket);

    rps.returns(
      Promise.reject(
        new StatusCodeError(
          400,
          {
            response_code: "1033",
            response_text: "Error de Aurus",
            transaction_id: "12344",
          },
          { url: "" },
          http_message
        )
      )
    );
    gateway
      .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.code).to.be.eq("1033");
          expect(error.getMessage()).to.be.eq("Error de Aurus");
          done();
        },
        next: done,
      });
  });
  it("test empty response with AurusError - success", (done: Mocha.Done) => {
    const socket: net.Socket = new net.Socket();
    const http_message: http.IncomingMessage = new http.IncomingMessage(socket);

    rps.returns(
      Promise.reject(
        new StatusCodeError(
          400,
          {
            response_code: "1032",
            response_text: "Error de suscripciones, significa respuesta vacia",
          },
          { url: "" },
          http_message
        )
      )
    );
    gateway.request({}, "method", {}).subscribe({
      next: (data: object): void => {
        expect(data).to.be.empty;
        done();
      },
    });
  });
  it("test error with unhandled Error", (done: Mocha.Done) => {
    const socket: net.Socket = new net.Socket();
    const http_message: http.IncomingMessage = new http.IncomingMessage(socket);

    rps.returns(
      Promise.reject(new StatusCodeError(500, {}, { url: "" }, http_message))
    );
    gateway
      .voidTransaction(undefined, "1234567890", "95678343356756", TRX_REF)
      .subscribe({
        error: (error: AurusError): void => {
          expect(error).to.not.eq(undefined, "not Aurus error");
          done();
        },
        next: done,
      });
  });
});
describe("Test fullName Splitter ", () => {
  function getdetailNames(fullName: string | undefined): object {
    if (fullName === undefined) return {};

    const details: object = parseFullName(String(fullName));

    const middlename: string[] = lodash.get(details, "middle", "").split(" ");

    if (middlename.length > 1) lodash.set(details, "last", middlename[1]);

    return {
      lastname: lodash.get(details, "last"),
      name: lodash.get(details, "first"),
    };
  }

  it("Test with name and lastname - success", () => {
    const fullname: string = "Test names";

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(fullname.split(" ")[0]);
  });

  it("Test with two name and two lastname - success", () => {
    const fullname: string = "Test Dos lastname1 lastname2";

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(fullname.split(" ")[0]);
    expect(lodash.get(result, "lastname")).to.equal(fullname.split(" ")[2]);
  });

  it("Test with undefined - success", () => {
    const result: object = getdetailNames(undefined);

    expect(lodash.get(result, "name")).to.equal(undefined);
    expect(lodash.get(result, "lastname")).to.equal(undefined);
  });

  it("Test with two name and one lastname - success", () => {
    const fullname: string = "Test Dos lastname1";
    const name_component = fullname.split(" ");

    const result: object = getdetailNames(fullname);

    expect(lodash.get(result, "name")).to.equal(name_component[0]);
    expect(lodash.get(result, "lastname")).to.equal(name_component[2]);
  });
});
