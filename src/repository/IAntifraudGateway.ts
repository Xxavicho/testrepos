/**
 * Interface for Antifraud Gateway.
 */
import { Observable } from "rxjs";
import { DynamoMerchantFetch } from "types/dynamo_merchant_fetch";
import { DynamoTokenFetch } from "types/dynamo_token_fetch";
import { SiftScienceCreateOrderResponse } from "types/sift_science_create_order_response";
import { SiftScienceDecisionResponse } from "types/sift_science_decision_response";
import { SiftScienceWorkflowsResponse } from "types/sift_science_workflows_response";

export interface IAntifraudGateway {
  /**
   * Send  POST transaction requests to Antifraud Gateway
   * @param body - body to send in the request
   * @param method - type of request
   * @param headers - headers to send in the request
   */
  request(body: object, method: string, headers: object): Observable<object>;

  /**
   * Send GET transaction requests to Antifraud Gateway
   * @param auth - username to send as authentication method in request
   * @param accountId - id of the account
   * @param decisionId - pathParameter send in the request
   * @param headers - headers to send in the request
   */
  requestGet(
    auth: object,
    accountId: string,
    decisionId: string,
    headers: object
  ): Observable<object>;

  /**
   * Create an order in the Antifraud Gateway
   * @param merchant - merchant info
   * @param tokenInfo - information for the saved transaction token
   */
  createOrder(
    merchant: DynamoMerchantFetch,
    tokenInfo: DynamoTokenFetch
  ): Observable<SiftScienceCreateOrderResponse>;

  /**
   * Consume a workflow in Antifraud Gateway
   * @param merchant - merchant info
   * @param tokenInfo - information for the saved transaction token
   */
  getWorkflows(
    merchant: DynamoMerchantFetch,
    tokenInfo: Required<DynamoTokenFetch>
  ): Observable<SiftScienceWorkflowsResponse>;

  /**
   * Consume transaction endpoint to feed antifraud database
   * @param merchant - merchant info
   * @param tokenInfo - information for the saved transaction token
   */
  transaction(
    merchant: DynamoMerchantFetch,
    tokenInfo: DynamoTokenFetch
  ): Observable<boolean>;

  /**
   * Consume getDecision endpoint to get all info details about a specific decision
   * @param merchant - merchant info
   * @param decisionId - decisionId needed to get all details of the decision
   */
  getDecision(
    merchant: DynamoMerchantFetch,
    decisionId: string
  ): Observable<SiftScienceDecisionResponse>;

  /**
   * Get generic response on workflows
   */
  siftWorkflowGenericAnswer(): SiftScienceWorkflowsResponse;
}
