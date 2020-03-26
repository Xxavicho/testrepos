/**
 * FirehoseGateway Unit Tests
 */
import { use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { IFirehoseGateway } from "repository/IFirehoseGateway";
import { createSandbox, SinonSandbox } from "sinon";
import * as sinonChai from "sinon-chai";

use(sinonChai);

describe("FirehoseGateway -", () => {
  let gateway: IFirehoseGateway;
  let box: SinonSandbox;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.rebind(IDENTIFIERS.AwsFirehose).toConstantValue({
      putRecordBatch: box.stub().returns({
        promise: box.stub().resolves({}),
      }),
    });
    gateway = CONTAINER.get<IFirehoseGateway>(IDENTIFIERS.FirehoseGateway);
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test put", (done: Mocha.Done) => {
    process.env.SLS_REGION = "us-east-1";
    gateway
      .put([{ test: "hi!!", test2: "hello world" }], "ci_transfer_transaction")
      .subscribe({
        error: done,
        next: (data: boolean): void => {
          data ? done() : done("this test must return true");
        },
      });
  });
});
