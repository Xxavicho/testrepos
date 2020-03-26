/**
 * Firehose Client
 */
import { Observable } from "rxjs";

export interface IFirehoseGateway {
  /**
   * Put data on firehose stream
   * @param data - data to be sent to the stream
   * @param stream - stream's name
   */
  put(data: object[], stream: string): Observable<boolean>;
}
