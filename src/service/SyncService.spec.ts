/**
 * SyncService Unit Tests
 */
import {
  DynamoEventNameEnum,
  IDynamoDbEvent,
  IDynamoElement,
  IDynamoRecord,
  IRecord,
  ISns,
  ISnsEvent,
} from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { DynamoGateway } from "gateway/DynamoGateway";
import { CONTAINER } from "infrastructure/Container";
import { get } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { ISyncService } from "repository/ISyncService";
import { Observable, Observer, of } from "rxjs";
import { createSandbox, match, SinonSandbox, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { MerchantFetch } from "types/remote/merchant_fetch";
import { ProcessorFetch } from "types/remote/processor_fetch";
import { SiftScienceCreateOrderResponse } from "types/sift_science_create_order_response";
import { TransactionSNS } from "types/transactionSNS";

use(sinonChai);

function putStub(
  box: SinonSandbox
): { put_obs_stub: SinonStub; put_stub: SinonStub } {
  const put_obs_stub: SinonStub = box.stub().returns(true);

  const put_stub: SinonStub = box.stub().returns(
    new Observable((observable: Observer<SiftScienceCreateOrderResponse>) => {
      observable.next(put_obs_stub());
      observable.complete();
    })
  );

  return { put_obs_stub, put_stub };
}
function getProcessorFetch(
  processorFetch: ProcessorFetch,
  processorType: string,
  processorCode?: ""
): object {
  return {
    acquirer_bank:
      processorFetch.StoreInformation.DemographicalInfo.acquirerBank,
    merchant_id: processorFetch.merchantId,
    omitCVV: processorFetch.StoreInformation.DemographicalInfo.omitCVV,
    plcc: !!+get(
      processorFetch,
      "StoreInformation.DemographicalInfo.PlccProcessorDetails",
      "0"
    ),
    private_id: processorFetch.privateMerchantId,
    processor_code: processorCode ? processorCode : "",
    processor_merchant_id:
      processorFetch.StoreInformation.CreditInfo.processorMerchantId,
    processor_name: processorFetch.StoreInformation.CreditInfo.processorName,
    processor_type: processorType,
    public_id: processorFetch.publicMerchantId,
    terminal_id: processorFetch.StoreInformation.CreditInfo.processorTerminalId,
    unique_code:
      processorFetch.StoreInformation.CreditInfo.uniqueCode !== undefined
        ? processorFetch.StoreInformation.CreditInfo.uniqueCode
        : processorFetch.StoreInformation.CreditInfo.processorMerchantId,
  };
}
describe("SyncService - Merchant", () => {
  let box: SinonSandbox;

  beforeEach(async () => {
    box = createSandbox();
    CONTAINER.snapshot();
  });
  afterEach(() => {
    CONTAINER.restore();
    box.restore();
  });
  it("test sync merchant - success", (done: Mocha.Done) => {
    const merchant_fetch: MerchantFetch = Mock.of<MerchantFetch>({
      address: "address",
      businessOwnerIdNumber: "101210210212",
      businessOwnerIdType: "0",
      city: "Quito",
      contactPerson: "persona",
      country: "Ecuador",
      created: 10010101,
      deferredOptions: [
        {
          bank: ["Pichincha", "Banco Guayaquil"],
          deferredType: ["1", "2"],
          months: ["3", "6", "9"],
          monthsOfGrace: ["1", "2", "3"],
        },
      ],
      email: "mail@mail.com",
      name: "sync",
      phoneNumber: "22222222222",
      privateMerchantId: "100123131313131310120",
      publicMerchantId: "10000032323232121212121",
      siftScience: { SandboxApiKey: "123jasdkad", ProdApiKey: "ppasdapdas" },
      socialReason: "socialReason",
      specialContributor: 0,
      state: "P",
      taxId: "1212312912001",
      zipCode: "123456",
    });
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);
    const event: IDynamoDbEvent<MerchantFetch> = Mock.of<
      IDynamoDbEvent<MerchantFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<MerchantFetch>>({
          dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
            NewImage: merchant_fetch,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
        Mock.of<IDynamoRecord>({
          dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
            NewImage: undefined,
          }),
          eventName: DynamoEventNameEnum.REMOVE,
        }),
      ],
    });
    const put_item: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));

    service.syncMerchants(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_item).to.have.been.calledOnce;
      expect(
        put_item.calledWith(
          match.any,
          match.has("nit", merchant_fetch.taxId),
          match.any
        )
      );
      done();
    });
  });
  it("test sync merchant - success w/o deferredOptions", (done: Mocha.Done) => {
    const merchant_fetch: MerchantFetch = Mock.of<MerchantFetch>({
      address: "address",
      businessOwnerIdNumber: "101210210212",
      businessOwnerIdType: "0",
      city: "Quito",
      contactPerson: "persona",
      country: "Ecuador",
      created: 10010101,
      email: "mail@mail.com",
      name: "sync",
      phoneNumber: "22222222222",
      privateMerchantId: "100123131313131310120",
      publicMerchantId: "10000032323232121212121",
      socialReason: "socialReason",
      specialContributor: 0,
      state: "P",
      taxId: "1212312912001",
      zipCode: "123456",
    });
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);
    const event: IDynamoDbEvent<MerchantFetch> = Mock.of<
      IDynamoDbEvent<MerchantFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<MerchantFetch>>({
          dynamodb: Mock.of<IDynamoElement<MerchantFetch>>({
            NewImage: merchant_fetch,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });
    const put_item: SinonStub<
      [object, string, (string | undefined)?],
      Observable<boolean>
    > = box.stub(DynamoGateway.prototype, "put").returns(of(true));

    service.syncMerchants(event).subscribe((data: boolean) => {
      expect(put_item).to.have.been.calledOnce;
      expect(data).to.be.eq(true);
      done();
    });
  });
});
describe("SyncService - Processor", () => {
  let box: SinonSandbox;
  let get_stub: SinonStub;

  beforeEach(async () => {
    process.env.CARD_PROCESSORS =
      "BlueSnap Processor,Credimatic Processor,Datafast Processor,Credibanco Processor,Redeban Processor";
    box = createSandbox();
    CONTAINER.snapshot();
    const merchant: DynamoMerchantFetch = {
      contactPerson: "",
      email: "",
      merchant_name: "asd",
      private_id: "",
      public_id: "",
      sift_science: {},
    };

    get_stub = box.stub().returns(of(merchant));
  });
  afterEach(() => {
    CONTAINER.restore();
    box.restore();
  });
  it("test sync processor traditional - success", (done: Mocha.Done) => {
    const processor_fetch_gateway: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "33333333333",
      paymentMethod: "card",
      privateMerchantId: "222222222222",
      publicMerchantId: "111111111",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "Credimatic Processor",
          processorTerminalId: "12345",
          uniqueCode: "54321",
        },
        DemographicalInfo: {
          acquirerBank: "Davivienda",
          omitCVV: false,
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_fetch_gateway,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

    const put_stub: { put_obs_stub: SinonStub; put_stub: SinonStub } = putStub(
      box
    );

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub.put_stub,
      })
    );
    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.put_stub).to.be.calledWith(
        getProcessorFetch(processor_fetch_gateway, "traditional")
      );
      expect(put_stub.put_obs_stub).to.be.calledOnce;
      done();
    });
  });
  it("test sync processor aggregator - success", (done: Mocha.Done) => {
    const processor_fetch_aggregator: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "4444444",
      paymentMethod: "card",
      privateMerchantId: "111111",
      publicMerchantId: "222222",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "Credibanco Processor",
          processorTerminalId: "12345",
        },
        DemographicalInfo: {
          acquirerBank: "",
          omitCVV: true,
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_fetch_aggregator,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);

    const put_stub: { put_obs_stub: SinonStub; put_stub: SinonStub } = putStub(
      box
    );

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: put_stub.put_stub,
      })
    );
    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.put_stub).to.be.calledWith(
        getProcessorFetch(processor_fetch_aggregator, "aggregator")
      );
      expect(put_stub.put_obs_stub).to.be.calledOnce;
      done();
    });
  });
  it("test sync processor - success with remove event", (done: Mocha.Done) => {
    delete process.env.CARD_PROCESSORS;
    const processor_fetch: ProcessorFetch = Mock.of<ProcessorFetch>({
      publicMerchantId: "111111111",
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            OldImage: processor_fetch,
          }),
          eventName: DynamoEventNameEnum.REMOVE,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(true);

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>) => {
              observable.next(put_stub());
              observable.complete();
            }
          )
        ),
      })
    );
    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.not.be.called;
      done();
    });
  });
  it("test sync processor - success with insert event - PaymentType - Card ", (done: Mocha.Done) => {
    delete process.env.CARD_PROCESSORS;
    const processor_insert_fetch: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "0009999999",
      paymentMethod: "card",
      privateMerchantId: "222222222222",
      publicMerchantId: "55555555",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "Credimatic Processor",
          processorTerminalId: "456",
          uniqueCode: "12344",
        },
        DemographicalInfo: {
          acquirerBank: "SNR",
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_insert_fetch,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(true);

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>) => {
              observable.next(put_stub());
              observable.complete();
            }
          )
        ),
      })
    );

    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(put_stub).to.called;
      done();
    });
  });
  it("test sync processor - success with insert event - PaymentType - Transfer ", (done: Mocha.Done) => {
    delete process.env.CARD_PROCESSORS;
    const processor_insert_fetch: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "0009999999",
      paymentMethod: "transfer",
      privateMerchantId: "222222222222",
      publicMerchantId: "55555555",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "Fake Processor",
          processorTerminalId: "456",
          uniqueCode: "12344",
        },
        DemographicalInfo: {
          acquirerBank: "SNR",
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_insert_fetch,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(true);

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>) => {
              observable.next(put_stub());
              observable.complete();
            }
          )
        ),
      })
    );

    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.not.called;
      done();
    });
  });
  it("test sync transaction  - success ", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      created: 1562084538948,
      currency: "CLP",
      description: "-",
      id: "04913ab6-8186-4a99-a578-f51372182619",
      merchantId: "20000000103098876000",
      returnURL: "htttp://",
      status: "requestedToken",
      ticketNumber: "1234456777",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
      totalAmount: 250,
    };
    event.Records = [transaction_sns];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_stub,
        put: put_stub,
      })
    );

    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub).to.be.called;
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });
  it("test sync transaction with extraxes  - success ", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      amount: {
        extraTaxes: { iac: 0 },
        iva: 0,
        subtotalIva: 0,
        subtotalIva0: 0,
      },
      created: 1562084538948,
      currency: "USD",
      description: "test",
      id: "04913ab6-8186-4a99-a578-f51372182619",
      merchantId: "200000103098876000",
      returnURL: "www.google.com",
      status: "approvedTransaction",
      ticketNumber: "132324",
      token: "c8204cdaec0e46d08fe2186eed6d9fe2",
    };
    event.Records = [transaction_sns];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_stub,
        put: put_stub,
      })
    );

    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.callCount).to.be.equal(1);
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });
  it("test sync transaction without extraxes  - success ", (done: Mocha.Done) => {
    const event: ISnsEvent<TransactionSNS> = Mock.of<ISnsEvent<TransactionSNS>>(
      {}
    );
    const transaction_sns: IRecord<TransactionSNS> = Mock.of<
      IRecord<TransactionSNS>
    >({ Sns: Mock.of<ISns<TransactionSNS>>({}) });

    transaction_sns.Sns.Message = {
      amount: {
        iva: 1,
        subtotalIva: 10,
        subtotalIva0: 110,
      },
      created: Date.now(),
      currency: "USD",
      description: "test 1",
      id: "0799999ab6-8186-4a99-a578-f51372182619",
      merchantId: "20001233103098876000",
      returnURL: "www.yahhoo.com",
      status: "declinedTransaction",
      ticketNumber: "890000",
      token: "vgdfh7e387878908fe2186eed6d9fe2",
    };
    event.Records = [transaction_sns];

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(of(true));

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        getItem: get_stub,
        put: put_stub,
      })
    );

    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncAsyncTransactions(event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      expect(put_stub.callCount > 0);
      expect(get_stub).to.have.been.calledOnce;
      done();
    });
  });
  it("test sync visanet card processor  - success", (done: Mocha.Done) => {
    delete process.env.CARD_PROCESSORS;

    const processor_fetch_gateway: ProcessorFetch = Mock.of<ProcessorFetch>({
      merchantId: "4444444444",
      paymentMethod: "card",
      privateMerchantId: "333333333",
      publicMerchantId: "0000000",
      StoreInformation: {
        CreditInfo: {
          processorMerchantId: "3223",
          processorName: "VisaNet Processor",
          processorTerminalId: "12345",
          uniqueCode: "54321",
        },
        DemographicalInfo: {
          acquirerBank: "",
          omitCVV: false,
        },
        ProcessorInfo: {
          processorCode: "000000002",
        },
      },
    });
    const event: IDynamoDbEvent<ProcessorFetch> = Mock.of<
      IDynamoDbEvent<ProcessorFetch>
    >({
      Records: [
        Mock.of<IDynamoRecord<ProcessorFetch>>({
          dynamodb: Mock.of<IDynamoElement<ProcessorFetch>>({
            NewImage: processor_fetch_gateway,
          }),
          eventName: DynamoEventNameEnum.INSERT,
        }),
      ],
    });

    CONTAINER.unbind(IDENTIFIERS.DynamoGateway);
    const put_stub: SinonStub = box.stub().returns(true);

    CONTAINER.bind<IDynamoGateway>(IDENTIFIERS.DynamoGateway).toConstantValue(
      Mock.of<IDynamoGateway>({
        put: box.stub().returns(
          new Observable(
            (observable: Observer<SiftScienceCreateOrderResponse>) => {
              observable.next(put_stub());
              observable.complete();
            }
          )
        ),
      })
    );

    box.stub(DynamoGateway.prototype, "put").returns(of(true));
    const service: ISyncService = CONTAINER.get(IDENTIFIERS.SyncService);

    service.syncProcessors(event).subscribe((data: boolean) => {
      done();
      expect(put_stub).to.called;
      expect(put_stub).to.be.called;
      expect(data).to.be.eq(true);
    });
  });
});
