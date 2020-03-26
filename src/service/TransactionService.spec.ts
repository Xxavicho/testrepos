/* tslint:disable: no-big-function */
/**
 * TransactionService Unit Tests
 */
import {
  AurusError,
  DynamoEventNameEnum,
  IAPIGatewayEvent,
  IDENTIFIERS as CORE_ID,
  IDynamoDbEvent,
  IDynamoElement,
  IDynamoRecord,
  ILambdaGateway,
  KushkiError,
} from "@kushki/core";
import { expect, use } from "chai";
import * as chaiJsonSchema from "chai-json-schema";
import { IDENTIFIERS } from "constant/Identifiers";
import { TABLES } from "constant/Tables";
import { lorem } from "faker";
import * as fs from "fs";
import { DynamoGateway } from "gateway/DynamoGateway";
import { FirehoseGateway } from "gateway/FirehoseGateway";
import { CONTAINER } from "infrastructure/Container";
import { ERRORS } from "infrastructure/ErrorEnum";
import { IndexEnum } from "infrastructure/IndexEnum";
import { TransactionStatusEnum } from "infrastructure/TransactionStatusEnum";
import { get } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISQSGateway } from "repository/ISQSGateway";
import { ITransactionService, VoidBody } from "repository/ITransactionService";
import { Observable, Observer, of } from "rxjs";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { AurusResponse } from "types/aurus_response";
import { AuthorizerContext } from "types/authorizer_context";
import { ChargesCardRequest } from "types/charges_card_request";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoProcessorFetch } from "types/dynamo_processor_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { RecordTransactionRequest } from "types/record_transaction_request";
import { SyncTransactionStream } from "types/sync_transaction_stream";
import { Transaction } from "types/transaction";
import { VoidCardHeader } from "types/void_card_header";
import { VoidCardPath } from "types/void_card_path";

use(sinonChai);
use(chaiJsonSchema);

const TRX_REFERENCE: string = "124-345-556-677";

