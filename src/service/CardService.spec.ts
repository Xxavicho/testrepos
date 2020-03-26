/**
 * CardService Unit test
 */
import {
  AurusError,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE,
  ILambdaGateway,
  IRequestContext,
  KushkiError,
} from "@kushki/core";
import { Context } from "aws-lambda";
import { expect, use } from "chai";
import * as chaiJsonSchema from "chai-json-schema";
import { IDENTIFIERS } from "constant/Identifiers";
import { SNSGateway } from "gateway/SNSGateway";
import { CONTAINER } from "infrastructure/Container";
import { CountryEnum } from "infrastructure/CountryEnum";
import { CurrencyEnum } from "infrastructure/CurrencyEnum";
import { DeferredNamesEnum } from "infrastructure/DeferredNameEnum";
import { ERRORS } from "infrastructure/ErrorEnum";
import { ProcessorEnum } from "infrastructure/ProcessorEnum";
import { get, set } from "lodash";
import { beforeEach } from "mocha";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { IBinInfoGateway } from "repository/IBinInfoGateway";
import { ICardGateway } from "repository/ICardGateway";
import { ICardService } from "repository/ICardService";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import { CardData, ITokenGateway } from "repository/ITokenGateway";
import { ITransactionService } from "repository/ITransactionService";
import { RequestCallback, UriOptions, UrlOptions } from "request";
import * as rp from "request-promise";
import * as Rollbar from "rollbar";
import { Observable, Observer, of, throwError } from "rxjs";
import { map, mapTo, switchMap } from "rxjs/operators";
import { CardService } from "service/CardService";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Amount } from "types/amount";
import { AurusResponse, TransactionDetails } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { BinInfo } from "types/bin_info";
import { BinInfoResponse } from "types/bin_info_response";
import { BinParameters } from "types/bin_parameters";
import { CaptureCardRequest } from "types/capture_card_request";
import { ChargesCardRequest } from "types/charges_card_request";
import { ChargesCardResponse } from "types/charges_card_response";
import {
  DeferredOption,
  DynamoMerchantFetch,
} from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { LambdaTransactionRuleResponse } from "types/lambda_transaction_rule_response";
import { IDeferredResponse } from "types/remote/deferred_response";
import { DynamoBinFetch } from "types/remote/dynamo_bin_fetch";
import { SandboxChargeResponse } from "types/sandbox_charge_response";
import { SiftScienceCreateOrderResponse } from "types/sift_science_create_order_response";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";
import { TokenDynamo } from "types/token_dynamo";
import {
  CardToken,
  TokensCardRequest,
  TokenToken,
} from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";
import { VoidCardRequest } from "types/void_card_request";

use(sinonChai);

use(chaiJsonSchema);
const TOKEN: string = "token";
const BAD_BINS: string = "444088,475395,422249";
const HEADER_NAME: string = "PRIVATE-MERCHANT-ID";
const UNREACHABLE: string = "this line must be unreachable";
const X_FORWARDED_FOR: string = "X-FORWARDED-FOR";
const COLOMBIAN_PROCESSORS: string[] = [
  "Redeban Processor",
  "Credibanco Processor",
];
const ECUADORIAN_PROCESSORS: string[] = [
  "Credimatic Processor",
  "Datafast Processor",
];
const BRAND: string = "World Elite";

let gTokensRequest: TokensCardRequest;
let gTokensResponse: TokensCardResponse;
let gChargesRequest: ChargesCardRequest;
let gChargesResponse: ChargesCardResponse;
let gCaptureRequest: CaptureCardRequest;
let gAurusResponse: AurusResponse;
let gMerchantFetch: DynamoMerchantFetch;
let gProcessorFetch: DynamoProcessorFetch;
let gBinFetch: DynamoBinFetch;
let gBinInfoResponse: BinInfoResponse;
let gSiftScienceCreateOrderResponse: SiftScienceCreateOrderResponse;
let gSiftScienceGetWorkflowsResponse: SiftScienceWorkflowsResponse;
let gTransaction: Transaction;
let gSiftScienceDecisionResponse: SiftScienceDecisionResponse;
const HEADER: string = "PUBLIC-MERCHANT-ID";
let gInvokeFunctionStub: SinonStub;
let gTokenDynamo: TokenDynamo;

function rollbarInstance(box: SinonSandbox): void {
  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<Rollbar>({
      critical: box.stub(),
      warn: box.stub(),
    })
  );
}

function chargesEvent(
  fullResponse: boolean = false
): IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext> {
  return Mock.of<
    IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
  >({
    body: { ...gChargesRequest, fullResponse },
    headers: { HEADER_NAME: "123455799754313" },
    requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
      authorizer: {
        merchantId: "123",
      },
    }),
  });
}

function chargesCardResponse(): Transaction {
  return {
    approval_code: "reprehenderit do minim",
    approved_amount: "cupidatat occaecat nulla",
    approved_transaction_amount: 123,
    bin_card: "2323",
    binCard: "occaecat eu exercitation",
    card_holder_name: "Duis officia",
    created: Number(new Date()),
    currency_code: "USD",
    isDeferred: "id tempor ipsum qui",
    issuing_bank: "Bco. Pichincha",
    iva_value: 1,
    last_four_digits: "do",
    merchant_id: "irure exercitation deserunt sed",
    merchant_name: "Excepteur",
    payment_brand: "aute",
    processor_bank_name: "Excepteur",
    processor_id: "Excepteur",
    processor_name: "Excepteur",
    recap: "12345",
    request_amount: 23,
    response_code: "263",
    response_text: "incididunt ipsum ullamco exercitation",
    subtotal_iva: 1,
    subtotal_iva0: 1,
    sync_mode: "api",
    ticket_number: "07874520255",
    transaction_id: "exercitation ",
    transaction_status: "00000",
    transaction_type: "exercitation ",
  };
}

function tokensEvent(): IAPIGatewayEvent<
  TokensCardRequest,
  null,
  null,
  AuthorizerContext
> {
  return Mock.of<
    IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
  >({
    body: gTokensRequest,
    headers: { [HEADER]: "98765432134", [X_FORWARDED_FOR]: "1.1.1.1, 2.2.2.2" },
    requestContext: {
      authorizer: {
        merchantId: "123455799754313",
      },
    },
  });
}

function tokensSuccess(
  service: ICardService,
  mockTokensEvent: IAPIGatewayEvent<
    TokensCardRequest,
    null,
    null,
    AuthorizerContext
  >,
  done: Mocha.Done,
  putSpy?: [SinonSpy, number],
  putStub?: SinonStub,
  getBinInfoStub?: SinonStub
): void {
  service.tokens(mockTokensEvent).subscribe({
    next: (data: object): void => {
      expect(data.hasOwnProperty("token")).to.be.eql(true);
      expect(data[TOKEN]).to.have.lengthOf(32);
      if (getBinInfoStub !== undefined)
        expect(getBinInfoStub).to.be.calledOnce.and.calledWith(
          gTokensRequest.card.number.slice(0, 6)
        );
      if (putSpy !== undefined) expect(putSpy[0]).to.be.callCount(putSpy[1]);
      if (putStub !== undefined)
        expect(putStub.getCall(0).args[0])
          .to.have.property("info")
          .and.have.property("bank", gBinFetch.bank);
      done();
    },
  });
}

function chargesError(
  service: ICardService,
  mockChargesEvent: IAPIGatewayEvent<
    ChargesCardRequest,
    null,
    null,
    AuthorizerContext
  >,
  done: Mocha.Done
): void {
  service.charges(mockChargesEvent).subscribe({
    error: (error: KushkiError): void => {
      expect(error.code).to.be.eql("K004");
      done();
    },
    next: (): void => {
      done(UNREACHABLE);
    },
  });
}

// tslint:disable-next-line: max-func-body-length
async function createSchemas(): Promise<void> {
  gTokensRequest = Mock.of<CardToken>({
    card: {
      expiryMonth: "asdas",
      expiryYear: "xzvzc",
      name: "czxcz",
      number: "12345678901234567890123456789012",
    },
    totalAmount: 333,
  });
  gTokensResponse = Mock.of<TokensCardResponse>({
    token: "cxvxcvhjkshjkdashdaksdhakjsdasdn",
  });
  gChargesRequest = Mock.of<ChargesCardRequest>({
    amount: {
      iva: 342423,
      subtotalIva: 42432,
      subtotalIva0: 4234,
    },
    token: "asdad",
  });
  gChargesResponse = Mock.of<ChargesCardResponse>({
    ticketNumber: "ticket",
  });
  gCaptureRequest = Mock.of<CaptureCardRequest>({
    ticketNumber: "azxczxcb",
  });
  gAurusResponse = Mock.of<AurusResponse>({
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
  gMerchantFetch = Mock.of<DynamoMerchantFetch>({
    commission: false,
    contactPerson: "person",
    email: "mail",
    merchant_name: "name",
    multi_merchant: true,
    private_id: "pid",
    public_id: "id",
    sift_science: {
      SandboxAccountId: "sai",
      SandboxApiKey: "apk",
      SiftScore: 22,
    },
  });
  gProcessorFetch = Mock.of<DynamoProcessorFetch>({
    merchant_id: "iuoi",
    private_id: "mossf",
    processor_name: "nnkjbj",
    processor_type: "mvsdv",
    public_id: "dsjjs",
    terminal_id: "pmkxnv",
  });
  gBinFetch = Mock.of<DynamoBinFetch>({
    bank: "zczxc",
    bin: "dvzxc",
    brand: "ioiou",
    processor: "edsgbdsvs",
  });
  gBinInfoResponse = Mock.of<BinInfoResponse>({
    brand: "zxczcx",
    scheme: "xzcz",
  });
  gSiftScienceCreateOrderResponse = Mock.of<SiftScienceCreateOrderResponse>({
    error_message: "error",
    request: "req",
    score_response: {
      scores: {
        payment_abuse: {
          score: 222,
        },
      },
    },
    status: 111,
    time: 2222,
  });
  gSiftScienceGetWorkflowsResponse = Mock.of<SiftScienceWorkflowsResponse>({});
  gSiftScienceDecisionResponse = Mock.of<SiftScienceDecisionResponse>({});
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

function mockCardGateway(box: SinonSandbox): void {
  CONTAINER.unbind(IDENTIFIERS.CardGateway);
  CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
    Mock.of<ICardGateway>({
      tokensTransaction: box.stub().returns(of(gTokensResponse)),
    })
  );
}

function voidSuccess(
  service: ICardService,
  event: IAPIGatewayEvent<
    VoidCardRequest | null,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  >,
  next: SinonSpy,
  done: Mocha.Done
): void {
  service.chargeDeleteGateway(event).subscribe({
    next,
    complete: (): void => {
      expect(next).to.be.calledOnce.calledWithMatch({
        ticketNumber: gTransaction.ticket_number,
      });
      done();
    },
    error: done,
  });
}

function chargeSuccessNoBinInfo(
  service: ICardService,
  mockChargesEvent: IAPIGatewayEvent<
    ChargesCardRequest,
    null,
    null,
    AuthorizerContext
  >,
  lambdaStub: SinonStub,
  createOrderStub: SinonStub,
  workflowsStub: SinonStub,
  transactionStub: SinonStub,
  done: Mocha.Done
): void {
  service.charges(mockChargesEvent).subscribe({
    error: done,
    next: (data: object): void => {
      expect(lambdaStub.getCall(0).args[1]).to.have.property("body");
      expect(data).to.have.property("ticketNumber");
      expect(lambdaStub.getCall(0).args[1].body)
        .to.have.property("detail")
        .and.have.property("bank", "");
      expect(createOrderStub).to.be.calledOnce;
      expect(workflowsStub).to.be.calledOnce;
      expect(transactionStub).to.be.calledOnce;
      done();
    },
  });
}

function successChargefullResponse(
  service: ICardService,
  mockChargesEvent: IAPIGatewayEvent<
    ChargesCardRequest,
    null,
    null,
    AuthorizerContext
  >,
  put: SinonStub,
  done: Mocha.Done,
  processStub: SinonStub
): void {
  service.charges(mockChargesEvent).subscribe({
    complete: (): void => {
      expect(processStub).to.be.called;
      done();
    },
    error: done,
    next: (data: object): void => {
      expect(data)
        .to.have.property("details")
        .and.have.property("binInfo");
      expect(data).to.not.have.property("acquirerBank");
      expect(put).to.be.calledOnce;
      expect(put).to.be.calledWith(
        match
          .has("transactionId", match.string)
          .and(match.has("ticketNumber", match.string))
          .and(match.has("details", match.object))
      );
    },
  });
}

function dynamoBinding(put: SinonStub, box: SinonSandbox): void {
  CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put,
      getItem: box
        .stub()
        .onFirstCall()
        .returns(of(gMerchantFetch))
        .onSecondCall()
        .returns(of(gTokenDynamo))
        .onThirdCall()
        .returns(of(gProcessorFetch))
        .onCall(3)
        .returns(of(gBinFetch)),
    })
  );
}

