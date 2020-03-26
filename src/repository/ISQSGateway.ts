/**
 * Connect gateway with data.
 */

import { Observable } from "rxjs";

/**
 * SQS gateway interface.
 */
export interface ISQSGateway {
  /**
   * Put a message on the queue
   * @param queue - Url of the queue
   * @param data - Message to send
   */
  put(queue: string, data: object): Observable<boolean>;
}
