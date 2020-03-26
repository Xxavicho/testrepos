/**
 * Sandbox Aurus Service Unit Tests
 */
import { AurusError, IDENTIFIERS as CORE, ILambdaGateway } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ICardGateway } from "repository/ICardGateway";
import { ISandboxGateway } from "repository/ISandboxGateway";
import * as Rollbar from "rollbar";
import { of } from "rxjs";
import { createSandbox, SinonSandbox } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AurusTokensResponse } from "types/aurus_tokens_response";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { CardToken } from "types/tokens_card_request";
import { TokensCardResponse } from "types/tokens_card_response";

use(sinonChai);
const TOKEN: string = "token";
const MID: string = "1291219939131";
const TRX_REF = "1234-455559-tutu6";
let gChargesAurusResponse: AurusResponse;
let gChargesRequest: ChargesCardRequest;
let gTokensRequest: CardToken;
let gTokensAurusResponse: AurusTokensResponse;
let gToken: DynamoTokenFetch;

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
}

function mockGateways(response: object, box: SinonSandbox): void {
  CONTAINER.unbind(CORE.LambdaGateway);
  CONTAINER.bind(CORE.LambdaGateway).toConstantValue(
    Mock.of<ILambdaGateway>({
      invokeFunction: box.stub().returns(
        of({
          body: {
            ...response,
          },
        })
      ),
    })
  );
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
}

function setBeforeEach(): {
  box: SinonSandbox;
  gateway: ISandboxGateway;
} {
  const box: SinonSandbox = createSandbox();

  CONTAINER.bind(CORE.RollbarInstance).toConstantValue(
    Mock.of<Rollbar>({
      warn: box.stub(),
    })
  );

  const gateway: ISandboxGateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);

  process.env.AURUS_URL = "https://aurusinc.com";

  return { box, gateway };
}

function requestTokensSuccess(
  gateway: ISandboxGateway,
  done: Mocha.Done
): void {
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
  gateway: ISandboxGateway,
  done: Mocha.Done,
  trxReference: string,
  tokenInfo: DynamoTokenFetch
): void {
  gateway
    .chargesTransaction(gChargesRequest, MID, trxReference, "", tokenInfo)
    .subscribe({
      next: (data: AurusResponse): void => {
        expect(data).to.be.a("object");
        expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
        done();
      },
    });
}

describe("Sandbox Gateway - Token , Charge , PreAuthorization ", () => {
  let gateway: ISandboxGateway;
  let box: SinonSandbox;

  beforeEach(async () => {
    CONTAINER.snapshot();
    CONTAINER.bind(CORE.LambdaContext).toConstantValue({});
    process.env.IVA_EC = "0.12";
    process.env.IVA_CO = "0.19";
    process.env.IVA_PE = "0.18";
    await createSchemas();
    const ret: {
      box: SinonSandbox;
      gateway: ISandboxGateway;
    } = setBeforeEach();

    gToken.cardHolderName = "Pepe Toro";
    box = ret.box;
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test charge request  without iva in amount - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 0;
    gChargesRequest.amount.subtotalIva = 30;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe Toro";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request  without iva in amount  and transaction reference - COP request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "COP";
    gToken.cardHolderName = "Pepe";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, "23424", gToken);
  });

  it("test charge request  without transaction reference - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.ice = 1;
    gChargesRequest.amount.subtotalIva = 10;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Juan Test Topo";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    delete gToken.cardHolderName;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request  without cardHolderName complete name - PEN request success", (done: Mocha.Done) => {
    gChargesRequest.amount.iva = 1;
    gChargesRequest.amount.currency = "PEN";
    gToken.cardHolderName = "Indigo Merced Smith Doe";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });

  it("test charge request ec with metadata, ice and deferred - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = { metadata: "metadata" };
    gChargesRequest.months = 1;
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = 1.12;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 3 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "002",
      graceMonths: "01",
      months: 3,
    };

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec with grace months and credit type with 2 digits - success", (done: Mocha.Done) => {
    gChargesRequest.deferred = {
      creditType: "02",
      graceMonths: "01",
      months: 3,
    };
    gChargesRequest.amount.currency = "USD";
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request ec w/o metadata & w/o ice & w/o months - success", (done: Mocha.Done) => {
    gChargesRequest.metadata = undefined;
    gChargesRequest.months = undefined;
    gChargesRequest.amount.currency = "USD";
    gChargesRequest.amount.ice = undefined;
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request undefined currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = undefined;
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request with PEN currency - success", (done: Mocha.Done) => {
    gChargesRequest.amount.currency = "PEN";
    gChargesRequest.amount.iva = 0;

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co w/o extraTaxes & w/o months & w/o metadata - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = undefined;
    gChargesRequest.metadata = undefined;
    gChargesRequest.months = undefined;
    gChargesRequest.amount.currency = "COP";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test charge request co with extraTaxes & with months & with metadata - success", (done: Mocha.Done) => {
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
    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .chargesTransaction(gChargesRequest, MID, TRX_REF, "", gToken)
      .subscribe({
        next: (data: AurusResponse): void => {
          expect(data).to.be.a("object");
          expect(data.hasOwnProperty("ticket_number")).to.be.eql(true);
          expect(data.hasOwnProperty("transaction_reference")).to.be.eql(true);
          done();
        },
      });
  });
  it("test charge request co with extraTaxes empty object - success", (done: Mocha.Done) => {
    gChargesRequest.amount.extraTaxes = {};
    gChargesRequest.amount.currency = "COP";

    mockGateways(gChargesAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    chargesSuccess(gateway, done, TRX_REF, gToken);
  });
  it("test tokens request - success", (done: Mocha.Done) => {
    gTokensRequest.currency = undefined;
    gTokensRequest.isDeferred = true;
    gTokensRequest.card.cvv = "123";
    gTokensRequest.card.expiryMonth = "2";

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
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
  it("test tokens request - success without cvv and not transaction token type", (done: Mocha.Done) => {
    gTokensRequest.currency = "USD";
    delete gTokensRequest.card.cvv;
    gTokensRequest.isDeferred = undefined;
    gTokensRequest.card.expiryMonth = "11";

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    requestTokensSuccess(gateway, done);
  });
  it("test tokens request with Transbank as processor UF - success", (done: Mocha.Done) => {
    gTokensRequest.currency = "UF";

    gTokensRequest.isDeferred = false;

    mockGateways(gTokensAurusResponse, box);

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
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

  it("test error in token", (done: Mocha.Done) => {
    gTokensRequest.currency = "UF";

    mockGateways(gTokensAurusResponse, box);

    CONTAINER.rebind(CORE.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: box.stub().returns(
          of({
            body: {
              response_code: "017",
              response_text: "Tarjeta no válida",
              transaction_token: "",
              transaction_token_validity: "1800000",
            },
          })
        ),
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.SandboxGateway);
    gateway
      .tokensTransaction(
        gTokensRequest,
        "10000",
        "transaction",
        "Transbank Processor",
        "ipsum"
      )
      .subscribe({
        error: (error: AurusError): void => {
          expect(error.message).to.be.eq("AURUS017 - Tarjeta no válida");
          expect(error.code).to.be.eq("017");
          done();
        },
      });
  });
});
