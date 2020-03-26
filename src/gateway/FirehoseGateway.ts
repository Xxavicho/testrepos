/**
 * Firehose
 */
import { Firehose } from "aws-sdk";
import { PutRecordBatchRequestEntryList } from "aws-sdk/clients/firehose";
import { IDENTIFIERS } from "constant/Identifiers";
import { inject, injectable } from "inversify";
import "reflect-metadata";
import { IFirehoseGateway } from "repository/IFirehoseGateway";
import { from, Observable } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { bufferCount, last, mapTo, mergeMap } from "rxjs/operators";

/**
 * Firehose Class
 */
@injectable()
export class FirehoseGateway implements IFirehoseGateway {
  private readonly _client: Firehose;

  constructor(@inject(IDENTIFIERS.AwsFirehose) client: Firehose) {
    this._client = client;
  }

  public put(data: object[], stream: string): Observable<boolean> {
    return from(data).pipe(
      bufferCount(500),
      mergeMap(async (buff: object[]) => {
        const converted: PutRecordBatchRequestEntryList = buff.map(
          (el: object) => ({ Data: JSON.stringify(el) })
        );

        return this._client
          .putRecordBatch({
            DeliveryStreamName: stream,
            Records: converted,
          })
          .promise();
      }),
      tag("FireHostGateway | put"),
      last(),
      mapTo(true)
    );
  }
}
