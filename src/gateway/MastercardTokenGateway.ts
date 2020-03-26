/* tslint:disable:no-reserved-keywords */
/**
 * Aurus Gateway File
 */
import { KushkiError } from "@kushki/core";
import "@kushki/pidcrypt/asn1";
import "@kushki/pidcrypt/rsa";
import * as fs from "fs";
import { ERRORS } from "infrastructure/ErrorEnum";
import { injectable } from "inversify";
import "reflect-metadata";
import { CardData, ITokenGateway } from "repository/ITokenGateway";
import { get } from "request-promise";
import { StatusCodeError } from "request-promise/errors";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, switchMap } from "rxjs/operators";

export type TokenResponse = {
  sourceOfFunds: {
    provided: {
      card: {
        number: string;
        expiry: string;
      };
    };
  };
};

/**
 * Aurus Gateway Implementation
 */
@injectable()
export class MastercardTokenGateway implements ITokenGateway {
  public untokenize(token: string): Observable<CardData> {
    return of(token).pipe(
      switchMap((data: string) =>
        get({
          cert: fs.readFileSync(`./resources/${process.env.MC_CERT_NAME}.crt`),
          json: true,
          key: fs.readFileSync(`./resources/${process.env.MC_CERT_NAME}.key`),
          passphrase: this._getPassword(),
          qs: {
            "responseControls.sensitiveData": "UNMASK",
          },
          uri: `${process.env.MC_URL}/merchant/${process.env.MC_MERCHANTID}/token/${data}`,
        })
      ),
      catchError((err: StatusCodeError) =>
        throwError(new KushkiError(ERRORS.E010, undefined, err.error))
      ),
      map((data: TokenResponse) => ({
        expiryMonth: data.sourceOfFunds.provided.card.expiry.slice(0, 2),
        expiryYear: data.sourceOfFunds.provided.card.expiry.slice(-2),
        name: "na",
        number: data.sourceOfFunds.provided.card.number,
      })),
      tag("MastercardTokenGateway | untokenize")
    );
  }

  private _getPassword(): string | undefined {
    return `${process.env.MC_PASSWORD}` === "none"
      ? undefined
      : `${process.env.MC_PASSWORD}`;
  }
}