describe("TransactionService - record - ", () => {
  let box: SinonSandbox;
  let get_first: object | undefined;
  let get_second: object | undefined;
  let invoke_record: SinonStub;

  function prepareTest(
    transaction: RecordTransactionRequest,
    returnQuery: boolean = false
  ): {
    dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    >;
    dynamo_query: SinonStub<
      [string, IndexEnum, string, string],
      Observable<unknown[]>
    >;
    service: ITransactionService;
    event: IAPIGatewayEvent<RecordTransactionRequest>;
    spy: SinonSpy;
    dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    >;
  } {
    const dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const dynamo_query: SinonStub<
      [string, IndexEnum, string, string],
      Observable<unknown[]>
    > = box
      .stub(DynamoGateway.prototype, "query")
      .returns(of(returnQuery ? [Mock.of<RecordTransactionRequest>()] : []));
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(
        of({ deferred: { graceMonths: "01", creditType: "02", months: 6 } })
      )
      .onSecondCall()
      .returns(of(get_first))
      .onThirdCall()
      .returns(of(get_second))
      .onCall(3)
      .returns(of({ merchantId: "22222" }));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    return { dynamo_put, dynamo_query, service, event, spy, dynamo_get_item };
  }
  beforeEach(async () => {
    box = createSandbox();
    invoke_record = box.stub().returns(of(true));
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({
        invokeFunction: invoke_record,
      })
    );
    process.env.MERCHANT_WITH_RECORD_API = "1111111";
  });
  afterEach(() => {
    box.restore();
    get_first = undefined;
    get_second = undefined;
  });
  it("test record - success with card transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      dateAndTimeTransaction: "30122017201130",
      lastFourDigitsOfCard: "9876",
      merchantId: "1111",
      transactionId: lorem.word(),
    });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.be.calledWith({
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          last_four_digits: transaction.lastFourDigitsOfCard,
          number_of_months: 6,
          processor_id: "1111",
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        expect(invoke_record).to.not.have.called;
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test record - success with subscription transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      dateAndTimeTransaction: "30122017201130",
      lastFourDigitsOfCard: "9876",
      merchantId: "1111",
      transactionId: lorem.word(),
    });
    const { dynamo_put, service, event } = prepareTest(transaction);

    event.body.subscriptionId = "123123123";
    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.not.have.called;
        expect(invoke_record).to.be.calledWithMatch(match.any, {
          merchantId: match.any,
          subscriptionId: event.body.subscriptionId,
        });
        done();
      },
      error: done,
    });
  });

  it("test record - success when the merchant dont have record API service", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      dateAndTimeTransaction: "30122017201130",
      lastFourDigitsOfCard: "9876",
      merchantId: "2222",
      transactionId: lorem.word(),
    });
    const { service: service, event: event } = prepareTest(transaction);

    service.record(event).subscribe({
      next: (response: object): void => {
        expect(response).to.be.eql({ status: "OK" });

        done();
      },
    });
  });

  it("test record - success with metadata from aurus tables", (done: Mocha.Done) => {
    get_first = {
      TRANSACTION_METADATA: "{}",
    };
    get_second = {
      SUBSCRIPTION_METADATA: "{}",
    };
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      approvedTransactionAmount: 112,
      dateAndTimeTransaction: "30122017201130",
      merchantId: "1111111",
      Metadata: {
        qwerty: "lorem",
      },
      ticketNumber: lorem.word(),
      transactionId: "1324",
    });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put.getCall(0).args[0]).to.be.have.property("metadata");
        expect(dynamo_put.getCall(0).args[0]).to.be.have.property(
          "subscription_metadata"
        );
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test record - success with existing transaction", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >();
    const { dynamo_put, service, event, spy } = prepareTest(transaction, true);

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.not.be.called;
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test record - success with empty string on fields", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      dateAndTimeTransaction: "30122017201130",
      extraTaxes: "",
      merchantId: "1111111",
      numberOfMonths: 0,
      saleTicketNumber: "",
      ticketNumber: "",
      transactionId: lorem.word(),
    });
    const { dynamo_put, service, event, spy } = prepareTest(transaction);

    service.record(event).subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly({ status: "OK" });
        expect(dynamo_put).to.be.calledWith({
          created: 1514664690000,
          credit_type: "02",
          grace_months: "01",
          number_of_months: 6,
          processor_id: "1111111",
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test record - success with empty saleTicketNumber", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      dateAndTimeTransaction: "30122017201130",
      merchantId: "1111111",
      saleTicketNumber: "",
      transactionId: lorem.word(),
    });

    box.stub(DynamoGateway.prototype, "query").returns(of([]));
    const dynamo_put: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));

    box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({}))
      .onSecondCall()
      .returns(of(get_first))
      .onThirdCall()
      .returns(of(get_second))
      .onCall(3)
      .returns(of({ merchantId: "22222" }));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    service.record(event).subscribe({
      complete: (): void => {
        expect(dynamo_put).to.be.calledWith({
          created: 1514664690000,
          processor_id: "1111111",
          sync_mode: "api",
          transaction_id: transaction.transactionId,
        });

        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test record - error K003", (done: Mocha.Done) => {
    const transaction: RecordTransactionRequest = Mock.of<
      RecordTransactionRequest
    >({
      merchantId: "1111",
      transactionId: lorem.word(),
    });

    box.stub(DynamoGateway.prototype, "query").returns(of([]));
    box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of(undefined))
      .onSecondCall()
      .returns(of(get_first))
      .onThirdCall()
      .returns(of(get_second))
      .onCall(3)
      .returns(of(undefined));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IAPIGatewayEvent<RecordTransactionRequest> = Mock.of<
      IAPIGatewayEvent<RecordTransactionRequest>
    >({
      body: transaction,
    });
    const spy: SinonSpy = box.spy();

    service.record(event).subscribe({
      error: (err: KushkiError): void => {
        expect(err.code).to.be.eq("K003");
        done();
      },
      next: spy,
    });
  });
});
describe("Transaction Service - sync - ", () => {
  let box: SinonSandbox;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );
    process.env.MERCHANT_WITH_RECORD_API = "1111111";
  });
  afterEach(() => {
    box.restore();
  });
  it("test sync, success with a bad last four digit value and so log response text", (done: Mocha.Done) => {
    const transaction: SyncTransactionStream = Mock.of<SyncTransactionStream>({
      approved_transaction_amount: 112,
      bin_card: "424242",
      card_type: "DEBIT",
      created: 1514664690000,
      last_four_digits: "19876",
      merchant_id: "1111111",
      metadata: {
        qwerty: "lorem",
        value: {
          id: "12012012",
        },
      },
      payment_brand: "MasterCard",
      processor_id: "1111111",
      processor_name: "Qwerty Processor",
      recap: "12345",
      response_text:
        "Lorem ipsum dolor sit amet, id euismod inermis copiosae sit. No officiis philosophia quo. Duo ad dicam nostro",
      subscription_metadata: {
        asdfg: "ipsum",
      },
      transaction_id: lorem.word(),
      transaction_status: "APPROVAL",
      transaction_type: "PREAUTHORIZATION",
    });
    const firehose: SinonStub<
      [object[], string],
      Observable<boolean>
    > = box.stub(FirehoseGateway.prototype, "put").returns(of(true));
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({}));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IDynamoDbEvent<SyncTransactionStream> = Mock.of<
      IDynamoDbEvent<SyncTransactionStream>
    >({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: transaction,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });
    const spy: SinonSpy = box.spy();

    service.sync(event).subscribe({
      complete: (): void => {
        expect(dynamo_get_item).to.be.calledOnce;
        expect(firehose.firstCall).to.be.calledWith([
          {
            approved_transaction_amount:
              transaction.approved_transaction_amount,
            bin_card: transaction.bin_card,
            card_type: "Debit",
            created: "2017-12-30 20:11:30",
            last_four_digits: "9876",
            merchant_id: transaction.merchant_id,
            metadata: JSON.stringify({
              qwerty: "lorem",
              value: "",
            }),
            payment_brand: "Mastercard",
            processor_id: transaction.processor_id,
            processor_name: transaction.processor_name,
            recap: transaction.recap,
            response_text:
              "Lorem ipsum dolor sit amet, id euismod inermis copiosae sit. No officiis philosophia quo. ",
            subscription_metadata: JSON.stringify({
              asdfg: "ipsum",
            }),
            transaction_id: transaction.transaction_id,
            transaction_status: "APPROVAL",
            transaction_type: "PREAUTHORIZATION",
          },
        ]);
        expect(firehose.secondCall).to.be.calledWith([
          {
            approved_transaction_amount:
              transaction.approved_transaction_amount,
            bin_card: transaction.bin_card,
            card_type: "Debit",
            created: "2017-12-30T20:11:30.000Z",
            last_four_digits: transaction.last_four_digits,
            masked_credit_card: `${transaction.bin_card}XXXXXX${transaction.last_four_digits}`,
            merchant_id: transaction.merchant_id,
            metadata: {
              qwerty: "lorem",
              value: "",
            },
            payment_brand: "Mastercard",
            payment_method: "card",
            processor_id: transaction.processor_id,
            processor_name: transaction.processor_name,
            recap: transaction.recap,
            response_text:
              "Lorem ipsum dolor sit amet, id euismod inermis copiosae sit. No officiis philosophia quo. Duo ad dicam nostro",
            security: { id: undefined, service: undefined },
            string_metadata: `{"qwerty":"lorem","value":""}`,
            string_subscription_metadata: `{"asdfg":"ipsum"}`,
            subscription_metadata: {
              asdfg: "ipsum",
            },
            transaction_id: transaction.transaction_id,
            transaction_status: "APPROVAL",
            transaction_type: "PREAUTHORIZATION",
          },
        ]);
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test sync, success with otp information", (done: Mocha.Done) => {
    const trx_id: string = "lorem.word()";
    const transaction: SyncTransactionStream = Mock.of<SyncTransactionStream>({
      approved_transaction_amount: 112,
      bin_card: "424242",
      card_type: "CREDIT",
      created: 1558629391000,
      last_four_digits: "19876",
      merchant_id: "1111111",
      metadata: {
        qwerty: "lorem",
        value: {
          id: "12012012",
        },
      },
      payment_brand: "AmericanExpress",
      processor_id: "1111111",
      processor_name: "Mix Processor",
      recap: "12345",
      response_text: trx_id,
      security: {
        id: "2333",
        service: "12345",
      },
      subscription_metadata: {
        asdfg: "ipsum",
      },
      transaction_id: lorem.word(),
      transaction_status: "APPROVAL",
      transaction_type: "SALE",
    });
    const firehose: SinonStub<
      [object[], string],
      Observable<boolean>
    > = box.stub(FirehoseGateway.prototype, "put").returns(of(true));
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({}));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IDynamoDbEvent<SyncTransactionStream> = Mock.of<
      IDynamoDbEvent<SyncTransactionStream>
    >({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: transaction,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });
    const spy: SinonSpy = box.spy();

    service.sync(event).subscribe({
      complete: (): void => {
        expect(dynamo_get_item).to.be.calledOnce;
        expect(firehose.firstCall).to.be.calledWith([
          {
            approved_transaction_amount:
              transaction.approved_transaction_amount,
            bin_card: transaction.bin_card,
            card_type: "Credit",
            created: "2019-05-23 16:36:31",
            last_four_digits: "9876",
            merchant_id: transaction.merchant_id,
            metadata: JSON.stringify({
              qwerty: "lorem",
              value: "",
            }),
            payment_brand: "Amex",
            processor_id: transaction.processor_id,
            processor_name: transaction.processor_name,
            recap: transaction.recap,
            response_text: trx_id,
            secure_id: "2333",
            secure_service: "12345",
            subscription_metadata: JSON.stringify({
              asdfg: "ipsum",
            }),
            transaction_id: transaction.transaction_id,
            transaction_status: "APPROVAL",
            transaction_type: "SALE",
          },
        ]);
        expect(firehose.secondCall).to.be.calledWith([
          {
            approved_transaction_amount:
              transaction.approved_transaction_amount,
            bin_card: transaction.bin_card,
            card_type: "Credit",
            created: "2019-05-23T16:36:31.000Z",
            last_four_digits: transaction.last_four_digits,
            masked_credit_card: `${transaction.bin_card}XXXXXX${transaction.last_four_digits}`,
            merchant_id: transaction.merchant_id,
            metadata: {
              qwerty: "lorem",
              value: "",
            },
            payment_brand: "Amex",
            payment_method: "card",
            processor_id: transaction.processor_id,
            processor_name: transaction.processor_name,
            recap: transaction.recap,
            response_text: trx_id,
            security: {
              id: "2333",
              service: "12345",
            },
            string_metadata: `{"qwerty":"lorem","value":""}`,
            string_subscription_metadata: `{"asdfg":"ipsum"}`,
            subscription_metadata: {
              asdfg: "ipsum",
            },
            transaction_id: transaction.transaction_id,
            transaction_status: "APPROVAL",
            transaction_type: "SALE",
          },
        ]);
        done();
      },
      error: done,
      next: spy,
    });
  });
  it("test sync with deferred, success", (done: Mocha.Done) => {
    const expected_subtotal_iva = 12;
    const transaction: SyncTransactionStream = Mock.of<SyncTransactionStream>({
      approved_transaction_amount: 112,
      bin_card: "424242",
      created: 1514664690000,
      last_four_digits: "9876",
      merchant_id: "1111111",
      payment_brand: "VISA",
      processor_id: "1111111",
      processor_name: "Qwerty Processor",
      subtotal_iva: expected_subtotal_iva,
      transaction_id: lorem.word(),
      transaction_status: "APPROVAL",
      transaction_type: "DEFFERED",
    });
    const firehose: SinonStub<
      [object[], string],
      Observable<boolean>
    > = box.stub(FirehoseGateway.prototype, "put").returns(of(true));
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({ deferred: { graceMonths: "01", creditType: "02" } }))
      .onSecondCall()
      .returns(of({}));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IDynamoDbEvent<SyncTransactionStream> = Mock.of<
      IDynamoDbEvent<SyncTransactionStream>
    >({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: transaction,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: transaction,
            OldImage: {
              ...transaction,
              response_text: "change",
            },
          }),
          eventName: DynamoEventNameEnum.MODIFY,
        }),
      ],
    });
    const spy: SinonSpy = box.spy();

    service.sync(event).subscribe({
      complete: (): void => {
        expect(spy).to.be.calledTwice.and.calledWithExactly(true);
        expect(dynamo_get_item).to.be.calledOnce;
        expect(firehose).to.be.calledWith([
          {
            approved_transaction_amount:
              transaction.approved_transaction_amount,
            bin_card: transaction.bin_card,
            card_type: "",
            created: "2017-12-30T20:11:30.000Z",
            credit_type: "02",
            grace_months: "01",
            last_four_digits: transaction.last_four_digits,
            masked_credit_card: `${transaction.bin_card}XXXXXX${transaction.last_four_digits}`,
            merchant_id: transaction.merchant_id,
            payment_brand: "Visa",
            payment_method: "card",
            processor_id: transaction.processor_id,
            processor_name: transaction.processor_name,
            security: { id: undefined, service: undefined },
            subtotal_iva: expected_subtotal_iva,
            transaction_id: transaction.transaction_id,
            transaction_status: "APPROVAL",
            transaction_type: "DEFFERED",
          },
        ]);

        done();
      },
      next: spy,
    });
  });
  it("should not sync void transactions", (done: Mocha.Done) => {
    const void_transaction: SyncTransactionStream = Mock.of<
      SyncTransactionStream
    >({
      approved_transaction_amount: 12,
      bin_card: "424242",
      created: 1514664660000,
      last_four_digits: "9876",
      merchant_id: "1111111",
      payment_brand: "VISA",
      processor_id: "1111111",
      processor_name: "Processor",
      transaction_id: lorem.word(),
      transaction_status: "APPROVAL",
      transaction_type: "VOID",
    });
    const firehose: SinonStub<
      [object[], string],
      Observable<boolean>
    > = box.stub(FirehoseGateway.prototype, "put").returns(of(true));
    const dynamo_get_item: SinonStub<
      [string, object],
      Observable<object | undefined>
    > = box
      .stub(DynamoGateway.prototype, "getItem")
      .onFirstCall()
      .returns(of({ deferred: { graceMonths: "02", creditType: "03" } }))
      .onSecondCall()
      .returns(of({}));
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IDynamoDbEvent<SyncTransactionStream> = Mock.of<
      IDynamoDbEvent<SyncTransactionStream>
    >({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: void_transaction,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: void_transaction,
            OldImage: {
              ...void_transaction,
              response_text: "change",
            },
          }),
          eventName: DynamoEventNameEnum.MODIFY,
        }),
      ],
    });

    service.sync(event).subscribe({
      complete: (): void => {
        expect(dynamo_get_item).to.not.be.called;
        expect(firehose).to.not.be.called;
        done();
      },
    });
  });
  it("should not sync with billing firehose", (done: Mocha.Done) => {
    const declined_trx: SyncTransactionStream = Mock.of<SyncTransactionStream>({
      transaction_status: TransactionStatusEnum.DECLINED,
    });
    const firehose: SinonStub<
      [object[], string],
      Observable<boolean>
    > = box.stub(FirehoseGateway.prototype, "put").returns(of(true));

    box
      .stub(DynamoGateway.prototype, "getItem")
      .returns(of({ deferred: undefined }));

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );
    const event: IDynamoDbEvent<SyncTransactionStream> = Mock.of<
      IDynamoDbEvent<SyncTransactionStream>
    >({
      Records: [
        Mock.of<IDynamoRecord<SyncTransactionStream>>({
          dynamodb: Mock.of<IDynamoElement<SyncTransactionStream>>({
            NewImage: declined_trx,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });
    const spy: SinonSpy = box.spy();

    service.sync(event).subscribe({
      complete: (): void => {
        expect(spy).to.be.calledOnce.and.calledWithExactly(true);
        expect(firehose).to.be.calledTwice;
        done();
      },
      error: done,
      next: spy,
    });
  });
});
describe("Transaction Service - processRecord", () => {
  let box: SinonSandbox;
  let processor: DynamoProcessorFetch;

  beforeEach(() => {
    box = createSandbox();
    processor = Mock.of<DynamoProcessorFetch>({
      acquirer_bank: "Banco Del Pacifico",
      public_id: "323",
    });
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );
    CONTAINER.snapshot();
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });
  it("happy path", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              ice: 1,
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
            contactDetails: {
              documentNumber: "12312",
              documentType: "qweq",
            },
            deferred: {
              creditType: "04",
              graceMonths: "4",
              months: 6,
            },
          },
          requestContext: {
            authorizer: {
              credentialAlias: "alias",
              credentialId: "id",
            },
          },
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "12345",
          ticket_number: "1230987654",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwave",
            cardType: "",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "438108",
          binInfo: {
            bank: "Bco. Pichincha",
            bin: "438108",
            brand: "VISA",
            processor: "",
          },
          created: 120120103013,
          currency: "USD",
          id: "",
          lastFourDigits: "4242",
          maskedCardNumber: "438108xxxx4242",
          merchantId: "",
          secureId: "123455",
          secureService: "2345",
          settlement: 1,
        }),
        "Merchant",
        processor,
        undefined,
        undefined,
        undefined,
        { flag: "0", brand: "Visa" }
      )
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
          expect(trx.payment_brand).to.be.eq("Visa");
          expect(get(trx, "security.id")).to.be.eq("123455");
          expect(get(trx, "security.service")).to.be.eq("2345");
        },
      });
  });
  it("happy path, Master Card", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          ticket_number: "1235672839",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Piwave",
            cardType: "MASTERCARD",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 100,
          bin: "436402",
          created: 12139931921,
          currency: "USD",
          id: "12120000102192",
          lastFourDigits: "1111",
          maskedCardNumber: "436402XXXX1111",
          merchantId: "12129139193",
        }),
        "Merchant",
        processor,
        null,
        null,
        {},
        undefined,
        "preauthorization"
      )
      .subscribe({
        complete: (): void => {
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.payment_brand).to.be.eq("Master Card");
        },
      });
  });
  it("Process with extra taxes  - success ", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              extraTaxes: {
                propina: 13,
              },
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "34562",
          ticket_number: "1239372612",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Lopez",
            cardType: "VISA",
            isDeferred: "N",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        "Merchant",
        processor,
        null,
        "123"
      )
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });
  it("Process with extra taxes  - success - no processor info", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              extraTaxes: {
                propina: 13,
              },
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "34562",
          ticket_number: "1239372612",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Perez",
            cardType: "VISA",
            isDeferred: "N",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        "MerchantTest"
      )
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });
  it("Process with extra taxes  - success - send error code  ", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              extraTaxes: {
                propina: 13,
              },
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "234",
          ticket_number: "1237391348",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "Juan Perez",
            cardType: "VISA",
            isDeferred: "Y",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        "Merchant",
        processor,
        new AurusError("0001", "Prueba Error"),
        "123"
      )
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void =>
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          ),
      });
  });
  it("Process with KushkiError  - success - send error code  ", (done: Mocha.Done) => {
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().callsFake(
          (data: object, table: string) =>
            new Observable((observable: Observer<boolean>): void => {
              observable.next(put_stub(data, table));
              observable.complete();
            })
        ),
      })
    );

    const service: ITransactionService = CONTAINER.get(
      IDENTIFIERS.TransactionService
    );

    service
      .processRecord(
        Mock.of<
          IAPIGatewayEvent<ChargesCardRequest, null, null, AuthorizerContext>
        >({
          body: {
            amount: {
              currency: "USD",
              iva: 1,
              subtotalIva: 1,
              subtotalIva0: 0,
            },
          },
          requestContext: {},
        }),
        Mock.of<AurusResponse>({
          approved_amount: "10",
          recap: "123",
          ticket_number: "1231234567",
          transaction_details: {
            approvalCode: "1234",
            binCard: "123456",
            cardHolderName: "John Doe",
            cardType: "VISA",
            isDeferred: "Y",
            lastFourDigitsOfCard: "1234",
            merchantName: "Merchant",
            processorBankName: "Bank",
            processorName: "Processor",
          },
          transaction_id: "123",
          transaction_reference: TRX_REFERENCE,
        }),
        "123",
        Mock.of<DynamoTokenFetch>({
          amount: 10,
          bin: "436402",
          created: 12129300001212,
          currency: "USD",
          id: "101192919218383",
          lastFourDigits: "3333",
          maskedCardNumber: "436402XXXX3333",
          merchantId: "11000002192912",
        }),
        "Merchant",
        processor,
        new KushkiError(ERRORS.E021, "Transacción rechazada", {
          responseCode: "customCode",
          responseText: "customText",
        }),
        "123"
      )
      .subscribe({
        complete: (): void => {
          expect(put_stub).to.be.calledOnce;
          done();
        },
        error: done,
        next: (trx: Transaction): void => {
          expect(trx.response_code).to.be.eql("customCode");
          expect(trx.response_text).to.be.eql("customText");
          expect(trx).to.be.jsonSchema(
            JSON.parse(fs.readFileSync(`src/schema/transaction.json`, "utf8"))
          );
        },
      });
  });
});
describe("Transaction Service - processVoidRecord", () => {
  let box: SinonSandbox;
  let put_stub: SinonStub;
  let service: ITransactionService;
  let void_card_event: IAPIGatewayEvent<
    VoidBody,
    VoidCardPath,
    null,
    AuthorizerContext,
    VoidCardHeader
  >;
  let charge_trx: Transaction;

  beforeEach(() => {
    void_card_event = Mock.of<
      IAPIGatewayEvent<
        VoidBody,
        VoidCardPath,
        null,
        AuthorizerContext,
        VoidCardHeader
      >
    >({
      pathParameters: {
        ticketNumber: "123456789",
      },
      requestContext: {},
    });

    charge_trx = Mock.of<Transaction>({
      amount: {
        currency: "USD",
        ice: 0,
        iva: 0.54,
        subtotalIva: 4.46,
        subtotalIva0: 0,
      },
      approval_code: "650552",
      approved_transaction_amount: 5,
      bin_card: "438108",
      card_holder_name: "CEDENO GILSON",
      created: 1539186862000,
      currency_code: "USD",
      ice_value: 0,
      iva_value: 0.54,
      last_four_digits: "1652",
      merchant_id: "10123113252892681113149503222945",
      merchant_name: "Tuenti USSD",
      payment_brand: "Visa",
      processor_bank_name: "0032~BANCO INTERNACIONAL",
      processor_id: "10123113252892681113149503222945",
      processor_name: "Credimatic Processor",
      recap: "834234",
      request_amount: 5,
      response_code: "000",
      response_text: "Transacción aprobada",
      subtotal_iva: 4.46,
      subtotal_iva0: 0,
      sync_mode: "online",
      ticket_number: "182834286453603435",
      token: "ATap4D101231UYOv3L132528bdlOUaPW",
      transaction_details: {
        binCard: "438108",
        cardType: "Visa",
        isDeferred: "N",
        processorBankName: "0032~BANCO INTERNACIONAL",
      },
      transaction_id: "109182834286453627",
      transaction_status: "APPROVAL",
      transaction_type: "SALE",
    });
    box = createSandbox();
    put_stub = box.stub().returns(of(true));
    CONTAINER.snapshot();
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub,
      })
    );
    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );
  });
  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("test processVoidRecord - happy path", (done: Mocha.Done) => {
    service = CONTAINER.get(IDENTIFIERS.TransactionService);
    service.processVoidRecord(void_card_event, charge_trx).subscribe({
      next: (trx: Transaction): void => {
        expect(put_stub).to.be.calledOnce;
        expect(trx.sale_ticket_number).to.eql(
          void_card_event.pathParameters.ticketNumber
        );
        done();
      },
    });
  });
});
describe("Transaction Service - listen Transaction Table", () => {
  let service: ITransactionService;
  let box: SinonSandbox;
  let mock_dynamo_event: IDynamoDbEvent<Transaction>;
  let sqs_spy: SinonStub;
  let get_item: SinonStub;
  let merchant_dynamo: DynamoMerchantFetch;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
    sqs_spy = box.stub().returns(of(true));

    merchant_dynamo = Mock.of<DynamoMerchantFetch>({
      contactPerson: "Test Perez",
      email: "mail@gmail.com",
      private_id: "123",
      urls: ["www.google.com"],
    });

    get_item = box.stub().returns(of(merchant_dynamo));

    bindDynamoGateway(get_item);

    CONTAINER.unbind(IDENTIFIERS.SQSGateway);
    CONTAINER.bind(IDENTIFIERS.SQSGateway).toConstantValue(
      Mock.of<ISQSGateway>({
        put: sqs_spy,
      })
    );

    CONTAINER.rebind(CORE_ID.LambdaGateway).toConstantValue(
      Mock.of<ILambdaGateway>({})
    );
    service = CONTAINER.get(IDENTIFIERS.TransactionService);
  });

  function bindDynamoGateway(getItem?: SinonStub): void {
    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    CONTAINER.bind(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem,
      })
    );
  }

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("it put a transaction to sqs when merchant have url webhook - sucess", (done: Mocha.Done) => {
    mock_dynamo_event = Mock.of<IDynamoDbEvent<Transaction>>({
      Records: [
        {
          dynamodb: {
            NewImage: {
              merchant_id: "123",
              status: TransactionStatusEnum.APPROVAL,
            },
          },
          eventName: DynamoEventNameEnum.INSERT,
        },
        {
          dynamodb: {},
        },
      ],
    });
    service.notifyTransaction(mock_dynamo_event).subscribe({
      next: (data: boolean): void => {
        expect(data).to.be.true;
        expect(sqs_spy).calledOnce;
        expect(
          sqs_spy.calledWith({
            transaction: { status: TransactionStatusEnum.APPROVAL },
            url: merchant_dynamo.url,
            webhookSignature: merchant_dynamo.private_id,
          })
        );
        done();
      },
    });
  });

  it("it not put a transaction to sqs when transaction isn`t insert eventname - sucess ", (done: Mocha.Done) => {
    mock_dynamo_event = Mock.of<IDynamoDbEvent<Transaction>>({
      Records: [
        {
          dynamodb: {
            NewImage: {
              status: TransactionStatusEnum.APPROVAL,
            },
          },
          eventName: DynamoEventNameEnum.REMOVE,
        },
      ],
    });
    service.notifyTransaction(mock_dynamo_event).subscribe({
      next: (data: boolean): void => {
        expect(data).to.be.true;
        expect(sqs_spy.called).is.equal(false);
        done();
      },
    });
  });

  it("it not put a transaction when merchant hasn`t url webhook - sucess ", (done: Mocha.Done) => {
    mock_dynamo_event = Mock.of<IDynamoDbEvent<Transaction>>({
      Records: [
        {
          dynamodb: {
            NewImage: {
              merchant_id: "123",
              status: TransactionStatusEnum.APPROVAL,
            },
          },
          eventName: DynamoEventNameEnum.INSERT,
        },
      ],
    });

    delete merchant_dynamo.urls;

    get_item = box.stub().returns(of(merchant_dynamo));

    bindDynamoGateway(get_item);

    service.notifyTransaction(mock_dynamo_event).subscribe({
      next: (data: boolean): void => {
        expect(data);
        expect(
          get_item.calledWith(TABLES.merchants, {
            public_id: get(
              mock_dynamo_event,
              ".Records[0].dynamodb.NewImage.merchant_id"
            ),
          })
        );
        expect(sqs_spy.calledOnce).is.equal(false);
        done();
      },
    });
  });
  it("it not put a transaction when paylod doesn`t have merchant_id - sucess ", (done: Mocha.Done) => {
    mock_dynamo_event = Mock.of<IDynamoDbEvent<Transaction>>({
      Records: [
        {
          dynamodb: {
            NewImage: {
              status: TransactionStatusEnum.APPROVAL,
            },
          },
          eventName: DynamoEventNameEnum.INSERT,
        },
      ],
    });

    get_item = box.stub().returns(of(merchant_dynamo));

    bindDynamoGateway(get_item);

    service.notifyTransaction(mock_dynamo_event).subscribe({
      next: (data: boolean): void => {
        expect(data);
        expect(sqs_spy.notCalled);
        done();
      },
    });
  });
  it("it not put a transaction when urls is null - sucess ", (done: Mocha.Done) => {
    mock_dynamo_event = Mock.of<IDynamoDbEvent<Transaction>>({
      Records: [
        {
          dynamodb: {
            NewImage: {
              status: TransactionStatusEnum.APPROVAL,
            },
          },
          eventName: DynamoEventNameEnum.INSERT,
        },
      ],
    });

    merchant_dynamo.urls = null;

    get_item = box.stub().returns(of(merchant_dynamo));

    bindDynamoGateway(get_item);

    service.notifyTransaction(mock_dynamo_event).subscribe({
      next: (data: boolean): void => {
        expect(data).to.equal(true);
        expect(sqs_spy.notCalled);
        done();
      },
    });
  });
});
