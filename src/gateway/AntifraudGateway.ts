/**
 * Antifraud Gateway File
 */
import { KushkiError } from "@kushki/core";
import * as AWSXRay from "aws-xray-sdk";
import * as http from "http";
import * as https from "https";
AWSXRay.captureHTTPsGlobal(http, false);
AWSXRay.captureHTTPsGlobal(https, false);
import { ERRORS } from "infrastructure/ErrorEnum";
import { injectable } from "inversify";
import "reflect-metadata";
import { IAntifraudGateway } from "repository/IAntifraudGateway";
import { OptionsWithUri } from "request";
import * as rp from "request-promise";
import { Observable, of } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, concatMap, map, mapTo, switchMap } from "rxjs/operators";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SiftScienceCreateOrderResponse } from "types/sift_science_create_order_response";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsRequest } from "types/sift_science_workflows_request";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";

/**
 * Antifraud Gateway Implementation
 */
@injectable()
export class AntifraudGateway implements IAntifraudGateway {
  public request<T = object>(
    body: object,
    method: string,
    qs?: object
  ): Observable<T> {
    return of(1).pipe(
      switchMap(() => {
        const options: OptionsWithUri = {
          body,
          method,
          qs,
          json: true,
          uri: `${process.env.SIFT_SCIENCE_API}`,
        };

        return rp.post(options);
      }),
      tag("Antifraud Gateway | request")
    );
  }

  public requestGet<T = object>(
    auth: object,
    accountId: string,
    decisionId: string
  ): Observable<T> {
    return of(1).pipe(
      switchMap(() => {
        const options: OptionsWithUri = {
          auth,
          json: true,
          uri: `${process.env.SIFT_SCIENCE_DECISION_API}${accountId}/decisions/${decisionId}`,
        };

        return rp.get(options);
      }),
      tag("Antifraud Gateway | requestGet")
    );
  }

  public createOrder(
    merchant: DynamoMerchantFetch,
    tokenInfo: DynamoTokenFetch
  ): Observable<SiftScienceCreateOrderResponse> {
    const sift_science_api_key: string = AntifraudGateway._getSiftScienceKey(
      merchant
    );

    return of(1).pipe(
      concatMap(() =>
        this.request<SiftScienceCreateOrderResponse>(
          {
            $amount: tokenInfo.amount * 1000000,
            $api_key: sift_science_api_key,
            $currency_code: tokenInfo.currency,
            $payment_methods: [
              {
                $card_bin: tokenInfo.bin,
                $card_last4: tokenInfo.lastFourDigits,
              },
            ],
            $session_id: tokenInfo.sessionId,
            $type: "$create_order",
            $user_id: tokenInfo.userId,
          },
          "POST",
          {
            return_score: true,
          }
        )
      ),
      catchError((err: Error) =>
        of(1).pipe(switchMap(() => of(this.getCreateOrderGeneric(err.message))))
      ),
      map((response: SiftScienceCreateOrderResponse) => {
        if (response.score_response.status !== 0)
          // Any other status number means error in siftScience with statusCode 200
          response = this.getCreateOrderGeneric(response.error_message);
        if (
          response.score_response.scores.payment_abuse.score >=
          Number(process.env.SIFT_THRESHOLD)
        )
          throw new KushkiError(ERRORS.E020);

        return response;
      }),
      tag("Antifraud Gateway | createOrder")
    );
  }

