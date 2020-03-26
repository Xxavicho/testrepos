import { ISQSEvent, ISQSRecord } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { CONTAINER } from "infrastructure/Container";
import { NotificationTypeEnum } from "infrastructure/NotificationTypeEnum";
import * as jsf from "json-schema-faker";
import * as path from "path";
import { INotificationService } from "repository/INotificationService";
import * as rp from "request-promise";
import { createSandbox, SinonSandbox } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";
import { Transaction } from "types/transaction";
import { WebhookPayload } from "types/webhook_payload";

/**
 * Notification Service Unit test
 */

use(sinonChai);

describe("Notification Service Test", () => {
  const schema_path: string = "./src/schema";
  let box: SinonSandbox;
  let webhook_sqs_event: ISQSEvent<WebhookPayload>;
  let trx: Transaction;
  let dynamo_trx_sqs: WebhookPayload;

  async function createSchemas(): Promise<void> {
    trx = await jsf.resolve(
      {
        $ref: "transaction.json",
      },
      null,
      path.resolve(schema_path)
    );
  }

  beforeEach(async () => {
    await createSchemas();
  });

  beforeEach(() => {
    box = createSandbox();
    box
      .stub(rp, "post")
      .returns(Mock.from<rp.RequestPromise>(Promise.resolve(true)));

    dynamo_trx_sqs = {
      transaction: trx,
      url: "www.google.com",
      webhookSignature: "232323232",
    };

    webhook_sqs_event = Mock.of<ISQSEvent<WebhookPayload>>({
      Records: [
        Mock.of<ISQSRecord<WebhookPayload>>({
          body: Mock.of<WebhookPayload>(dynamo_trx_sqs),
        }),
      ],
    });
  });

  afterEach(() => {
    box.restore();
  });

  it("send webhook - sucess", (done: Mocha.Done) => {
    const service: INotificationService = CONTAINER.get(
      IDENTIFIERS.NotificationService
    );

    service.webhookSqs(webhook_sqs_event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      done();
    });
  });

  it("send webhook - webcheckout", (done: Mocha.Done) => {
    const service: INotificationService = CONTAINER.get(
      IDENTIFIERS.NotificationService
    );

    process.env.WEBCHECKOUT_WEBHOOK = "prueba.webcheckout.com";
    webhook_sqs_event.Records[0].body.transaction.channel =
      NotificationTypeEnum.WEBCHECKOUT;
    webhook_sqs_event.Records[0].body.transaction.merchantId = "0123456789";

    service.webhookSqs(webhook_sqs_event).subscribe((data: boolean) => {
      expect(data).to.be.eq(true);
      done();
    });
  });
});