function transactionServiceBinding(processStub: SinonStub): void {
  CONTAINER.bind<ITransactionService>(
    IDENTIFIERS.TransactionService
  ).toConstantValue(
    Mock.of<ITransactionService>({
      processRecord: processStub,
    })
  );
}

function antifraudBindSiftFlow(
  box: SinonSandbox,
  createOrderStub: SinonStub,
  workflowsStub: SinonStub,
  transactionStub: SinonStub
): void {
  CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
    Mock.of<IAntifraudGateway>({
      createOrder: box.stub().returns(
        new Observable(
          (observable: Observer<SiftScienceCreateOrderResponse>): void => {
            observable.next(createOrderStub());
            observable.complete();
          }
        )
      ),
      getWorkflows: workflowsStub,
      transaction: transactionStub,
    })
  );
}

function validateCharge(
  data: object,
  lambdaStub: SinonStub,
  cardStub: SinonStub,
  put: SinonStub,
  processStub: SinonStub,
  done: Mocha.Done
): void {
  expect(data).to.have.property("ticketNumber", gAurusResponse.ticket_number);
  expect(lambdaStub).to.be.calledOnce;
  expect(cardStub).to.be.calledWith(match.any, gProcessorFetch.private_id);
  expect(put).to.be.calledOnce;
  expect(put).to.be.calledWith(
    match
      .has("transactionId", match.string)
      .and(match.has("ticketNumber", match.string))
      .and(match.has("details", match.object))
  );
  expect(lambdaStub).to.be.calledWith(
    match.any,
    match.has(
      "body",
      match.has(
        "detail",
        match
          .has("bin")
          .and(match.has("country"))
          .and(match.has("isCreditCard"))
          .and(match.has("ip"))
          .and(match.has("lastFourDigits"))
          .and(match.has("maskedCardNumber"))
      )
    )
  );
  expect(processStub).to.be.calledWith(
    match.any,
    match.any,
    match.any,
    match.any,
    match.any,
    match.any,
    match.any,
    match.any,
    match.has("ip")
  );
  done();
}

function lambdaServiceBinding(lambdaStub: SinonStub): void {
  CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: lambdaStub,
    })
  );
}

function lambdaStubTransactionRule(box: SinonSandbox): SinonStub {
  return box.stub().returns(
    of(
      Mock.of<{ body: LambdaTransactionRuleResponse }>({
        body: {
          privateId: gProcessorFetch.private_id,
          publicId: gProcessorFetch.public_id,
        },
      })
    )
  );
}

function dynamoBindSiftFlow(put: SinonStub, box: SinonSandbox): void {
  CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
    Mock.of<IDynamoGateway>({
      put,
      getItem: box
        .stub()
        .onFirstCall()
        .returns(of(gMerchantFetch))
        .onSecondCall()
        .returns(
          of(
            Mock.of<TokenDynamo>({
              amount: 34,
              sessionId: "123",
              userId: "123",
            })
          )
        )
        .onThirdCall()
        .returns(of(gProcessorFetch))
        .returns(of(gMerchantFetch)),
    })
  );
}

function lambdaGateway(box: SinonSandbox): void {
  gInvokeFunctionStub = box
    .stub()
    .returns(of({ body: { publicId: "123456" } }));
  CONTAINER.unbind(CORE.LambdaGateway);
  CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: gInvokeFunctionStub,
    })
  );
}

function sandboxInit(box: SinonSandbox): void {
  CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
  CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
    Mock.of<ISandboxGateway>({
      chargesTransaction: box.stub().returns(of({})),
      tokensTransaction: box.stub().returns(of({})),
    })
  );
}

