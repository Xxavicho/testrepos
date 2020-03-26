/**
 * Connect gateway with data.
 */

import { Observable } from "rxjs";

/**
 * SNS gateway interface.
 */
export interface ISNSGateway {
  /**
   * Put message in sns
   * @param queue - the aws topic arn of the SNS
   * @param event - the object that will be stringify to publish to the topic SNS
   */
  publish(queue: string, event: object): Observable<boolean>;
}
