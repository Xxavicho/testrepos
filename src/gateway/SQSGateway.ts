/**
 * SQS Gateway.
 */
import { SQS } from "aws-sdk";
import { IDENTIFIERS as ID } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { ISQSGateway } from "repository/ISQSGateway";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { mapTo, switchMap } from "rxjs/operators";

/**
 * Gateway to send message to specific SQS queue on AWS
 */
@injectable()
export class SQSGateway implements ISQSGateway {
  private readonly _client: SQS;

  constructor(@inject(ID.AwsSqs) client: SQS) {
    this._client = client;
  }

  public put(queue: string, data: object): Observable<boolean> {
    return of(1).pipe(
      switchMap(async () =>
        this._client
          .sendMessage({
            MessageBody: JSON.stringify(data),
            QueueUrl: queue,
          })
          .promise()
      ),
      tag("SQSGateway | put"),
      mapTo(true)
    );
  }
}
