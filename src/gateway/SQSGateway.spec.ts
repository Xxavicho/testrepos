/**
 * SQSGateway Unit Tests
 */
import { SQS } from "aws-sdk";
import { SendMessageResult } from "aws-sdk/clients/sqs";
import { expect } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ISQSGateway } from "repository/ISQSGateway";
import { createSandbox, SinonSandbox } from "sinon";
import { Mock } from "ts-mockery";

let gateway: ISQSGateway;
let gBox: SinonSandbox;

describe("SQSGateway -", () => {
  beforeEach(() => {
    gBox = createSandbox();
    CONTAINER.snapshot();
  });

  afterEach(() => {
    gBox.restore();
    CONTAINER.restore();
  });

  it("test SQS put", (done: Mocha.Done) => {
    const expected_response: SendMessageResult = { MessageId: "test-message" };

    CONTAINER.rebind(IDENTIFIERS.AwsSqs).toConstantValue(
      Mock.of<SQS>({
        sendMessage: gBox.stub().returns({ promise: () => expected_response }),
      })
    );

    gateway = CONTAINER.get<ISQSGateway>(IDENTIFIERS.SQSGateway);
    gateway.put("url", {}).subscribe({
      complete: done,
      error: done,
      next: (data: boolean): void => {
        expect(data).to.be.eq(true, "data should be true");
      },
    });
  });
});
