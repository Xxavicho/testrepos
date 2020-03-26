/**
 * BinList Gateway interface file.
 */

import { Observable } from "rxjs";
import { BinInfoResponse } from "types/bin_info_response";

export interface IBinInfoGateway {
  /**
   * request Bin Information de API
   * @param bin - bin number
   */
  getBinInfo(bin: string): Observable<BinInfoResponse | undefined>;
}
