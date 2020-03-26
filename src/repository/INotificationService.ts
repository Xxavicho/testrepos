import { ISQSEvent } from "@kushki/core";
import { Observable } from "rxjs";
import { WebhookPayload } from "types/webhook_payload";

/**
 * INotification Service file.
 */
export interface INotificationService {
  /**
   *  Listen to Transaction SQS to start webhook
   * @param event - Dynamo event
   */
  webhookSqs(event: ISQSEvent<WebhookPayload>): Observable<boolean>;
}
