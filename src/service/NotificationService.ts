/**
 * Notification Service file
 */
import { ISQSEvent } from "@kushki/core";
import * as AWSXRay from "aws-xray-sdk";
import * as http from "http";
import * as https from "https";
AWSXRay.captureHTTPsGlobal(http, false);
AWSXRay.captureHTTPsGlobal(https, false);
import { HmacSHA256, WordArray } from "crypto-js";
import { NotificationTypeEnum } from "infrastructure/NotificationTypeEnum";
import { injectable } from "inversify";
import { INotificationService } from "repository/INotificationService";
import { OptionsWithUri } from "request";
import * as rp from "request-promise";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { concatMap, map, mapTo, mergeMap, switchMap } from "rxjs/operators";
import { WebhookPayload } from "types/webhook_payload";

@injectable()
export class NotificationService implements INotificationService {
  public webhookSqs(event: ISQSEvent<WebhookPayload>): Observable<boolean> {
    const body: WebhookPayload = event.Records[0].body;

    return of(1).pipe(
      switchMap(() => this._webhookRequest(body)),
      tag("Notification Service | webhookSqs"),
      mapTo(true)
    );
  }

  private _webhookRequest(data: WebhookPayload): Observable<object> {
    return of(1).pipe(
      switchMap(() => this._buildWebhookRequest(data)),
      tag("Notification Service | _webhookRequest")
    );
  }

  private _buildWebhookRequest(body: WebhookPayload): Observable<object> {
    return of(1).pipe(
      mergeMap(() => {
        const timestamp: number = new Date().getTime();
        const signature: string[] = NotificationService._generateWebhookSign(
          body.webhookSignature,
          JSON.stringify(body.transaction),
          timestamp
        );

        return this._getRequestOptions(signature, timestamp, body);
      }),
      mergeMap((options: OptionsWithUri) => this._sendWebhookRequest(options)),
      tag("Notification Service | _buildWebhookRequest")
    );
  }

  private static _generateWebhookSign(
    secretId: string,
    body: string,
    timestamp: number
  ): string[] {
    const payload: string = `${body}.${timestamp}`;
    const hash: WordArray = HmacSHA256(payload, secretId);
    const simple_hash: WordArray = HmacSHA256(`${timestamp}`, secretId);

    return [hash.toString(), simple_hash.toString()];
  }

  private _getRequestOptions(
    signature: string[],
    timestamp: number,
    body: WebhookPayload
  ): Observable<OptionsWithUri> {
    return of(1).pipe(
      map(() => ({
        body: body.transaction,
        headers: {
          "X-Kushki-Id": timestamp,
          "X-Kushki-Key": body.transaction.merchant_id,
          "X-Kushki-Signature": signature[0],
          "X-Kushki-SimpleSignature": signature[1],
        },
        json: true,
        uri:
          body.transaction.channel &&
          body.transaction.channel.toUpperCase() ===
            NotificationTypeEnum.WEBCHECKOUT
            ? `${process.env.WEBCHECKOUT_WEBHOOK}`
            : body.url,
      })),
      tag("Notification Service | _getRequestOptions")
    );
  }

  private _sendWebhookRequest(options: OptionsWithUri): Observable<object> {
    return of(1).pipe(
      concatMap(() => rp.post(options)),
      tag("NotificationService | _sendWebhookRequest")
    );
  }
}
