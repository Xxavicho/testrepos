/* tslint:disable:no-reserved-keywords */
/**
 * Interface for Aurus Gateway.
 */
import { Observable } from "rxjs";

export interface ITokenGateway {
  /**
   * Send a untokenize request to gateway
   * @param token - token to get information
   * @param tokenType - type of external token
   */
  untokenize(token: string): Observable<CardData>;
}

export type CardData = {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  name: string;
  cvv?: string;
};
