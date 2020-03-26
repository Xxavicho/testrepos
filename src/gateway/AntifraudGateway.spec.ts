/**
 * AntifraudGateway Unit Tests
 */
import { KushkiError } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { RequestCallback, UriOptions, UrlOptions } from "request";
import * as rp from "request-promise";
import { throwError } from "rxjs";
import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SiftScienceCreateOrderResponse } from "types/sift_science_create_order_response";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";

use(sinonChai);
const UNREACHABLE: string = "this line must be unreachable";
let gSiftScienceWorkflowsResponse: SiftScienceWorkflowsResponse;
let gSiftScienceCreateOrderResponse: SiftScienceCreateOrderResponse;
let gTokenInfo: Required<DynamoTokenFetch>;
let gMerchantInfo: DynamoMerchantFetch;
let gSiftScienceDecisionResponse: SiftScienceDecisionResponse;

async function createSchemas(): Promise<void> {
  gSiftScienceDecisionResponse = Mock.of<SiftScienceDecisionResponse>({});
  gSiftScienceWorkflowsResponse = Mock.of<SiftScienceWorkflowsResponse>({
    error_message: "error",
    request: "req",
    status: 122,
    time: 22222,
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
  gTokenInfo = Mock.of<Required<DynamoTokenFetch>>({});
  gMerchantInfo = Mock.of<DynamoMerchantFetch>({
    contactPerson: "person",
    email: "mail",
    merchant_name: "name",
    private_id: "pid",
    public_id: "id",
    sift_science: {
      ProdAccountId: "pai",
      ProdApiKey: "pak",
      SandboxAccountId: "sai",
      SandboxApiKey: "apk",
      SiftScore: 22,
    },
  });
}

function setBeforeEach(): {
  box: SinonSandbox;
  rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
  rpg: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
  gateway: IAntifraudGateway;
} {
  const box: SinonSandbox = createSandbox();
  const rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]> = box.stub(
    rp,
    "post"
  );
  const rpg: SinonStub<[UriOptions | UrlOptions, RequestCallback?]> = box.stub(
    rp,
    "get"
  );
  const gateway: IAntifraudGateway = CONTAINER.get(
    IDENTIFIERS.AntifraudGateway
  );

  process.env.SIFT_SCIENCE_API = "https://siftScience.com";

  return { box, rps, rpg, gateway };
}

function createOrderSuccess(
  gateway: IAntifraudGateway,
  done: Mocha.Done
): void {
  gateway.createOrder(gMerchantInfo, gTokenInfo).subscribe({
    next: (data: SiftScienceCreateOrderResponse): void => {
      expect(data).to.be.a("object");
      expect(data.hasOwnProperty("status")).to.be.eql(true);
      done();
    },
  });
}

function decisionSuccess(gateway: IAntifraudGateway, done: Mocha.Done): void {
  gateway.getDecision(gMerchantInfo, "decisionIdString").subscribe({
    next: (data: SiftScienceDecisionResponse): void => {
      expect(data).to.be.a("object");
      expect(data.hasOwnProperty("id")).to.exist;
      done();
    },
  });
}

function getWorkflowsSuccess(
  gateway: IAntifraudGateway,
  done: Mocha.Done
): void {
  gateway.getWorkflows(gMerchantInfo, gTokenInfo).subscribe({
    next: (data: SiftScienceWorkflowsResponse): void => {
      expect(data).to.be.a("object");
      expect(data.hasOwnProperty("status")).to.be.eql(true);
      expect(data.hasOwnProperty("time")).to.be.eql(true);
      done();
    },
  });
}

describe("Antifraud Gateway - ", () => {
  let gateway: IAntifraudGateway;
  let box: SinonSandbox;
  let rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
  let rpg: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;

  beforeEach(async () => {
    await createSchemas();
    const ret: {
      box: SinonSandbox;
      rps: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
      rpg: SinonStub<[UriOptions | UrlOptions, RequestCallback?]>;
      gateway: IAntifraudGateway;
    } = setBeforeEach();

    box = ret.box;
    rps = ret.rps;
    rpg = ret.rpg;
    gateway = ret.gateway;
  });
  afterEach(() => {
    box.restore();
  });
  it("test siftScience transaction with no answer - success", (done: Mocha.Done) => {
    rps.returns(Promise.resolve(gSiftScienceWorkflowsResponse));
    gateway.transaction(gMerchantInfo, gTokenInfo).subscribe({
      next: (): void => {
        expect(rps).to.be.calledOnce;
        done();
      },
    });
  });
  it("test siftScience transaction with error - success", (done: Mocha.Done) => {
    rps.returns(Promise.reject(throwError("")));
    gateway.transaction(gMerchantInfo, gTokenInfo).subscribe({
      next: (): void => {
        expect(rps).to.be.calledOnce;
        done();
      },
    });
  });
  it("test siftScience getWorkflows with no active workflows - success", (done: Mocha.Done) => {
    process.env.SIFT_SCIENCE_API_KEY = undefined;
    delete gSiftScienceWorkflowsResponse.score_response;
    rps.returns(Promise.resolve(gSiftScienceWorkflowsResponse));
    getWorkflowsSuccess(gateway, done);
  });

  it("test siftScience getWorkflows with error in request - success", (done: Mocha.Done) => {
    process.env.SIFT_SCIENCE_API_KEY = undefined;
    delete gSiftScienceWorkflowsResponse.score_response;
    rps.throwsException(new Error("Error SiftScience"));

    gateway.getWorkflows(gMerchantInfo, gTokenInfo).subscribe({
      next: (data: SiftScienceWorkflowsResponse): void => {
        expect(data.hasOwnProperty("status")).to.be.eql(true);
        done();
      },
    });
  });

  it("test siftScience getWorkflows with serverSide error, statusCode 200 - success with generic answer", (done: Mocha.Done) => {
    process.env.SIFT_SCIENCE_API_KEY = undefined;
    delete gSiftScienceWorkflowsResponse.score_response;
    rps.returns(Promise.resolve(gSiftScienceWorkflowsResponse));
    gSiftScienceWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0,
        },
      },
      status: -1,
      workflow_statuses: [
        {
          config_display_name: "displayName",
          history: [
            {
              app: "generic",
              name: "generic",
            },
          ],
        },
      ],
    };
    getWorkflowsSuccess(gateway, done);
  });
  it("test siftScience getWorkflows with active workflows - success", (done: Mocha.Done) => {
    gSiftScienceWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.2,
        },
      },
      workflow_statuses: [
        {
          config_display_name: "name2",
          history: [
            {
              app: "decision",
              name: "ApprovedTransaction",
            },
          ],
          state: "success",
        },
      ],
    };
    rps.returns(Promise.resolve(gSiftScienceWorkflowsResponse));
    getWorkflowsSuccess(gateway, done);
  });
  it("test siftScience getWorkflows - fail because antifraud score", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.ProdApiKey = "lkasdlaskd1";
    gMerchantInfo.sift_science.SandboxApiKey = "12091dakld";
    process.env.USRV_STAGE = "qa";
    gSiftScienceWorkflowsResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.2,
        },
      },
      workflow_statuses: [
        {
          config_display_name: "name",
          history: [
            {
              app: "decision",
              name: "ApprovedTransaction",
            },
          ],
          state: "failed",
        },
      ],
    };
    rps.returns(Promise.resolve(gSiftScienceWorkflowsResponse));
    gateway.getWorkflows(gMerchantInfo, gTokenInfo).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K020");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("test siftScience create order - success", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.SandboxApiKey = "adajflkj12";
    gMerchantInfo.sift_science.ProdApiKey = "123134343121";
    process.env.USRV_STAGE = "ci";
    rps.returns(Promise.resolve(gSiftScienceCreateOrderResponse));
    createOrderSuccess(gateway, done);
  });
  it("test siftScience create order with prod credentials - success", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.ProdApiKey = "alskdadklj12";
    gMerchantInfo.sift_science.SandboxApiKey = "asdlasdk121";
    process.env.USRV_STAGE = "primary";
    rps.returns(Promise.resolve(gSiftScienceCreateOrderResponse));
    createOrderSuccess(gateway, done);
  });
  it("test siftScience create order - when fail because antifraud score - send default response", (done: Mocha.Done) => {
    process.env.SIFT_THRESHOLD = "0.8";
    process.env.SIFT_SCIENCE_API_KEY = "sift_api_key";
    gMerchantInfo.sift_science.ProdApiKey = undefined;
    gMerchantInfo.sift_science.SandboxApiKey = undefined;
    gSiftScienceCreateOrderResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.99,
        },
      },
      status: 0,
    };
    process.env.USRV_STAGE = "stg";
    rps.returns(Promise.resolve(gSiftScienceCreateOrderResponse));
    gateway.createOrder(gMerchantInfo, gTokenInfo).subscribe({
      error: (error: KushkiError): void => {
        expect(error.code).to.be.eql("K020");
        done();
      },
      next: (): void => {
        done(UNREACHABLE);
      },
    });
  });
  it("test siftScience create order - when ocurr unexpected error  - send default response", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.ProdApiKey = undefined;
    gMerchantInfo.sift_science.SandboxApiKey = undefined;
    const errortest: Error = new Error("Error inesperado");

    process.env.USRV_STAGE = "stg";
    rps.throws(errortest);

    gateway.createOrder(gMerchantInfo, gTokenInfo).subscribe({
      next: (data: SiftScienceCreateOrderResponse): void => {
        expect(data).haveOwnProperty("status");
        expect(data.error_message).equal(errortest.message);
        done();
      },
    });
  });
  it("test siftScience create order - when unexpected error with statusCode 200  - send default response", (done: Mocha.Done) => {
    gSiftScienceCreateOrderResponse.score_response = {
      scores: {
        payment_abuse: {
          score: 0.99,
        },
      },
      status: -1,
    };
    gMerchantInfo.sift_science.ProdApiKey = undefined;
    gMerchantInfo.sift_science.SandboxApiKey = undefined;
    const errortest: Error = new Error("Unexpected server side error");

    process.env.USRV_STAGE = "stg";
    rps.throws(errortest);

    gateway.createOrder(gMerchantInfo, gTokenInfo).subscribe({
      next: (data: SiftScienceCreateOrderResponse): void => {
        expect(data.error_message).equal(errortest.message);
        expect(data).haveOwnProperty("status");
        done();
      },
    });
  });
  it("test siftScience getDecision - success", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.SandboxApiKey = "adajflkj12";
    gMerchantInfo.sift_science.ProdApiKey = "123134343121";
    process.env.USRV_STAGE = "ci";
    rpg.returns(Promise.resolve(gSiftScienceDecisionResponse));
    decisionSuccess(gateway, done);
  });
  it("test siftScience getDecision error unexcepted - success with generic response", (done: Mocha.Done) => {
    process.env.USRV_STAGE = "ci";
    const errorget: Error = new Error("Error inesperado");

    rpg.throws(errorget);

    gateway.getDecision(gMerchantInfo, "decisionIdString").subscribe({
      next: (data: SiftScienceDecisionResponse): void => {
        expect(data.type).equal("green");
        expect(data.description).equal(errorget.message);
        done();
      },
    });
  });
  it("test siftScience getDecision with ProdAccountID - success", (done: Mocha.Done) => {
    gMerchantInfo.sift_science.ProdApiKey = "123134343121";
    gMerchantInfo.sift_science.SandboxApiKey = "adajflkj12";
    process.env.USRV_STAGE = "primary";
    rpg.returns(Promise.resolve(gSiftScienceDecisionResponse));
    decisionSuccess(gateway, done);
  });
});
