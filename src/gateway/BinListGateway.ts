/**
 *    BinList Gateway
 */
import { IDENTIFIERS, ILogger } from "@kushki/core";
import * as binlookup from "binlookup";
import { inject, injectable } from "inversify";
import { IBinInfoGateway } from "repository/IBinInfoGateway";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, switchMap } from "rxjs/operators";
import { BinInfoResponse } from "types/bin_info_response";
/**
 * BinListGateway to consume API services from https://lookup.binlist.net/
 */
@injectable()
export class BinListGateway implements IBinInfoGateway {
  private readonly _logger: ILogger;
  constructor(@inject(IDENTIFIERS.Logger) logger: ILogger) {
    this._logger = logger;
  }
  public getBinInfo(bin: string): Observable<BinInfoResponse | undefined> {
    return of(bin).pipe(
      switchMap(
        (binNumber: string): Observable<object> => binlookup()(binNumber)
      ),
      map((binInfo: object | unknown) => <BinInfoResponse>binInfo),
      catchError((err: { code?: number }) => {
        if (err.code === undefined || err.code !== 404)
          this._logger.error("BinList fail", err);

        return of(undefined);
      }),
      tag("BinInfoGateway | getBinInfo")
    );
  }
}
