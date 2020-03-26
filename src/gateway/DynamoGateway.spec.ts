/**
 * DynamoGateway Unit Tests
 */
import { DocumentClient } from "aws-sdk/lib/dynamodb/document_client";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { CONTAINER } from "infrastructure/Container";
import { IndexEnum } from "infrastructure/IndexEnum";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { createSandbox, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { TransactionDynamo } from "types/transaction_dynamo";

use(sinonChai);

describe("DynamoGateway -", () => {
  let gateway: IDynamoGateway;
  let box: SinonSandbox;
  let put_data: object;
  let put_stub: SinonStub;
  let update_stub: SinonStub;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
    put_data = { test: "hi!!", test2: "hello world" };
    update_stub = box.stub().returns({ promise: () => true });

    put_stub = box.stub().returns({ promise: () => true });
    CONTAINER.rebind(IDENTIFIERS.AwsDocumentClient).toConstantValue(
      Mock.of<DocumentClient>({
        put: put_stub,
        update: update_stub,
      })
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("test put", (done: Mocha.Done) => {
    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    const spy: SinonSpy = box.spy();

    gateway.put(put_data, "testStream").subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        expect(put_stub.getCall(0).args[0]).to.not.have.property(
          "ConditionExpression"
        );
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test put with condition", (done: Mocha.Done) => {
    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    const spy: SinonSpy = box.spy();

    gateway.put(put_data, "testStream", "condition").subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        expect(put_stub.getCall(0).args[0]).to.have.property(
          "ConditionExpression",
          "condition"
        );
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test put with condition and ConditionalCheckFailedException", (done: Mocha.Done) => {
    put_stub = box.stub().returns({
      promise: async () =>
        Promise.reject({ code: "ConditionalCheckFailedException" }),
    });
    const spy: SinonSpy = box.spy();

    CONTAINER.rebind(IDENTIFIERS.AwsDocumentClient).toConstantValue(
      Mock.of<DocumentClient>({
        put: put_stub,
      })
    );

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.put(put_data, "testStream", "condition").subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test put with error", (done: Mocha.Done) => {
    put_stub = box
      .stub()
      .returns({ promise: async () => Promise.reject({ code: "error" }) });

    CONTAINER.rebind(IDENTIFIERS.AwsDocumentClient).toConstantValue(
      Mock.of<DocumentClient>({
        put: put_stub,
      })
    );

    gateway = CONTAINER.get<IDynamoGateway>(IDENTIFIERS.DynamoGateway);
    gateway.put(put_data, "testStream").subscribe({
      error: (err: Error): void => {
        expect(err).to.have.property("code", "error");
        done();
      },
      next: (): void => {
        done("next should not be called");
      },
    });
  });
  it("test query", (done: Mocha.Done) => {
    const output: TransactionDynamo[] = [Mock.of<TransactionDynamo>()];

    const query_stub: SinonStub = box
      .stub()
      .returns({ promise: () => ({ Items: output }) });
    const spy_next: SinonSpy = box.spy();

    CONTAINER.rebind(IDENTIFIERS.AwsDocumentClient).toConstantValue(
      Mock.of<DocumentClient>({
        query: query_stub,
      })
    );

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway
      .query(
        TABLES.transaction,
        IndexEnum.transaction_sale_ticket_number,
        "sale_ticket_number",
        "181063568268500321"
      )
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("test getItem", (done: Mocha.Done) => {
    const output: object = {
      qwerty: "ipsum",
    };

    const get_stub: SinonStub = box
      .stub()
      .returns({ promise: () => ({ Item: output }) });

    CONTAINER.rebind(IDENTIFIERS.AwsDocumentClient).toConstantValue(
      Mock.of<DocumentClient>({
        get: get_stub,
      })
    );
    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    const spy_next: SinonSpy = box.spy();

    gateway
      .getItem("table", {
        key: "lorem",
      })
      .subscribe({
        complete: (): void => {
          expect(spy_next).to.be.calledOnce.and.calledWithExactly(output);
          done();
        },
        error: done,
        next: spy_next,
      });
  });
  it("should update an Item", (done: Mocha.Done) => {
    const values_to_update: {
      booleanValue: boolean;
      numberValue: number;
      objectValue: object;
      stringValue: string;
    } = {
      booleanValue: false,
      numberValue: 123,
      objectValue: { some: "object" },
      stringValue: "string",
    };

    const key: object = {
      some: "key",
    };

    gateway = CONTAINER.get(IDENTIFIERS.DynamoGateway);
    gateway.updateValues("some_table", key, values_to_update).subscribe({
      error: done,
      next: (resp: boolean) => {
        expect(resp).to.be.true;
        expect(update_stub).to.have.been.calledOnce.and.calledWith({
          ExpressionAttributeNames: {
            "#booleanValue": "booleanValue",
            "#numberValue": "numberValue",
            "#objectValue": "objectValue",
            "#stringValue": "stringValue",
          },
          ExpressionAttributeValues: {
            ":booleanValue": values_to_update.booleanValue,
            ":numberValue": values_to_update.numberValue,
            ":objectValue": values_to_update.objectValue,
            ":stringValue": values_to_update.stringValue,
          },
          Key: key,
          TableName: "some_table",
          UpdateExpression:
            "SET #booleanValue=:booleanValue, #numberValue=:numberValue, #objectValue=:objectValue, #stringValue=:stringValue",
        });
        done();
      },
    });
  });
});
