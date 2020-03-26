/**
 * SNSGateway Unit Tests
 */
import { SNS } from "aws-sdk";
import { expect } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { ISNSGateway } from "repository/ISNSGateway";
import { createSandbox, SinonSandbox } from "sinon";
import { Mock } from "ts-mockery";

describe("SNSGateway -", () => {
  let gateway: ISNSGateway | undefined;
  let sandbox: SinonSandbox;

  beforeEach(async () => {
    CONTAINER.snapshot();
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });

  it("when publish is called it will return true", (done: Mocha.Done) => {
    CONTAINER.rebind(IDENTIFIERS.AwsSns).toConstantValue(
      Mock.of<SNS>({
        publish: sandbox
          .stub()
          .returns({ promise: () => ({ FailedPutCount: 0 }) }),
      })
    );

    gateway = CONTAINER.get<ISNSGateway>(IDENTIFIERS.ISNSGateway);
    gateway.publish("arn", {}).subscribe({
      next: (data: boolean): void => {
        expect(data).to.be.true;
        done();
      },
    });
  });
});