describe("CardService - Void", () => {
  process.env.BAD_BINS = BAD_BINS;
  let service: ICardService;
  let box: SinonSandbox;
  let void_stub: SinonStub;
  let process_void_stub: SinonStub;
  let processor_dynamo: DynamoProcessorFetch;
  let void_cold: SinonStub;
  let merchant_dynamo: DynamoMerchantFetch;

  function prepareVoidContainers(trx: Transaction[] = [gTransaction]): void {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { ticketNumber: gTransaction.ticket_number } })),
      })
    );
    processor_dynamo = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Pacifico",
      private_id: "34345",
      public_id: "123123",
    });

    merchant_dynamo = Mock.of<DynamoMerchantFetch>({
      contactPerson: "Juan Perez",
      email: "jose@gmail.com",
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(processor_dynamo))
          .onSecondCall()
          .returns(of(merchant_dynamo))
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of(trx)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    void_cold = box.stub();
    process_void_stub = box.stub().callsFake(() =>
      of(1).pipe(
        map(() => {
          void_cold();

          return gTransaction;
        })
      )
    );
    CONTAINER.bind(IDENTIFIERS.TransactionService).toConstantValue(
      Mock.of<ITransactionService>({
        processVoidRecord: process_void_stub,
      })
    );
  }

  function mockLambdaInvocation(): SinonStub {
    const lambda_invocation: SinonStub = box
      .stub()
      .returns(of({ ticketNumber: gTransaction.ticket_number }));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_invocation,
      })
    );

    return lambda_invocation;
  }

  function initChargeDeleteEvent(
    body: VoidCardRequest | null = null
  ): {
    event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    >;
    next: SinonSpy;
  } {
    const event: IAPIGatewayEvent<
      VoidCardRequest | null,
      VoidCardPath,
      null,
      AuthorizerContext,
      VoidCardHeader
    > = Mock.of<
      IAPIGatewayEvent<
        VoidCardRequest | null,
        VoidCardPath,
        null,
        AuthorizerContext,
        VoidCardHeader
      >
    >({
      body,
      headers: Mock.of<VoidCardHeader>(),
      pathParameters: {
        ticketNumber: "1234567890123456",
      },
      requestContext: {
        authorizer: {
          merchantId: gTransaction.merchant_id,
        },
      },
    });

    event.headers[HEADER_NAME] = "12345678";
    const next: SinonSpy = box.spy();

    return { event, next };
  }

  beforeEach(async () => {
    await createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    process.env.USRV_STAGE = "primary";
    rollbarInstance(box);
    CONTAINER.bind(CORE.LambdaContext).toConstantValue(
      Mock.of<Context>({
        getRemainingTimeInMillis: box.stub().returns(300),
      })
    );
    sandboxInit(box);
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    void_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        voidTransaction: void_stub,
      })
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("void a transaction, success", (done: Mocha.Done) => {
    prepareVoidContainers();
    const { event, next } = initChargeDeleteEvent();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    voidSuccess(service, event, next, done);
  });

  it("void a transaction in sandbox , success", (done: Mocha.Done) => {
    prepareVoidContainers();
    const { event, next } = initChargeDeleteEvent();

    process.env.USRV_STAGE = "uat";

    set(merchant_dynamo, "sandboxEnable", true);

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(processor_dynamo))
          .onSecondCall()
          .returns(of(merchant_dynamo))
          .returns(of(gBinFetch))
          .onThirdCall()
          .returns(of(merchant_dynamo)),
        put: box.stub().returns(of(true)),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    voidSuccess(service, event, next, done);
  });

  it("test chargeBack - Happy Path", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: box.stub().returns(of([gTransaction])),
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(of(true)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event, next } = initChargeDeleteEvent();

    service.chargeBack(event).subscribe({
      next,
      complete: (): void => {
        expect(next).to.be.calledOnce.and.calledWithMatch(true);
        done();
      },
      error: done,
    });
  });

  it("test chargeBack - with error", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: box.stub().returns(of([])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event } = initChargeDeleteEvent();

    service.chargeBack(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K020");
        done();
      },
    });
  });

  it("test request void existing trx void - success ", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event } = initChargeDeleteEvent();

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
      },
    });
  });

  it("void a transaction - with error", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: box.stub().returns(of([])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event } = initChargeDeleteEvent();

    service.chargeDelete(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K020");
        done();
      },
    });
  });
  it("happy path void a transaction without full response ", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box.stub().returns(of([gTransaction])),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event } = initChargeDeleteEvent();

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(response)
          .haveOwnProperty("ticketNumber")
          .equal(gTransaction.ticket_number);
      },
    });
  });
  it("void a transaction from subscription", (done: Mocha.Done) => {
    prepareVoidContainers([]);
    mockLambdaInvocation();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event, next } = initChargeDeleteEvent();

    if (event.body !== null) delete event.body.fullResponse;
    voidSuccess(service, event, next, done);
  });
  it("void a transaction from subscription with fullResponse", (done: Mocha.Done) => {
    prepareVoidContainers([]);
    const lambda_invocation: SinonStub = mockLambdaInvocation();
    const amount_requested: object = {
      currency: "COP",
      iva: 0,
      subtotalIva: 344,
      subtotalIva0: 0,
    };

    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event, next } = initChargeDeleteEvent(amount_requested);

    event.body = { amount: <Amount>amount_requested, fullResponse: true };
    service.chargeDeleteGateway(event).subscribe({
      next,
      complete: (): void => {
        expect(lambda_invocation).to.be.calledWith(match.any, {
          amount: amount_requested,
          fullResponse: true,
          path: event.path,
          ticketNumber: event.pathParameters.ticketNumber,
        });
        expect(next).to.be.calledWithExactly({
          ticketNumber: gTransaction.ticket_number,
        });
        done();
      },
      error: done,
    });
  });
  it("void a transaction from subscription with empty body", (done: Mocha.Done) => {
    prepareVoidContainers([]);
    const lambda_invocation: SinonStub = mockLambdaInvocation();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    const { event, next } = initChargeDeleteEvent();

    event.body = null;
    service.chargeDeleteGateway(event).subscribe({
      next,
      complete: (): void => {
        expect(lambda_invocation).to.be.calledOnce.calledWith(match.any, {
          amount: {},
          fullResponse: false,
          path: event.path,
          ticketNumber: event.pathParameters.ticketNumber,
        });
        done();
      },
      error: done,
    });
  });
  it.skip("void a transaction, error K003", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(undefined)),
        query: box.stub().returns(of([gTransaction])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind(IDENTIFIERS.TransactionService).toConstantValue(
      Mock.of<ITransactionService>({
        processVoidRecord: box.stub().returns(of(gTransaction)),
      })
    );
    const { event, next } = initChargeDeleteEvent();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.chargeDelete(event).subscribe({
      next,
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eql("K003");
        done();
      },
    });
  });
  it("void a transaction, success - fullResponse with binInfo", (done: Mocha.Done) => {
    const { event } = initChargeDeleteEvent({ fullResponse: true });
    const card_type: string = "DEBIT";

    gTransaction.sale_ticket_number = "119304520711880252";
    gBinFetch.info = { ...gBinFetch.info, type: card_type };
    prepareVoidContainers();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(response)
          .to.have.property("details")
          .and.have.property("binInfo");
      },
    });
  });
  it("void a transaction, success - fullResponse without binInfo", (done: Mocha.Done) => {
    const { event, next } = initChargeDeleteEvent({ fullResponse: true });
    const ticket: string = gTransaction.ticket_number;

    gBinFetch.info = undefined;
    prepareVoidContainers();
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.chargeDelete(event).subscribe({
      next,
      complete: (): void => {
        expect(next).to.be.calledOnce.and.calledWithMatch({
          details: {
            acquirerBank: processor_dynamo.acquirer_bank,
            binInfo: { bank: null, type: null },
          },
          ticketNumber: ticket,
        });
        done();
      },
      error: done,
    });
  });
  it("void a transaction, AurusError from Wrapper", (done: Mocha.Done) => {
    const { event, next } = initChargeDeleteEvent();
    const trx_details: TransactionDetails = {
      approvalCode: "102005",
      binCard: "455983",
      cardHolderName: "",
      cardType: "VISA",
      isDeferred: "N",
      lastFourDigitsOfCard: "7726",
      merchantName: "Superintendecia de Notariado",
      processorBankName: "000051~Davivienda",
      processorName: COLOMBIAN_PROCESSORS[0],
    };
    const wrapper_error: AurusError = new AurusError("333", "wrapper error", {
      ...trx_details,
    });

    prepareVoidContainers();
    void_stub.throws(wrapper_error);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.chargeDelete(event).subscribe({
      next,
      complete: done,
      error: (err: AurusError): void => {
        const metadata: AurusResponse = <AurusResponse>err.getMetadata();

        expect(err.code).to.eq(wrapper_error.code);
        expect(metadata.response_code).to.eq(wrapper_error.code);
        expect(metadata.response_text).to.eq(err.getMessage());
        expect(metadata.transaction_details).to.eql(trx_details);
        done();
      },
    });
  });

  it("test request partial void existing trx void, with amount equal to transaction amount - success ", (done: Mocha.Done) => {
    prepareVoidContainers();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 344,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
      },
    });
  });

  it("test request partial void existing trx void, with amount less than transaction amount - success ", (done: Mocha.Done) => {
    prepareVoidContainers();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 342,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
      },
    });
  });

  it("test request partial void existing trx void, with amount less than transaction amount - fails ", (done: Mocha.Done) => {
    prepareVoidContainers();
    gTransaction.pendingAmount = 0;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
      })
    );

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 342,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K023");
        done();
      },
    });
  });

  it("test request partial void existing trx void, with amount equal than transaction amount - success ", (done: Mocha.Done) => {
    prepareVoidContainers();
    gTransaction.approved_transaction_amount = 200;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 200,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
      },
    });
  });

  it("test request partial void existing trx void, with amount is greater than pending amount - fails ", (done: Mocha.Done) => {
    prepareVoidContainers();
    gTransaction.pendingAmount = 200;

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 350,
        subtotalIva0: 0,
      },
    };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
      })
    );

    const { event } = initChargeDeleteEvent(amount_request);

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K023");
        done();
      },
    });
  });

  it("test request partial void existing trx void, with pending amount than transaction amount - success ", (done: Mocha.Done) => {
    prepareVoidContainers();
    gTransaction.pendingAmount = 200;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of([gProcessorFetch])),
        query: box
          .stub()
          .onFirstCall()
          .returns(of([gTransaction]))
          .onSecondCall()
          .returns(of([])),
        updateValues: box.stub().returns(of(true)),
      })
    );

    const amount_request: VoidCardRequest = {
      amount: {
        currency: "COP",
        iva: 0,
        subtotalIva: 40,
        subtotalIva0: 0,
      },
    };
    const { event } = initChargeDeleteEvent(amount_request);

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.chargeDelete(event).subscribe({
      complete: done,
      error: done,
      next: (response: object): void => {
        expect(get(response, "ticketNumber")).equal(gTransaction.ticket_number);
      },
    });
  });
});
describe("CardService - Tokens Success", () => {
  process.env.BAD_BINS = BAD_BINS;
  let service: ICardService;
  let box: SinonSandbox;
  let next: SinonSpy;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
    sandboxInit(box);
    lambdaGateway(box);
    rollbarInstance(box);
    await createSchemas();
    next = box.spy();
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        ),
      })
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("tokens - success", (done: Mocha.Done) => {
    gBinFetch = {
      bank: "BANCO PICHINCHA C.A.",
      bin: "361349",
      brand: "amex",
      info: {
        brand: "Visa Plus",
        country: {
          alpha2: "US",
          latitude: 38,
          longitude: -97,
          name: "USA",
          numeric: "840",
        },
        number: {
          length: 19,
          prefix: "361349",
        },
        scheme: "VISA",
        type: "DEBIT",
      },
      processor: ECUADORIAN_PROCESSORS[0],
    };
    gInvokeFunctionStub = box.stub().returns(
      of({
        body: {
          processor: ProcessorEnum.MCPROCESSOR,
          publicId: "123456",
          secureId: "uniqueId12345",
          secureService: "kushkiOTP",
        },
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: gInvokeFunctionStub,
      })
    );
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();
    const secure_service: string = "secureService";
    const secure_id: string = "secureId";

    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = null;
    gTokensRequest.currency = "USD";
    gTokensResponse.settlement = 1;
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(gBinFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(data[TOKEN]).to.have.lengthOf(32);
        expect(data[secure_service]).to.be.eql("kushkiOTP");
        expect(data[secure_id]).to.be.eql("uniqueId12345");
        expect(put_spy).to.be.calledOnce;
        expect(put_stub).calledWith(
          match
            .has("binInfo")
            .and(match.has("maskedCardNumber", match(/^[0-9]{6}X+[0-9]{4}$/)))
            .and(match.has("ip", "1.1.1.1"))
        );
        done();
      },
    });
  });
  it("when tokens is called with a dynamo bin fetch of type debit, it will return an object with token", (done: Mocha.Done) => {
    const bin_fetch_test: DynamoBinFetch = {
      ...gBinFetch,
      info: {
        type: "debit",
      },
    };
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              processor: ProcessorEnum.CREDIMATIC,
              publicId: "123456",
              secureId: "uniqueId12345",
              secureService: "kushkiOTP",
            },
          })
        ),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(bin_fetch_test)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (data: object): void => {
        expect(data).to.haveOwnProperty("token");
        done();
      },
    });
  });
  it("tokens sandbox - success", (done: Mocha.Done) => {
    const rps: SinonStub<[
      UriOptions | UrlOptions,
      RequestCallback?
    ]> = box.stub(rp, "post");

    process.env.USRV_STAGE = "uat";
    gBinFetch = {
      bank: "BANCO GUAYAQUIL C.A.",
      bin: "361349",
      brand: "VISA",
      info: {
        brand: "Visa BG",
        country: {
          alpha2: "US",
          latitude: 38,
          longitude: -97,
          name: "United States",
          numeric: "840",
        },
        number: {
          length: 19,
          prefix: "361349",
        },
        scheme: "VISA",
        type: "DEBIT",
      },
      processor: "Credimatic Processor",
    };
    gInvokeFunctionStub = box.stub().returns(
      of({
        body: {
          processor: ProcessorEnum.CREDIMATIC,
          publicId: "5464647",
          secureId: "uniqueId99045",
          secureService: "kushkiOTP",
        },
      })
    );

    rps.returns(Promise.resolve(of(gTokensResponse)));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: gInvokeFunctionStub,
      })
    );
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = null;
    gTokensRequest.currency = "USD";
    gTokensResponse.settlement = 1;
    CONTAINER.unbind(IDENTIFIERS.SandboxGateway);
    CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
      Mock.of<ISandboxGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    set(gMerchantFetch, "sandboxEnable", true);
    set(gProcessorFetch, "omitCVV", true);

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gBinFetch))
          .onSecondCall()
          .returns(of(gProcessorFetch))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gMerchantFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(rps.called);
        done();
      },
    });
  });
  it("tokens - success with mastercard token", (done: Mocha.Done) => {
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = Mock.of<IAPIGatewayEvent<TokenToken, null, null, AuthorizerContext>>({
      body: {
        card: {},
        kind: "Mastercard",
        token: "qwerty",
        totalAmount: 100,
      },
      headers: {
        [HEADER]: "255487981",
        [X_FORWARDED_FOR]: "2.1.1.2, 3.2.2.3",
      },
      requestContext: {
        authorizer: {
          merchantId: "123455799754313",
        },
      },
    });
    const aurus: SinonStub = box.stub().returns(of(gTokensResponse));

    CONTAINER.rebind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: aurus,
      })
    );
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gBinFetch))
          .returns(of(gProcessorFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TokenGateway);
    CONTAINER.bind(IDENTIFIERS.TokenGateway).toConstantValue(
      Mock.of<ITokenGateway>({
        untokenize: box.stub().returns(
          of(
            Mock.of<CardData>({
              name: "Qwerty",
              number: "1234567890",
            })
          )
        ),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next,
      complete: (): void => {
        expect(next).to.be.calledWith(match.has("token"));
        expect(aurus).to.be.calledWith(
          match.has("card", match.has("number", "1234567890"))
        );
        done();
      },
    });
  });
  it("tokens - success, no exists bin info on table", (done: Mocha.Done) => {
    delete gBinFetch.info;
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = null;
    delete gTokensRequest.currency;
    gTokensRequest.isDeferred = true;
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(undefined)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box
      .stub()
      .returns(of(gBinInfoResponse));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );
    const ksh_header: string = "KSH_AWS_REQUEST_ID";

    mock_tokens_event[ksh_header] = "qwerty";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(data[TOKEN]).to.have.lengthOf(32);
        expect(put_spy).to.be.calledTwice;
        expect(put_stub.getCall(0)).calledWith(match.has("info"));
        expect(put_stub.getCall(1)).calledWith(match.has("binInfo"));
        expect(get_bin_info_stub).to.be.calledOnce.and.calledWith(
          gTokensRequest.card.number.slice(0, 6)
        );
        done();
      },
    });
  });
  it("tokens - success with undefined siftScience data", (done: Mocha.Done) => {
    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = "123";
    mockCardGateway(box);

    gBinInfoResponse = {
      bank: { name: "Jyske Bank2" },
      brand: "Visa",
      country: {
        alpha2: "CA",
        currency: "CAD",
        emoji: "🇨🇦",
        latitude: 60,
        longitude: -95,
        name: "Canada",
        numeric: "124",
      },
      number: {},
      scheme: "mastercard",
      type: "credit",
    };

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box
      .stub()
      .returns(of(gBinInfoResponse));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(undefined))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gMerchantFetch))
          .onCall(3)
          .returns(of(gProcessorFetch)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    tokensSuccess(service, mock_tokens_event, done);
  });

  it("should return error if omitCVV is false and cvv does not exists in request", (done: Mocha.Done) => {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        ),
      })
    );

    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = Mock.of<
      IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
    >({
      body: {
        card: {
          expiryMonth: "asdas",
          expiryYear: "xzvzc",
          name: "czxcz",
          number: "12345678901234567890123456789012",
        },
        totalAmount: 333,
      },
      headers: {
        [HEADER]: "98765432134",
        [X_FORWARDED_FOR]: "1.1.1.1, 2.2.2.2",
      },
      requestContext: {
        authorizer: {
          merchantId: "123455799754313",
        },
      },
    });

    gProcessorFetch.omitCVV = false;
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(undefined))
          .onSecondCall()
          .returns(of(gProcessorFetch))
          .onThirdCall()
          .returns(of(gMerchantFetch))
          .onCall(3)
          .returns(of(gMerchantFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.getMessage()).equal("Transacción no permitida sin ccv2.");
        done();
      },
    });
  });

  it("tokens - success, no exists bank name in info in token gen", (done: Mocha.Done) => {
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = null;
    gTokensRequest.currency = "USD";
    gTokensRequest.isDeferred = true;
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(undefined))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .returns(of(gProcessorFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(
      of({
        brand: BRAND,
        country: {
          alpha2: "CA",
          currency: "CAD",
          emoji: "🇨🇦",
          latitude: 60,
          longitude: -95,
          name: "Canada",
          numeric: "124",
        },
        number: {},
        scheme: "mastercard",
        type: "credit",
      })
    );

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.tokens(mock_tokens_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(put_spy).to.be.calledTwice;
        expect(put_stub.getCall(0)).calledWith(match.has("info"));
        expect(put_stub.getCall(0)).calledWith(match.has("bank", ""));
        expect(put_stub.getCall(1)).calledWith(match.has("binInfo"));
        expect(get_bin_info_stub).to.be.calledOnce.and.calledWith(
          gTokensRequest.card.number.slice(0, 6)
        );
        done();
      },
    });
  });
  it("when tokens is called, it will invoke a multi merchant tokens lambda with the token, total amount, merchant id and a partners object", (done: Mocha.Done) => {
    const lambda_test: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(
        of({
          body: {
            processor: ProcessorEnum.CREDIMATIC,
            publicId: "123456",
            secureId: "uniqueId12345",
            secureService: "kushkiOTP",
          },
        })
      )
      .onSecondCall()
      .returns(of({}));
    const partners_test: {
      amount: {
        subtotalIva: number;
        subtotalIva0: number;
        iva: number;
        ice?: number;
        // tslint:disable-next-line:max-union-size
        currency: "USD" | "COP" | "PEN" | "CLP" | "UF";
      };
      merchantId: string;
    }[] = [
      {
        amount: {
          currency: "USD",
          ice: 10,
          iva: 12,
          subtotalIva: 100,
          subtotalIva0: 88,
        },
        merchantId: "123",
      },
    ];
    const tokens_request: TokensCardRequest = {
      ...gTokensRequest,
      partners: partners_test,
      totalAmount: 50,
    };
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = Mock.of<
      IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
    >({
      body: tokens_request,
      headers: {
        [HEADER]: "98765432134",
        [X_FORWARDED_FOR]: "2.1.1.2, 3.3.3.3",
      },
      requestContext: {
        authorizer: {
          merchantId: "123455799754313",
        },
      },
    });
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_test,
      })
    );

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gBinFetch))
          .returns(of(gProcessorFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    process.env.MULTI_MERCHANT_TOKENS_LAMBDA = "multiMerchantTokensLambda";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (): void => {
        expect(lambda_test.args[1][1].partners).to.be.eql(partners_test);
        expect(lambda_test.args[1][1].totalAmount).to.be.eql(
          tokens_request.totalAmount
        );
        expect(lambda_test.args[1][1]).to.be.haveOwnProperty("merchantId");
        expect(lambda_test.args[1][1]).to.be.haveOwnProperty("parentToken");
        done();
      },
    });
  });

  it("when tokens is called, it will invoke a commission token lambda with the token, total amount, merchant id and a commission object", (done: Mocha.Done) => {
    const lambda_test: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(
        of({
          body: {
            processor: ProcessorEnum.CREDIMATIC,
            publicId: "123456",
            secureId: "uniqueId12345",
            secureService: "kushkiOTP",
          },
        })
      )
      .onSecondCall()
      .returns(of({}));

    const tokens_request: TokensCardRequest = {
      ...gTokensRequest,
      currency: CurrencyEnum.USD,
      totalAmount: 50,
    };
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = Mock.of<
      IAPIGatewayEvent<TokensCardRequest, null, null, AuthorizerContext>
    >({
      body: tokens_request,
      headers: {
        [HEADER]: "98765432134",
        [X_FORWARDED_FOR]: "2.1.1.2, 3.3.3.3",
      },
      requestContext: {
        authorizer: {
          merchantId: "123455799754313",
        },
      },
    });
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_test,
      })
    );

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    gMerchantFetch.commission = true;
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gProcessorFetch))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gMerchantFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    process.env.MULTI_MERCHANT_TOKENS_LAMBDA = "multiMerchantTokensLambda";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (): void => {
        expect(lambda_test.args[1][1].totalAmount).to.be.eql(
          tokens_request.totalAmount
        );
        expect(lambda_test.args[1][1].commission).to.be.eql(true);
        expect(lambda_test.args[1][1]).to.be.haveOwnProperty("merchantId");
        expect(lambda_test.args[1][1]).to.be.haveOwnProperty("parentToken");
        done();
      },
    });
  });
});
describe("CardService - Tokens Success Special Characters", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let lambda_stub: SinonStub;

  beforeEach(async () => {
    delete process.env.BAD_BINS;
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            processor: ProcessorEnum.CREDIMATIC,
            publicId: "123",
          },
        })
      )
    );
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    await createSchemas();
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("tokens - success with special character in cardHolderName", (done: Mocha.Done) => {
    gTokensRequest.sessionId = "adkasjdklaj12";
    gTokensRequest.userId = "120301299128371721";
    gTokensRequest.card.name = "Alonso� Núñez1新道";
    gProcessorFetch.omitCVV = true;

    const expected_name: string = "Alonso Nunez1";
    const put: SinonStub = box.stub().returns(of(true));
    const consttokens_transaction_spy: SinonStub = box
      .stub()
      .returns(of(gTokensResponse));

    const get_item: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(of(undefined))
      .onSecondCall()
      .returns(of(gMerchantFetch))
      .onThirdCall()
      .returns(of(gProcessorFetch))
      .returns(of(gProcessorFetch));

    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: consttokens_transaction_spy,
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: get_item,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    gBinInfoResponse = {
      bank: { name: "Jyske Bank" },
      brand: "World Elite",
      country: {
        alpha2: "CA",
        currency: "CAD",
        emoji: "🇨🇦",
        latitude: 60,
        longitude: -95,
        name: "Canada",
        numeric: "124",
      },
      number: {},
      scheme: "mastercard",
      type: "credit",
    };

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box
      .stub()
      .returns(of(gBinInfoResponse));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        expect(data[TOKEN]).to.have.lengthOf(32);
        expect(put).to.have.been.calledTwice;
        expect(consttokens_transaction_spy.args[0][0].card.name).to.eql(
          expected_name
        );
        done();
      },
    });
  });
});
describe("CardService - Tokens Fail", () => {
  let service: ICardService;
  let box: SinonSandbox;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    process.env.BAD_BINS = BAD_BINS;
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { publicId: "123456" } })),
      })
    );
  });
  beforeEach(async () => {
    await createSchemas();
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("tokens - fail with invalid bin card", (done: Mocha.Done) => {
    gTokensRequest.card.number = "4440881234560000";
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    mockCardGateway(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K007");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("tokens - fail with invalid card", (done: Mocha.Done) => {
    gTokensRequest.card.number = "0004565389456";
    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    mockCardGateway(box);
    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K025");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("tokens - null bin info - success", (done: Mocha.Done) => {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<LambdaTransactionRuleResponse>({
              body: {
                processor: ProcessorEnum.MCPROCESSOR,
                publicId: "1234567",
              },
            })
          )
        ),
      })
    );

    const mock_tokens_event: IAPIGatewayEvent<
      TokensCardRequest,
      null,
      null,
      AuthorizerContext
    > = tokensEvent();

    gTokensRequest.sessionId = "123";
    gTokensRequest.userId = null;
    gTokensRequest.currency = "USD";
    gTokensRequest.isDeferred = true;
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        tokensTransaction: box.stub().returns(of(gTokensResponse)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(undefined))
          .onSecondCall()
          .returns(of(gMerchantFetch))
          .onThirdCall()
          .returns(of(gMerchantFetch))
          .returns(of(gProcessorFetch)),
        put: put_stub,
        query: box.stub().returns(of([gProcessorFetch])),
      })
    );

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.tokens(mock_tokens_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data.hasOwnProperty("token")).to.be.eql(true);
        done();
      },
    });
  });
});
describe("CardService - Charges success", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let lambda_stub: SinonStub;
  let put: SinonStub;
  let process_stub: SinonStub;

  function prepareFullResponse(
    processor: DynamoProcessorFetch
  ): IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext> {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gBinFetch = {
      bank: "BANCO PICHINCHA C.A.",
      bin: "361349",
      brand: "VISA",
      info: {
        brand: "Visa Plus",
        country: {
          alpha2: "US",
          latitude: 38,
          longitude: -97,
          name: "United States",
          numeric: "840",
        },
        number: {
          length: 19,
          prefix: "361349",
        },
        scheme: "VISA",
        type: "DEBIT",
      },
      processor: "Datafast Processor",
    };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

    put = box.stub().returns(of(true));
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 33,
                binInfo: {
                  bank: "Pichincha",
                  bin: "123456",
                  brand: "VISA",
                  processor: "Credimatic",
                },
                secureId: "12345OTP",
              })
            )
          )
          .onThirdCall()
          .returns(of(processor))
          .onCall(3)
          .returns(of(gBinFetch))
          .onCall(4)
          .returns(of(gProcessorFetch)),
      })
    );

    mock_charges_event.body.fullResponse = true;

    return mock_charges_event;
  }

  beforeEach(async () => {
    await createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put = box.stub().returns(of(true));
    gTokenDynamo = Mock.of<TokenDynamo>({
      amount: 100,
      binInfo: {
        bank: "Pichincha",
        bin: "123456",
        brand: "VISA",
        processor: "Credimatic",
      },
    });
    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        type: "debit",
      },
      processor: "Credimatic",
    };
    dynamoBinding(put, box);
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        preAuthorization: card_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = lambdaStubTransactionRule(box);
    lambdaServiceBinding(lambda_stub);
    process_stub = box.stub().returns(of(chargesCardResponse()));
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    transactionServiceBinding(process_stub);
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("charges - success", (done: Mocha.Done) => {
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        validateCharge(data, lambda_stub, card_stub, put, process_stub, done);
      },
    });
  });
  it("charges - success with deferredOptions ", (done: Mocha.Done) => {
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gChargesRequest.deferred = {
      creditType: "",
      graceMonths: "",
      months: 3,
    };
    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.charges(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        validateCharge(data, lambda_stub, card_stub, put, process_stub, done);
      },
    });
  });
  it("charges - success with ksh_subscriptionValidation ", (done: Mocha.Done) => {
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gChargesRequest.metadata = {
      ksh_subscriptionValidation: true,
    };
    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.charges(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        validateCharge(data, lambda_stub, card_stub, put, process_stub, done);
      },
    });
  });
  it("charges with visanet processor - success", (done: Mocha.Done) => {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              plcc: "0",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        ),
      })
    );
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gTokenDynamo.amount = 33;
    gTokenDynamo.bin = "123456";
    gTokenDynamo.ip = "1.1.1.1";
    gTokenDynamo.lastFourDigits = "1234";
    gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        type: "credit",
      },
      processor: "Credimatic",
    };
    gAurusResponse.ticket_number = "07874520255";
    mock_charges_event.body.months = 3;

    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    gProcessorFetch.processor_code = "00002";
    gProcessorFetch.processor_name = ProcessorEnum.VISANET;

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .returns(of(gMerchantFetch)),
        put: put_stub,
      })
    );

    mock_charges_event.body.months = 3;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).haveOwnProperty("ticketNumber");
        done();
      },
    });
  });

  it("when charges is called, it will send a SNS with the transaction and a contactDetails object", (done: Mocha.Done) => {
    const sns_publish_test: SinonStub<
      [string, object],
      Observable<boolean>
    > = box.stub(SNSGateway.prototype, "publish").returns(of(true));
    const contact_details_test: object = {
      documentNumber: "123",
      documentType: "CC",
      email: "email",
      firstName: "name",
      phoneNumber: "123",
    };

    process.env.SNS_INVOICE = "snsInvoice";
    gChargesRequest.contactDetails = contact_details_test;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      next: (): void => {
        expect(sns_publish_test).to.be.called;
        expect(sns_publish_test.args[0][1]).to.haveOwnProperty(
          "contactDetails"
        );
        expect(sns_publish_test.args[0][1]).to.be.haveOwnProperty(
          "transaction"
        );
        done();
      },
    });
  });
  it("charges in sandbox - success ", (done: Mocha.Done) => {
    const rps: SinonStub<[
      UriOptions | UrlOptions,
      RequestCallback?
    ]> = box.stub(rp, "post");

    process.env.USRV_STAGE = "uat";
    process.env.IVA_EC = "0";
    process.env.IVA_CO = "0";
    process.env.IVA_PE = "0";

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        buildAurusAmount: box.stub().returns(
          of({
            IVA: 0.19,
            Subtotal_IVA: 1.1,
            Subtotal_IVA0: 2.2,
            Total_amount: 3.4,
          })
        ),
      })
    );

    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";
    set(gMerchantFetch, "sandboxEnable", true);

    CONTAINER.unbind(CORE.LambdaGateway);

    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: SandboxChargeResponse }>({
          body: {
            response_code: "000",
            response_text: "aprovada",
            ticket_number: "123",
          },
        })
      )
    );

    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 33,
                binInfo: {
                  bank: "Pichincha",
                  bin: "123456",
                  brand: "VISA",
                  processor: "Credimatic",
                },
                secureId: "12345OTP",
              })
            )
          )
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gMerchantFetch)),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property(
          "ticketNumber",
          gAurusResponse.ticket_number
        );
        expect(rps.called);
        done();
      },
    });
  });

  it("when charges is called it will catch an error when sending a sns and validate the charge", (done: Mocha.Done) => {
    gChargesRequest.contactDetails = {
      documentNumber: "123",
      documentType: "CC",
      email: "email",
      firstName: "name",
      phoneNumber: "123",
    };
    box
      .stub(SNSGateway.prototype, "publish")
      .returns(of(1).pipe(switchMap(() => throwError(new Error("")))));
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        validateCharge(data, lambda_stub, card_stub, put, process_stub, done);
      },
    });
  });

  it("charges - PreAuthorization - success", (done: Mocha.Done) => {
    delete gTokenDynamo.secureId;
    delete gChargesRequest.secureService;
    gAurusResponse.ticket_number = "07874520255";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.preAuthorization(chargesEvent()).subscribe({
      error: done,
      next: (data: object): void => {
        validateCharge(data, lambda_stub, card_stub, put, process_stub, done);
        expect(data).to.have.property("ticketNumber");
      },
    });
  });
  it("charges - success with months and country on bin info", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gTokenDynamo.secureId = "asdlkadslk0-12dasda";
    gTokenDynamo.bin = "123456";
    gTokenDynamo.ip = "1.1.1.1";
    gTokenDynamo.lastFourDigits = "1234";
    gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        country: {
          name: "Ecuador",
        },
        type: "credit",
      },
      processor: "Credimatic",
    };
    gAurusResponse.ticket_number = "07874520255";
    mock_charges_event.body.months = 3;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property(
          "ticketNumber",
          gAurusResponse.ticket_number
        );
        done();
      },
    });
  });
  it("When send charge with channel property - success", (done: Mocha.Done) => {
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              plcc: "0",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        ),
      })
    );
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gTokenDynamo.amount = 33;
    gTokenDynamo.bin = "123456";
    gTokenDynamo.ip = "1.1.1.1";
    gTokenDynamo.lastFourDigits = "1234";
    gTokenDynamo.maskedCardNumber = "123456XXXXXX1234";
    gTokenDynamo.binInfo = {
      bank: "Pichincha",
      bin: "123456",
      brand: "VISA",
      info: {
        type: "credit",
      },
      processor: "Credimatic",
    };
    gAurusResponse.ticket_number = "07874520255";
    mock_charges_event.body.months = 3;

    const put_spy: SinonSpy = box.spy();
    const put_stub: SinonStub = box
      .stub()
      .callsFake(() => of(1).pipe(map(put_spy), mapTo(true)));

    process.env.USRV_STAGE = "primary";

    CONTAINER.rebind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .returns(of(gMerchantFetch)),
        put: put_stub,
      })
    );

    mock_charges_event.body.channel = "Test";
    mock_charges_event.body.months = 3;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).haveOwnProperty("ticketNumber");
        expect(put_stub).calledWith(match.has("channel"));
        done();
      },
    });
  });
  it("charges - success with siftScience flow and no bin info", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gSiftScienceCreateOrderResponse = {
      error_message: "OK",
      request: "",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0.18,
          },
        },
      },
      status: 23232,
      time: 35634376456374537463,
    };
    gMerchantFetch.sift_science.SiftScore = 0.2;
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.18,
        },
      },
      workflow_statuses: [
        {
          config_display_name: "displayName",
          history: [
            {
              app: "decision",
              name: "ApprovedTransaction",
            },
          ],
        },
      ],
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    process.env.USRV_STAGE = "uat";
    dynamoBindSiftFlow(put, box);
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const create_order_stub: SinonStub = box
      .stub()
      .returns(gSiftScienceCreateOrderResponse);

    antifraudBindSiftFlow(
      box,
      create_order_stub,
      workflows_stub,
      transaction_stub
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    mock_charges_event.headers[HEADER_NAME] = "123456";
    chargeSuccessNoBinInfo(
      service,
      mock_charges_event,
      lambda_stub,
      create_order_stub,
      workflows_stub,
      transaction_stub,
      done
    );
  });
  it("charges - success with fullResponse", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box
      .stub()
      .returns(of(gBinInfoResponse));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              plcc: "0",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        ),
      })
    );
    delete gProcessorFetch.acquirer_bank;
    const event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = prepareFullResponse(gProcessorFetch);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    successChargefullResponse(service, event, put, done, process_stub);
  });
  it("charges - success with fullResponse - acquirerBank", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              plcc: "0",
              privateId: gProcessorFetch.private_id,
              publicId: gProcessorFetch.public_id,
            },
          })
        ),
      })
    );
    const bank_test: string = "Banco Internacional";
    const next_spy: SinonSpy = box.spy();
    const event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = prepareFullResponse({
      ...gProcessorFetch,
      acquirer_bank: bank_test,
    });

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(event).subscribe({
      complete: (): void => {
        expect(next_spy).to.have.been.calledWithMatch({
          details: {
            acquirerBank: bank_test,
          },
        });
        done();
      },
      next: next_spy,
    });
  });
  it("when charges is called with a transaction rule response with plcc = 1, it will validate the charge", (done: Mocha.Done) => {
    const lambda_test: SinonStub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            plcc: "1",
            privateId: gProcessorFetch.private_id,
            publicId: gProcessorFetch.public_id,
          },
        })
      )
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch))
          .onCall(4)
          .returns(of(gBinFetch)),
      })
    );

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_test,
      })
    );
    gAurusResponse.ticket_number = "07874520255";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      next: (data: object): void => {
        validateCharge(data, lambda_test, card_stub, put, process_stub, done);
      },
    });
  });
  it("when charges is called with a transaction rule response with plcc = 1 but undefined response of bin, it will validate the charge", (done: Mocha.Done) => {
    const lambda_test: SinonStub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: {
            plcc: "1",
            privateId: gProcessorFetch.private_id,
            publicId: gProcessorFetch.public_id,
          },
        })
      )
    );

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(undefined))
          .onCall(4)
          .returns(of(gBinFetch)),
      })
    );

    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_test,
      })
    );
    gAurusResponse.ticket_number = "07874520255";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      next: (data: object): void => {
        validateCharge(data, lambda_test, card_stub, put, process_stub, done);
      },
    });
  });
  it("charges - deferred in token info incorrect with charge info", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gTokenDynamo.isDeferred = true;
    delete mock_charges_event.body.deferred;
    delete mock_charges_event.body.months;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K013");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
});
describe("CardService - Charges SiftScience", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let lambda_stub: SinonStub;
  let process_stub: SinonStub;

  beforeEach(async () => {
    await createSchemas();
  });
  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 55,
                binInfo: {
                  bank: "Pichincha",
                  bin: "123456",
                  brand: "VISA",
                  processor: "Credimatic",
                },
              })
            )
          )
          .onThirdCall()
          .returns(of(gBinFetch)),
        put: box.stub().returns(of(true)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        preAuthorization: card_stub,
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: { privateId: "123" },
        })
      )
    );
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );
    process_stub = box.stub().returns(of(chargesCardResponse()));
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        processRecord: process_stub,
      })
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("charges - siftScience error, sift score greater than merchant sift score", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    gSiftScienceCreateOrderResponse = {
      error_message: "OK",
      request: "",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0.21,
          },
        },
      },
      status: 23232,
      time: 35634376456374537463,
    };
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.22,
        },
      },
    };
    gMerchantFetch.sift_science.SiftScore = 0.2;
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 45,
                sessionId: "123",
                userId: "123",
              })
            )
          )
          .onThirdCall()
          .returns(of(gProcessorFetch)),
        put: box.stub().returns(of(true)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const create_order_stub: SinonStub = box
      .stub()
      .returns(gSiftScienceCreateOrderResponse);

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        createOrder: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>): void => {
              observable.next(create_order_stub());
              observable.complete();
            }
          )
        ),
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    mock_charges_event.headers[HEADER_NAME] = "123456";
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K021");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - siftScience error, workflow failed", (done: Mocha.Done) => {
    let g_sift_decision_green: SiftScienceDecisionResponse;
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    g_sift_decision_green = {
      description: "siftResp 2",
      id: "decisionId2",
      name: "siftGreenResponse",
      type: "green",
    };

    gSiftScienceDecisionResponse = {
      description: "siftResponse description",
      id: "decisionId1",
      name: "siftResponse",
      type: "red",
    };

    gSiftScienceCreateOrderResponse = {
      error_message: "OK",
      request: "",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0.1,
          },
        },
      },
      status: 23232,
      time: 35634376456374537463,
    };
    process.env.SIFT_SCORE = "0.2";

    delete gMerchantFetch.sift_science.SiftScore;
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.15,
        },
      },
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 30,
                sessionId: "123",
                userId: "123",
              })
            )
          )
          .onThirdCall()
          .returns(of(gProcessorFetch)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    gSiftScienceGetWorkflowsResponse.score_response.workflow_statuses = [
      {
        config_display_name: "workflowName",
        history: [
          {
            app: "decision",
            config: { decision_id: "decisionId1" },
            name: "DeclinedTransaction",
          },
          {
            app: "decision",
            config: { decision_id: "decisionId2" },
            name: "ApprovedTransaction",
          },
        ],
      },
    ];
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const create_order_stub: SinonStub = box
      .stub()
      .returns(gSiftScienceCreateOrderResponse);
    const decision_stub: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(g_sift_decision_green)
      .onSecondCall()
      .returns(gSiftScienceDecisionResponse);

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        createOrder: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>): void => {
              observable.next(create_order_stub());
              observable.complete();
            }
          )
        ),
        getDecision: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceDecisionResponse>): void => {
              observable.next(decision_stub());
              observable.complete();
            }
          )
        ),
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    mock_charges_event.headers[HEADER_NAME] = "123456";
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K021");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - siftScience error, no workflow data", (done: Mocha.Done) => {
    let g_sift_decision_green: SiftScienceDecisionResponse;
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    g_sift_decision_green = {
      description: "siftResp 2",
      id: "decisionId2",
      name: "siftGreenResponse",
      type: "green",
    };
    process.env.SIFT_SCORE = "0.2";

    delete gMerchantFetch.sift_science.SiftScore;
    gSiftScienceGetWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.15,
        },
      },
    };
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 30,
                sessionId: "123",
                userId: "123",
              })
            )
          )
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .returns(of(gMerchantFetch)),
        put: box.stub().returns(of(true)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.AntifraudGateway);
    delete gSiftScienceGetWorkflowsResponse.score_response.workflow_statuses;
    const workflows_stub: SinonStub = box
      .stub()
      .returns(of(gSiftScienceGetWorkflowsResponse));
    const transaction_stub: SinonStub = box.stub().returns(of(true));
    const create_order_stub: SinonStub = box
      .stub()
      .returns(gSiftScienceCreateOrderResponse);
    const decision_stub: SinonStub = box
      .stub()
      .onFirstCall()
      .returns(g_sift_decision_green)
      .onSecondCall()
      .returns(gSiftScienceDecisionResponse);

    CONTAINER.bind(IDENTIFIERS.AntifraudGateway).toConstantValue(
      Mock.of<IAntifraudGateway>({
        createOrder: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>): void => {
              observable.next(create_order_stub());
              observable.complete();
            }
          )
        ),
        getDecision: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceDecisionResponse>): void => {
              observable.next(decision_stub());
              observable.complete();
            }
          )
        ),
        getWorkflows: workflows_stub,
        transaction: transaction_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    mock_charges_event.headers[HEADER_NAME] = "123456";
    service.charges(mock_charges_event).subscribe({
      error: done,
      next: (response: object): void => {
        expect(response).to.have.property("ticketNumber");
        done();
      },
    });
  });
});
describe("CardService - Charges wrong", () => {
  let service: ICardService;
  let box: SinonSandbox;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
  });
  beforeEach(async () => {
    await createSchemas();
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  // TODO: SKIP BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  it.skip("charges - wrong no token information", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(undefined)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K008");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  // TODO: EXISTS BECAUSE TUENTI MAKE TOKEN WITH AURUS AND CHARGE BY HERE -.-
  it("charges - wrong no token information, Tuenti success", (done: Mocha.Done) => {
    gAurusResponse.ticket_number = "123";
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();
    const ticket: string = gTransaction.ticket_number;

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(undefined))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .returns(of(gMerchantFetch)),
        put: box.stub().returns(of(true)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "PRUEBA";
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: box.stub().returns(of(gAurusResponse)),
        preAuthorization: box.stub().returns(of(gAurusResponse)),
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: { privateId: "123" },
            })
          )
        ),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        processRecord: box.stub().returns(of(gTransaction)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      complete: done,
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("ticketNumber", ticket);
      },
    });
  });
  it("charges - wrong private merchant id", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(undefined)),
        query: box.stub().returns(of(undefined)),
      })
    );
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of(
            Mock.of<{ body: LambdaTransactionRuleResponse }>({
              body: { privateId: "123" },
            })
          )
        ),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    chargesError(service, mock_charges_event, done);
  });
});
describe("CardService - Deferred", () => {
  let box: SinonSandbox;
  let service: ICardService;
  const merchant_id: string = "42123333";
  const bin_number: string = "123456";
  const test_bank_1: string = "BANCO PICHINCHA, C.A.";
  const test_bank_2: string = "BANCO BOLIVARIANO";
  const test_bank_3: string = "BANCO DE GUAYAQUIL";
  const test_bank_4: string = "BANCO DEL AUSTRO";
  const test_bank_5: string = "BANCO DEL PACIFICO";
  const test_deferred_options: DeferredOption[] = [
    {
      bank: [test_bank_1, test_bank_3],
      deferredType: ["01"],
      months: ["2", "4", "6"],
      monthsOfGrace: ["1", "2"],
    },
    {
      bank: [test_bank_2, test_bank_4],
      deferredType: ["01"],
      months: ["3", "6", "9"],
      monthsOfGrace: ["2", "3", "4"],
    },
    {
      bank: [test_bank_5, test_bank_1],
      deferredType: ["02", "03"],
      months: ["3", "6", "9"],
      monthsOfGrace: ["2", "3", "4"],
    },
    {
      bank: [test_bank_2, test_bank_1],
      deferredType: ["01"],
      months: ["4", "5", "8"],
      monthsOfGrace: ["3"],
    },
  ];
  const bin_fetch_response: DynamoBinFetch = {
    bank: "",
    bin: bin_number,
    brand: "VISA",
    info: {
      type: "credit",
    },
    processor: "NA",
  };
  const bin_fetch_debit_response: DynamoBinFetch = {
    bank: "",
    bin: bin_number,
    brand: "VISA",
    info: {
      type: "DEBIT",
    },
    processor: "NA",
  };
  let merchant_unsorted_ecuadorian_response: DynamoMerchantFetch;
  let merchant_colombian_response: DynamoMerchantFetch;
  let merchant_chilenian_response: DynamoMerchantFetch;
  const processor_fetch_response: DynamoProcessorFetch = {
    merchant_id,
    private_id: "123331",
    processor_name: "",
    processor_type: "traditional",
    public_id: "23444",
    terminal_id: "K69",
  };

  let deferred_event: IAPIGatewayEvent<
    null,
    BinParameters,
    null,
    AuthorizerContext
  >;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { publicId: "123456" } })),
      })
    );
    rollbarInstance(box);
    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          merchantId: merchant_id,
        },
      },
    });
    merchant_unsorted_ecuadorian_response = {
      merchant_id,
      contactPerson: "",
      country: CountryEnum.ECUADOR,
      email: "",
      merchant_name: "Kushki",
      private_id: "333",
      public_id: merchant_id,
      sift_science: {},
    };
    merchant_colombian_response = {
      ...merchant_unsorted_ecuadorian_response,
      country: CountryEnum.COLOMBIA,
    };
    merchant_chilenian_response = {
      ...merchant_unsorted_ecuadorian_response,
      country: CountryEnum.CHILE,
    };
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("when deferred is called with an Ecuadorian bin,it returns deferred conditions", (done: Mocha.Done) => {
    merchant_unsorted_ecuadorian_response.deferredOptions = test_deferred_options;
    merchant_unsorted_ecuadorian_response.country = CountryEnum.ECUADOR;

    const expected_result: IDeferredResponse[] = [
      {
        months: ["2", "4", "5", "6", "8"],
        monthsOfGrace: ["1", "2", "3"],
        name: DeferredNamesEnum[`D01`],
        type: "01",
      },
      {
        months: ["3", "6", "9"],
        monthsOfGrace: ["2", "3", "4"],
        name: DeferredNamesEnum[`D02`],
        type: "02",
      },
      {
        months: ["3", "6", "9"],
        monthsOfGrace: ["2", "3", "4"],
        name: DeferredNamesEnum[`D03`],
        type: "03",
      },
    ];

    bin_fetch_response.bank = test_bank_1;
    processor_fetch_response.processor_name =
      ECUADORIAN_PROCESSORS[
        // tslint:disable-next-line
        Math.floor(Math.random() * ECUADORIAN_PROCESSORS.length)
      ];

    const spy: SinonSpy = box.spy();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_response))
          .onSecondCall()
          .returns(of(merchant_unsorted_ecuadorian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith(expected_result);
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("When deferred is called with an Ecuadorian bin, it returns months with numerical order", (done: Mocha.Done) => {
    const bank: string = test_bank_1;

    merchant_unsorted_ecuadorian_response.deferredOptions = [
      {
        bank: [bank, test_bank_3],
        deferredType: ["01"],
        months: ["6", "4", "2"],
        monthsOfGrace: ["1", "2"],
      },
      {
        bank: [test_bank_2, test_bank_4],
        deferredType: ["01"],
        months: ["3", "6", "9"],
        monthsOfGrace: ["4", "3", "2"],
      },
      {
        bank: [test_bank_5, bank],
        deferredType: ["02", "03"],
        months: ["3", "6", "9"],
        monthsOfGrace: ["2", "4", "3"],
      },
      {
        bank: [test_bank_2, bank],
        deferredType: ["01"],
        months: ["4", "5", "8"],
        monthsOfGrace: ["3"],
      },
    ];

    bin_fetch_response.bank = bank;
    processor_fetch_response.processor_name = ECUADORIAN_PROCESSORS[0];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_response))
          .onSecondCall()
          .returns(of(merchant_unsorted_ecuadorian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (data: object): void => {
        const months_key: string = "months";
        const months_of_grace: string = "monthsOfGrace";

        expect(data).to.not.be.undefined;
        expect(data[0][months_key]).to.be.eql(["2", "4", "5", "6", "8"]);
        expect(data[0][months_of_grace]).to.be.eql(["1", "2", "3"]);
        expect(data[1][months_key]).to.be.eql(["3", "6", "9"]);
        expect(data[1][months_of_grace]).to.be.eql(["2", "4", "3"]);
        expect(data[2][months_key]).to.be.eql(["3", "6", "9"]);
        expect(data[2][months_of_grace]).to.be.eql(["2", "4", "3"]);
        done();
      },
    });
  });

  it("When deferred is called with an Ecuadorian bin, but bin type is DEBIT it will return an empty defferred array", (done: Mocha.Done) => {
    const bank: string = test_bank_1;

    merchant_unsorted_ecuadorian_response.deferredOptions = [
      {
        bank: [bank, test_bank_3],
        deferredType: ["01"],
        months: ["6", "4", "2"],
        monthsOfGrace: ["1", "2"],
      },
      {
        bank: [test_bank_2, test_bank_4],
        deferredType: ["01"],
        months: ["3", "6", "9"],
        monthsOfGrace: ["4", "3", "2"],
      },
      {
        bank: [test_bank_5, bank],
        deferredType: ["02", "03"],
        months: ["3", "6", "9"],
        monthsOfGrace: ["2", "4", "3"],
      },
      {
        bank: [test_bank_2, bank],
        deferredType: ["01"],
        months: ["4", "5", "8"],
        monthsOfGrace: ["3"],
      },
    ];

    bin_fetch_response.bank = bank;
    processor_fetch_response.processor_name = ECUADORIAN_PROCESSORS[0];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_debit_response))
          .onSecondCall()
          .returns(of(merchant_unsorted_ecuadorian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (data: object): void => {
        expect(data).to.be.empty;
        done();
      },
    });
  });

  it("When deferred is called with a Mexican bin, it returns months with numerical order", (done: Mocha.Done) => {
    const merchant_mexican_response: DynamoMerchantFetch = {
      ...merchant_unsorted_ecuadorian_response,
      country: CountryEnum.MEXICO,
    };
    const bin_fetch_mexican_response: DynamoBinFetch = {
      bank: "",
      bin: bin_number,
      brand: "VISA",
      info: {
        type: "credit",
      },
      processor: "NA",
    };

    merchant_mexican_response.deferredOptions = [
      {
        bins: ["123456"],
        deferredType: ["01"],
        months: ["3", "6", "9", "12"],
        monthsOfGrace: [],
      },
      {
        bins: ["222222"],
        deferredType: ["02"],
        months: ["3", "6", "9"],
        monthsOfGrace: [],
      },
    ];

    processor_fetch_response.processor_name = "Elavon Processor";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_mexican_response))
          .onSecondCall()
          .returns(of(merchant_mexican_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (data: object): void => {
        const months_key: string = "months";

        expect(data).to.not.be.undefined;
        expect(data[0][months_key]).to.be.eql(["3", "6", "9", "12"]);
        done();
      },
    });
  });

  it("When deferred is called with a Mexican bin but cannot defer, it returns an empty array", (done: Mocha.Done) => {
    const merchant_mexican_response: DynamoMerchantFetch = {
      ...merchant_unsorted_ecuadorian_response,
      country: CountryEnum.MEXICO,
    };
    const bin_fetch_mexican_response: DynamoBinFetch = {
      bank: "",
      bin: bin_number,
      brand: "VISA",
      info: {
        type: "debit",
      },
      processor: "NA",
    };

    merchant_mexican_response.deferredOptions = [
      {
        bins: ["222222"],
        deferredType: ["05"],
        months: ["3", "6", "9", "12"],
        monthsOfGrace: [],
      },
    ];

    processor_fetch_response.processor_name = "Elavon Processor";

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_mexican_response))
          .onSecondCall()
          .returns(of(merchant_mexican_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      next: (data: object): void => {
        expect(data).to.not.be.undefined;
        done();
      },
    });
  });

  it("When deferred is called with a Colombian bin , it returns deferred conditions", (done: Mocha.Done) => {
    processor_fetch_response.processor_name =
      COLOMBIAN_PROCESSORS[
        // tslint:disable-next-line
        Math.floor(Math.random() * COLOMBIAN_PROCESSORS.length)
      ];
    deferred_event = { ...deferred_event };

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_response))
          .onSecondCall()
          .returns(of(merchant_colombian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    const spy: SinonSpy = box.spy();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith(CardService.sColombianChileanDeferredOptions);
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("When deferred is called with a Chilean bin , it returns deferred conditions", (done: Mocha.Done) => {
    processor_fetch_response.processor_name =
      COLOMBIAN_PROCESSORS[
        // tslint:disable-next-line
        Math.floor(Math.random() * COLOMBIAN_PROCESSORS.length)
      ];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_response))
          .onSecondCall()
          .returns(of(merchant_chilenian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      error: done,
      next: (response: object): void => {
        expect(response).to.eql(CardService.sColombianChileanDeferredOptions);
        done();
      },
    });
  });

  it("should get an empty object - dynamo undefined objects", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(undefined)),
        query: box.stub().returns(of([])),
      })
    );
    const spy: SinonSpy = box.spy();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith([]);
        done();
      },
      error: done,
      next: spy,
    });
  });

  it("should get an empty object - without DeferredOption in Ecuadorian Merchant", (done: Mocha.Done) => {
    delete merchant_unsorted_ecuadorian_response.deferredOptions;
    merchant_unsorted_ecuadorian_response.country = CountryEnum.ECUADOR;
    processor_fetch_response.processor_name =
      ECUADORIAN_PROCESSORS[
        // tslint:disable-next-line
        Math.floor(Math.random() * ECUADORIAN_PROCESSORS.length)
      ];
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(bin_fetch_response))
          .onSecondCall()
          .returns(of(merchant_unsorted_ecuadorian_response)),
        query: box.stub().returns(of([processor_fetch_response])),
      })
    );
    const spy: SinonSpy = box.spy();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.deferred(deferred_event).subscribe({
      complete: (): void => {
        expect(spy).calledWith([]);
        done();
      },
      error: done,
      next: spy,
    });
  });
});
describe("CardService - BinInfo", () => {
  let box: SinonSandbox;
  let service: ICardService;
  let processor: DynamoProcessorFetch;
  const merchant_id: string = "42123333";
  const bin_number: string = "234363";
  const bin_fetch_response: DynamoBinFetch = {
    bank: "bb",
    bin: bin_number,
    brand: "VISA",
    info: {
      type: "credit",
    },
    processor: "NA",
  };
  let deferred_event: IAPIGatewayEvent<
    null,
    BinParameters,
    null,
    AuthorizerContext
  >;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(CORE.LambdaGateway);
    CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box
          .stub()
          .returns(of({ body: { publicId: "123456" } })),
      })
    );
    deferred_event = Mock.of<
      IAPIGatewayEvent<null, BinParameters, null, AuthorizerContext>
    >({
      headers: { [HEADER]: merchant_id },
      pathParameters: { binNumber: bin_number },
      requestContext: {
        authorizer: {
          merchantId: merchant_id,
        },
      },
    });
    processor = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Del Pacifico",
      public_id: "323",
    });
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  function bindDynamoGateway(
    queryCall?: DynamoProcessorFetch[],
    firstCall?: DynamoBinFetch,
    secondCall?: DynamoBinFetch
  ): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(firstCall))
          .onSecondCall()
          .returns(of(secondCall)),
        put: box.stub().returns(of(true)),
        query: box.stub().returns(of(queryCall)),
      })
    );
  }

  it("get BinInfo from card private in Ecuador Commerce", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "ALIA";
    bin_fetch_response.info = { type: null };

    bindDynamoGateway([processor], bin_fetch_response);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.eql({
          bank: "bb",
          brand: "alia",
          cardType: "credit",
        });
        done();
      },
    });
  });
  it("get BinInfo with a private card not found", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "visa";

    bindDynamoGateway([processor], undefined, bin_fetch_response);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("brand");
        done();
      },
    });
  });
  it("get BinInfo from regular card in Ecuador Commerce", (done: Mocha.Done) => {
    processor.plcc = true;
    bin_fetch_response.brand = "MASTERCARD";
    bindDynamoGateway([processor], bin_fetch_response);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("cardType");
        done();
      },
    });
  });

  it("get BinInfo from regular card in Ecuador Commerce with processor don't support private cards", (done: Mocha.Done) => {
    bin_fetch_response.brand = "VISA";

    bindDynamoGateway([processor], bin_fetch_response);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response).to.haveOwnProperty("brand");
        done();
      },
    });
  });

  it("get BinInfo from card private in Ecuador Commerce without Processor Info ", (done: Mocha.Done) => {
    bindDynamoGateway([]);

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K003");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("get BinInfo from card without BinInfo in dynamo ", (done: Mocha.Done) => {
    bindDynamoGateway([processor]);
    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(
      of({
        brand: BRAND,
        country: {
          alpha2: "CA",
          currency: "CAD",
          emoji: "🇨🇦",
          latitude: 60,
          longitude: -95,
          name: "Canada",
          numeric: "124",
        },
        number: {},
        scheme: "mastercard",
        type: "credit",
      })
    );

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response.bank).to.eql("");
        done();
      },
    });
  });

  it("get BinInfo from card without BinInfo in api ", (done: Mocha.Done) => {
    processor.plcc = false;
    bindDynamoGateway([processor]);

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response.bank).to.eql("");
        done();
      },
    });
  });

  it("get BinInfo from card without BinInfo in api ", (done: Mocha.Done) => {
    processor.plcc = true;
    bindDynamoGateway([processor]);

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response.bank).to.eql("");
        done();
      },
    });
  });

  it("get BinInfo from card without BinInfo in api with bank ", (done: Mocha.Done) => {
    bindDynamoGateway([processor]);

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(
      of({
        bank: {
          name: "test bank",
        },
        brand: BRAND,
        country: {
          alpha2: "CA",
          currency: "CAD",
          emoji: "🇨🇦",
          latitude: 60,
          longitude: -95,
          name: "Canada",
          numeric: "124",
        },
        number: {},
        scheme: "mastercard",
        type: "credit",
      })
    );

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.binInfo(deferred_event).subscribe({
      next: (response: BinInfo): void => {
        expect(response.bank).to.eql("test bank");
        done();
      },
    });
  });
});
describe("CardService - Charges Error", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let card_stub: SinonStub;
  let lambda_stub: SinonStub;
  let put: SinonStub;
  let process_stub: SinonStub;
  let aurus_error: AurusError;

  beforeEach(async () => {
    await createSchemas();
    box = createSandbox();
    CONTAINER.snapshot();
    rollbarInstance(box);
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    put = box.stub().returns(of(true));
    sandboxInit(box);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 129,
                binInfo: {
                  bank: "Bolivariano",
                  bin: "123456",
                  brand: "MASTERCARD",
                  processor: "Credimatic",
                },
              })
            )
          )
          .onThirdCall()
          .returns(of(gMerchantFetch))
          .returns(of(gMerchantFetch)),
      })
    );
    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    gChargesResponse.approvalCode = "GENERICO";
    card_stub = box.stub().returns(of(gAurusResponse));
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        chargesTransaction: card_stub,
        preAuthorization: card_stub,
      })
    );
    aurus_error = new AurusError("228", "Procesador inalcanzable", {
      approvalCode: "000000",
      binCard: "450724",
      cardHolderName: "Juan Perez",
      cardType: "VISA",
      isDeferred: "N",
      lastFourDigitsOfCard: "3249",
      merchantName: "",
      processorBankName: "",
      processorName: ECUADORIAN_PROCESSORS[0],
    });

    CONTAINER.unbind(CORE.LambdaGateway);
    lambda_stub = box.stub().returns(
      of(
        Mock.of<{ body: LambdaTransactionRuleResponse }>({
          body: { privateId: "123", publicId: "123343", plcc: "0" },
        })
      )
    );
    CONTAINER.bind<ILambdaGateway>(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: lambda_stub,
      })
    );
    process_stub = box.stub().returns(of(gTransaction));
    CONTAINER.unbind(IDENTIFIERS.TransactionService);
    CONTAINER.bind<ITransactionService>(
      IDENTIFIERS.TransactionService
    ).toConstantValue(
      Mock.of<ITransactionService>({
        processRecord: process_stub,
      })
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("charges - AurusError CardService with fullResponse", (done: Mocha.Done) => {
    card_stub.throws(aurus_error);
    process.env.USRV_STAGE = "uat";

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(true)).subscribe({
      error: (error: AurusError): void => {
        expect(error.code).to.be.eql("228");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - AurusError PreAuthorization with fullResponse", (done: Mocha.Done) => {
    card_stub.throws(aurus_error);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.preAuthorization(chargesEvent(true)).subscribe({
      error: (error: AurusError): void => {
        expect(error.code).to.be.eql("228");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - AurusPay Error ", (done: Mocha.Done) => {
    const aurus_pay_error: AurusError = new AurusError(
      "228",
      "Procesador inalcanzable",
      {
        approved_amount: "",
        recap: "0001",
        response_code: "238",
        response_text: "Transacción anulada",
        ticket_number: "",
        transaction_details: {
          approvalCode: "",
          binCard: "",
          cardHolderName: "",
          cardType: "VISA",
          isDeferred: "N",
          lastFourDigitsOfCard: "",
          merchantName: "Kushki Staging test Account",
          processorBankName: "0032~BANCO INTERNACIONAL",
          processorName: ECUADORIAN_PROCESSORS[0],
        },
        transaction_id: "295182854295577817",
      }
    );

    card_stub.throws(aurus_pay_error);
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      error: (error: AurusError): void => {
        expect(error.code).to.be.eql(aurus_pay_error.code);
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("When charges is called, but Aurus Error 322 is thrown , it returns an error K322", (done: Mocha.Done) => {
    const expected_error_code: string = "322";
    const response_text_key: string = "response_text";

    card_stub.throws(new AurusError("322", "Error", { qwerty: "lorem" }));
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(true)).subscribe({
      error: (error: KushkiError): void => {
        expect(error.getMessage()).to.eql(ERRORS.E322.message);
        expect(error.getStatusCode()).to.eql(ERRORS.E322.statusCode);
        expect(error.code).to.be.eql(expected_error_code);
        expect(error.getMetadata()[response_text_key]).to.not.eql(
          error.getMessage()
        );
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("when charges is called with empty current token and has an aurus error, it returns an error ", (done: Mocha.Done) => {
    card_stub.throws(new AurusError("322", "Error", { qwerty: "lorem" }));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: box.stub().returns(of(undefined)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.charges(chargesEvent(true)).subscribe({
      error: (error: object): void => {
        expect(error).to.not.be.undefined;
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - KushkiError in  lambda  with fullResponse   ", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    lambda_stub.throws(new KushkiError(ERRORS.E003));
    mock_charges_event.body.fullResponse = true;

    mock_charges_event.body.binInfo = {
      bank: "Pichincha",
      brand: "VISA",
      processor: "CREDIMATIC",
    };
    mock_charges_event.body.months = 1;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K003");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it.skip("charges - KushkiError in generate Token with full response  ", (done: Mocha.Done) => {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .throws(new KushkiError(ERRORS.E001)),
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent()).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K001");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - Error put into Dynamo with fullResponse", (done: Mocha.Done) => {
    put.throws(new KushkiError(ERRORS.E001));
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(chargesEvent(true)).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K001");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - KushkiError in  lambda  with information    ", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    lambda_stub.throws(new KushkiError(ERRORS.E003));
    mock_charges_event.body.fullResponse = true;
    mock_charges_event.body.months = 0;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K003");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("charges - KushkiError in  lambda  without information    ", (done: Mocha.Done) => {
    const mock_charges_event: IAPIGatewayEvent<
      ChargesCardRequest,
      null,
      null,
      AuthorizerContext
    > = chargesEvent();

    delete gMerchantFetch.merchant_name;
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(
            of(
              Mock.of<TokenDynamo>({
                amount: 112,
                binInfo: {
                  bank: "Bolivariano",
                  bin: "123456",
                  brand: "MASTERCARD",
                  processor: "Credimatic",
                },
              })
            )
          ),
      })
    );

    lambda_stub.throws(new KushkiError(ERRORS.E003));
    mock_charges_event.body.fullResponse = true;
    mock_charges_event.body.months = 0;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.charges(mock_charges_event).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K003");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
});
describe("CardService - Capture", () => {
  let service: ICardService;
  let box: SinonSandbox;
  let put: SinonStub;
  let capture_stub: SinonStub;

  function captureEvent(
    amount?: object
  ): IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext> {
    const event = Mock.of<
      IAPIGatewayEvent<CaptureCardRequest, null, null, AuthorizerContext>
    >({
      body: {
        ...gCaptureRequest,
        amount,
      },
      headers: {},
      requestContext: Mock.of<IRequestContext<AuthorizerContext>>({
        authorizer: {
          merchantId: "123",
        },
      }),
    });

    event.headers[HEADER_NAME] = "123455799754313";

    return event;
  }

  function validateCapture(
    data: object,
    ticketNumber: string,
    captureStub: SinonStub,
    done: Mocha.Done
  ): void {
    expect(data).to.have.property("ticketNumber", ticketNumber);
    expect(captureStub).to.be.calledOnce;
    done();
  }

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.bind(IDENTIFIERS.SandboxGateway).toConstantValue(
      Mock.of<ISandboxGateway>({
        chargesTransaction: box.stub().returns({}),
        tokensTransaction: box.stub().returns({}),
      })
    );
    rollbarInstance(box);
    sandboxInit(box);
    lambdaGateway(box);
    await createSchemas();
    lambdaStubTransactionRule(box);
    capture_stub = mockCaptureTransaction();
  });

  function mockDynamo(): void {
    put = box.stub().returns(of(true));
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch))
          .onSecondCall()
          .returns(of(gTokenDynamo))
          .onThirdCall()
          .returns(of(gProcessorFetch))
          .onCall(3)
          .returns(of(gBinFetch)),
        query: box.stub().returns(of([gTransaction])),
      })
    );
  }

  function mockCaptureTransaction(): SinonStub {
    const response_stub = box.stub().returns(of(gAurusResponse));

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: response_stub,
      })
    );

    return response_stub;
  }

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("works with the correct ticket number without an amount", (done: Mocha.Done) => {
    const ticket_number = "1234567989";
    const capture_event = captureEvent();

    delete capture_event.body.amount;
    delete capture_event.body.fullResponse;

    gTransaction.approved_transaction_amount = 100;

    gProcessorFetch.acquirer_bank = "BP";

    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event).subscribe({
      error: done,
      next: (data: object): void =>
        validateCapture(data, ticket_number, capture_stub, done),
    });
  });

  it("works with the correct ticket number and a correct amount", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    delete gProcessorFetch.acquirer_bank;

    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 0.2,
            iac: 0.2,
            propina: 0.1,
            tasaAeroportuaria: 0.5,
          },
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        })
      )
      .subscribe({
        error: done,
        next: (data: object): void =>
          validateCapture(data, ticket_number, capture_stub, done),
      });
  });

  it("when capture is called with no extraTaxes, it will validate the capture", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gTransaction.approved_transaction_amount = 10;
    delete gProcessorFetch.acquirer_bank;

    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {},
          ice: 0.1,
          iva: 5,
          subtotalIva: 5,
          subtotalIva0: 0,
        })
      )
      .subscribe({
        error: done,
        next: (data: object): void =>
          validateCapture(data, ticket_number, capture_stub, done),
      });
  });

  it("responds with a fullResponse", (done: Mocha.Done) => {
    const ticket_number = "1234567989";
    const capture_event = captureEvent();

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box
      .stub()
      .returns(of(gBinInfoResponse));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    capture_event.body.fullResponse = true;

    gTransaction.approved_transaction_amount = 100;
    mockDynamo();

    gAurusResponse.ticket_number = ticket_number;
    gAurusResponse.transaction_id = "laboreipsum";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("ticketNumber", ticket_number);
        expect(data)
          .to.have.property("details")
          .and.have.property("binInfo");
        expect(data)
          .to.have.property("details")
          .and.have.property("transactionId", gAurusResponse.transaction_id);
        done();
      },
    });
  });

  it("responds with fullResponse when processor acquirer bank isn't undefined", (done: Mocha.Done) => {
    const ticket_number = "1234567989";
    const capture_event = captureEvent();

    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
    const get_bin_info_stub: SinonStub = box.stub().returns(of(undefined));

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: get_bin_info_stub,
      })
    );

    capture_event.body.fullResponse = true;

    gTransaction.approved_transaction_amount = 100;
    gProcessorFetch.acquirer_bank = "Banco Pacifico";
    gProcessorFetch.private_id = "34345";
    gProcessorFetch.public_id = "123123";
    mockDynamo();
    gAurusResponse.transaction_details = {
      approvalCode: "111111",
      binCard: "424242",
      cardHolderName: "Jhon Doe",
      cardType: "VISA",
      isDeferred: "N",
      lastFourDigitsOfCard: "4242",
      merchantName: "merchantName",
      processorBankName: "",
      processorName: "Transbank Processor",
    };

    gAurusResponse.ticket_number = ticket_number;

    const response_stub = box.stub().returns(of(gAurusResponse));

    CONTAINER.unbind(IDENTIFIERS.CardGateway);
    CONTAINER.bind(IDENTIFIERS.CardGateway).toConstantValue(
      Mock.of<ICardGateway>({
        captureTransaction: response_stub,
      })
    );
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event).subscribe({
      error: done,
      next: (data: object): void => {
        expect(data).to.have.property("ticketNumber", ticket_number);
        expect(data)
          .to.have.property("details")
          .and.have.property("acquirerBank", gProcessorFetch.acquirer_bank);
        done();
      },
    });
  });

  it("responds with fullResponse when processor acquirer bank is undefined", (done: Mocha.Done) => {
    const capture_event = captureEvent();

    CONTAINER.rebind(IDENTIFIERS.BinInfoGateway).toConstantValue(
      Mock.of<IBinInfoGateway>({
        getBinInfo: box.stub().returns(of(undefined)),
      })
    );

    capture_event.body.fullResponse = true;

    gProcessorFetch.acquirer_bank = undefined;
    mockDynamo();

    gAurusResponse.ticket_number = "1234567989";
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(capture_event).subscribe({
      next: (data: object): void => {
        expect(data).to.not.have.property("acquirerBank");
        done();
      },
    });
  });

  it("throws error on no transaction found", (done: Mocha.Done) => {
    mockDynamo();

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put,
        getItem: box
          .stub()
          .onFirstCall()
          .returns(of(gMerchantFetch)),
        query: box.stub().returns(of([])),
      })
    );

    service = CONTAINER.get(IDENTIFIERS.CardService);

    service.capture(captureEvent()).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K004");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("throws error on aurus 322 error", (done: Mocha.Done) => {
    gTransaction.approved_transaction_amount = 100;
    mockDynamo();

    capture_stub.throws(new AurusError("322", "Error", { qwerty: "lorem" }));
    service = CONTAINER.get(IDENTIFIERS.CardService);
    service.capture(captureEvent()).subscribe({
      error: (error: KushkiError): void => {
        expect(error.getMessage()).to.eql(ERRORS.E322.message);
        expect(error.getStatusCode()).to.eql(ERRORS.E322.statusCode);
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });

  it("throws error on superior amount above 20% of initial approved amount", (done: Mocha.Done) => {
    gTransaction.approved_transaction_amount = 200;
    mockDynamo();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          extraTaxes: {
            agenciaDeViaje: 1,
            iac: 1,
            propina: 1,
            tasaAeroportuaria: 1,
          },
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 237,
        })
      )
      .subscribe({
        error: (error: KushkiError): void => {
          expect(error.getMessage()).to.eql(ERRORS.E012.message);
          expect(error.getStatusCode()).to.eql(ERRORS.E012.statusCode);
          done();
        },
        next: (): void => {
          done(UNREACHABLE);
        },
      });
  });

  it("works on on superior amount below or equal to 20% of initial approved amount", (done: Mocha.Done) => {
    const ticket_number = "1234567989";

    gAurusResponse.ticket_number = ticket_number;

    gTransaction.approved_transaction_amount = 200;
    mockDynamo();

    service = CONTAINER.get(IDENTIFIERS.CardService);
    service
      .capture(
        captureEvent({
          currency: "CLP",
          iva: 0,
          subtotalIva: 0,
          subtotalIva0: 200,
        })
      )
      .subscribe({
        error: done,
        next: (data: object): void =>
          validateCapture(data, ticket_number, capture_stub, done),
      });
  });
});