  public getWorkflows(
    merchant: DynamoMerchantFetch,
    tokenInfo: Required<DynamoTokenFetch>
  ): Observable<SiftScienceWorkflowsResponse> {
    const sift_science_api_key: string = AntifraudGateway._getSiftScienceKey(
      merchant
    );
    const body: SiftScienceWorkflowsRequest = {
      $api_key: sift_science_api_key,
      $type: "$create_order",
      $user_id: tokenInfo.userId,
    };

    return of(1).pipe(
      concatMap(() =>
        this.request<SiftScienceWorkflowsResponse>(body, "POST", {
          return_workflow_status: true,
        })
      ),
      catchError((err: Error) =>
        of(1).pipe(
          switchMap(() => of(this.siftWorkflowGenericAnswer(err.message)))
        )
      ),
      map((response: SiftScienceWorkflowsResponse) => {
        if (
          response.score_response !== undefined &&
          response.score_response.workflow_statuses !== undefined
        )
          for (const workflow of response.score_response.workflow_statuses)
            if (workflow.state === "failed") throw new KushkiError(ERRORS.E020);

        if (
          response.score_response !== undefined &&
          response.score_response.status !== undefined &&
          response.score_response.status !== 0 // Any other status number means error in siftScience with statusCode 200
        )
          return this.siftWorkflowGenericAnswer();

        return response;
      }),
      tag("Antifraud Gateway | getWorkflows")
    );
  }

  public transaction(
    merchant: DynamoMerchantFetch,
    tokenInfo: DynamoTokenFetch
  ): Observable<boolean> {
    const sift_science_api_key: string = AntifraudGateway._getSiftScienceKey(
      merchant
    );

    return of(1).pipe(
      concatMap(() =>
        this.request(
          {
            $amount: tokenInfo.amount * 1000000,
            $api_key: sift_science_api_key,
            $currency_code: tokenInfo.currency,
            $session_id: tokenInfo.sessionId,
            $type: "$transaction",
            $user_id: tokenInfo.userId,
          },
          "POST"
        )
      ),
      catchError(() => of(true)),
      mapTo(true),
      tag("Antifraud Gateway | transaction")
    );
  }

  public getDecision(
    merchant: DynamoMerchantFetch,
    decisionId: string
  ): Observable<SiftScienceDecisionResponse> {
    const sift_science_api_key: string = AntifraudGateway._getSiftScienceKey(
      merchant
    );

    return of(1).pipe(
      concatMap(() =>
        this.requestGet<SiftScienceDecisionResponse>(
          { user: sift_science_api_key },
          process.env.USRV_STAGE === "primary" ||
            process.env.USRV_STAGE === "stg"
            ? `${merchant.sift_science.ProdAccountId}`
            : `${merchant.sift_science.SandboxAccountId}`,
          `${decisionId}`
        )
      ),
      catchError((err: Error) =>
        of(1).pipe(switchMap(() => of(this.getGenericDecision(err.message))))
      ),
      tag("AntifraudGateway | getDecision")
    );
  }

  public siftWorkflowGenericAnswer(
    errorMessage?: string
  ): SiftScienceWorkflowsResponse {
    return {
      error_message: errorMessage === undefined ? "OK" : errorMessage,
      request: "request",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0,
          },
        },
        workflow_statuses: [
          {
            config_display_name: "displayName",
            history: [
              {
                app: "generic",
                name: "generic",
              },
            ],
          },
        ],
      },
      status: 1,
      time: 1,
    };
  }

  public getCreateOrderGeneric(
    message: string
  ): SiftScienceCreateOrderResponse {
    return {
      error_message: message,
      request: "",
      score_response: {
        scores: {
          payment_abuse: {
            score: 0,
          },
        },
      },
      status: 0,
      time: new Date().getTime(),
    };
  }

  public getGenericDecision(errorMessage: string): SiftScienceDecisionResponse {
    return {
      description: errorMessage,
      id: "",
      name: "",
      type: "green",
    };
  }

  private static _getSiftScienceKey(merchant: DynamoMerchantFetch): string {
    let sift_science_api_key: string =
      process.env.SIFT_SCIENCE_API_KEY !== undefined
        ? process.env.SIFT_SCIENCE_API_KEY
        : "";

    if (
      merchant.sift_science.ProdApiKey !== undefined &&
      merchant.sift_science.SandboxApiKey !== undefined
    )
      if (
        process.env.USRV_STAGE === "dev" ||
        process.env.USRV_STAGE === "ci" ||
        process.env.USRV_STAGE === "qa" ||
        process.env.USRV_STAGE === "uat"
      )
        sift_science_api_key = merchant.sift_science.SandboxApiKey;
      else sift_science_api_key = merchant.sift_science.ProdApiKey;

    return sift_science_api_key;
  }
}
